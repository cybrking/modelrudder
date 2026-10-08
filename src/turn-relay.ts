import { recommendRoute, turnEffort } from './routing-decision.ts';
import { createClassifierLifecycle, classifierFailureReason } from './classifier-lifecycle.ts';
import { enforce, parseDecision } from './policy.ts';
import { classifierVersion, createRuntimePolicy, type RuntimePolicy } from './runtime-policy.ts';
import type { Classifier, Profile, ProfileProbabilities } from './types.ts';

export type RoutingMode = 'auto' | 'observe' | 'pinned';
export type RpcMessage = Record<string, any>;
const record = (value: unknown): value is RpcMessage => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

// Changes only turn model settings. Approvals, tools, and thread history belong
// to Codex; the relay never executes tools or retries a turn.
export function createTurnRelay(options: {
  mode: RoutingMode; model: string; classifier?: Classifier;
  runtimePolicy?: RuntimePolicy;
  upstream: (message: RpcMessage) => void;
  downstream: (message: RpcMessage) => void;
  onRoute?: (metadata: Record<string, unknown>) => void;
  onThread?: (id: string) => void;
}) {
  const runtime = createRuntimePolicy(options.runtimePolicy ?? { mode: options.mode, model: options.model });
  const classifier = options.classifier ? createClassifierLifecycle(options.classifier, runtime.classificationTimeoutMs) : undefined;
  type ActiveTurn = { turnId?: string };
  const active = new Map<string, ActiveTurn>();
  const pending = new Map<string, { id: unknown; canceled: boolean; cancel: () => void }>();
  const starts = new Map<unknown, { thread: string; turn: ActiveTurn }>();
  const context = new Map<string, string[]>();
  const freshThreads = new Set<string>();
  const opaqueThreads = new Map<string, string>();
  const resuming = new Map<string, Set<unknown>>();
  const internal = new Set<string>();
  const threadRequests = new Map<unknown, { internal: boolean; kind: string; thread?: string; closed: Set<string> }>();
  let closed = false;

  function cancelPending(thread: string) {
    const turn = pending.get(thread);
    if (!turn) return;
    turn.canceled = true;
    pending.delete(thread);
    turn.cancel();
    options.downstream({ id: turn.id, error: { code: -32800, message: 'Routing canceled before turn started' } });
  }

  function clearThread(thread: string) {
    cancelPending(thread);
    active.delete(thread); context.delete(thread); internal.delete(thread);
    freshThreads.delete(thread); opaqueThreads.delete(thread); resuming.delete(thread);
    for (const [id, start] of starts) if (start.thread === thread) starts.delete(id);
    for (const [id, request] of threadRequests) {
      if (request.kind === 'thread/resume' && request.thread === thread) threadRequests.delete(id);
      else request.closed.add(thread);
    }
  }

  function contextReason(thread: string): string | undefined {
    if (resuming.has(thread)) return 'unclassified_context_baseline';
    return opaqueThreads.get(thread) ?? (freshThreads.has(thread) ? undefined : 'unclassified_context_baseline');
  }

  function server(message: RpcMessage) {
    if (closed) return;
    if (!record(message)) { options.downstream(message); return; }
    if (threadRequests.has(message.id) && ('result' in message || 'error' in message)) {
      const request = threadRequests.get(message.id)!;
      threadRequests.delete(message.id);
      if (request.kind === 'thread/resume' && request.thread) {
        const ids = resuming.get(request.thread);
        ids?.delete(message.id);
        if (ids?.size === 0) resuming.delete(request.thread);
      }
      const id = message.result?.thread?.id;
      if (!message.error && typeof id === 'string' && !request.closed.has(id)) {
        if (request.internal) internal.add(id);
        else {
          internal.delete(id);
          if (request.kind === 'thread/start') {
            cancelPending(id); context.delete(id); active.delete(id);
            for (const [startId, start] of starts) if (start.thread === id) starts.delete(startId);
            freshThreads.add(id); opaqueThreads.delete(id);
          } else {
            freshThreads.delete(id); opaqueThreads.set(id, 'unclassified_context_baseline');
          }
          options.onThread?.(id);
        }
      }
    }
    const thread = message.params?.threadId;
    const turnId = message.params?.turn?.id;
    if (message.method === 'turn/started' && typeof thread === 'string') {
      const turn = active.get(thread);
      if (turn && (turn.turnId === undefined || turn.turnId === turnId)) turn.turnId = typeof turnId === 'string' ? turnId : undefined;
      // Once bound, only completion or a matching start response may release
      // this identity. A delayed started notification cannot replace it.
      else if (!turn) active.set(thread, { turnId: typeof turnId === 'string' ? turnId : undefined });
    }
    if (message.method === 'turn/completed' && typeof thread === 'string') {
      const turn = active.get(thread);
      // A late completion from an interrupted turn must not release a newer turn.
      if (turn && (typeof turnId !== 'string' || turn.turnId === turnId)) {
        active.delete(thread);
        for (const [id, start] of starts) if (start.turn === turn) starts.delete(id);
      }
    }
    if (starts.has(message.id) && ('result' in message || 'error' in message)) {
      const start = starts.get(message.id)!;
      starts.delete(message.id);
      if (active.get(start.thread) === start.turn) {
        if (message.error) active.delete(start.thread);
        else if (typeof message.result?.turn?.id === 'string' && start.turn.turnId === undefined) {
          start.turn.turnId = message.result.turn.id;
        }
      }
    }
    if (message.method === 'thread/closed' || message.method === 'thread/deleted') {
      if (typeof thread === 'string') clearThread(thread);
    }
    if (!closed) options.downstream(message);
  }

  async function client(message: RpcMessage) {
    if (closed) return;
    if (!record(message)) { options.upstream(message); return; }
    const params = message.params;
    const thread = params?.threadId;
    if (['thread/start', 'thread/resume', 'thread/fork'].includes(message.method)) {
      // Native Codex creates ephemeral threads for background helpers such as
      // chat titles. Those are not new user tasks and must not reach Jev.
      threadRequests.set(message.id, { internal: params?.ephemeral === true || Boolean(params?.serviceName),
        kind: message.method, thread: typeof thread === 'string' ? thread : undefined, closed: new Set() });
      if (message.method === 'thread/resume' && typeof thread === 'string') {
        const ids = resuming.get(thread) ?? new Set(); ids.add(message.id); resuming.set(thread, ids);
      }
    }
    if (message.method === 'turn/interrupt' && pending.has(thread)) {
      cancelPending(thread);
      options.downstream({ id: message.id, result: {} });
      return;
    }
    const validInput = Array.isArray(params?.input) && params.input.every((item: unknown) =>
      record(item) && typeof item.type === 'string' && (item.type !== 'text' || typeof item.text === 'string'));
    const validCollaboration = params?.collaborationMode == null || (record(params.collaborationMode) &&
      (params.collaborationMode.settings == null || record(params.collaborationMode.settings)));
    // Native references introduced while steering cannot change an already
    // running model, but make later turns in this history ineligible.
    if (['turn/start', 'turn/steer'].includes(message.method) && typeof thread === 'string' && validInput && validCollaboration &&
        !internal.has(thread) && !params.toolOutput) {
      const nonText = params.input.filter((item: RpcMessage) => item.type !== 'text');
      if (nonText.length) opaqueThreads.set(thread, nonText.some((item: RpcMessage) =>
        !['image', 'localImage', 'audio', 'localAudio'].includes(item.type))
        ? 'reference_context_baseline' : 'media_baseline');
    }
    if (message.method !== 'turn/start' || typeof thread !== 'string' ||
        !Array.isArray(params.input) || params.toolOutput || active.has(thread) || internal.has(thread)) {
      options.upstream(message); return;
    }
    // Let Codex validate malformed protocol input; never inspect it or send a
    // partially extracted task to the classifier. Unknown valid fields survive.
    if (!validInput || !validCollaboration) {
      options.upstream(message); return;
    }
    if (pending.has(thread)) {
      options.downstream({ id: message.id, error: { code: -32001, message: 'A turn is already being routed' } });
      return;
    }
    const controller = new AbortController();
    const cancel = () => controller.abort();
    const turn = { id: message.id, canceled: false, cancel };
    pending.set(thread, turn);
    const routingStarted = performance.now();
    const text = params.input.filter((item: RpcMessage) => item.type === 'text' && typeof item.text === 'string')
      .map((item: RpcMessage) => item.text).join('\n');
    const hasMedia = params.input.some((item: RpcMessage) => ['image', 'localImage', 'audio', 'localAudio'].includes(item.type));
    let selected: Profile = runtime.policy.fallback;
    let proposed: Profile | null = null;
    let confidence: number | null = null;
    let probabilities: ProfileProbabilities | null = null;
    let servedModel: string | null = null;
    let classified = false;
    let reason = runtime.mode === 'pinned' ? 'pinned' : 'classification_disabled';
    const previous = context.get(thread) ?? [];
    const unavailableContext = contextReason(thread);
    if (runtime.mode !== 'pinned' && unavailableContext) reason = unavailableContext;
    else if (runtime.mode !== 'pinned' && runtime.policy.allowClassification && classifier && text.trim() && text.length <= 100_000 && !hasMedia) {
      classified = true;
      try {
        const decision = parseDecision(await classifier({ input: JSON.stringify({
          previousUserTasks: previous, currentTask: text,
        }) }, controller.signal));
        proposed = decision.profile;
        const recommendation = recommendRoute(decision, runtime.policy, runtime.routes, 'reported');
        confidence = recommendation.confidence;
        probabilities = decision.probabilities ?? null;
        servedModel = decision.servedModel ?? null;
        if (runtime.mode === 'auto' && recommendation.qualified) {
          selected = proposed; reason = 'experimental_route';
        } else reason = runtime.mode === 'observe' ? 'observe' : 'uncertain_classification';
      } catch (error) { reason = classifierFailureReason(error); }
    } else if (runtime.mode !== 'pinned' && hasMedia) reason = 'media_baseline';
    else if (runtime.mode !== 'pinned' && (!text.trim() || text.length > 100_000)) reason = 'unsupported_input_baseline';
    if (closed || turn.canceled || pending.get(thread) !== turn) return;
    // A resume or reference can arrive while classification is outstanding.
    // Its previously visible text must not authorize a route for opaque history.
    if (runtime.mode !== 'pinned' && contextReason(thread)) {
      selected = runtime.policy.fallback; reason = contextReason(thread)!;
      proposed = null; confidence = null; probabilities = null; servedModel = null;
    }
    pending.delete(thread);
    const model = runtime.mode === 'pinned' ? runtime.model : enforce(selected, runtime.policy, runtime.routes).route.model;
    const candidate = proposed === null ? null : enforce(proposed, runtime.policy, runtime.routes).route;
    const { effort, effortReason, proposedEffort } = turnEffort({ mode: runtime.mode, effortMode: runtime.effortMode,
      candidate, selected: enforce(selected, runtime.policy, runtime.routes).route,
      qualified: confidence !== null && confidence >= runtime.policy.confidenceThreshold, reason });
    // Collaboration mode settings take precedence over top-level model/effort.
    const updated = { ...params, model, effort };
    if (params.collaborationMode?.settings) {
      updated.collaborationMode = { ...params.collaborationMode,
        settings: { ...params.collaborationMode.settings, model, reasoning_effort: effort } };
    }
    const started: ActiveTurn = {};
    active.set(thread, started);
    starts.set(message.id, { thread, turn: started });
    // Only tasks observed by this launcher are retained, in memory, bounded.
    context.set(thread, [...previous, text.slice(0, 4000)].slice(-2));
    // Composer settings accompany ordinary turns too, so their presence cannot
    // identify a /model choice. Report recognized overrides without logging
    // arbitrary incoming values or changing automatic routing.
    const modelOverridden = (value: unknown) => typeof value === 'string' &&
      runtime.policy.allowedModels.includes(value) && value !== model;
    const effortOverridden = (value: unknown) => typeof value === 'string' &&
      ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'ultra'].includes(value) && value !== effort;
    options.onRoute?.({ threadId: thread, mode: runtime.mode, proposed, reportedConfidence: confidence, model, effort, reason,
      probabilities, servedModel,
      effortMode: runtime.effortMode, proposedEffort, effortReason,
      policyVersion: runtime.version, policyHash: runtime.hash,
      classifierVersion: classified ? classifierVersion : null,
      routingLatencyMs: Math.max(0, performance.now() - routingStarted),
      modelOverridden: modelOverridden(params.model),
      effortOverridden: effortOverridden(params.effort),
      collaborationSettingsOverridden: modelOverridden(params.collaborationMode?.settings?.model) ||
        effortOverridden(params.collaborationMode?.settings?.reasoning_effort),
    });
    options.upstream({ ...message, params: updated });
  }
  return { client, server, close() {
    closed = true;
    for (const turn of pending.values()) { turn.canceled = true; turn.cancel(); }
    pending.clear(); context.clear(); active.clear(); starts.clear(); internal.clear(); threadRequests.clear();
    freshThreads.clear(); opaqueThreads.clear(); resuming.clear();
  } };
}

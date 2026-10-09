import { createServer } from 'node:http';
import { timingSafeEqual, createHash } from 'node:crypto';
import { createClassifierLifecycle, classifierFailureReason } from './classifier-lifecycle.ts';
import { parseDecision } from './policy.ts';
import { claudeClassifierVersion, claudeClassificationTimeoutMs } from './claude-classifier.ts';
import type { Classifier, Profile } from './types.ts';

export const claudeModels = ['haiku', 'sonnet', 'opus'] as const;
export type ClaudeModel = typeof claudeModels[number];
// Unlike CLI --model, native turn.step rewrites do not resolve family aliases.
// Full-ID resolution was checked using a synthetic loopback provider on 2.1.295.
export const defaultClaudeModelIds: Readonly<Record<ClaudeModel, string>> = Object.freeze({
  haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5',
});
export function readClaudeModelIds(env: NodeJS.ProcessEnv = process.env): Record<ClaudeModel, string> {
  return Object.fromEntries(claudeModels.map(family => {
    const model = env[`SMART_CLAUDE_${family.toUpperCase()}_MODEL`] ?? defaultClaudeModelIds[family];
    if (!new RegExp(`^claude-${family}-[a-z0-9][a-z0-9.-]{0,80}$`).test(model)) throw new Error('Claude model overrides must be full IDs within their declared family.');
    return [family, model];
  })) as Record<ClaudeModel, string>;
}
export type ClaudeRoutingMode = 'auto' | 'observe' | 'pinned';
export const claudeRoutes: Readonly<Record<Profile, ClaudeModel>> = Object.freeze({ FAST: 'haiku', BALANCED: 'sonnet', DEEP: 'sonnet', MAX: 'opus' });
export const claudeContextReasons = ['media_baseline', 'reference_context_baseline', 'unclassified_context_baseline', 'unsupported_input_baseline'] as const;
export type ClaudeContextReason = typeof claudeContextReasons[number];
export type ClaudeTask = { sessionId: string; turnId: string; task: string; contextReason: ClaudeContextReason | null };
export type ClaudeDecision = { model: ClaudeModel; reason: string; proposed: Profile | null; reportedConfidence: number | null };
export const claudePolicy = Object.freeze({ version: 'claude-native-mods-v1', fallback: 'sonnet', confidenceThreshold: 0.8, routes: claudeRoutes, modelIds: defaultClaudeModelIds, effort: 'native', classifier: claudeClassifierVersion });
export const claudePolicyHash = createHash('sha256').update(JSON.stringify(claudePolicy)).digest('hex');
const record = (raw: unknown): raw is Record<string, any> => Boolean(raw) && typeof raw === 'object' && !Array.isArray(raw);
const id = (raw: unknown): raw is string => typeof raw === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(raw);

export function parseClaudeTask(raw: unknown): ClaudeTask {
  if (!record(raw) || !id(raw.sessionId) || !id(raw.turnId) || typeof raw.task !== 'string' || raw.task.length > 100_000 ||
    !(raw.contextReason === null || claudeContextReasons.includes(raw.contextReason))) throw new Error('Invalid routing request');
  // Ineligible inputs never need to cross the native/local boundary as text.
  if (raw.contextReason !== null && raw.task !== '') throw new Error('Ineligible task text must be withheld');
  return { sessionId: raw.sessionId, turnId: raw.turnId, task: raw.task, contextReason: raw.contextReason };
}

// A launcher-local policy engine. Does not run tools, read a transcript, access
// Claude credentials, retry inference or convert Claude plan usage into dollars.
export function createClaudeRouter(options: { mode: ClaudeRoutingMode; model: ClaudeModel; classifier?: Classifier; modelIds?: Readonly<Record<ClaudeModel, string>>;
  onRoute?: (metadata: Record<string, unknown>) => void; onComplete?: (metadata: Record<string, unknown>) => void }) {
  if (!['auto', 'observe', 'pinned'].includes(options.mode) || !claudeModels.includes(options.model)) throw new Error('Invalid Claude routing policy');
  const modelIds = options.modelIds ?? defaultClaudeModelIds;
  for (const family of claudeModels) if (!new RegExp(`^claude-${family}-[a-z0-9][a-z0-9.-]{0,80}$`).test(modelIds[family])) throw new Error('Invalid Claude model IDs');
  const runtimeHash = createHash('sha256').update(JSON.stringify({ ...claudePolicy, mode: options.mode, pinnedModel: options.model, modelIds })).digest('hex');
  const classify = options.classifier ? createClassifierLifecycle(options.classifier, claudeClassificationTimeoutMs) : undefined;
  const history = new Map<string, { turnId: string; text: string }[]>();
  const turns = new Map<string, { controller: AbortController; promise: Promise<ClaudeDecision>; taskHash: string; complete: boolean; settled: boolean }>();
  const completed = new Set<string>();
  const rememberCompleted = (key: string) => {
    completed.add(key);
    if (completed.size > 4096) completed.delete(completed.values().next().value!);
  };
  let closed = false;
  const key = (session: string, turn: string) => `${session}:${turn}`;
  return {
    route(raw: unknown, parent?: AbortSignal): Promise<ClaudeDecision> {
      const task = parseClaudeTask(raw);
      if (closed) return Promise.reject(new Error('Router closed'));
      const k = key(task.sessionId, task.turnId);
      if (completed.has(k)) return Promise.reject(new Error('Turn already completed'));
      const hash = createHash('sha256').update(JSON.stringify(task)).digest('hex');
      const prior = turns.get(k);
      if (prior) return prior.taskHash === hash ? prior.promise : Promise.reject(new Error('Conflicting turn'));
      if (turns.size >= 128) {
        // Completion telemetry is best-effort. Missing it must not permanently
        // fill the launcher's cache; never evict a classification still running.
        const stale = [...turns].find(([, state]) => state.settled);
        if (!stale) return Promise.reject(new Error('Too many active turns'));
        turns.delete(stale[0]); rememberCompleted(stale[0]);
      }
      const controller = new AbortController();
      const cancel = () => controller.abort();
      if (parent?.aborted) controller.abort();
      else parent?.addEventListener('abort', cancel, { once: true });
      const state = { controller, taskHash: hash, complete: false, settled: false, promise: undefined as unknown as Promise<ClaudeDecision> };
      turns.set(k, state);
      state.promise = (async () => {
        const started = performance.now();
        let decision: ClaudeDecision = { model: options.mode === 'pinned' ? options.model : 'sonnet',
          reason: options.mode === 'pinned' ? 'pinned' : task.contextReason ?? 'classification_disabled', proposed: null, reportedConfidence: null };
        let classifierUsage: { inputTokens: number; outputTokens: number } | undefined;
        let classified = false;
        try {
          if (options.mode !== 'pinned' && !task.contextReason && task.task.trim() && classify) {
            classified = true;
            try {
              const result = parseDecision(await classify({ input: JSON.stringify({ previousUserTasks: (history.get(task.sessionId) ?? []).map(item => item.text), currentTask: task.task }) }, controller.signal));
              const score = result.reportedConfidence ?? result.confidence;
              classifierUsage = result.usage;
              const qualified = score !== null && score >= claudePolicy.confidenceThreshold;
              decision = { model: options.mode === 'auto' && qualified ? claudeRoutes[result.profile] : 'sonnet',
                reason: options.mode === 'observe' ? 'observe' : qualified ? 'experimental_route' : 'uncertain_classification',
                proposed: result.profile, reportedConfidence: score };
            } catch (error) { decision.reason = classifierFailureReason(error); }
          } else if (options.mode !== 'pinned' && !task.contextReason && !task.task.trim()) decision.reason = 'unsupported_input_baseline';
          if (controller.signal.aborted || closed) throw new Error('Routing cancelled');
          if (task.contextReason) history.delete(task.sessionId);
          else if (options.mode !== 'pinned') {
            history.set(task.sessionId, [...history.get(task.sessionId) ?? [], { turnId: task.turnId, text: task.task.slice(0, 4000) }].slice(-2));
            if (history.size > 32) history.delete(history.keys().next().value!);
          }
          options.onRoute?.({ ...decision, mode: options.mode, policyVersion: claudePolicy.version, policyHash: runtimeHash,
            classifierVersion: classified ? claudeClassifierVersion : null, classifierUsage,
            routingLatencyMs: Math.max(0, performance.now() - started) });
          return decision;
        } finally { state.settled = true; parent?.removeEventListener('abort', cancel); }
      })();
      state.promise.catch(() => { if (turns.get(k) === state) turns.delete(k); });
      return state.promise;
    },
    complete(raw: unknown) {
      if (!record(raw) || !id(raw.sessionId) || !id(raw.turnId) || typeof raw.isAborted !== 'boolean') throw new Error('Invalid completion');
      const k = key(raw.sessionId, raw.turnId), state = turns.get(k);
      // Cancellation can beat the route HTTP request, or arrive after it was
      // classified. Never resurrect that turn or reuse its text as context.
      if (raw.isAborted && history.has(raw.sessionId)) history.set(raw.sessionId, history.get(raw.sessionId)!.filter(item => item.turnId !== raw.turnId));
      rememberCompleted(k);
      if (!state || state.complete) return;
      state.complete = true; state.controller.abort(); turns.delete(k);
      let usage: Record<string, number | string> | undefined;
      if (record(raw.usage) && typeof raw.usage.model === 'string' && /^claude-[A-Za-z0-9._-]{1,100}$/.test(raw.usage.model) &&
          ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].every(name => Number.isSafeInteger(raw.usage[name]) && raw.usage[name] >= 0)) {
        usage = { model: raw.usage.model };
        for (const name of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) usage[name] = raw.usage[name];
      }
      options.onComplete?.({ isAborted: raw.isAborted, ...(usage ? { usage } : { usageUnavailable: true }) });
    },
    close() { closed = true; for (const state of turns.values()) state.controller.abort(); turns.clear(); completed.clear(); history.clear(); },
  };
}

export async function startClaudeBridge(options: Parameters<typeof createClaudeRouter>[0] & { token: string; onReady?: () => void }) {
  if (!/^[a-f0-9]{64}$/.test(options.token)) throw new Error('Invalid bridge token');
  const router = createClaudeRouter(options);
  const http = createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    const supplied = Buffer.from(request.headers.authorization ?? ''), expected = Buffer.from(`Bearer ${options.token}`);
    if (request.headers.origin || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) { response.writeHead(403).end(); return; }
    if (request.method === 'GET' && request.url === '/health') { options.onReady?.(); response.writeHead(200, { 'Content-Type': 'application/json' }).end('{"protocol":1}'); return; }
    if (request.method !== 'POST' || !['/route', '/complete'].includes(request.url ?? '')) { response.writeHead(404).end(); return; }
    if (request.headers['content-type'] !== 'application/json') { response.writeHead(415).end(); return; }
    const controller = new AbortController();
    const abort = () => { if (!response.writableEnded) controller.abort(); };
    response.once('close', abort);
    let size = 0; const chunks: Buffer[] = [];
    const timer = setTimeout(() => { controller.abort(); response.writeHead(408).end(); request.destroy(); }, 1000);
    try {
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 512 * 1024) { response.writeHead(413).end(); request.destroy(); return; }
        chunks.push(chunk);
      }
      clearTimeout(timer);
      if (controller.signal.aborted) return;
      const raw = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const result = request.url === '/route' ? await router.route(raw, controller.signal) : (router.complete(raw), {});
      if (!controller.signal.aborted) response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(result));
    } catch {
      if (!response.headersSent && !controller.signal.aborted) response.writeHead(400).end('{"error":"Request unavailable"}');
    } finally { clearTimeout(timer); response.off('close', abort); }
  });
  http.requestTimeout = 8000; http.headersTimeout = 5000; http.keepAliveTimeout = 1000; http.maxConnections = 32;
  await new Promise<void>((done, reject) => { http.once('error', reject); http.listen(0, '127.0.0.1', done); });
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('Bridge address unavailable');
  return { endpoint: `http://127.0.0.1:${address.port}`, async close() {
    router.close(); http.closeAllConnections(); await new Promise<void>(done => http.close(() => done()));
  } };
}

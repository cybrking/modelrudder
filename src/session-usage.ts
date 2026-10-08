import { randomUUID } from 'node:crypto';
import { effortModes, effortReasons, routingReasons } from './types.ts';
import type { Effort, EffortMode, ProfileProbabilities } from './types.ts';
import { parseProbabilities, parseServedModel } from './policy.ts';
// Reference prices checked 2026-10-01. Standard, short context, USD / million.
// These are API equivalents, not ChatGPT subscription charges or quota weights.
export const referencePrices = {
  'gpt-6-luna': [0.10, 0.01, 0.125, 0.50],
  'gpt-6.1-sol': [2, 0.10, 2.50, 10],
  'gpt-6-astra': [10, 1, 12.50, 50],
} as const;
export const jevInputPrice = 0.042;
type Tokens = { input: number; cached: number; cacheWrite: number; output: number; reasoning: number };
const zero = (): Tokens => ({ input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0 });
function tokens(value: any): Tokens | undefined {
  if (!value || !['inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens']
    .every(key => Number.isSafeInteger(value[key]) && value[key] >= 0)) return;
  const write = value.cacheWriteInputTokens ?? 0;
  if (!Number.isSafeInteger(write) || write < 0 || value.cachedInputTokens + write > value.inputTokens ||
      value.reasoningOutputTokens > value.outputTokens) return;
  return { input: value.inputTokens, cached: value.cachedInputTokens, cacheWrite: write,
    output: value.outputTokens, reasoning: value.reasoningOutputTokens };
}
function add(target: Tokens, delta: Tokens) { for (const key of Object.keys(target) as (keyof Tokens)[]) target[key] += delta[key]; }
function cost(t: Tokens, prices: readonly number[]) {
  return ((t.input - t.cached - t.cacheWrite) * prices[0] + t.cached * prices[1] +
    t.cacheWrite * prices[2] + t.output * prices[3]) / 1e6;
}

export function createSessionUsage() {
  const requests = new Map<unknown, string>();
  const turnRequests = new Map<unknown, string>();
  const threads = new Map<string, { previous?: Tokens; model?: string; active?: string; fresh: boolean }>();
  const byModel: Record<string, Tokens> = {};
  const calls = new Map<number, 'pending' | 'unknown' | 'reported'>();
  let jevInput = 0, jevOutput = 0, partial = false, compactions = 0, ended = false;
  const compactionIds = new Set<string>();
  let decisionCount = 0;
  let latestRoute: { decisionId: string; policyVersion: string | null; policyHash: string | null; classifierVersion: string | null;
    model: string; proposed: string | null; confidence: number | null; reason: string;
    probabilities: ProfileProbabilities | null; servedModel: string | null;
    effort: Effort | null; proposedEffort: Effort | null; effortMode: EffortMode | null; effortReason: string | null;
    routingLatencyMs: number | null; modelOverridden: boolean | null;
    effortOverridden: boolean | null; collaborationSettingsOverridden: boolean | null } | null = null;
  const state = (id: string) => {
    if (!threads.has(id)) threads.set(id, { fresh: false });
    return threads.get(id)!;
  };
  return {
    client(message: any) {
      if (['thread/start', 'thread/resume', 'thread/fork'].includes(message.method)) requests.set(message.id, message.method);
      if (message.method === 'turn/start' && typeof message.params?.threadId === 'string') {
        const s = state(message.params.threadId);
        if (typeof message.params.model === 'string') s.model = message.params.model;
        s.active ??= 'pending';
        turnRequests.set(message.id, message.params.threadId);
      }
      return false;
    },
    server(message: any) {
      if (turnRequests.has(message.id) && ('result' in message || 'error' in message)) {
        const s = state(turnRequests.get(message.id)!); turnRequests.delete(message.id);
        if (message.error) { s.active = undefined; partial = true; }
      }
      if (requests.has(message.id) && ('result' in message || 'error' in message)) {
        const kind = requests.get(message.id); requests.delete(message.id);
        const id = message.result?.thread?.id;
        if (typeof id === 'string') {
          const s = state(id); s.fresh = kind === 'thread/start';
          s.model = message.result.model ?? message.result.thread.model;
          if (s.fresh) s.previous = zero();
        }
      }
      const p = message.params;
      if (typeof p?.threadId !== 'string') return false;
      if (message.method === 'thread/closed' || message.method === 'thread/deleted') {
        const previous = threads.get(p.threadId);
        if (previous?.active) partial = true;
        threads.delete(p.threadId);
        for (const [id, thread] of turnRequests) if (thread === p.threadId) turnRequests.delete(id);
        return true;
      }
      const s = state(p.threadId);
      if (message.method === 'turn/started') s.active = p.turn?.id ?? 'pending';
      if (message.method === 'thread/settings/updated') s.model = p.threadSettings?.model;
      if (message.method === 'model/rerouted') { s.model = 'unattributed'; partial = true; }
      if (message.method === 'item/completed' && p.item?.type === 'contextCompaction') {
        const key = `${p.threadId}:${p.item.id}`;
        if (!compactionIds.has(key)) { compactionIds.add(key); compactions++; return true; }
      }
      if (message.method === 'turn/completed') {
        s.active = undefined;
        if (p.turn?.status && p.turn.status !== 'completed') partial = true;
      }
      if (message.method !== 'thread/tokenUsage/updated') return false;
      const total = tokens(p.tokenUsage?.total);
      if (!total) { partial = true; return true; }
      let delta: Tokens | undefined;
      if (s.previous) {
        delta = zero();
        for (const key of Object.keys(delta) as (keyof Tokens)[]) delta[key] = total[key] - s.previous[key];
        if (Object.values(delta).some(n => n < 0) || delta.cached + delta.cacheWrite > delta.input || delta.reasoning > delta.output) {
          partial = true; delta = undefined;
        }
      } else if (s.active && (s.active === 'pending' || s.active === p.turnId)) {
        // Resumed history has no usage baseline in the resume response. The
        // first new request's last usage is safe; earlier requests may be missing.
        delta = tokens(p.tokenUsage.last); partial = true;
      }
      s.previous = total;
      if (delta && (delta.input || delta.output)) {
        const model = Object.hasOwn(referencePrices, s.model ?? '') ? s.model! : 'unattributed';
        if (model === 'unattributed') partial = true;
        byModel[model] ??= zero(); add(byModel[model], delta);
      }
      return true;
    },
    route(metadata: Record<string, unknown>) {
      decisionCount++;
      let probabilities: ProfileProbabilities | null = null;
      let servedModel: string | null = null;
      try { probabilities = parseProbabilities(metadata.probabilities, metadata.proposed); } catch {}
      try { servedModel = parseServedModel(metadata.servedModel); } catch {}
      latestRoute = { decisionId: randomUUID(),
        policyVersion: ['1', '2', '3', '4'].includes(metadata.policyVersion as string) ? metadata.policyVersion as string : null,
        policyHash: typeof metadata.policyHash === 'string' && /^[a-f0-9]{64}$/.test(metadata.policyHash) ? metadata.policyHash : null,
        classifierVersion: metadata.classifierVersion === 'jev-latest:rubric-2026-10-01' ? metadata.classifierVersion : null,
        model: String(metadata.model), proposed: typeof metadata.proposed === 'string' ? metadata.proposed : null,
        confidence: typeof metadata.reportedConfidence === 'number' ? metadata.reportedConfidence : null,
        reason: routingReasons.includes(metadata.reason as typeof routingReasons[number]) ? metadata.reason as string : 'unknown',
        probabilities, servedModel,
        effort: metadata.effort === 'low' || metadata.effort === 'medium' ? metadata.effort : null,
        proposedEffort: metadata.proposedEffort === 'low' || metadata.proposedEffort === 'medium' ? metadata.proposedEffort : null,
        effortMode: effortModes.includes(metadata.effortMode as EffortMode) ? metadata.effortMode as EffortMode : null,
        effortReason: effortReasons.includes(metadata.effortReason as typeof effortReasons[number]) ? metadata.effortReason as string : null,
        routingLatencyMs: typeof metadata.routingLatencyMs === 'number' && Number.isFinite(metadata.routingLatencyMs) && metadata.routingLatencyMs >= 0 ? metadata.routingLatencyMs : null,
        modelOverridden: typeof metadata.modelOverridden === 'boolean' ? metadata.modelOverridden : null,
        effortOverridden: typeof metadata.effortOverridden === 'boolean' ? metadata.effortOverridden : null,
        collaborationSettingsOverridden: typeof metadata.collaborationSettingsOverridden === 'boolean' ? metadata.collaborationSettingsOverridden : null };
    },
    classificationStarted() { const id = calls.size; calls.set(id, 'pending'); return id; },
    classificationFinished(id: number, usage?: { inputTokens: number; outputTokens: number }) {
      if (calls.get(id) !== 'pending') return;
      if (usage && Number.isSafeInteger(usage.inputTokens) && usage.inputTokens >= 0 &&
          Number.isSafeInteger(usage.outputTokens) && usage.outputTokens >= 0) {
        jevInput += usage.inputTokens; jevOutput += usage.outputTokens; calls.set(id, 'reported');
      } else calls.set(id, 'unknown');
    },
    finish() { ended = true; if ([...threads.values()].some(s => s.active)) partial = true; },
    snapshot() {
      const total = zero(); let equivalent = 0, baseline = 0;
      for (const [model, t] of Object.entries(byModel)) {
        add(total, t);
        if (Object.hasOwn(referencePrices, model)) {
          baseline += cost(t, referencePrices['gpt-6.1-sol']);
          equivalent += cost(t, referencePrices[model as keyof typeof referencePrices]);
        }
      }
      const unknownJevCalls = [...calls.values()].filter(status => status !== 'reported').length;
      const jevUsd = jevInput * jevInputPrice / 1e6;
      const estimatedDifferenceUsd = partial || unknownJevCalls ? null : baseline - equivalent - jevUsd;
      return { version: 1, ended, partial, tokens: total, byModel: structuredClone(byModel), compactions,
        decisionCount, latestRoute: latestRoute ? structuredClone(latestRoute) : null,
        jev: { calls: calls.size, unknownCalls: unknownJevCalls, inputTokens: jevInput, outputTokens: jevOutput, estimatedUsd: jevUsd },
        apiEquivalentUsd: equivalent, solReferenceUsd: baseline, estimatedDifferenceUsd,
        coveredDifferenceUsd: baseline - equivalent - jevUsd,
        tokenSavings: null, subscriptionMoneySaved: null, priceBasis: '2026-10-01 standard short context' };
    },
  };
}
export type UsageSnapshot = ReturnType<ReturnType<typeof createSessionUsage>['snapshot']>;
export function formatSessionUsage(s: UsageSnapshot, options: { emphasis?: boolean } = {}) {
  const number = (n: number) => n.toLocaleString('en-US');
  const money = (n: number, digits = 6) => `$${n.toFixed(digits)}`;
  const count = (n: number, noun: string) => `${number(n)} ${noun}${n === 1 ? '' : 's'}`;
  const bold = (text: string) => options.emphasis ? `\x1b[1m${text}\x1b[22m` : text;
  const row = (label: string, value: string) => `  ${label.padEnd(12)}${value}`;
  const modelName = (model: string) => ({ 'gpt-6.1-sol': 'Sol 6.1', 'gpt-6-luna': 'Luna',
    'gpt-6-astra': 'Astra', unattributed: 'Unattributed' }[model] ?? 'Unknown');
  const partial = s.partial || s.jev.unknownCalls > 0;
  const models = Object.entries(s.byModel).sort(([, a], [, b]) => b.input - a.input || b.output - a.output);
  const hasPricedUsage = models.some(([model]) => Object.hasOwn(referencePrices, model));
  const lines = ['', `  ${bold(`Smart Codex / Session ${s.ended ? 'ended' : 'live'}`)}`,
    '  -----------------------------------------------', '',
    row('Tokens', `${number(s.tokens.input)} in / ${number(s.tokens.output)} out`),
    row('Cached', `${number(s.tokens.cached)} input tokens`)];
  if (models.length === 1) lines.push(row('Model', modelName(models[0][0])));
  else models.forEach(([model, t], index) => lines.push(row(index === 0 ? 'Models' : '',
    `${modelName(model).padEnd(14)}${number(t.input)} in / ${number(t.output)} out`)));
  lines.push(row('Jev', `${count(s.jev.calls, 'call')} / ${money(s.jev.estimatedUsd)} estimated`));
  if (s.jev.unknownCalls) lines.push(row('', `${count(s.jev.unknownCalls, 'call')} with unknown usage`));
  lines.push(row('API equiv.', !hasPricedUsage && (s.tokens.input || s.tokens.output)
    ? 'Unavailable (model attribution missing)' : `${money(s.apiEquivalentUsd, s.apiEquivalentUsd > 0 && s.apiEquivalentUsd < 0.0001 ? 6 : 4)} (priced usage)`));
  const delta = s.estimatedDifferenceUsd ?? s.coveredDifferenceUsd;
  if (hasPricedUsage && typeof delta === 'number' && Math.abs(delta) >= 0.0000005) {
    lines.push(row('Rate delta', `${money(Math.abs(delta))} ${delta < 0 ? 'higher' : 'lower'} vs Sol${partial ? ' (covered only)' : ''}`));
  }
  lines.push('', row('Routing', `${count(s.decisionCount, 'decision')} / ${count(s.compactions, 'compaction')}`));
  if (s.latestRoute) {
    const route = s.latestRoute;
    const confidence = typeof route.confidence === 'number' && Number.isFinite(route.confidence) &&
      route.confidence >= 0 && route.confidence <= 1 ? `${Math.round(route.confidence * 100)}%` : null;
    const reason = {
      uncertain_classification: `Low Jev confidence${confidence ? ` (${confidence})` : ''}; kept baseline`,
      classifier_failed: 'Classifier unavailable; kept baseline',
      experimental_route: `Auto choice${confidence ? ` (Jev confidence ${confidence})` : ''}`,
      observe: 'Observe mode; kept baseline', pinned: 'Pinned model',
      reference_context_baseline: 'Referenced context; kept baseline',
      unclassified_context_baseline: 'History not classified; kept baseline',
      media_baseline: 'Media attached; kept baseline',
      unsupported_input_baseline: 'Unsupported input; kept baseline',
      classification_disabled: 'Classification disabled',
    }[route.reason] ?? 'No classification available';
    lines.push(row('Last route', `${modelName(route.model)} / ${route.effort ?? 'effort unknown'}`), row('Reason', reason));
  }
  lines.push('', `  ${partial ? 'Partial coverage; some usage is missing.' : 'Reported usage accounted for.'}`,
    '  API estimates only. Subscription savings unknown.');
  return lines.join('\n');
}

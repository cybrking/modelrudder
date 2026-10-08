import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defaultPolicy, routes as configuredRoutes, allowedEfforts } from './config.ts';
import { validatePolicy } from './policy.ts';
import { classificationBudget } from './classifier-contract.ts';
import { profiles, effortModes } from './types.ts';
import type { Policy, Profile, Route, EffortMode } from './types.ts';

export type RoutingMode = 'auto' | 'observe' | 'pinned';
export const routerVersion: string = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
export const runtimePolicyVersion = '4';
export const contextEligibility = 'fresh-text-only-history-v1';
// Requested model/rubric revision; the hosted Jev model is not pinned.
export { classifierVersion } from './classifier-contract.ts';

export type RuntimePolicy = Readonly<{
  version: string;
  hash: string;
  mode: RoutingMode;
  model: string;
  effort: 'medium';
  effortMode: EffortMode;
  contextEligibility: typeof contextEligibility;
  classifierLifecycle: 'bounded-circuit-v1';
  classificationTimeoutMs: number;
  policy: Readonly<Policy>;
  routes: Readonly<Record<Profile, Readonly<Route>>>;
}>;

// Capture effective interactive settings before accepting any user turns.
// Configured efforts describe proposals; the relay applies effortMode per turn.
export function createRuntimePolicy(options: {
  mode?: RoutingMode; model?: string; policy?: Policy;
  routes?: Record<Profile, Route>; classificationTimeoutMs?: number; effortMode?: EffortMode;
} = {}): RuntimePolicy {
  const source = options.policy ?? defaultPolicy;
  const mode = options.mode ?? 'auto';
  const effortMode = options.effortMode ?? 'auto';
  if (!['auto', 'observe', 'pinned'].includes(mode)) throw new Error('Invalid routing policy mode');
  if (!effortModes.includes(effortMode)) throw new Error('Invalid effort mode');
  validatePolicy(source);
  if (typeof source.allowClassification !== 'boolean' || !Array.isArray(source.allowedModels) ||
      !source.allowedModels.length || source.allowedModels.some(model =>
        typeof model !== 'string' || !allowedEfforts[model]?.includes('medium'))) {
    throw new Error('Invalid routing policy allowed models or classification setting');
  }
  const models = [...new Set(source.allowedModels)].sort();
  const policy = Object.freeze({ minimum: source.minimum, maximum: source.maximum, fallback: source.fallback,
    confidenceThreshold: source.confidenceThreshold,
    allowClassification: mode !== 'pinned' && source.allowClassification,
    allowedModels: Object.freeze(models),
  });
  const minimum = profiles.indexOf(policy.minimum), maximum = profiles.indexOf(policy.maximum);
  const fallback = profiles.indexOf(policy.fallback);
  if (fallback < minimum || fallback > maximum) throw new Error('Routing fallback conflicts with policy range');
  const routeSource = options.routes ?? configuredRoutes;
  const routes = Object.fromEntries(profiles.map(profile => {
    const route = routeSource[profile];
    if (!route || !allowedEfforts[route.model]?.includes(route.effort) ||
        (route.effort === 'low' && (profile !== 'FAST' || route.model !== 'gpt-6-luna'))) throw new Error('Invalid routing policy route');
    if (profiles.indexOf(profile) >= minimum && profiles.indexOf(profile) <= maximum && !models.includes(route.model)) {
      throw new Error('Routing policy permits a prohibited model');
    }
    return [profile, Object.freeze({ model: route.model, effort: route.effort })];
  })) as Record<Profile, Readonly<Route>>;
  const model = options.model ?? routes[policy.fallback].model;
  if (routes[policy.fallback].effort !== 'medium') throw new Error('Routing fallback must use medium effort');
  if (!models.includes(model)) throw new Error(`Model must be one of: ${models.join(', ')}`);
  const classificationTimeoutMs = options.classificationTimeoutMs ?? classificationBudget.client;
  if (!Number.isSafeInteger(classificationTimeoutMs) || classificationTimeoutMs < 1 || classificationTimeoutMs > 30_000) {
    throw new Error('Invalid classification timeout; expected 1–30000 milliseconds');
  }
  const snapshot = { version: runtimePolicyVersion, mode, model, effort: 'medium' as const, effortMode, contextEligibility, classifierLifecycle: 'bounded-circuit-v1' as const,
    classificationTimeoutMs, policy, routes: Object.freeze(routes) } as const;
  const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  return Object.freeze({ ...snapshot, hash });
}

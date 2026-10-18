import { profiles } from './types.ts';
import type { Decision, Policy, Profile, ProfileProbabilities, Route } from './types.ts';

// Copy only the documented distribution. Provider extras must never enter logs.
export function parseProbabilities(raw: unknown, profile: unknown): ProfileProbabilities {
  if (!profiles.includes(profile as Profile) || !raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid classifier probabilities');
  }
  const value = raw as Record<string, unknown>;
  if (Object.keys(value).length !== profiles.length || profiles.some(key => !Object.hasOwn(value, key) ||
    typeof value[key] !== 'number' || !Number.isFinite(value[key]) || (value[key] as number) < 0 ||
    (value[key] as number) > 1)) throw new Error('Invalid classifier probabilities');
  const result = Object.fromEntries(profiles.map(key => [key, value[key]])) as ProfileProbabilities;
  if (Math.abs(profiles.reduce((sum, key) => sum + result[key], 0) - 1) > 1e-6 ||
    profiles.some(key => result[key] > result[profile as Profile])) throw new Error('Invalid classifier probabilities');
  return result;
}

export function parseServedModel(raw: unknown): string {
  if (typeof raw !== 'string' || raw !== raw.trim() || !/^jev-[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(raw)) {
    throw new Error('Invalid classifier served model');
  }
  return raw;
}

export function parseDecision(raw: unknown): Decision {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid classification');
  const value = raw as Record<string, unknown>;
  if (!profiles.includes(value.profile as Profile)) throw new Error('Invalid profile');
  if (value.confidence !== null && (typeof value.confidence !== 'number' ||
    !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1)) {
    throw new Error('Invalid confidence');
  }
  const decision: Decision = { profile: value.profile as Profile, confidence: value.confidence as number | null };
  if (value.reportedConfidence !== undefined) {
    if (typeof value.reportedConfidence !== 'number' || !Number.isFinite(value.reportedConfidence) ||
      value.reportedConfidence < 0 || value.reportedConfidence > 1) throw new Error('Invalid reported confidence');
    decision.reportedConfidence = value.reportedConfidence;
  }
  if (value.probabilities !== undefined) decision.probabilities = parseProbabilities(value.probabilities, decision.profile);
  if (value.servedModel !== undefined) decision.servedModel = parseServedModel(value.servedModel);
  if (value.usage !== undefined) {
    const usage = value.usage as Record<string, unknown>;
    if (!usage || typeof usage !== 'object' || !Number.isSafeInteger(usage.inputTokens) ||
      !Number.isSafeInteger(usage.outputTokens) || (usage.inputTokens as number) < 0 ||
      (usage.outputTokens as number) < 0) throw new Error('Invalid classifier usage');
    decision.usage = { inputTokens: usage.inputTokens as number, outputTokens: usage.outputTokens as number };
  }
  return decision;
}

export function validatePolicy(policy: Policy): void {
  for (const profile of [policy.minimum, policy.maximum, policy.fallback]) {
    if (!profiles.includes(profile)) throw new Error('Invalid policy profile');
  }
  if (profiles.indexOf(policy.minimum) > profiles.indexOf(policy.maximum)) throw new Error('Policy conflict');
  if (!Number.isFinite(policy.confidenceThreshold) || policy.confidenceThreshold < 0 || policy.confidenceThreshold > 1) {
    throw new Error('Invalid confidence threshold');
  }
}

export function enforce(profile: Profile, policy: Policy, routes: Record<Profile, Route>): { profile: Profile; route: Route } {
  validatePolicy(policy);
  const index = Math.max(profiles.indexOf(policy.minimum), Math.min(profiles.indexOf(policy.maximum), profiles.indexOf(profile)));
  const selected = profiles[index];
  const route = routes[selected];
  if (!route || !policy.allowedModels.includes(route.model)) throw new Error('Selected model is prohibited');
  return { profile: selected, route: { ...route } };
}

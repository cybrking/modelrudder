import { enforce } from './policy.ts';
import type { Decision, Effort, EffortMode, Policy, Profile, Route } from './types.ts';

// Callers explicitly choose whether an experimental provider score is eligible.
// A reported score must never silently become calibrated confidence.
export function confidenceGate(decision: Decision, policy: Policy, source: 'calibrated' | 'reported') {
  const confidence = source === 'reported' ? decision.reportedConfidence ?? decision.confidence : decision.confidence;
  return { confidence, qualified: confidence !== null && confidence >= policy.confidenceThreshold };
}
export function recommendRoute(decision: Decision, policy: Policy, routes: Record<Profile, Route>,
  source: 'calibrated' | 'reported') {
  const gate = confidenceGate(decision, policy, source);
  return { ...gate, candidate: enforce(decision.profile, policy, routes),
    recommendation: enforce(gate.qualified ? decision.profile : policy.fallback, policy, routes) };
}

export function turnEffort(options: { mode: 'auto' | 'observe' | 'pinned'; effortMode: EffortMode;
  candidate: Route | null; selected: Route; qualified: boolean; reason: string }) {
  let effort: Effort = 'medium';
  let effortReason = options.effortMode === 'fixed' ? 'fixed_medium' : options.reason;
  if (options.effortMode !== 'fixed' && options.candidate && options.qualified) {
    if (options.effortMode === 'observe') effortReason = 'observe';
    else if (options.mode === 'observe') effortReason = 'model_observe_baseline';
    else if (options.mode === 'auto') {
      effort = options.selected.effort;
      effortReason = effort === 'low' ? 'experimental_effort' : 'profile_medium';
    }
  } else if (options.effortMode !== 'fixed' && options.candidate) effortReason = 'uncertain_classification';
  return { effort, effortReason, proposedEffort: options.candidate?.effort ?? null };
}

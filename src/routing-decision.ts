import { enforce } from './policy.ts';
import type { Decision, Effort, EffortMode, Policy, Profile, Route } from './types.ts';

// Parsing establishes a valid classifier decision; reported confidence remains
// descriptive metadata and is not a model/effort selection gate.
export function recommendRoute(decision: Decision, policy: Policy, routes: Record<Profile, Route>) {
  const selected = enforce(decision.profile, policy, routes);
  return { confidence: decision.reportedConfidence ?? decision.confidence,
    candidate: selected, recommendation: selected };
}

export function turnEffort(options: { mode: 'auto' | 'observe' | 'pinned'; effortMode: EffortMode;
  candidate: Route | null; selected: Route; reason: string }) {
  let effort: Effort = 'medium';
  let effortReason = options.effortMode === 'fixed' ? 'fixed_medium' : options.reason;
  if (options.effortMode !== 'fixed' && options.candidate) {
    if (options.effortMode === 'observe') effortReason = 'observe';
    else if (options.mode === 'observe') effortReason = 'model_observe_baseline';
    else if (options.mode === 'auto') {
      effort = options.selected.effort;
      effortReason = effort === 'low' ? 'experimental_effort' : 'profile_medium';
    }
  }
  return { effort, effortReason, proposedEffort: options.candidate?.effort ?? null };
}

export const profiles = ['FAST', 'BALANCED', 'DEEP', 'MAX'] as const;
export type Profile = typeof profiles[number];
export type ProfileProbabilities = Record<Profile, number>;
export type Effort = 'low' | 'medium';
export const effortModes = ['fixed', 'observe', 'auto'] as const;
export type EffortMode = typeof effortModes[number];
export const routingReasons = ['pinned', 'classification_disabled', 'experimental_route', 'observe',
  'uncertain_classification', 'classifier_failed', 'media_baseline', 'unsupported_input_baseline',
  'reference_context_baseline', 'unclassified_context_baseline', 'classifier_circuit_open', 'classifier_access_denied', 'classifier_quota_exceeded'] as const;
export const effortReasons = ['fixed_medium', 'observe', 'experimental_effort', 'profile_medium',
  'model_observe_baseline', 'uncertain_classification', 'classifier_failed', 'classification_disabled',
  'pinned', 'media_baseline', 'unsupported_input_baseline', 'reference_context_baseline', 'unclassified_context_baseline', 'classifier_circuit_open', 'classifier_access_denied', 'classifier_quota_exceeded'] as const;
export type Route = { model: string; effort: Effort };
export type Decision = {
  profile: Profile; confidence: number | null;
  reportedConfidence?: number;
  probabilities?: ProfileProbabilities;
  servedModel?: string;
  usage?: { inputTokens: number; outputTokens: number };
};
export type Request = { input: string };
export type Policy = {
  minimum: Profile;
  maximum: Profile;
  allowedModels: readonly string[];
  allowClassification: boolean;
  confidenceThreshold: number;
  fallback: Profile;
};
export type Classifier = (request: Request, signal?: AbortSignal) => Promise<unknown>;
export type Execution = { text: string; success: boolean; inputTokens: number; outputTokens: number };
export type Executor = (request: Request, route: Route) => Promise<Execution>;

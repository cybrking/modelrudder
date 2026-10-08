import type { Effort, Policy, Profile, Route } from './types.ts';

// Model-selection guidance verified 2026-10-01.
// Account availability must be verified before live execution.
export const routes: Record<Profile, Route> = {
  FAST: { model: 'gpt-6-luna', effort: 'low' },
  BALANCED: { model: 'gpt-6-luna', effort: 'medium' },
  DEEP: { model: 'gpt-6.1-sol', effort: 'medium' },
  MAX: { model: 'gpt-6-astra', effort: 'medium' },
};
export const allowedEfforts: Record<string, readonly Effort[]> = {
  'gpt-6-luna': ['low', 'medium'],
  'gpt-6.1-sol': ['low', 'medium'],
  'gpt-6-astra': ['medium'],
};
export const defaultPolicy: Policy = {
  minimum: 'FAST', maximum: 'MAX', fallback: 'DEEP',
  confidenceThreshold: 0.8,
  allowClassification: true,
  allowedModels: ['gpt-6-luna', 'gpt-6.1-sol', 'gpt-6-astra'],
};

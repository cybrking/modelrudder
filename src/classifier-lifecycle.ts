import { ClassificationError, withDeadline } from './classifier-contract.ts';
import { parseDecision } from './policy.ts';
import type { Classifier } from './types.ts';

// One instance per launcher. No prompts, durable remote state or inference retries.
export function createClassifierLifecycle(classifier: Classifier, timeoutMs: number,
  options: { now?: () => number; cooldownMs?: number; failureThreshold?: number } = {}): Classifier {
  const now = options.now ?? (() => performance.now());
  const cooldown = options.cooldownMs ?? 30_000, threshold = options.failureThreshold ?? 3;
  let failures = 0, openUntil = 0, probe = false;
  return async (request, parent) => {
    const recovering = openUntil !== 0;
    if (recovering && (now() < openUntil || probe)) throw new ClassificationError('circuit_open');
    if (recovering) probe = true;
    try {
      const result = parseDecision(await withDeadline(timeoutMs, signal => classifier(request, signal), parent));
      failures = 0; openUntil = 0;
      return result;
    } catch (error) {
      if (!parent?.aborted) {
        if (++failures >= threshold || error instanceof ClassificationError &&
            ['access_denied', 'quota_exceeded'].includes(error.code)) openUntil = now() + cooldown;
      }
      throw error;
    } finally { if (recovering) probe = false; }
  };
}

export function classifierFailureReason(error: unknown): string {
  if (!(error instanceof ClassificationError)) return 'classifier_failed';
  return error.code === 'access_denied' ? 'classifier_access_denied' : error.code === 'quota_exceeded'
    ? 'classifier_quota_exceeded' : error.code === 'circuit_open' ? 'classifier_circuit_open' : 'classifier_failed';
}

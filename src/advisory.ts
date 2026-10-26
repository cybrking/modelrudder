import { classificationEnabled, createConfiguredClassifier } from './classifier.ts';
import { claudeJevInput } from './claude-classifier.ts';
import { defaultPolicy, routes } from './config.ts';
import { parseDecision } from './policy.ts';
import { recommendRoute } from './routing-decision.ts';
import { withDeadline } from './classifier-contract.ts';
import type { Classifier, Profile } from './types.ts';

export type AdvisoryProvider = 'codex' | 'claude';
const claudeModels: Record<Profile, string> = { FAST: 'haiku', BALANCED: 'sonnet', DEEP: 'sonnet', MAX: 'opus' };
export const advisoryTimeoutMs = 1500;

export function recommendationNote(provider: AdvisoryProvider, raw: unknown, currentModel: string): string | null {
  const decision = parseDecision(raw);
  const model = provider === 'claude' ? claudeModels[decision.profile]
    : recommendRoute(decision, defaultPolicy, routes).recommendation.route.model;
  const current = provider === 'claude'
    ? /^(?:claude-)?(haiku|sonnet|opus)(?:-[a-z0-9.-]+)?(?:\[1m\])?$/.exec(currentModel)?.[1]
    : currentModel;
  if (current === model) return null;
  return `ModelRudder suggests ${model} for this task. Use /model if you want to switch; your current model is unchanged.`;
}

export async function recommend(provider: AdvisoryProvider, task: string, currentModel: string,
  env: NodeJS.ProcessEnv = process.env, classifier?: Classifier, parent?: AbortSignal): Promise<string | null> {
  // Suggestions use only this prompt, never files, transcripts or prior turns.
  if (!['codex', 'claude'].includes(provider) || typeof task !== 'string' || !task.trim() || task.length > 64000 ||
      /^\s*[!/]/.test(task) || /(^|\s)@\S/.test(task) ||
      typeof currentModel !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._:[\]-]{0,127}$/.test(currentModel)) return null;
  try {
    if (!classificationEnabled(env)) return null;
    if (provider === 'claude' && env.SMART_CODEX_CLASSIFIER === 'hosted') return null;
    const classify = classifier ?? createConfiguredClassifier(env, advisoryTimeoutMs,
      provider === 'claude' ? claudeJevInput : undefined,
      provider === 'claude' ? 'claude-rubric-2026-10-08' : undefined);
    const result = await withDeadline(advisoryTimeoutMs, signal => classify({
      input: JSON.stringify({ previousUserTasks: [], currentTask: task }),
    }, signal), parent);
    return recommendationNote(provider, result, currentModel);
  } catch { return null; }
}

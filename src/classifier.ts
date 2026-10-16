import { createHostedClassifier } from './adapters/hosted.ts';
import { createJevClassifier, jevInput } from './adapters/jev.ts';
import { createTevClassifier, localTevEndpoint, tevModel, tevCodexRubric } from './adapters/tev.ts';
import { httpsEndpoint } from './classifier-contract.ts';

export function readClassifierConfig(env: Record<string, string | undefined>) {
  const provider = env.SMART_CODEX_CLASSIFIER === 'jev' ? 'direct' : env.SMART_CODEX_CLASSIFIER ?? 'direct';
  if (provider === 'tev') return { provider, url: localTevEndpoint(env.SMART_CODEX_TEV_URL), model: tevModel(env.SMART_CODEX_TEV_MODEL) } as const;
  if (provider !== 'direct' && provider !== 'hosted') throw new Error('SMART_CODEX_CLASSIFIER must be jev, direct, hosted or tev');
  if (provider === 'direct') {
    const apiKey = env.TYPESAFE_API_KEY?.trim() ?? '';
    if (!apiKey) throw new Error('TYPESAFE_API_KEY is required when Jev classification is enabled');
    return { provider, apiKey } as const;
  }
  const url = env.SMART_CODEX_GATEWAY_URL ?? '';
  const token = env.SMART_CODEX_GATEWAY_TOKEN ?? '';
  try { httpsEndpoint(url); } catch { throw new Error('SMART_CODEX_GATEWAY_URL must be an HTTPS classification endpoint'); }
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new Error('SMART_CODEX_GATEWAY_TOKEN must be a customer access token');
  return { provider, url, token } as const;
}

export function classificationEnabled(env: Record<string, string | undefined>): boolean {
  const flag = env.ALLOW_CLASSIFICATION;
  if (flag !== undefined && flag !== 'true' && flag !== 'false') throw new Error('ALLOW_CLASSIFICATION must be true or false');
  if (flag === 'false') return false;
  // Hosted consent is always required; a local activation never grants it.
  return env.SMART_CODEX_CLASSIFIER === 'tev' ? flag === 'true' : env.ALLOW_JEV_CLASSIFICATION === 'true';
}

export function classifierNotice(env: Record<string, string | undefined>) {
  return env.SMART_CODEX_CLASSIFIER === 'tev'
    ? 'Routing provider: Tev (local). Eligible task text stays on the local classifier; native execution still uses your provider. No hosted classifier fallback.'
    : 'Routing provider: Jev. Eligible task text and up to two earlier excerpts are sent to TypeSafe' + (env.SMART_CODEX_CLASSIFIER === 'hosted' ? ' through your configured gateway.' : '.');
}

export function createConfiguredClassifier(env: Record<string, string | undefined>, timeoutMs?: number,
  buildInput?: typeof jevInput, rubric?: string) {
  const config = readClassifierConfig(env);
  const classifier = config.provider === 'tev' ? createTevClassifier({ ...config, timeoutMs, buildInput })
    : config.provider === 'direct' ? createJevClassifier({ apiKey: config.apiKey, timeoutMs, buildInput })
    : createHostedClassifier({ url: config.url, token: config.token, timeoutMs });
  return Object.assign(classifier, { metadata: {
    provider: config.provider === 'tev' ? 'tev' : 'jev',
    version: `${config.provider === 'tev' ? config.model : 'jev-latest'}:${rubric ?? (config.provider === 'tev' && !buildInput ? tevCodexRubric : 'rubric-2026-10-01')}`,
  } });
}

// Strip only router options before the native argument parser; never inspect after --.
export function classifierOverride(args: string[], env: NodeJS.ProcessEnv) {
  const remaining: string[] = []; let provider: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') { remaining.push(...args.slice(i)); break; }
    if (arg === '--classifier' || arg.startsWith('--classifier=')) {
      const value = arg === '--classifier' ? args[++i] : arg.slice('--classifier='.length);
      if (provider || !['jev', 'tev'].includes(value)) throw new Error('Invalid --classifier; choose jev or tev once.');
      provider = value;
    } else remaining.push(arg);
  }
  return { args: remaining, env: provider ? { ...env, SMART_CODEX_CLASSIFIER: provider === 'jev' ? 'direct' : 'tev' } : env };
}

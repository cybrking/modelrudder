import { createHostedClassifier } from './adapters/hosted.ts';
import { createJevClassifier, jevInput } from './adapters/jev.ts';
import { httpsEndpoint } from './classifier-contract.ts';

export function readClassifierConfig(env: Record<string, string | undefined>) {
  const provider = env.SMART_CODEX_CLASSIFIER === 'jev' ? 'direct' : env.SMART_CODEX_CLASSIFIER ?? 'direct';
  if (provider !== 'direct' && provider !== 'hosted') throw new Error('SMART_CODEX_CLASSIFIER must be jev, direct or hosted; run setup --classifier jev.');
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
  return ['jev', 'direct', 'hosted'].includes(env.SMART_CODEX_CLASSIFIER ?? 'direct') && env.ALLOW_JEV_CLASSIFICATION === 'true';
}

export function classifierNotice(env: Record<string, string | undefined>) {
  return 'Recommendation provider: Jev. Only the current eligible task text is sent to TypeSafe' + (env.SMART_CODEX_CLASSIFIER === 'hosted' ? ' through your configured gateway.' : '.');
}

export function createConfiguredClassifier(env: Record<string, string | undefined>, timeoutMs?: number,
  buildInput?: typeof jevInput, rubric?: string) {
  const config = readClassifierConfig(env);
  const classifier = config.provider === 'direct' ? createJevClassifier({ apiKey: config.apiKey, timeoutMs, buildInput })
    : createHostedClassifier({ url: config.url, token: config.token, timeoutMs });
  return Object.assign(classifier, { metadata: {
    provider: 'jev',
    version: `jev-latest:${rubric ?? 'rubric-2026-10-01'}`,
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
      if (provider || value !== 'jev') throw new Error('Invalid --classifier; choose jev once.');
      provider = value;
    } else remaining.push(arg);
  }
  return { args: remaining, env: provider ? { ...env, SMART_CODEX_CLASSIFIER: 'direct' } : env };
}

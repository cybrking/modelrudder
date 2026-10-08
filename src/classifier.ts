import { createHostedClassifier } from './adapters/hosted.ts';
import { createJevClassifier } from './adapters/jev.ts';
import { httpsEndpoint } from './classifier-contract.ts';

export function readClassifierConfig(env: Record<string, string | undefined>) {
  const provider = env.SMART_CODEX_CLASSIFIER ?? 'direct';
  if (provider !== 'direct' && provider !== 'hosted') throw new Error('SMART_CODEX_CLASSIFIER must be direct or hosted');
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

export function createConfiguredClassifier(env: Record<string, string | undefined>, timeoutMs?: number) {
  const config = readClassifierConfig(env);
  return config.provider === 'direct' ? createJevClassifier({ apiKey: config.apiKey, timeoutMs })
    : createHostedClassifier({ url: config.url, token: config.token, timeoutMs });
}

import { boundedJson, withDeadline } from '../classifier-contract.ts';
import { jevInput, parseJevResponse } from './jev.ts';
import type { Classifier } from '../types.ts';

export function localTevEndpoint(value = 'http://127.0.0.1:11434'): string {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) ||
    url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Tev endpoint must be an HTTP loopback IP origin without credentials or a path.');
  }
  return url.origin;
}

export function tevModel(value = 'tev1:latest'): string {
  if (!/^tev[0-9]+:[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(value)) throw new Error('Invalid Tev model; use a tagged model such as tev1:latest.');
  return value;
}

export function createTevClassifier(options: { url: string; model: string; timeoutMs?: number;
  fetch?: typeof fetch; buildInput?: typeof jevInput }): Classifier {
  const origin = localTevEndpoint(options.url), model = tevModel(options.model);
  const transport = options.fetch ?? fetch;
  return async (request, parent) => {
    try {
      return await withDeadline(options.timeoutMs ?? 13_000, async signal => {
        const response = await transport(`${origin}/v1/systemone`, { method: 'POST', redirect: 'error', signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, ...(options.buildInput ?? jevInput)(request.input) }) });
        if (!response.ok) throw new Error();
        const raw = await boundedJson(response, 16_384, signal);
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error();
        const value = raw as Record<string, unknown>;
        // Same choice schema; retain actual served identity only when returned.
        if (value.model !== undefined && value.model !== model) throw new Error();
        const result = parseJevResponse({ ...raw, model: undefined });
        return { ...result, ...(value.model === undefined ? {} : { servedModel: model }) };
      }, parent);
    } catch { throw new Error('Tev request failed'); }
  };
}

// Metadata only: does not load a model or submit task text/inference.
export async function inspectTev(url: string, model: string, transport = fetch) {
  try {
    return await withDeadline(2000, async signal => {
      const response = await transport(`${localTevEndpoint(url)}/api/tags`, { redirect: 'error', signal });
      if (!response.ok) throw new Error();
      const data = await boundedJson(response, 256 * 1024, signal);
      if (!data || typeof data !== 'object' || !('models' in data) || !Array.isArray(data.models)) return { ready: false, message: 'Tev service protocol unsupported.' };
      const found = data.models.find((entry: { name?: unknown }) => entry?.name === model);
      if (!found) return { ready: false, message: `Tev service reachable; ${model} is missing. Install the model in your local service, then retry setup.` };
      const digest = typeof found.digest === 'string' && /^(sha256:)?[a-f0-9]{64}$/.test(found.digest) ? found.digest : null;
      return { ready: true, message: `Tev model present: ${model}; digest ${digest ?? 'unavailable'}. Inference readiness and systemone compatibility have not been tested.` };
    });
  } catch { return { ready: false, message: 'Tev service unavailable. Start your local service and retry; no task was sent to Jev.' }; }
}

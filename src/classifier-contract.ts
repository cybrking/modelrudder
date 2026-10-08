export const classifierVersion = 'jev-latest:rubric-2026-10-01';
export const gatewayProtocol = 1;

export function httpsEndpoint(value: string): string {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Expected an HTTPS endpoint without credentials, query or fragment');
  }
  return url.href;
}

export async function boundedJson(response: Request | Response, limit: number, signal?: AbortSignal): Promise<unknown> {
  if (!response.body) throw new Error('Missing JSON body');
  const reader = response.body.getReader();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0; let text = '';
  try {
    while (true) {
      if (signal?.aborted) throw new Error('Request cancelled');
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('JSON body exceeds limit');
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    signal?.removeEventListener('abort', cancel);
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export const classificationBudget = Object.freeze({ client: 13_000, gateway: 12_500,
  access: 500, body: 1000, quota: 500, provider: 10_000, release: 500 });
export type ClassifierFailure = 'unavailable' | 'access_denied' | 'quota_exceeded' | 'invalid_response' | 'circuit_open';
export class ClassificationError extends Error {
  readonly code: ClassifierFailure;
  constructor(code: ClassifierFailure) { super(`Classification ${code}`); this.code = code; }
}

// Bound consumption and transports that ignore abort; propagate caller cancellation.
export async function withDeadline<T>(timeoutMs: number, work: (signal: AbortSignal) => Promise<T>, parent?: AbortSignal): Promise<T> {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('Invalid timeout');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort!: () => void;
  const cancellation = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new Error('Request cancelled')); };
    parent?.addEventListener('abort', abort, { once: true });
  });
  try {
    if (parent?.aborted) { abort(); return await cancellation; }
    return await Promise.race([work(controller.signal), cancellation, new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('Request timed out')); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer); parent?.removeEventListener('abort', abort); }
}

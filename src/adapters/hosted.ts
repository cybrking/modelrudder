import { boundedJson, classificationBudget, ClassificationError, classifierVersion, gatewayProtocol, httpsEndpoint, withDeadline } from '../classifier-contract.ts';
import { parseDecision } from '../policy.ts';
import type { Classifier } from '../types.ts';

export function createHostedClassifier(options: {
  url: string; token: string; timeoutMs?: number; fetch?: typeof fetch;
}): Classifier {
  const url = httpsEndpoint(options.url);
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(options.token)) throw new Error('Invalid gateway access token');
  const timeoutMs = options.timeoutMs ?? classificationBudget.client;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000) throw new Error('Invalid gateway timeout');
  const transport = options.fetch ?? fetch;
  return async (request, parent) => {
    try {
      return await withDeadline(timeoutMs, async signal => {
        const response = await transport(url, { method: 'POST', redirect: 'error', signal,
          headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ input: request.input }) });
        if (response.status === 401 || response.status === 403) throw new ClassificationError('access_denied');
        if (response.status === 429) throw new ClassificationError('quota_exceeded');
        if (!response.ok) throw new Error();
        const raw = await boundedJson(response, 16_384, signal) as Record<string, unknown>;
        if (!raw || raw.protocol !== gatewayProtocol || raw.classifierVersion !== classifierVersion) throw new Error();
        const decision = parseDecision(raw.decision);
        if (decision.confidence !== null || decision.reportedConfidence === undefined || !decision.usage) throw new Error();
        return decision;
      }, parent);
    } catch (error) {
      if (error instanceof ClassificationError) throw error;
      throw new Error('Hosted classification failed');
    }
  };
}

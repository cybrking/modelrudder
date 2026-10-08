import { boundedJson, withDeadline } from './classifier-contract.ts';
import { readClassifierConfig } from './classifier.ts';

export async function accountStatus(env: Record<string, string | undefined>, transport: typeof fetch = fetch) {
  const config = readClassifierConfig(env);
  if (config.provider !== 'hosted') throw new Error('Account status requires hosted classification.');
  const url = new URL(config.url); url.pathname = '/v1/status';
  return withDeadline(5000, async signal => {
    const response = await transport(url, { signal, redirect: 'error', headers: { Authorization: `Bearer ${config.token}` } });
    if (response.status === 401) throw new Error('Access token is invalid, expired or revoked. Contact support.');
    if (!response.ok) throw new Error('Account status is unavailable. Try again later.');
    const raw = await boundedJson(response, 8192, signal) as Record<string, unknown>;
    const fields = ['customerId', 'managed', 'status', 'accessActive', 'accessUntil', 'billingStatus',
      'dailyRequests', 'usedToday', 'remainingToday', 'monthlyRequests', 'usedThisMonth', 'remainingThisMonth', 'allowancePeriod',
      'resetAt', 'burstRequests', 'maxConcurrent', 'maxInputChars'];
    return Object.fromEntries(fields.filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]));
  });
}

import { cliCompatibilityData } from './cli-compatibility-data.ts';
export type CliProvider = 'codex' | 'claude';
const stable = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
export function compareCliVersions(a: string, b: string) {
  if (!stable.test(a) || !stable.test(b)) throw new Error('Invalid stable CLI version');
  return a.split('.').map((part, i) => Number(part) - Number(b.split('.')[i])).find(n => n !== 0) ?? 0;
}
export function cliCompatibility(provider: CliProvider, version: string | null) {
  const policy = cliCompatibilityData[provider];
  const valid = version !== null && stable.test(version);
  const block = valid ? (policy.blocked as { version: string; reason: string }[]).find(entry => entry.version === version) : undefined;
  const blocked = Boolean(block);
  const eligible = valid && !blocked && version.split('.')[0] === policy.minimum.split('.')[0]
    && compareCliVersions(version, policy.minimum) >= 0;
  const recorded = eligible && policy.tested.includes(version);
  return { version, eligible, recorded, blocked, blockReason: block?.reason ?? null,
    withinRecordedRange: eligible && compareCliVersions(version, policy.latestRecorded) <= 0,
    status: blocked ? 'blocked' : !eligible ? 'unsupported' : recorded ? 'recorded' : 'probe-required' };
}

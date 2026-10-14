import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cliCompatibilityData } from '../src/cli-compatibility-data.ts';
import { compareCliVersions, type CliProvider } from '../src/cli-compatibility.ts';

type Candidate = { provider: CliProvider; version: string; os: string };
export type Evidence = Candidate & { sourceSha: string; native: Record<string, unknown> };
const platforms = ['ubuntu-latest', 'macos-latest', 'windows-latest'];
export function promoteCliEvidence(candidates: Candidate[], evidence: Evidence[], sourceSha: string) {
  if (!/^[a-f0-9]{40}$/.test(sourceSha) || !candidates.length) throw new Error('Missing candidate source revision');
  const policy = structuredClone(cliCompatibilityData);
  const providers = new Set(candidates.map(c => c.provider));
  for (const provider of providers) {
    if (!['codex', 'claude'].includes(provider)) throw new Error('Invalid CLI provider');
    const rows = candidates.filter(c => c.provider === provider);
    const version = rows[0].version;
    compareCliVersions(version, policy[provider].minimum);
    if (rows.length !== platforms.length || new Set(rows.map(c => c.os)).size !== platforms.length
      || rows.some(c => c.version !== version || !platforms.includes(c.os))) throw new Error('Incomplete candidate platform matrix');
    if (version.split('.')[0] !== policy[provider].minimum.split('.')[0]
      || compareCliVersions(version, policy[provider].minimum) < 0
      || policy[provider].blocked.some((c: { version: string }) => c.version === version)) throw new Error('Candidate is blocked or outside supported major');
    for (const row of rows) {
      const records = evidence.filter(e => e.provider === provider && e.version === version && e.os === row.os);
      if (records.length !== 1 || records[0].sourceSha !== sourceSha) throw new Error('Missing, duplicate or stale CLI evidence');
      const native = records[0].native;
      if (provider === 'codex') {
        const required = ['remote-capability', 'stdio-capability', 'stdio-initialize', 'fresh-thread-start', 'model-setting', 'read-only-permissions'];
        const checks = native.checks;
        if (native.version !== version || native.ok !== true || native.inferenceCalls !== 0 || native.nativeTuiCertified !== false
          || !Array.isArray(checks) || required.some(check => !checks.includes(check))) throw new Error('Codex contract checks did not pass');
      } else {
        const required: Record<string, string> = { 'alias-is-not-resolved': 'haiku', 'haiku-full-id': 'claude-haiku-5-5',
          'sonnet-full-id': 'claude-sonnet-5-5', 'opus-full-id': 'claude-opus-5-5',
          'haiku-obeys-native-allowlist': 'claude-sonnet-5-5', 'opus-obeys-native-allowlist': 'claude-sonnet-5-5' };
        const results = native.results as { name: string; emitted: string }[];
        if (native.version !== `${version} (Claude Code)` || native.provider !== 'synthetic loopback only'
          || native.paidInference !== false || native.realAuthentication !== false || native.interactiveTuiQualified !== false
          || !Array.isArray(results) || results.length !== Object.keys(required).length
          || Object.entries(required).some(([name, emitted]) => results.filter(r => r.name === name && r.emitted === emitted).length !== 1)) {
          throw new Error('Claude contract checks did not pass');
        }
      }
    }
    if (!policy[provider].tested.includes(version)) policy[provider].tested.push(version);
    policy[provider].tested.sort(compareCliVersions);
    if (compareCliVersions(version, policy[provider].latestRecorded) > 0) policy[provider].latestRecorded = version;
  }
  return policy;
}

async function main() {
  const [directory, sourceSha] = process.argv.slice(2);
  if (!directory || !sourceSha || process.argv.length !== 4) throw new Error('Usage: promote-cli-compatibility.ts ARTIFACT_DIRECTORY SOURCE_SHA');
  const plan = JSON.parse(await readFile(join(directory, 'upstream-release-report', 'upstream-releases.json'), 'utf8'));
  const evidence: Evidence[] = [];
  for (const name of await readdir(directory)) {
    if (name.startsWith('upstream-') && name !== 'upstream-release-report') {
      evidence.push(JSON.parse(await readFile(join(directory, name, 'validation.json'), 'utf8')));
    }
  }
  const policy = promoteCliEvidence(plan.matrix.include, evidence, sourceSha);
  await writeFile('src/cli-compatibility-data.ts', `export const cliCompatibilityData = ${JSON.stringify(policy, null, 2)};\n`);
  await mkdir('docs/compatibility', { recursive: true });
  await writeFile('docs/compatibility/latest.json', `${JSON.stringify({ sourceSha, evidence }, null, 2)}\n`);
  await writeFile('compatibility-pr-body.md', `Updates recorded CLI evidence after all candidate checks passed on macOS, Linux and Windows at source revision ${sourceSha}.\n\n${plan.matrix.include.filter((c: Candidate) => c.os === 'ubuntu-latest').map((c: Candidate) => `- ${c.provider} ${c.version}`).join('\n')}\n\nEvidence: docs/compatibility/latest.json. No paid inference or real Claude authentication was used. Full interactive approvals, resume, compaction and task quality remain unqualified. Review upstream changes and run applicable interactive journeys before release. This PR does not merge or publish automatically.\n`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('CLI promotion rejected: incomplete, stale, blocked or invalid evidence.'); process.exitCode = 1; });
}

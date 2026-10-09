import { appendFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { protocolTestedCodexVersions, codexCompatibility } from '../src/compatibility.ts';
import { offlineTestedClaudeVersions, claudeCompatibility } from '../src/claude-command.ts';

const providers = ['codex', 'claude'] as const;
type Provider = typeof providers[number];
const repositories = { codex: 'openai/codex', claude: 'anthropics/claude-code' };
type StableRelease = { provider: Provider; version: string; url: string };
const component = '(?:0|[1-9]\\d{0,5})';
const versionPattern = `${component}\\.${component}\\.${component}`;
const platforms = ['ubuntu-latest', 'macos-latest', 'windows-latest'];

export function parseStableRelease(provider: Provider, value: unknown): StableRelease {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid GitHub release response.');
  const release = value as Record<string, unknown>;
  if (release.draft !== false || release.prerelease !== false || typeof release.tag_name !== 'string') {
    throw new Error('Expected a published stable GitHub release.');
  }
  const prefix = provider === 'codex' ? 'rust-v' : 'v';
  const match = new RegExp(`^${prefix}(${versionPattern})$`).exec(release.tag_name);
  if (!match) throw new Error('Unexpected stable release tag.');
  return { provider, version: match[1],
    url: `https://github.com/${repositories[provider]}/releases/tag/${encodeURIComponent(release.tag_name)}` };
}

export async function fetchStableRelease(provider: Provider, request: typeof fetch = fetch): Promise<StableRelease> {
  const token = process.env.GITHUB_TOKEN;
  const response = await request(`https://api.github.com/repos/${repositories[provider]}/releases/latest`, {
    headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2026-03-10',
      ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`${provider} release lookup failed (HTTP ${response.status}).`);
  return parseStableRelease(provider, await response.json());
}

const compare = (a: string, b: string) => a.split('.').map((part, index) => Number(part) - Number(b.split('.')[index]))
  .find(difference => difference !== 0) ?? 0;

export function releasePlan(latest: StableRelease[], includeRecorded = false) {
  const releases = latest.map(release => {
    const recorded = release.provider === 'codex' ? protocolTestedCodexVersions : offlineTestedClaudeVersions;
    const baseline = [...recorded].sort(compare).at(-1)!;
    const launcherAccepted = release.provider === 'codex'
      ? codexCompatibility(`codex-cli ${release.version}`).protocolTested
      : claudeCompatibility(`${release.version} (Claude Code)`).supportsMods;
    return { ...release, baseline, needsChecks: includeRecorded || compare(release.version, baseline) > 0, launcherAccepted };
  });
  return { releases, matrix: { include: releases.filter(release => release.needsChecks)
    .flatMap(release => platforms.map(os => ({ provider: release.provider, version: release.version, os }))) } };
}

async function main() {
  const args = process.argv.slice(2);
  const includeRecorded = args.length === 1 && args[0] === '--include-recorded';
  if (args.length && !includeRecorded) throw new Error('Usage: node scripts/check-upstream-releases.ts [--include-recorded]');
  const latest = await Promise.all(providers.map(provider => fetchStableRelease(provider)));
  const plan = { checkedAt: new Date().toISOString(), ...releasePlan(latest, includeRecorded) };
  await writeFile('upstream-releases.json', `${JSON.stringify(plan, null, 2)}\n`);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(plan.matrix)}\nhas_updates=${plan.matrix.include.length > 0}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const rows = plan.releases.map(release => `| ${release.provider} | [${release.version}](${release.url}) | ${release.baseline} | ${release.needsChecks ? 'candidate checks' : 'no newer release'} | ${release.launcherAccepted ? 'accepted' : 'currently rejected'} |`);
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Daily upstream releases\n\n| CLI | Latest stable | Recorded baseline | Action | Current launcher |\n| --- | --- | --- | --- | --- |\n${rows.join('\n')}\n\nNative probes use no paid inference. Passing probes do not update launchers or certify full interactive/task-quality behavior.\n`);
  }
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => { console.error('Upstream release check failed; inspect API availability and stable release tags. No supported versions were changed.'); process.exitCode = 1; });
}

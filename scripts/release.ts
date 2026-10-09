import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Explicit allowlist: never ship credentials, usage records, or experiment inputs.
export const legacyReleaseFiles = [
  'LICENSE', 'package.json', 'package-lock.json', 'bin/smart-codex', 'scripts/release.ts',
  'src/install-cli.ts', 'src/smart-codex.ts', 'src/config.ts', 'src/policy.ts',
  'src/runtime-policy.ts', 'src/compatibility.ts', 'src/routing-decision.ts', 'src/classifier-lifecycle.ts', 'src/outcome.ts', 'src/doctor.ts', 'src/live-config.ts', 'src/types.ts', 'src/turn-relay.ts',
  'src/classifier.ts', 'src/classifier-contract.ts', 'src/adapters/hosted.ts',
  'src/account-status.ts',
  'src/native-command.ts', 'src/private-files.ts', 'src/setup.ts',
  'src/session-usage.ts', 'src/usage-log.ts', 'src/usage-report.ts', 'src/adapters/jev.ts',
  'node_modules/ws/LICENSE', 'node_modules/ws/package.json', 'node_modules/ws/index.js',
  'node_modules/ws/browser.js', 'node_modules/ws/wrapper.mjs',
  ...['buffer-util', 'constants', 'event-target', 'extension', 'limiter', 'permessage-deflate',
    'receiver', 'sender', 'stream', 'subprotocol', 'validation', 'websocket-server', 'websocket']
    .map(name => `node_modules/ws/lib/${name}.js`),
].sort();
// Accept the last Codex-only manifest for offline upgrades and rollback. New builds
// always include both launchers; partial Claude payloads remain invalid.
export const releaseFiles = [...legacyReleaseFiles,
  'bin/smart-claude', 'src/smart-claude.ts', 'src/claude-routing.ts',
  'src/claude-classifier.ts', 'src/claude-command.ts', 'src/claude-usage.ts',
  'plugins/claude/.claude-plugin/plugin.json', 'plugins/claude/hooks/hooks.json', 'plugins/claude/hooks/register.js',
].sort();
export type Release = { format: 1; version: string; id: string; files: Record<string, string>; sha256: string };
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const payload = (version: string, files: Record<string, string>) => JSON.stringify({ format: 1, version, files });
export function validateRelease(value: unknown): Release {
  if (!value || typeof value !== 'object') throw new Error('Invalid release artifact.');
  const r = value as Release;
  if (r.format !== 1 || typeof r.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(r.version)
    || !r.files || typeof r.files !== 'object' || Array.isArray(r.files)
    || ![releaseFiles, legacyReleaseFiles].some(allowlist => JSON.stringify(Object.keys(r.files)) === JSON.stringify(allowlist))
    || Object.values(r.files).some(content => typeof content !== 'string')) throw new Error('Invalid release manifest or file allowlist.');
  if (r.sha256 !== digest(payload(r.version, r.files)) || r.id !== `${r.version}-${r.sha256.slice(0, 16)}`) throw new Error('Release checksum mismatch.');
  const pkg = JSON.parse(r.files['package.json']);
  const lock = JSON.parse(r.files['package-lock.json']);
  const ws = JSON.parse(r.files['node_modules/ws/package.json']);
  if (pkg.version !== r.version || lock.version !== r.version || lock.packages['node_modules/ws'].version !== ws.version) throw new Error('Release dependency/version mismatch.');
  return r;
}
export async function buildRelease(root: string): Promise<Release> {
  const files: Record<string, string> = {};
  for (const path of releaseFiles) {
    if (!(await lstat(resolve(root, path))).isFile()) throw new Error(`Release source must be a regular file: ${path}`);
    files[path] = await readFile(resolve(root, path), 'utf8');
  }
  const version = JSON.parse(files['package.json']).version;
  const sha256 = digest(payload(version, files));
  return validateRelease({ format: 1, version, id: `${version}-${sha256.slice(0, 16)}`, files, sha256 });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] === '--help') console.log('Usage: node scripts/release.ts OUTPUT.json\nBuild a deterministic offline release from installed locked dependencies.');
  else {
    try {
      const release = await buildRelease(fileURLToPath(new URL('../', import.meta.url)));
      await writeFile(resolve(args[0]), `${JSON.stringify(release)}\n`, { mode: 0o600, flag: 'wx' });
      console.log(`Packaged ${release.id}; SHA-256 ${release.sha256}`);
    } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
  }
}

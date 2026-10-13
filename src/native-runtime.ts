import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { protocolTestedCodexVersions } from './compatibility.ts';
import { offlineTestedClaudeVersions } from './claude-command.ts';
import type { NativeCommand } from './native-command.ts';
import { protectPrivatePathSync } from './private-files.ts';

export type NativeProvider = 'codex' | 'claude';
type Selection = { format: 1; current: string; previous: string | null };
type Metadata = { format: 1; provider: NativeProvider; version: string; platform: string; arch: string; entry: string };
const execute = promisify(execFile);
const versionPattern = /^\d+\.\d+\.\d+$/;
const problem = (message: string) => new Error(`ModelRudder native: ${message}`);
export const testedNativeVersions = (provider: NativeProvider): readonly string[] =>
  provider === 'codex' ? protocolTestedCodexVersions : offlineTestedClaudeVersions;
export function nativeDirectory(provider: NativeProvider, env: NodeJS.ProcessEnv = process.env) {
  const state = env.SMART_CODEX_STATE_DIR || (process.platform === 'win32'
    ? join(env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'ModelRudder', 'runtime', 'state')
    : join(homedir(), '.local', 'share', 'smart-codex', 'state'));
  return resolve(state, 'native', provider);
}
async function info(path: string) {
  try { return await lstat(path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
}
function approved(provider: NativeProvider, version: unknown): asserts version is string {
  if (typeof version !== 'string' || !versionPattern.test(version) || !testedNativeVersions(provider).includes(version)) {
    throw problem(`${provider} ${typeof version === 'string' && versionPattern.test(version) ? version : 'version'} is not verified by this ModelRudder release. Supported: ${testedNativeVersions(provider).join(', ')}. Upgrade ModelRudder after candidate checks pass; the current CLI was not changed.`);
  }
}
async function selection(root: string): Promise<Selection | undefined> {
  const path = join(root, 'selection.json');
  const item = await info(path);
  if (!item) return undefined;
  if (!item.isFile() || item.size > 4096) throw problem('Invalid native selection file; restore the managed installation.');
  let value;
  try { value = JSON.parse(await readFile(path, 'utf8')); } catch { throw problem('Invalid native selection file; restore the managed installation.'); }
  if (!value || value.format !== 1 || typeof value.current !== 'string' || !versionPattern.test(value.current) ||
    (value.previous !== null && (typeof value.previous !== 'string' || !versionPattern.test(value.previous)))) {
    throw problem('Invalid native selection file; restore the managed installation.');
  }
  return value;
}
async function installedCommand(provider: NativeProvider, root: string, version: string): Promise<NativeCommand> {
  approved(provider, version);
  const folder = join(root, 'versions', version);
  if (!(await info(folder))?.isDirectory()) throw problem(`Managed ${provider} ${version} is missing. Run smart-${provider} native install ${version}.`);
  const path = join(folder, 'metadata.json');
  if (!(await info(path))?.isFile()) throw problem(`Managed ${provider} metadata is missing; reinstall its version.`);
  let data: Metadata;
  try { data = JSON.parse(await readFile(path, 'utf8')); } catch { throw problem('Invalid managed CLI metadata.'); }
  if (!data || data.format !== 1 || data.provider !== provider || data.version !== version || data.platform !== process.platform ||
    data.arch !== process.arch || typeof data.entry !== 'string' || isAbsolute(data.entry)) throw problem('Managed CLI metadata does not match this machine.');
  const entry = resolve(folder, data.entry);
  const canonical = await realpath(entry).catch(() => { throw problem('Managed CLI executable is missing; restore its installation.'); });
  const base = await realpath(folder);
  if (!canonical.startsWith(base + sep) || !(await lstat(canonical)).isFile()) throw problem('Managed CLI executable must remain inside its version directory.');
  return commandForEntry(canonical);
}
export function commandForEntry(entry: string): NativeCommand {
  return /\.(?:c|m)?js$/.test(entry) ? { file: process.execPath, args: ['--', entry] } : { file: entry, args: [] };
}
export async function managedNativeCommand(provider: NativeProvider, env: NodeJS.ProcessEnv = process.env) {
  const root = nativeDirectory(provider, env);
  const pin = await selection(root);
  return pin ? installedCommand(provider, root, pin.current) : undefined;
}
export async function requireManagedNative(provider: NativeProvider, env: NodeJS.ProcessEnv = process.env) {
  const command = await managedNativeCommand(provider, env);
  if (!command) throw problem(`No verified ${provider} is pinned. Run smart-${provider} native install once. This installs a separate tested CLI; plain ${provider} is unchanged.`);
  return command;
}
export async function nativeStatus(provider: NativeProvider, env: NodeJS.ProcessEnv = process.env) {
  const root = nativeDirectory(provider, env);
  const pin = await selection(root);
  if (!pin) return `Native ${provider}: no managed version. Run smart-${provider} native install.\n`;
  const command = await installedCommand(provider, root, pin.current);
  return `Native ${provider}: ${pin.current} (managed; independent of PATH updates)\nExecutable: ${command.args.at(-1) ?? command.file}\nPrevious: ${pin.previous ?? 'none'}\nVerified versions in this release: ${testedNativeVersions(provider).join(', ')}\n`;
}
// Installation and probes never receive classifier/provider secrets or npm config overrides.
export function nativeMaintenanceEnv(source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const allowed = new Set(['PATH', 'HOME', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT', 'TMP', 'TEMP', 'TMPDIR', 'LANG', 'LC_ALL']);
  const env = Object.fromEntries(Object.entries(source).filter(([key]) => allowed.has(key.toUpperCase())));
  return { ...env, DISABLE_AUTOUPDATER: '1', DISABLE_UPDATES: '1' };
}
async function npmCommand(env: NodeJS.ProcessEnv): Promise<NativeCommand> {
  if (process.platform !== 'win32') return { file: 'npm', args: [] };
  const path = Object.entries(env).find(([key]) => key.toLowerCase() === 'path')?.[1] ?? '';
  for (const directory of [dirname(process.execPath), ...path.split(delimiter).filter(Boolean)]) {
    const entry = join(directory, 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if ((await info(entry))?.isFile()) return commandForEntry(entry);
  }
  throw problem('npm is required to install a tested CLI. Install Node.js with npm, then retry.');
}
export type NativeInstallOperations = {
  install: (provider: NativeProvider, version: string, directory: string, env: NodeJS.ProcessEnv) => Promise<string>;
  verify: (provider: NativeProvider, version: string, command: NativeCommand, env: NodeJS.ProcessEnv) => Promise<void>;
};
const operations: NativeInstallOperations = {
  async install(provider, version, directory, env) {
    const npm = await npmCommand(env);
    const config = join(directory, 'empty.npmrc');
    await writeFile(config, '', { flag: 'wx', mode: 0o600 });
    const globalConfig = join(directory, 'global.npmrc');
    await writeFile(globalConfig, '', { flag: 'wx', mode: 0o600 });
    const packageName = provider === 'codex' ? '@openai/codex' : '@anthropic-ai/claude-code';
    try {
      await execute(npm.file, [...npm.args, 'install', '--prefix', directory, '--ignore-scripts', '--no-audit', '--no-fund',
        '--save-exact', '--registry=https://registry.npmjs.org', `--userconfig=${config}`, `--globalconfig=${globalConfig}`,
        `--cache=${join(directory, '.npm-cache')}`, `${packageName}@${version}`], { env, cwd: directory, timeout: 180_000, maxBuffer: 1024 * 1024, windowsHide: true });
    } catch { throw problem(`Could not download ${provider} ${version} from the official npm registry. Check npm/network access and retry; the current CLI was not changed.`); }
    await rm(join(directory, '.npm-cache'), { recursive: true, force: true });
    const packageRoot = join(directory, 'node_modules', ...packageName.split('/'));
    const pkg = JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'));
    if (pkg.name !== packageName || pkg.version !== version || typeof pkg.bin?.[provider] !== 'string') throw problem('Downloaded CLI package metadata did not match the requested version.');
    if (provider === 'claude') {
      try {
        await execute(process.execPath, ['--', join(packageRoot, 'install.cjs')],
          { env, cwd: packageRoot, timeout: 30_000, maxBuffer: 1024 * 1024, windowsHide: true });
      } catch { throw problem(`Could not prepare the official Claude ${version} executable; the current CLI was not changed.`); }
    }
    return relative(directory, resolve(packageRoot, pkg.bin[provider]));
  },
  async verify(provider, version, command, env) {
    let stage = 'version';
    try {
      const result = await execute(command.file, [...command.args, '--version'], { env, timeout: 15_000, maxBuffer: 16384, windowsHide: true });
      const expected = provider === 'codex' ? `codex-cli ${version}` : `${version} (Claude Code)`;
      if (result.stdout.trim() !== expected) throw new Error('Version mismatch');
      const entry = command.args.at(-1) ?? command.file;
      const script = fileURLToPath(new URL(provider === 'codex' ? '../scripts/native-protocol-smoke.ts' : '../scripts/claude-native-smoke.ts', import.meta.url));
      stage = 'protocol';
      await execute(process.execPath, ['--', script, entry], { env, timeout: 120_000, maxBuffer: 1024 * 1024, windowsHide: true });
      if (provider === 'claude') {
        stage = 'plugin fixtures';
        await execute(command.file, [...command.args, 'plugin', 'test', fileURLToPath(new URL('../plugins/claude', import.meta.url))],
          { env, timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true });
      }
    } catch { throw problem(`${provider} ${version} failed its native ${stage} check. The current selection was not changed. These checks submit no real model task.`); }
  },
};
async function privateFolder(path: string) {
  const item = await info(path);
  if (item && !item.isDirectory()) throw problem('Managed CLI directories must not be symlinks or files.');
  await mkdir(path, { recursive: true, mode: 0o700 });
  protectPrivatePathSync(path, true);
}
async function withLock<T>(root: string, action: () => Promise<T>) {
  await privateFolder(root);
  const lock = join(root, '.lock');
  try { await mkdir(lock, { mode: 0o700 }); }
  catch { throw problem('Another native install/rollback is active. Retry after it finishes; an interrupted operation may require removing its .lock directory.'); }
  try { return await action(); } finally { await rm(lock, { recursive: true, force: true }); }
}
// Windows can briefly retain executable/directory handles after a successful probe.
export async function renameNative(from: string, to: string, platform: NodeJS.Platform = process.platform,
  move = rename, wait: (ms: number) => Promise<unknown> = delay) {
  for (let attempt = 0; ; attempt++) {
    try { await move(from, to); return; }
    catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (platform !== 'win32' || !['EPERM', 'EACCES', 'EBUSY'].includes(code ?? '') || attempt >= 6) {
        throw problem('Could not activate the verified native installation. Close other ModelRudder sessions and retry; the current selection was not changed.');
      }
      await wait(100 * 2 ** attempt);
    }
  }
}
async function activate(root: string, pin: Selection) {
  const temporary = join(root, '.selection-next');
  await writeFile(temporary, `${JSON.stringify(pin)}\n`, { mode: 0o600 });
  try { await renameNative(temporary, join(root, 'selection.json')); }
  finally { await rm(temporary, { force: true }); }
}
export async function installNative(provider: NativeProvider, version: string, env: NodeJS.ProcessEnv = process.env,
  ops: NativeInstallOperations = operations) {
  approved(provider, version);
  const root = nativeDirectory(provider, env);
  return withLock(root, async () => {
    const previous = await selection(root);
    const versions = join(root, 'versions');
    await privateFolder(versions);
    const target = join(versions, version);
    const cleanEnv = nativeMaintenanceEnv(env);
    if (await info(target)) {
      try {
        await ops.verify(provider, version, await installedCommand(provider, root, version), cleanEnv);
      } catch {
        throw problem(`Existing managed ${provider} ${version} failed validation. Selection and installation files were left unchanged. Try smart-${provider} native rollback if a previous version is available, or stop all ModelRudder sessions, move aside only the version directory ${JSON.stringify(target)}, then run smart-${provider} native install ${version}.`);
      }
    } else {
      const staging = await mkdtemp(join(versions, '.candidate-'));
      try {
        const entry = await ops.install(provider, version, staging, cleanEnv);
        // Validate package entry before executing any downloaded code.
        const absolute = await realpath(resolve(staging, entry));
        if (!absolute.startsWith(await realpath(staging) + sep) || !(await lstat(absolute)).isFile()) throw problem('Downloaded CLI entry escapes its version directory.');
        await ops.verify(provider, version, commandForEntry(absolute), cleanEnv);
        const metadata: Metadata = { format: 1, provider, version, platform: process.platform, arch: process.arch, entry };
        await writeFile(join(staging, 'metadata.json'), JSON.stringify(metadata), { mode: 0o600, flag: 'wx' });
        await renameNative(staging, target);
      } finally { await rm(staging, { recursive: true, force: true }); }
    }
    if (previous?.current !== version) await activate(root, { format: 1, current: version, previous: previous?.current ?? null });
    return version;
  });
}
export async function rollbackNative(provider: NativeProvider, env: NodeJS.ProcessEnv = process.env, ops: NativeInstallOperations = operations) {
  const root = nativeDirectory(provider, env);
  return withLock(root, async () => {
    const pin = await selection(root);
    if (!pin?.previous) throw problem(`No previous managed ${provider} version is available.`);
    const command = await installedCommand(provider, root, pin.previous);
    await ops.verify(provider, pin.previous, command, nativeMaintenanceEnv(env));
    await activate(root, { format: 1, current: pin.previous, previous: pin.current });
    return pin.previous;
  });
}
export async function runNativeManagement(provider: NativeProvider, args: string[], env: NodeJS.ProcessEnv = process.env) {
  if (args.length === 1 && args[0] === 'status') process.stdout.write(await nativeStatus(provider, env));
  else if (args.length === 1 && args[0] === 'rollback') {
    console.log(`Restored managed ${provider} ${await rollbackNative(provider, env)}. Start a new session.`);
  } else if (args[0] === 'install' && args.length <= 2) {
    const version = args[1] ?? testedNativeVersions(provider).at(-1)!;
    approved(provider, version);
    console.log(`Installing and checking managed ${provider} ${version}; the active version stays selected until checks pass.`);
    await installNative(provider, version, env);
    console.log(`Selected managed ${provider} ${version}. Plain ${provider} is unchanged. Start a new session.\nNative checks passed; full interactive behavior and task quality remain unqualified.`);
  } else throw problem(`Usage: smart-${provider} native install [VERSION] | status | rollback`);
  return 0;
}

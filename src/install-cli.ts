import { lstat, mkdir, mkdtemp, readFile, readdir, readlink, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRelease, validateRelease } from '../scripts/release.ts';
import type { Release } from '../scripts/release.ts';
import { protectPrivatePathSync } from './private-files.ts';

const marker = '# Managed by openai-smart-router install-cli';
const ownership = 'openai-smart-router release installation v1\n';
const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
const exists = async (path: string) => { try { return await lstat(path); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw e; } };
export type InstallOptions = { root: string; binDirectory: string; envFile: string; platform?: NodeJS.Platform };
const windows = (options: InstallOptions) => (options.platform ?? process.platform) === 'win32';
const launcherPath = (options: InstallOptions) => join(options.binDirectory, windows(options) ? 'smart-codex.cmd' : 'smart-codex');
export function defaultInstallOptions(platform: NodeJS.Platform = process.platform, home = homedir(), env: NodeJS.ProcessEnv = process.env): InstallOptions {
  const base = env.LOCALAPPDATA || join(home, 'AppData', 'Local');
  return platform === 'win32'
    ? { root: join(base, 'ModelRudder', 'runtime'), binDirectory: join(base, 'ModelRudder', 'bin'), envFile: join(base, 'ModelRudder', 'config', 'env'), platform }
    : { root: join(home, '.local/share/smart-codex'), binDirectory: join(home, '.local/bin'), envFile: join(home, '.config/smart-codex/env'), platform };
}
async function currentPointer(options: InstallOptions): Promise<string | undefined> {
  const path = join(options.root, 'current');
  const info = await exists(path);
  if (!info) return undefined;
  if (windows(options)) {
    if (!info.isFile() || info.isSymbolicLink()) throw new Error('Current release pointer must be a regular file.');
    const value = (await readFile(path, 'utf8')).trim();
    if (!/^releases\/\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?-[a-f0-9]{16}$/.test(value)) throw new Error('Invalid current release pointer.');
    return value;
  }
  if (!info.isSymbolicLink()) throw new Error('Current release pointer must be a symbolic link.');
  const value = await readlink(path);
  if (!/^releases\/\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?-[a-f0-9]{16}$/.test(value)) throw new Error('Invalid current release pointer.');
  return value;
}
async function canonicalPath(path: string): Promise<string> {
  try { return await realpath(path); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || dirname(path) === path) throw error;
    return join(await canonicalPath(dirname(path)), basename(path));
  }
}
async function validatePaths(options: InstallOptions) {
  const paths = [options.root, options.binDirectory, options.envFile].map(path => resolve(path));
  const canonical = await Promise.all(paths.map(canonicalPath));
  const contains = (parent: string, child: string) => {
    if (windows(options)) { parent = parent.toLowerCase(); child = child.toLowerCase(); }
    return child === parent || child.startsWith(parent + sep);
  };
  for (const [root, bin, env] of [paths, canonical]) {
    if (contains(root, env) || contains(root, bin) || contains(bin, root)) throw new Error('Configuration, executable directory and installation root must use separate locations.');
  }
}
async function ownedLauncher(target: string) {
  const info = await exists(target);
  if (info && (!info.isFile() || !(await readFile(target, 'utf8')).includes(marker))) throw new Error('An unmanaged smart-codex already exists; installation stopped.');
}
async function privateDirectory(path: string) {
  const info = await exists(path);
  if (info && !info.isDirectory()) throw new Error(`Installation directory must not be a symlink: ${path}`);
  await mkdir(path, { recursive: true, mode: 0o700 });
  protectPrivatePathSync(path, true);
}
async function withInstallation<T>(options: InstallOptions, action: () => Promise<T>): Promise<T> {
  await validatePaths(options);
  const info = await exists(options.root);
  if (info) {
    if (!info.isDirectory()) throw new Error('Installation root must be a real directory.');
    if (await readFile(join(options.root, '.managed-install'), 'utf8').catch(() => '') !== ownership) throw new Error('Refusing to use an unmanaged installation root.');
    protectPrivatePathSync(options.root, true);
  } else {
    await privateDirectory(options.root);
    await writeFile(join(options.root, '.managed-install'), ownership, { flag: 'wx', mode: 0o600 });
  }
  const lock = join(options.root, '.install-lock');
  await mkdir(lock, { mode: 0o700 }).catch(() => { throw new Error('Another install operation is active; check .install-lock before retrying.'); });
  try { return await action(); } finally { await rm(lock, { recursive: true, force: true }); }
}
async function switchCurrent(options: InstallOptions, id: string) {
  await currentPointer(options);
  const next = join(options.root, '.current-next');
  await rm(next, { force: true });
  if (windows(options)) await writeFile(next, `releases/${id}\n`, { flag: 'wx', mode: 0o600 });
  else await symlink(`releases/${id}`, next);
  await rename(next, join(options.root, 'current'));
}
function windowsBootstrap(options: InstallOptions): string {
  return `// ${marker}
import { readFile, lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const root = ${JSON.stringify(options.root)};
const pointer = join(root, 'current');
if (!(await lstat(pointer)).isFile() || (await lstat(pointer)).isSymbolicLink()) throw new Error('Invalid current release pointer.');
const current = (await readFile(pointer, 'utf8')).trim();
if (!/^releases\\/\\d+\\.\\d+\\.\\d+(?:-[A-Za-z0-9.-]+)?-[a-f0-9]{16}$/.test(current)) throw new Error('Invalid current release pointer.');
const env = { ...process.env };
env.SMART_CODEX_STATE_DIR ||= join(root, 'state');
env.SMART_CODEX_ENV_FILE ||= ${JSON.stringify(options.envFile)};
const child = spawn(process.execPath, ['--env-file-if-exists=' + env.SMART_CODEX_ENV_FILE, '--', join(root, current, 'src', 'smart-codex.ts'), ...process.argv.slice(2)], { env, stdio: 'inherit', shell: false });
child.once('error', error => { console.error(error.message); process.exitCode = 1; });
child.once('exit', code => { process.exitCode = code ?? 1; });
`;
}
export async function installRelease(input: Release, options: InstallOptions) {
  const release = validateRelease(input);
  const target = launcherPath(options);
  await ownedLauncher(target);
  if (windows(options)) await ownedLauncher(join(options.binDirectory, 'smart-codex.mjs'));
  return withInstallation(options, async () => {
    await privateDirectory(join(options.root, 'releases'));
    await privateDirectory(join(options.root, 'state'));
    const destination = join(options.root, 'releases', release.id);
    if (await exists(destination)) await verifyInstalled(options.root, release.id);
    else {
      const staging = await mkdtemp(join(options.root, 'releases', '.staging-'));
      try {
        for (const [path, content] of Object.entries(release.files)) {
          await mkdir(dirname(join(staging, path)), { recursive: true, mode: 0o700 });
          await writeFile(join(staging, path), content, { mode: path === 'bin/smart-codex' ? 0o700 : 0o600, flag: 'wx' });
        }
        await writeFile(join(staging, '.release.json'), JSON.stringify(release), { mode: 0o600, flag: 'wx' });
        await rename(staging, destination);
      } finally { await rm(staging, { recursive: true, force: true }); }
    }
    // Resolve current once so a concurrent upgrade cannot mix module versions.
    const launcher = windows(options) ? `@echo off\r\nREM ${marker}\r\nnode "%~dp0smart-codex.mjs" %*\r\n` : `#!/bin/sh\n${marker}\nif [ -z "\${SMART_CODEX_STATE_DIR:-}" ]; then SMART_CODEX_STATE_DIR=${quote(join(options.root, 'state'))}; fi\nif [ -z "\${SMART_CODEX_ENV_FILE:-}" ]; then SMART_CODEX_ENV_FILE=${quote(options.envFile)}; fi\nexport SMART_CODEX_STATE_DIR SMART_CODEX_ENV_FILE\nrelease_root=$(CDPATH= cd -P -- ${quote(join(options.root, 'current'))} && pwd) || exit 1\nexec "$release_root/bin/smart-codex" "$@"\n`;
    await mkdir(options.binDirectory, { recursive: true });
    const temporary = await mkdtemp(join(options.binDirectory, '.smart-codex-'));
    try {
      await writeFile(join(temporary, 'launcher'), launcher, { mode: 0o755 });
      const previous = await currentPointer(options);
      await switchCurrent(options, release.id);
      try {
        if (windows(options)) {
          await writeFile(join(temporary, 'bootstrap'), windowsBootstrap(options), { mode: 0o600 });
          await rename(join(temporary, 'bootstrap'), join(options.binDirectory, 'smart-codex.mjs'));
        }
        await rename(join(temporary, 'launcher'), target);
      }
      catch (error) {
        if (previous === undefined) await rm(join(options.root, 'current'));
        else {
          await switchCurrent(options, previous.slice('releases/'.length));
        }
        throw error;
      }
    } finally { await rm(temporary, { recursive: true, force: true }); }
    return release.id;
  });
}
export async function verifyInstalled(root: string, id: string) {
  if (!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?-[a-f0-9]{16}$/.test(id)) throw new Error('Invalid release identifier.');
  const dir = join(root, 'releases', id);
  if (!(await lstat(dir)).isDirectory()) throw new Error('Invalid installed release directory.');
  const release = validateRelease(JSON.parse(await readFile(join(dir, '.release.json'), 'utf8')));
  if (release.id !== id) throw new Error('Installed release identifier mismatch.');
  for (const [path, content] of Object.entries(release.files)) {
    if (!(await lstat(join(dir, path))).isFile() || await readFile(join(dir, path), 'utf8') !== content) throw new Error(`Installed release was modified: ${path}`);
  }
  return release;
}
export async function rollbackRelease(id: string, options: InstallOptions) {
  return withInstallation(options, async () => { await verifyInstalled(options.root, id); await switchCurrent(options, id); });
}
export async function uninstallRelease(options: InstallOptions) {
  await ownedLauncher(launcherPath(options));
  if (windows(options)) await ownedLauncher(join(options.binDirectory, 'smart-codex.mjs'));
  return withInstallation(options, async () => {
    const target = launcherPath(options);
    if (await exists(target) || (windows(options) && await exists(join(options.binDirectory, 'smart-codex.mjs')))) {
      const ownerFile = windows(options) ? join(options.binDirectory, 'smart-codex.mjs') : target;
      const ownerToken = windows(options) ? `const root = ${JSON.stringify(options.root)};` : quote(join(options.root, 'current'));
      if (!(await readFile(ownerFile, 'utf8')).includes(ownerToken)) throw new Error('Launcher belongs to another installation.');
      await rm(target, { force: true });
      if (windows(options)) await rm(join(options.binDirectory, 'smart-codex.mjs'));
    }
    await rm(join(options.root, 'current'), { force: true });
    await rm(join(options.root, 'releases'), { recursive: true, force: true });
    // Keep state and external configuration; removal is an explicit user choice.
  });
}
export async function runInstaller(args: string[]) {
  if (args.includes('--help')) {
    console.log('Usage: npm run install-cli -- [--artifact FILE | --rollback RELEASE_ID | --list | --uninstall] [--root DIR] [--bin-dir DIR] [--env-file FILE]\nDefault install creates a versioned copy of the current runtime. Configuration and logs survive upgrade, rollback and uninstall.');
    return;
  }
  const options = defaultInstallOptions();
  let artifact: string | undefined; let rollback: string | undefined; let uninstall = false; let list = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--uninstall') uninstall = true;
    else if (arg === '--list') list = true;
    else if (['--root', '--bin-dir', '--env-file', '--artifact', '--rollback'].includes(arg)) {
      const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      if (arg === '--root') options.root = resolve(value);
      else if (arg === '--bin-dir') options.binDirectory = resolve(value);
      else if (arg === '--env-file') options.envFile = resolve(value);
      else if (arg === '--artifact') artifact = resolve(value);
      else rollback = value;
    } else throw new Error(`Unknown installer option: ${arg}`);
  }
  if ([Boolean(artifact), Boolean(rollback), uninstall, list].filter(Boolean).length > 1) throw new Error('Select only one installer operation.');
  if (list) {
    console.log(`Current: ${await currentPointer(options) ?? 'none'}`);
    console.log((await readdir(join(options.root, 'releases')).catch(() => [])).filter(name => !name.startsWith('.')).sort().join('\n'));
  } else if (uninstall) { await uninstallRelease(options); console.log('Uninstalled executable releases. Configuration and state retained.'); }
  else if (rollback) { await rollbackRelease(rollback, options); console.log(`Activated ${rollback}`); }
  else {
    const release = artifact ? JSON.parse(await readFile(artifact, 'utf8')) : await buildRelease(fileURLToPath(new URL('../', import.meta.url)));
    console.log(`Installed ${await installRelease(release, options)} in ${options.root}`);
    if (windows(options)) console.log('Managed runtime and state directories use private Windows ACLs. External configuration must also be private to your account.');
    console.log(`Configuration: ${options.envFile} (or SMART_CODEX_ENV_FILE). Add ${options.binDirectory} to PATH.`);
  }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await runInstaller(process.argv.slice(2)); } catch (error) { console.error((error as Error).message); process.exitCode = 1; }
}

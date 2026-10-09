import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs, { mkdtemp, mkdir, readFile, readdir, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRelease, digest, legacyReleaseFiles, releaseFiles, validateRelease } from '../scripts/release.ts';
import { installRelease, rollbackRelease, uninstallRelease, defaultInstallOptions } from '../src/install-cli.ts';
const run = promisify(execFile);
const project = fileURLToPath(new URL('../', import.meta.url));
const isWindows = process.platform === 'win32';
const launcherNames = ['smart-codex', 'smart-claude'] as const;
const target = (options: { binDirectory: string; platform?: NodeJS.Platform }, name = 'smart-codex') => join(options.binDirectory, (options.platform ?? process.platform) === 'win32' ? `${name}.cmd` : name);
const pointer = (root: string) => isWindows ? readFile(join(root, 'current'), 'utf8').then(value => value.trim()) : readlink(join(root, 'current'));
const installedRun = (options: { binDirectory: string; platform?: NodeJS.Platform }, args: string[], cwd: string, name = 'smart-codex') => (options.platform ?? process.platform) === 'win32'
  ? run(process.execPath, [join(options.binDirectory, `${name}.mjs`), ...args], { cwd })
  : run(target(options, name), args, { cwd });
const sealRelease = (release: Awaited<ReturnType<typeof buildRelease>>) => {
  release.sha256 = digest(JSON.stringify({ format: 1, version: release.version, files: release.files }));
  release.id = `${release.version}-${release.sha256.slice(0, 16)}`;
  return release;
};
const fixture = async () => {
  const temp = await mkdtemp(join(tmpdir(), 'smart-release-'));
  const options = { root: join(temp, "install }$root 'quoted' literal"), binDirectory: join(temp, 'bin'), envFile: join(temp, "user }$config 'quoted'") };
  return { temp, options };
};

test('standalone pilot installer needs no checkout or downloads and supports installed account command', async () => {
  const { temp, options } = await fixture();
  try {
    const output = join(temp, 'delivery');
    await run(process.execPath, ['--', join(project, 'scripts/package-pilot.ts'), output]);
    const filename = (await readdir(output)).find(name => name.endsWith('.mjs'))!;
    assert.equal(await readFile(join(output, 'SHA256SUMS'), 'utf8'), `${digest(await readFile(join(output, filename), 'utf8'))}  ${filename}\n`);
    await run(process.execPath, ['--', join(output, filename), '--root', options.root, '--bin-dir', options.binDirectory,
      '--env-file', options.envFile], { cwd: temp });
    const help = await installedRun(options, ['--help'], temp);
    assert.match(help.stdout, /smart-codex account/);
    assert.match((await installedRun(options, ['--help'], temp, 'smart-claude')).stdout, /smart-claude/);
    if (isWindows) {
      const script = '& $env:MODEL_RUDDER_TEST_LAUNCHER --help; exit $LASTEXITCODE';
      const nativeHelp = await run('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
        '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
        cwd: temp, env: { ...process.env, MODEL_RUDDER_TEST_LAUNCHER: target(options) },
      });
      assert.match(nativeHelp.stdout, /smart-codex account/);
    }
    const list = await run(process.execPath, ['--', join(output, filename), '--list', '--root', options.root,
      '--bin-dir', options.binDirectory, '--env-file', options.envFile], { cwd: temp });
    assert.match(list.stdout, /Current: releases\//);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('release is reproducible, has exact allowlist, and rejects traversal/tampering', async () => {
  const a = await buildRelease(project); const b = await buildRelease(project);
  assert.deepEqual(a, b);
  assert.deepEqual(Object.keys(a.files), releaseFiles);
  assert.ok(!releaseFiles.some(path => /\.env|\.smart-codex|evals\/|artifacts\//.test(path)));
  const changed = structuredClone(a); changed.files['src/config.ts'] += '\n';
  assert.throws(() => validateRelease(changed), /checksum/);
  const partial = structuredClone(a); delete partial.files['src/claude-command.ts'];
  assert.throws(() => validateRelease(sealRelease(partial)), /allowlist/);
  const traversal = structuredClone(a); traversal.files['../escape'] = 'bad';
  assert.throws(() => validateRelease(traversal), /allowlist/);
});

test('offline installed help runs independently of checkout; upgrade, rollback and uninstall retain user data', async () => {
  const { temp, options } = await fixture();
  try {
    const first = await buildRelease(project);
    await writeFile(options.envFile, 'RELEASE_SMOKE_CONFIG=preserved\n', { mode: 0o600 });
    await installRelease(first, options);
    assert.equal(await pointer(options.root), `releases/${first.id}`);
    if (!isWindows) assert.equal((await stat(options.root)).mode & 0o777, 0o700);
    const launcher = await readFile(isWindows ? join(options.binDirectory, 'smart-codex.mjs') : target(options), 'utf8');
    assert.ok(!launcher.includes(project));
    assert.match(launcher, /SMART_CODEX_STATE_DIR/);
    const help = await installedRun(options, ['--help'], temp);
    assert.match(help.stdout, /smart-codex/);
    assert.match((await installedRun(options, ['--help'], temp, 'smart-claude')).stdout, /smart-claude/);
    if (!isWindows) assert.equal((await stat(join(options.root, 'releases', first.id, 'bin/smart-claude'))).mode & 0o777, 0o700);
    const stateFile = join(options.root, 'state', 'keep.json');
    await writeFile(stateFile, '{}');
    const next = structuredClone(first); next.files['src/config.ts'] += '\n// release smoke variant\n';
    next.sha256 = digest(JSON.stringify({ format: 1, version: next.version, files: next.files }));
    next.id = `${next.version}-${next.sha256.slice(0, 16)}`;
    await installRelease(next, options);
    assert.equal(await pointer(options.root), `releases/${next.id}`);
    await rollbackRelease(first.id, options);
    assert.equal(await pointer(options.root), `releases/${first.id}`);
    await writeFile(join(options.root, 'releases', next.id, 'src/config.ts'), 'modified');
    await assert.rejects(rollbackRelease(next.id, options), /modified/);
    assert.equal(await pointer(options.root), `releases/${first.id}`);
    await uninstallRelease(options);
    for (const name of launcherNames) {
      await assert.rejects(stat(target(options, name)), { code: 'ENOENT' });
      if (isWindows) await assert.rejects(stat(join(options.binDirectory, `${name}.mjs`)), { code: 'ENOENT' });
    }
    assert.equal(await readFile(options.envFile, 'utf8'), 'RELEASE_SMOKE_CONFIG=preserved\n');
    assert.equal(await readFile(stateFile, 'utf8'), '{}');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('installer preserves unmanaged launchers and roots', async () => {
  const { temp, options } = await fixture();
  try {
    const release = await buildRelease(project);
    await mkdir(options.binDirectory); await writeFile(target(options), 'unmanaged');
    await assert.rejects(installRelease(release, options), /unmanaged/);
    assert.equal(await readFile(target(options), 'utf8'), 'unmanaged');
    await rm(target(options));
    await mkdir(options.root); await writeFile(join(options.root, 'valuable'), 'keep');
    await assert.rejects(installRelease(release, options), /unmanaged/);
    assert.equal(await readFile(join(options.root, 'valuable'), 'utf8'), 'keep');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('packager and artifact installer CLI work offline and never overwrite an artifact', async () => {
  const { temp, options } = await fixture();
  try {
    const artifact = join(temp, 'release.json');
    await run(process.execPath, [join(project, 'scripts/release.ts'), artifact], { cwd: temp });
    const release = validateRelease(JSON.parse(await readFile(artifact, 'utf8')));
    if (!isWindows) assert.equal((await stat(artifact)).mode & 0o777, 0o600);
    await assert.rejects(run(process.execPath, [join(project, 'scripts/release.ts'), artifact], { cwd: temp }));
    await run(process.execPath, ['--', join(project, 'src/install-cli.ts'), '--artifact', artifact,
      '--root', options.root, '--bin-dir', options.binDirectory, '--env-file', options.envFile], { cwd: temp });
    assert.equal(await pointer(options.root), `releases/${release.id}`);
    const help = await installedRun(options, ['--help'], temp);
    assert.match(help.stdout, /smart-codex/);
    assert.match((await installedRun(options, ['--help'], temp, 'smart-claude')).stdout, /smart-claude/);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('installer refuses configuration inside release storage including aliases before mutation', async () => {
  const { temp, options } = await fixture();
  try {
    const release = await buildRelease(project);
    await assert.rejects(installRelease(release, { ...options, envFile: join(options.root, 'releases', release.id, 'env') }), /separate locations/);
    await assert.rejects(stat(options.root), { code: 'ENOENT' });
    await installRelease(release, options);
    const alias = join(temp, 'release-alias');
    await symlink(join(options.root, 'releases', release.id), alias, isWindows ? 'junction' : 'dir');
    await assert.rejects(installRelease(release, { ...options, envFile: join(alias, 'env') }), /separate locations/);
    await assert.rejects(installRelease(release, { ...options, binDirectory: join(options.root, 'bin') }), /separate locations/);
    assert.equal(await pointer(options.root), `releases/${release.id}`);
  } finally { await rm(temp, { recursive: true, force: true }); }
});


test('Windows installer uses regular pointers and a Node bootstrap without shell interpolation', async () => {
  const { temp, options: base } = await fixture();
  const options = { ...base, platform: 'win32' as const };
  try {
    const first = await buildRelease(project);
    await installRelease(first, options);
    assert.equal((await stat(join(options.root, 'current'))).isFile(), true);
    assert.equal((await readFile(join(options.root, 'current'), 'utf8')).trim(), `releases/${first.id}`);
    const shim = await readFile(join(options.binDirectory, 'smart-codex.cmd'), 'utf8');
    assert.match(shim, /node "%~dp0smart-codex.mjs" %\*/);
    assert.ok(!shim.includes(options.root));
    const help = await run(process.execPath, [join(options.binDirectory, 'smart-codex.mjs'), '--help'], { cwd: temp });
    assert.match(help.stdout, /smart-codex/);
    const bootstrap = await readFile(join(options.binDirectory, 'smart-codex.mjs'), 'utf8');
    assert.match(bootstrap, /shell: false/);
    assert.match(bootstrap, /process\.argv\.slice\(2\)/);
    assert.match((await installedRun(options, ['--help'], temp, 'smart-claude')).stdout, /smart-claude/);
    assert.match(await readFile(join(options.binDirectory, 'smart-claude.cmd'), 'utf8'), /node "%~dp0smart-claude.mjs" %\*/);
    const next = structuredClone(first); next.files['src/config.ts'] += '\n// Windows upgrade fixture\n';
    next.sha256 = digest(JSON.stringify({ format: 1, version: next.version, files: next.files }));
    next.id = `${next.version}-${next.sha256.slice(0, 16)}`;
    await installRelease(next, options);
    await rollbackRelease(first.id, options);
    assert.equal((await readFile(join(options.root, 'current'), 'utf8')).trim(), `releases/${first.id}`);
    await uninstallRelease(options);
    await assert.rejects(stat(join(options.binDirectory, 'smart-codex.cmd')), { code: 'ENOENT' });
    await assert.rejects(stat(join(options.binDirectory, 'smart-codex.mjs')), { code: 'ENOENT' });
    await assert.rejects(stat(join(options.binDirectory, 'smart-claude.cmd')), { code: 'ENOENT' });
    await assert.rejects(stat(join(options.binDirectory, 'smart-claude.mjs')), { code: 'ENOENT' });
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('Windows defaults separate runtime, executable and credential locations', () => {
  const options = defaultInstallOptions('win32', '/home/customer', { LOCALAPPDATA: '/local/customer' });
  assert.equal(options.root, join('/local/customer', 'ModelRudder', 'runtime'));
  assert.equal(options.binDirectory, join('/local/customer', 'ModelRudder', 'bin'));
  assert.equal(options.envFile, join('/local/customer', 'ModelRudder', 'config', 'env'));
  assert.equal(defaultInstallOptions('win32', '/home/customer', {}).root, join('/home/customer', 'AppData', 'Local', 'ModelRudder', 'runtime'));
});

test('Windows bootstrap preserves literal arguments and external configuration/state overrides', async () => {
  const { temp, options: base } = await fixture();
  const options = { ...base, platform: 'win32' as const };
  try {
    const release = await buildRelease(project);
    for (const name of launcherNames) release.files[`src/${name}.ts`] = `process.stdout.write(JSON.stringify({ args: process.argv.slice(2), state: process.env.SMART_CODEX_STATE_DIR, env: process.env.SMART_CODEX_ENV_FILE }));\n`;
    release.sha256 = digest(JSON.stringify({ format: 1, version: release.version, files: release.files }));
    release.id = `${release.version}-${release.sha256.slice(0, 16)}`;
    await installRelease(release, options);
    const args = ['plain', 'spaces and & literal', '"quoted"', '%PATH%', '$HOME', '`literal`'];
    const external = { ...process.env, SMART_CODEX_STATE_DIR: join(temp, 'external state'), SMART_CODEX_ENV_FILE: join(temp, 'external env') };
    for (const name of launcherNames) {
      const result = await run(process.execPath, [join(options.binDirectory, `${name}.mjs`), ...args], { cwd: temp, env: external });
      assert.deepEqual(JSON.parse(result.stdout), { args, state: external.SMART_CODEX_STATE_DIR, env: external.SMART_CODEX_ENV_FILE });
    }
    delete external.SMART_CODEX_STATE_DIR;
    delete external.SMART_CODEX_ENV_FILE;
    for (const name of launcherNames) {
      const defaults = await run(process.execPath, [join(options.binDirectory, `${name}.mjs`), ...args], { cwd: temp, env: external });
      assert.deepEqual(JSON.parse(defaults.stdout), { args, state: join(options.root, 'state'), env: options.envFile });
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

for (const platform of [...new Set<NodeJS.Platform>([process.platform, 'win32'])]) {
  test(`${platform}: unmanaged Claude launchers block install before any mutation`, async () => {
    const { temp, options: base } = await fixture();
    const options = { ...base, platform };
    try {
      const release = await buildRelease(project);
      await mkdir(options.binDirectory);
      const targets = [target(options, 'smart-claude')];
      if (platform === 'win32') targets.push(join(options.binDirectory, 'smart-claude.mjs'));
      for (const occupied of targets) {
        await writeFile(occupied, 'unmanaged Claude launcher');
        await assert.rejects(installRelease(release, options), /unmanaged smart-claude/);
        assert.equal(await readFile(occupied, 'utf8'), 'unmanaged Claude launcher');
        await assert.rejects(stat(options.root), { code: 'ENOENT' });
        await assert.rejects(stat(target(options)), { code: 'ENOENT' });
        await rm(occupied);
      }
    } finally { await rm(temp, { recursive: true, force: true }); }
  });

  test(`${platform}: Codex-only releases survive upgrade and rollback with matching launchers`, async () => {
    const { temp, options: base } = await fixture();
    const options = { ...base, platform };
    try {
      const current = await buildRelease(project);
      const legacy = structuredClone(current);
      legacy.files = Object.fromEntries(legacyReleaseFiles.map(path => [path, legacy.files[path]]));
      validateRelease(sealRelease(legacy));
      await installRelease(legacy, options);
      await assert.rejects(stat(target(options, 'smart-claude')), { code: 'ENOENT' });
      assert.match((await installedRun(options, ['--help'], temp)).stdout, /smart-codex/);
      await installRelease(current, options);
      assert.match((await installedRun(options, ['--help'], temp, 'smart-claude')).stdout, /smart-claude/);
      await rollbackRelease(legacy.id, options);
      await assert.rejects(stat(target(options, 'smart-claude')), { code: 'ENOENT' });
      if (platform === 'win32') await assert.rejects(stat(join(options.binDirectory, 'smart-claude.mjs')), { code: 'ENOENT' });
      assert.match((await installedRun(options, ['--help'], temp)).stdout, /smart-codex/);
      await rollbackRelease(current.id, options);
      assert.match((await installedRun(options, ['--help'], temp, 'smart-claude')).stdout, /smart-claude/);
    } finally { await rm(temp, { recursive: true, force: true }); }
  });

  test(`${platform}: failure installing the second launcher restores both launchers and release pointer`, async () => {
    const { temp, options: base } = await fixture();
    const options = { ...base, platform };
    const originalRename = fs.rename;
    try {
      const first = await buildRelease(project);
      await installRelease(first, options);
      const targets = launcherNames.flatMap(name => platform === 'win32'
        ? [target(options, name), join(options.binDirectory, `${name}.mjs`)] : [target(options, name)]);
      const originals = await Promise.all(targets.map(path => readFile(path, 'utf8')));
      const next = structuredClone(first);
      next.files['src/config.ts'] += '\n// failed upgrade fixture\n';
      sealRelease(next);
      let failed = false;
      fs.rename = (async (from, to) => {
        const lastLauncher = platform === 'win32' ? join(options.binDirectory, 'smart-claude.mjs') : target(options, 'smart-claude');
        if (!failed && to === lastLauncher) {
          failed = true;
          throw Object.assign(new Error('Simulated launcher replacement failure'), { code: 'EACCES' });
        }
        return originalRename(from, to);
      }) as typeof fs.rename;
      syncBuiltinESMExports();
      await assert.rejects(installRelease(next, { ...options, envFile: join(temp, 'upgraded config') }), /Simulated launcher replacement failure/);
      assert.equal(failed, true);
      assert.deepEqual(await Promise.all(targets.map(path => readFile(path, 'utf8'))), originals);
      const current = platform === 'win32' ? (await readFile(join(options.root, 'current'), 'utf8')).trim() : await readlink(join(options.root, 'current'));
      assert.equal(current, `releases/${first.id}`);
      for (const name of launcherNames) assert.match((await installedRun(options, ['--help'], temp, name)).stdout, new RegExp(name));
    } finally {
      fs.rename = originalRename;
      syncBuiltinESMExports();
      await rm(temp, { recursive: true, force: true });
    }
  });
}

test('uninstall checks both launcher owners before removing either', async () => {
  const { temp, options } = await fixture();
  try {
    const release = await buildRelease(project);
    await installRelease(release, options);
    const codex = await readFile(target(options), 'utf8');
    await writeFile(target(options, 'smart-claude'), 'unmanaged replacement');
    await assert.rejects(uninstallRelease(options), /unmanaged smart-claude/);
    assert.equal(await readFile(target(options), 'utf8'), codex);
    assert.equal(await pointer(options.root), `releases/${release.id}`);
  } finally { await rm(temp, { recursive: true, force: true }); }
});


test('POSIX launchers preserve literal arguments and load the shared legacy configuration', { skip: isWindows }, async () => {
  const { temp, options } = await fixture();
  try {
    const release = await buildRelease(project);
    for (const name of launcherNames) release.files[`src/${name}.ts`] = `process.stdout.write(JSON.stringify({ args: process.argv.slice(2), state: process.env.SMART_CODEX_STATE_DIR, env: process.env.SMART_CODEX_ENV_FILE, loaded: process.env.MODELRUDDER_RELEASE_TEST }));\n`;
    sealRelease(release);
    await writeFile(options.envFile, 'MODELRUDDER_RELEASE_TEST=shared-default\n');
    await installRelease(release, options);
    const args = ['spaces and & literal', '"quoted"', '$HOME', '`literal`', '--prompt', 'a; b'];
    const env = { ...process.env };
    delete env.SMART_CODEX_STATE_DIR; delete env.SMART_CODEX_ENV_FILE; delete env.MODELRUDDER_RELEASE_TEST;
    for (const name of launcherNames) {
      const result = await run(target(options, name), args, { cwd: temp, env });
      assert.deepEqual(JSON.parse(result.stdout), { args, state: join(options.root, 'state'), env: options.envFile, loaded: 'shared-default' });
    }
    const external = { ...env, SMART_CODEX_STATE_DIR: join(temp, 'external state'), SMART_CODEX_ENV_FILE: join(temp, 'external config') };
    await writeFile(external.SMART_CODEX_ENV_FILE, 'MODELRUDDER_RELEASE_TEST=shared-override\n');
    for (const name of launcherNames) {
      const result = await run(target(options, name), args, { cwd: temp, env: external });
      assert.deepEqual(JSON.parse(result.stdout), { args, state: external.SMART_CODEX_STATE_DIR, env: external.SMART_CODEX_ENV_FILE, loaded: 'shared-override' });
    }
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('managed launchers cannot be taken over by a different installation root', async () => {
  const { temp, options } = await fixture();
  try {
    const release = await buildRelease(project);
    await installRelease(release, options);
    const other = { ...options, root: join(temp, 'other installation') };
    await assert.rejects(installRelease(release, other), /another installation/);
    await assert.rejects(uninstallRelease(other), /another installation/);
    await assert.rejects(stat(other.root), { code: 'ENOENT' });
    for (const name of launcherNames) assert.match((await installedRun(options, ['--help'], temp, name)).stdout, new RegExp(name));
  } finally { await rm(temp, { recursive: true, force: true }); }
});

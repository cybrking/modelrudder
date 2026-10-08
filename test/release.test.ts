import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, readdir, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRelease, digest, releaseFiles, validateRelease } from '../scripts/release.ts';
import { installRelease, rollbackRelease, uninstallRelease } from '../src/install-cli.ts';
const run = promisify(execFile);
const project = fileURLToPath(new URL('../', import.meta.url));
const fixture = async () => {
  const temp = await mkdtemp(join(tmpdir(), 'smart-release-'));
  const options = { root: join(temp, "install }$root 'quoted' `literal`"), binDirectory: join(temp, 'bin'), envFile: join(temp, "user }$config 'quoted'") };
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
    const help = await run(join(options.binDirectory, 'smart-codex'), ['--help'], { cwd: temp });
    assert.match(help.stdout, /smart-codex account/);
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
  const traversal = structuredClone(a); traversal.files['../escape'] = 'bad';
  assert.throws(() => validateRelease(traversal), /allowlist/);
});

test('offline installed help runs independently of checkout; upgrade, rollback and uninstall retain user data', async () => {
  const { temp, options } = await fixture();
  try {
    const first = await buildRelease(project);
    await writeFile(options.envFile, 'RELEASE_SMOKE_CONFIG=preserved\n', { mode: 0o600 });
    await installRelease(first, options);
    assert.equal(await readlink(join(options.root, 'current')), `releases/${first.id}`);
    assert.equal((await stat(options.root)).mode & 0o777, 0o700);
    const launcher = await readFile(join(options.binDirectory, 'smart-codex'), 'utf8');
    assert.ok(!launcher.includes(project));
    assert.match(launcher, /SMART_CODEX_STATE_DIR/);
    const help = await run(join(options.binDirectory, 'smart-codex'), ['--help'], { cwd: temp });
    assert.match(help.stdout, /smart-codex/);
    const stateFile = join(options.root, 'state', 'keep.json');
    await writeFile(stateFile, '{}');
    const next = structuredClone(first); next.files['src/config.ts'] += '\n// release smoke variant\n';
    next.sha256 = digest(JSON.stringify({ format: 1, version: next.version, files: next.files }));
    next.id = `${next.version}-${next.sha256.slice(0, 16)}`;
    await installRelease(next, options);
    assert.equal(await readlink(join(options.root, 'current')), `releases/${next.id}`);
    await rollbackRelease(first.id, options);
    assert.equal(await readlink(join(options.root, 'current')), `releases/${first.id}`);
    await writeFile(join(options.root, 'releases', next.id, 'src/config.ts'), 'modified');
    await assert.rejects(rollbackRelease(next.id, options), /modified/);
    assert.equal(await readlink(join(options.root, 'current')), `releases/${first.id}`);
    await uninstallRelease(options);
    await assert.rejects(stat(join(options.binDirectory, 'smart-codex')), { code: 'ENOENT' });
    assert.equal(await readFile(options.envFile, 'utf8'), 'RELEASE_SMOKE_CONFIG=preserved\n');
    assert.equal(await readFile(stateFile, 'utf8'), '{}');
  } finally { await rm(temp, { recursive: true, force: true }); }
});

test('installer preserves unmanaged launchers and roots', async () => {
  const { temp, options } = await fixture();
  try {
    const release = await buildRelease(project);
    await mkdir(options.binDirectory); await writeFile(join(options.binDirectory, 'smart-codex'), 'unmanaged');
    await assert.rejects(installRelease(release, options), /unmanaged/);
    assert.equal(await readFile(join(options.binDirectory, 'smart-codex'), 'utf8'), 'unmanaged');
    await rm(join(options.binDirectory, 'smart-codex'));
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
    assert.equal((await stat(artifact)).mode & 0o777, 0o600);
    await assert.rejects(run(process.execPath, [join(project, 'scripts/release.ts'), artifact], { cwd: temp }));
    await run(process.execPath, ['--', join(project, 'src/install-cli.ts'), '--artifact', artifact,
      '--root', options.root, '--bin-dir', options.binDirectory, '--env-file', options.envFile], { cwd: temp });
    assert.equal(await readlink(join(options.root, 'current')), `releases/${release.id}`);
    const help = await run(join(options.binDirectory, 'smart-codex'), ['--help'], { cwd: temp });
    assert.match(help.stdout, /smart-codex/);
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
    await symlink(join(options.root, 'releases', release.id), alias);
    await assert.rejects(installRelease(release, { ...options, envFile: join(alias, 'env') }), /separate locations/);
    await assert.rejects(installRelease(release, { ...options, binDirectory: join(options.root, 'bin') }), /separate locations/);
    assert.equal(await readlink(join(options.root, 'current')), `releases/${release.id}`);
  } finally { await rm(temp, { recursive: true, force: true }); }
});

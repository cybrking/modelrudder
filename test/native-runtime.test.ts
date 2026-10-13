import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { installNative, rollbackNative, managedNativeCommand, requireManagedNative, nativeDirectory, nativeMaintenanceEnv, nativeStatus, renameNative } from '../src/native-runtime.ts';
import type { NativeInstallOperations } from '../src/native-runtime.ts';
import { codexCommand } from '../src/native-command.ts';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'native-runtime-test-'));
  const env = { ...process.env, SMART_CODEX_STATE_DIR: root };
  const seen: string[] = [];
  const ops: NativeInstallOperations = {
    async install(provider, version, directory, childEnv) {
      assert.equal(childEnv.TYPESAFE_API_KEY, undefined);
      assert.equal(childEnv.OPENAI_API_KEY, undefined);
      const entry = join('package with spaces', 'cli.js');
      await mkdir(join(directory, 'package with spaces'));
      await writeFile(join(directory, entry), `// ${provider} ${version}`);
      seen.push(`install ${version}`);
      return entry;
    },
    async verify(provider, version, command) {
      assert.equal(command.file, process.execPath);
      assert.equal(command.args[0], '--');
      assert.equal(await readFile(command.args[1], 'utf8'), `// ${provider} ${version}`);
      seen.push(`verify ${version}`);
    },
  };
  return { root, env, ops, seen, close: () => rm(root, { recursive: true, force: true }) };
}

test('managed selection survives global PATH updates, upgrades, idempotent install and rollback', async () => {
  const f = await fixture();
  try {
    assert.equal(await managedNativeCommand('codex', f.env), undefined);
    await assert.rejects(requireManagedNative('codex', f.env), /native install/);
    await installNative('codex', '0.161.0', f.env, f.ops);
    const first = await requireManagedNative('codex', f.env);
    assert.deepEqual(await codexCommand({ ...f.env, PATH: '/entirely/different/new/cli' }), first);
    await installNative('codex', '0.162.0', f.env, f.ops);
    assert.notDeepEqual(await requireManagedNative('codex', f.env), first);
    await installNative('codex', '0.162.0', f.env, f.ops);
    assert.equal(f.seen.filter(v => v === 'install 0.162.0').length, 1);
    assert.equal(await rollbackNative('codex', f.env, f.ops), '0.161.0');
    assert.deepEqual(await requireManagedNative('codex', f.env), first);
    assert.match(await nativeStatus('codex', f.env), /Previous: 0.162.0/);
    assert.equal(await rollbackNative('codex', f.env, f.ops), '0.162.0');
  } finally { await f.close(); }
});

test('failed download, verification and unsupported version preserve current and previous pins', async () => {
  const f = await fixture();
  try {
    await installNative('codex', '0.160.1', f.env, f.ops);
    await installNative('codex', '0.161.0', f.env, f.ops);
    const path = join(nativeDirectory('codex', f.env), 'selection.json');
    const before = await readFile(path, 'utf8');
    for (const step of ['install', 'verify'] as const) {
      await assert.rejects(installNative('codex', '0.162.0', f.env, { ...f.ops, async [step]() { throw new Error('simulated failure'); } }), /simulated failure/);
      assert.equal(await readFile(path, 'utf8'), before);
      assert.deepEqual((await readdir(join(nativeDirectory('codex', f.env), 'versions'))).sort(), ['0.160.1', '0.161.0']);
    }
    await assert.rejects(installNative('codex', '0.162.1', f.env, f.ops), /not verified/);
    await assert.rejects(installNative('codex', '../../outside', f.env, f.ops), /not verified/);
    assert.equal(await readFile(path, 'utf8'), before);
    await assert.rejects(rollbackNative('codex', f.env, { ...f.ops, async verify() { throw new Error('rollback failed'); } }), /rollback failed/);
    assert.equal(await readFile(path, 'utf8'), before);
  } finally { await f.close(); }
});

test('missing managed executable fails closed instead of falling back to global CLI', async () => {
  const f = await fixture();
  try {
    await installNative('codex', '0.162.0', f.env, f.ops);
    const command = await requireManagedNative('codex', f.env);
    await rm(command.args[1]);
    await assert.rejects(codexCommand(f.env), /executable is missing/);
  } finally { await f.close(); }
});

test('reject malformed selections, metadata path escapes, symlink selection and concurrent operation', async () => {
  const f = await fixture();
  try {
    await installNative('codex', '0.162.0', f.env, f.ops);
    const root = nativeDirectory('codex', f.env);
    const metadataPath = join(root, 'versions', '0.162.0', 'metadata.json');
    const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
    await writeFile(join(f.root, 'outside.js'), 'outside');
    await writeFile(metadataPath, JSON.stringify({ ...metadata, entry: '../../../../outside.js' }));
    await assert.rejects(requireManagedNative('codex', f.env), /inside its version/);
    await writeFile(metadataPath, JSON.stringify(metadata));
    await mkdir(join(root, '.lock'));
    await assert.rejects(installNative('codex', '0.161.0', f.env, f.ops), /Another native/);
    await rm(join(root, '.lock'), { recursive: true });
    await writeFile(join(root, 'selection.json'), '{invalid');
    await assert.rejects(requireManagedNative('codex', f.env), /Invalid native selection/);
    if (process.platform !== 'win32') {
      await rm(join(root, 'selection.json'));
      await symlink(join(f.root, 'outside.js'), join(root, 'selection.json'));
      await assert.rejects(requireManagedNative('codex', f.env), /Invalid native selection/);
    }
  } finally { await f.close(); }
});

test('provider installs stay separate and rollback without history reports actionable error', async () => {
  const f = await fixture();
  try {
    await installNative('codex', '0.162.0', f.env, f.ops);
    await installNative('claude', '2.1.295', f.env, f.ops);
    assert.notDeepEqual(await requireManagedNative('codex', f.env), await requireManagedNative('claude', f.env));
    await assert.rejects(rollbackNative('claude', f.env, f.ops), /No previous/);
    await assert.rejects(installNative('claude', '2.1.296', f.env, f.ops), /not verified/);
  } finally { await f.close(); }
});

test('maintenance strips secrets, npm overrides, native provider overrides and auto-update toggles', () => {
  const env = nativeMaintenanceEnv({ PATH: '/bin', HOME: '/home/test', SystemRoot: 'C:\\Windows', TYPESAFE_API_KEY: 'secret',
    OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret', NPM_TOKEN: 'secret', npm_config_registry: 'https://evil.invalid',
    NODE_OPTIONS: '--require=untrusted', ANTHROPIC_BASE_URL: 'https://evil.invalid', DISABLE_UPDATES: '0' });
  assert.deepEqual(env, { PATH: '/bin', HOME: '/home/test', SystemRoot: 'C:\\Windows', DISABLE_AUTOUPDATER: '1', DISABLE_UPDATES: '1' });
});

for (const failure of ['metadata', 'verification'] as const) {
  test(`existing installation ${failure} failure explains manual recovery and preserves files`, async () => {
    const f = await fixture();
    try {
      await installNative('codex', '0.161.0', f.env, f.ops);
      await installNative('codex', '0.162.0', f.env, f.ops);
      const root = nativeDirectory('codex', f.env);
      const target = join(root, 'versions', '0.162.0');
      const metadata = join(target, 'metadata.json');
      if (failure === 'metadata') await writeFile(metadata, '{broken');
      const beforeSelection = await readFile(join(root, 'selection.json'), 'utf8');
      const beforeMetadata = await readFile(metadata, 'utf8');
      const beforeEntry = await readFile(join(target, 'package with spaces', 'cli.js'), 'utf8');
      const beforeCalls = [...f.seen];
      await assert.rejects(installNative('codex', '0.162.0', f.env,
        failure === 'verification' ? { ...f.ops, async verify() { throw new Error('PRIVATE subprocess diagnostics'); } } : f.ops), error => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /ModelRudder native: Existing managed codex 0.162.0 failed validation/);
        assert.match(error.message, /native rollback/);
        assert.match(error.message, /stop all ModelRudder sessions/);
        assert.ok(error.message.includes(JSON.stringify(target)));
        assert.match(error.message, /then run smart-codex native install 0.162.0/);
        assert.doesNotMatch(error.message, /PRIVATE/);
        return true;
      });
      assert.equal(await readFile(join(root, 'selection.json'), 'utf8'), beforeSelection);
      assert.equal(await readFile(metadata, 'utf8'), beforeMetadata);
      assert.equal(await readFile(join(target, 'package with spaces', 'cli.js'), 'utf8'), beforeEntry);
      assert.deepEqual(f.seen, beforeCalls);
      assert.deepEqual((await readdir(root)).sort(), ['selection.json', 'versions']);
    } finally { await f.close(); }
  });
}


test('Windows activation retries transient locks, bounds failures, and never retries unrelated errors', async () => {
  let calls = 0;
  const waits: number[] = [];
  await renameNative('candidate', 'verified', 'win32', async () => {
    if (++calls < 3) throw Object.assign(new Error('locked'), { code: 'EPERM' });
  }, async ms => { waits.push(ms); });
  assert.equal(calls, 3);
  assert.deepEqual(waits, [100, 200]);
  calls = 0;
  await assert.rejects(renameNative('candidate', 'verified', 'win32', async () => {
    calls++; throw Object.assign(new Error('locked'), { code: 'EBUSY' });
  }, async () => {}), /current selection was not changed/);
  assert.equal(calls, 7);
  for (const [platform, code] of [['linux', 'EPERM'], ['win32', 'ENOENT']] as const) {
    calls = 0;
    await assert.rejects(renameNative('candidate', 'verified', platform, async () => {
      calls++; throw Object.assign(new Error('failure'), { code });
    }, async () => { assert.fail('Unexpected retry'); }), /Could not activate/);
    assert.equal(calls, 1);
  }
});

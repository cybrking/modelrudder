import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, writeFile, symlink } from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
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
    await assert.rejects(installNative('codex', '1.0.0', f.env, f.ops), /blocked or unsupported/);
    await assert.rejects(installNative('codex', '../../outside', f.env, f.ops), /blocked or unsupported/);
    assert.equal(await readFile(path, 'utf8'), before);
    await assert.rejects(rollbackNative('codex', f.env, { ...f.ops, async verify() { throw new Error('rollback failed'); } }), /rollback failed/);
    assert.equal(await readFile(path, 'utf8'), before);
  } finally { await f.close(); }
});

for (const [provider, previous, candidate] of [
  ['codex', '0.161.0', '0.162.0'], ['claude', '2.1.295', '2.1.296'],
] as const) {
  test(`${provider} is verified at its final path before metadata or selection is published`, async () => {
    const f = await fixture();
    try {
      await installNative(provider, previous, f.env, f.ops);
      const root = nativeDirectory(provider, f.env);
      const selectionPath = join(root, 'selection.json');
      const before = await readFile(selectionPath, 'utf8');
      const oldCommand = await requireManagedNative(provider, f.env);
      const target = join(await realpath(join(root, 'versions')), candidate);
      let verifiedEntry: string | undefined;
      await installNative(provider, candidate, f.env, { ...f.ops,
        async verify(actualProvider, version, command, env) {
          assert.equal(command.args[1], join(target, 'package with spaces', 'cli.js'),
            'Do not run the native executable in a directory that will be renamed afterward');
          await assert.rejects(readFile(join(target, 'metadata.json')), { code: 'ENOENT' });
          assert.equal(await readFile(selectionPath, 'utf8'), before);
          assert.deepEqual(await requireManagedNative(provider, f.env), oldCommand);
          await f.ops.verify(actualProvider, version, command, env);
          verifiedEntry = command.args[1];
        },
      });
      assert.equal((await requireManagedNative(provider, f.env)).args[1], verifiedEntry);
      assert.equal(JSON.parse(await readFile(selectionPath, 'utf8')).previous, previous);
      assert.deepEqual((await readdir(root)).sort(), ['selection.json', 'versions']);
      assert.deepEqual((await readdir(join(root, 'versions'))).sort(), [previous, candidate].sort());
      assert.equal(await rollbackNative(provider, f.env, f.ops), previous);
    } finally { await f.close(); }
  });
}

test('repairing a missing selected installation stays unavailable until native verification passes', async () => {
  const f = await fixture();
  try {
    await installNative('codex', '0.162.0', f.env, f.ops);
    const root = nativeDirectory('codex', f.env);
    const before = await readFile(join(root, 'selection.json'), 'utf8');
    await rm(join(root, 'versions', '0.162.0'), { recursive: true });
    await installNative('codex', '0.162.0', f.env, { ...f.ops,
      async verify(provider, version, command, env) {
        await assert.rejects(requireManagedNative(provider, f.env), /metadata is missing/);
        assert.equal(await readFile(join(root, 'selection.json'), 'utf8'), before);
        await f.ops.verify(provider, version, command, env);
      },
    });
    assert.ok(await requireManagedNative('codex', f.env));
    assert.equal(await readFile(join(root, 'selection.json'), 'utf8'), before);
  } finally { await f.close(); }
});

test('failed final-path verification removes only its candidate and permits a clean retry', async () => {
  const f = await fixture();
  try {
    await installNative('claude', '2.1.295', f.env, f.ops);
    const root = nativeDirectory('claude', f.env);
    const selectionPath = join(root, 'selection.json');
    const before = await readFile(selectionPath, 'utf8');
    const target = join(root, 'versions', '2.1.296');
    await assert.rejects(installNative('claude', '2.1.296', f.env, { ...f.ops,
      async verify() {
        assert.ok((await readdir(target)).includes('package with spaces'));
        await assert.rejects(readFile(join(target, 'metadata.json')), { code: 'ENOENT' });
        throw new Error('synthetic final-path failure');
      },
    }), /synthetic final-path failure/);
    assert.equal(await readFile(selectionPath, 'utf8'), before);
    assert.deepEqual((await readdir(root)).sort(), ['selection.json', 'versions']);
    assert.deepEqual(await readdir(join(root, 'versions')), ['2.1.295']);
    assert.equal(await readFile((await requireManagedNative('claude', f.env)).args[1], 'utf8'), '// claude 2.1.295');
    await installNative('claude', '2.1.296', f.env, f.ops);
    assert.equal(await rollbackNative('claude', f.env, f.ops), '2.1.295');
  } finally { await f.close(); }
});

test('downloaded verification metadata cannot make an unverified candidate usable', async () => {
  const f = await fixture();
  try {
    await installNative('codex', '0.162.0', f.env, f.ops);
    const root = nativeDirectory('codex', f.env);
    const target = join(root, 'versions', '0.162.0');
    const before = await readFile(join(root, 'selection.json'), 'utf8');
    const metadata = await readFile(join(target, 'metadata.json'), 'utf8');
    await rm(target, { recursive: true });
    await assert.rejects(installNative('codex', '0.162.0', f.env, { ...f.ops,
      async install(...args) {
        const entry = await f.ops.install(...args);
        await writeFile(join(args[2], 'metadata.json'), metadata);
        return entry;
      },
      async verify() { assert.fail('Do not probe a candidate carrying its own verification marker'); },
    }), /must not supply managed verification metadata/);
    assert.equal(await readFile(join(root, 'selection.json'), 'utf8'), before);
    assert.deepEqual(await readdir(join(root, 'versions')), []);
    await assert.rejects(requireManagedNative('codex', f.env), /is missing/);
  } finally { await f.close(); }
});

test('failed candidate cleanup explains recovery without exposing diagnostics or changing either pin', async (t) => {
  const f = await fixture();
  let restoreRemove: (() => void) | undefined;
  try {
    await installNative('claude', '2.1.295', f.env, f.ops);
    await installNative('claude', '2.1.296', f.env, f.ops);
    const root = nativeDirectory('claude', f.env);
    const target = join(root, 'versions', '2.1.303');
    const before = await readFile(join(root, 'selection.json'), 'utf8');
    const originalRemove = fs.rm;
    let cleanupAttempts = 0;
    const remove = t.mock.method(fs, 'rm', async (path, options) => {
      if (path === target) {
        cleanupAttempts++;
        assert.equal(options?.maxRetries, 6);
        assert.equal(options?.retryDelay, 100);
        throw Object.assign(new Error('PRIVATE filesystem diagnostic'), { code: 'EBUSY' });
      }
      return originalRemove(path, options);
    });
    syncBuiltinESMExports();
    restoreRemove = () => { remove.mock.restore(); syncBuiltinESMExports(); };
    await assert.rejects(installNative('claude', '2.1.303', f.env, { ...f.ops,
      async verify() { throw new Error('PRIVATE native diagnostic'); },
    }), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Could not finish verifying claude 2.1.303 or remove its unverified files/);
      assert.match(error.message, /current selection was not changed/);
      assert.ok(error.message.includes(JSON.stringify(target)));
      assert.match(error.message, /then run smart-claude native install 2.1.303/);
      assert.doesNotMatch(error.message, /PRIVATE/);
      return true;
    });
    assert.equal(cleanupAttempts, 1);
    assert.equal(await readFile(join(root, 'selection.json'), 'utf8'), before);
    await assert.rejects(readFile(join(target, 'metadata.json')), { code: 'ENOENT' });
    assert.deepEqual((await readdir(root)).sort(), ['selection.json', 'versions']);
    assert.deepEqual((await readdir(join(root, 'versions'))).sort(), ['2.1.295', '2.1.296', '2.1.303']);
    assert.equal(await readFile((await requireManagedNative('claude', f.env)).args[1], 'utf8'), '// claude 2.1.296');
    await assert.rejects(installNative('claude', '2.1.303', f.env, f.ops), /failed validation/);
    assert.equal(await rollbackNative('claude', f.env, f.ops), '2.1.295');
  } finally { restoreRemove?.(); await f.close(); }
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
    await installNative('claude', '2.1.296', f.env, f.ops);
    assert.match(await nativeStatus('claude', f.env), /2.1.296/);
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

test('unrecorded candidates switch only after verification and a later block permits rollback', async () => {
  const f = await fixture();
  const { cliCompatibilityData } = await import('../src/cli-compatibility-data.ts');
  try {
    await installNative('codex', '0.162.0', f.env, f.ops);
    const selectionPath = join(nativeDirectory('codex', f.env), 'selection.json');
    const before = await readFile(selectionPath, 'utf8');
    await assert.rejects(installNative('codex', '0.162.1', f.env, { ...f.ops,
      async verify() { throw new Error('candidate contract failed'); } }), /candidate contract failed/);
    assert.equal(await readFile(selectionPath, 'utf8'), before);
    await installNative('codex', '0.162.1', f.env, f.ops);
    assert.match(await nativeStatus('codex', f.env), /0.162.1/);
    cliCompatibilityData.codex.blocked.push({ version: '0.162.1', reason: 'Known regression fixture' });
    try {
      await assert.rejects(requireManagedNative('codex', f.env), /Known regression fixture/);
      assert.equal(await rollbackNative('codex', f.env, f.ops), '0.162.0');
    } finally { cliCompatibilityData.codex.blocked.pop(); }
  } finally { await f.close(); }
});

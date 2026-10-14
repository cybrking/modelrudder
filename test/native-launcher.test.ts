import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm, writeFile, chmod, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDoctor } from '../src/doctor.ts';
import { createRuntimePolicy } from '../src/runtime-policy.ts';

const exec = promisify(execFile);

for (const provider of ['codex', 'claude']) {
  test(`${provider} native management runs without an interactive terminal or classifier credentials`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'modelrudder-launcher-'));
    try {
      const result = await exec(process.execPath,
        [fileURLToPath(new URL(`../src/smart-${provider}.ts`, import.meta.url)), 'native', 'status'],
        { env: { PATH: '', SMART_CODEX_STATE_DIR: directory }, timeout: 15_000 });
      assert.ok(result.stdout.trim());
      assert.doesNotMatch(result.stderr, /requires an interactive terminal|Configure ALLOW_/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
}

test('default doctor uses the supplied state directory and refuses to execute an unpinned PATH CLI', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-doctor-'));
  try {
    const marker = join(directory, 'executed');
    const binary = join(directory, 'codex');
    await writeFile(binary, `#!${process.execPath}\nrequire('node:fs').writeFileSync(${JSON.stringify(marker)}, 'executed');\nconsole.log('codex-cli 0.162.0');\n`);
    await chmod(binary, 0o700);
    const result = await runDoctor({ SMART_CODEX_STATE_DIR: directory, PATH: directory }, undefined,
      createRuntimePolicy({ mode: 'pinned' }));
    assert.equal(result.ok, false);
    assert.match(result.text, /ModelRudder native:/);
    assert.match(result.text, /native install/);
    await assert.rejects(access(marker), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('doctor distinguishes an unsupported major from a failed diagnostic probe', async () => {
  const result = await runDoctor({}, async args => ({
    stdout: args[0] === '--version' ? 'codex-cli 99.0.0' : args[0] === 'login' ? 'Logged in using ChatGPT' : args[0] === 'app-server' ? '--stdio' : '--remote',
    stderr: '',
  }), createRuntimePolicy({ mode: 'pinned' }));
  assert.equal(result.ok, false);
  assert.match(result.text, /blocked or unsupported/);
  assert.doesNotMatch(result.text, /diagnostic probe failed/);
});


test('default doctor probes the pinned command with supplied environment and sanitized credentials', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-doctor-pin-'));
  try {
    const root = join(directory, 'native', 'codex');
    const version = '0.162.0';
    const folder = join(root, 'versions', version);
    await mkdir(folder, { recursive: true });
    await writeFile(join(root, 'selection.json'), JSON.stringify({ format: 1, current: version, previous: null }));
    await writeFile(join(folder, 'metadata.json'), JSON.stringify({ format: 1, provider: 'codex', version,
      platform: process.platform, arch: process.arch, entry: 'fake.cjs' }));
    await writeFile(join(folder, 'fake.cjs'), `
if (process.env.DIAGNOSTIC_FIXTURE !== 'supplied' || process.env.TYPESAFE_API_KEY) process.exit(2);
const arg = process.argv[2];
console.log(arg === '--version' ? 'codex-cli 0.162.0' : arg === 'login' ? 'Logged in using ChatGPT' : arg === 'app-server' ? '--stdio' : '--remote');
`);
    const result = await runDoctor({ SMART_CODEX_STATE_DIR: directory, PATH: '', DIAGNOSTIC_FIXTURE: 'supplied',
      TYPESAFE_API_KEY: 'must-not-reach-native' }, undefined, createRuntimePolicy({ mode: 'pinned' }));
    assert.equal(result.ok, true, result.text);
    assert.match(result.text, /0.162.0 \(managed; independent of PATH updates\)/);
    assert.match(result.text, /Codex subscription login: ready/);
    assert.doesNotMatch(result.text, /must-not-reach-native/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

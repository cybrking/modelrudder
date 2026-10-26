import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advisoryHook, advisoryHookArgs, runAdvisoryHook } from '../src/advisory-hook.ts';
import { isPrivatePath, protectPrivatePathSync } from '../src/private-files.ts';

const event = { hook_event_name: 'UserPromptSubmit', session_id: 'session-1', model: 'gpt-6-luna', prompt: 'Review this architecture' };
const note = 'Model Rudder suggests gpt-6-astra. Your current model is unchanged.';

// Windows ACL fixture creation starts several PowerShell processes before the hook starts.
test('hook process exits successfully within its bounded process watchdog when stdin never ends', { timeout: 30_000 }, async () => fixture(async directory => {
  const config = join(directory, 'classifier.env');
  writeFileSync(config, 'ALLOW_CLASSIFICATION=false\n', { mode: 0o600 });
  protectPrivatePathSync(config);
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/advisory-hook.ts', import.meta.url))], {
    env: { ...process.env, MODEL_RUDDER_ADVISORY_ENV_FILE: config, MODEL_RUDDER_ADVISORY_STATE_DIR: directory },
    stdio: 'pipe',
  });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const timer = setTimeout(() => child.kill(), 5000);
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject); child.once('close', resolve);
    });
    assert.equal(code, 0);
    assert.equal(output, '');
  } finally { clearTimeout(timer); child.stdin.destroy(); child.kill(); }
}));
async function fixture(work: (directory: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'advisory-hook-'));
  protectPrivatePathSync(directory, true);
  try { await work(directory); } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('only systemMessage is emitted and repeated notes are suppressed without storing prompts', async () => fixture(async directory => {
  assert.deepEqual(await advisoryHook(event, directory, async () => note), { systemMessage: note });
  const state = join(directory, readdirSync(directory)[0]);
  assert.equal(await isPrivatePath(state), true, 'new state must pass the same privacy check used on the next prompt');
  assert.equal(await advisoryHook(event, directory, async () => note), null);
  assert.equal(await advisoryHook(event, directory, async () => null), null);
  assert.equal(await advisoryHook(event, directory, async () => note), null);
  assert.deepEqual(JSON.parse(readFileSync(join(directory, readdirSync(directory)[0]), 'utf8')), { model: event.model, note });
  assert.equal(await advisoryHook({ ...event, model: 'gpt-6-astra' }, directory, async () => null), null);
  assert.deepEqual(JSON.parse(readFileSync(state, 'utf8')), { model: 'gpt-6-astra', note: null });
  assert.deepEqual(await advisoryHook(event, directory, async () => note), { systemMessage: note });
}));

test('malformed or ineligible inputs never call classifier', async () => fixture(async directory => {
  for (const input of [null, [], {}, { ...event, hook_event_name: 'Stop' }, { ...event, agent_id: 'child' },
    { ...event, model: '' }, { ...event, session_id: '../../elsewhere' }, { ...event, prompt: '/model' },
    { ...event, prompt: '@secret.txt' }, { ...event, prompt: 'a'.repeat(64001) }]) {
    assert.equal(await advisoryHook(input, directory, async () => { assert.fail('classifier called'); }), null);
  }
  assert.deepEqual(readdirSync(directory), []);
}));

test('symlink state is not followed or replaced', { skip: process.platform === 'win32' }, async () => fixture(async directory => {
  await advisoryHook(event, directory, async () => note);
  const path = join(directory, readdirSync(directory)[0]);
  rmSync(path);
  const target = join(directory, 'unrelated');
  writeFileSync(target, 'keep', { mode: 0o600 });
  symlinkSync(target, path);
  assert.equal(await advisoryHook(event, directory, async () => { assert.fail('must not classify'); }), null);
  assert.equal(readFileSync(target, 'utf8'), 'keep');
}));

test('classifier failures and unsafe messages leave native execution untouched', async () => fixture(async directory => {
  assert.equal(await advisoryHook(event, directory, async () => { throw Error('secret error'); }), null);
  assert.equal(await advisoryHook(event, directory, async () => '\u001b[2J'), null);
  assert.equal(await advisoryHook(event, directory, async () => 'x'.repeat(1025)), null);
  assert.deepEqual(readdirSync(directory), []);
}));

test('hook runner skips missing configuration and bounds input', async () => fixture(async directory => {
  assert.equal(await runAdvisoryHook((async function* () { throw Error('must not read'); })(), {}), '');
  const config = join(directory, 'classifier.env');
  writeFileSync(config, 'ALLOW_CLASSIFICATION=false\n', { mode: 0o600 });
  protectPrivatePathSync(config);
  const env = { MODEL_RUDDER_ADVISORY_ENV_FILE: config, MODEL_RUDDER_ADVISORY_STATE_DIR: directory };
  assert.equal(await runAdvisoryHook((async function* () { yield Buffer.alloc(256001); })(), env), '');
  assert.equal(await runAdvisoryHook((async function* () { yield Buffer.from('{bad'); })(), env), '');
}));

test('cancellation interrupts a pending privacy check before reading input or classifying', async () => {
  const controller = new AbortController();
  let canceled = false;
  let checking!: () => void;
  const started = new Promise<void>(resolve => { checking = resolve; });
  const result = runAdvisoryHook((async function* () { assert.fail('must not read input'); })(), {
    MODEL_RUDDER_ADVISORY_ENV_FILE: '/unused-config', MODEL_RUDDER_ADVISORY_STATE_DIR: '/unused-state',
  }, controller.signal, async (_path, _directory, signal) => {
    assert.ok(signal);
    checking();
    return new Promise(resolve => signal.addEventListener('abort', () => { canceled = true; resolve(false); }, { once: true }));
  });
  await started;
  controller.abort();
  assert.equal(await result, '');
  assert.equal(canceled, true);
});

test('cancellation discards a late note without writing state', async () => fixture(async directory => {
  const controller = new AbortController();
  assert.equal(await advisoryHook(event, directory, async () => { controller.abort(); return note; }, controller.signal), null);
  assert.deepEqual(readdirSync(directory), []);
}));

test('POSIX hook command preserves shell metacharacters in paths', { skip: process.platform === 'win32' }, () => {
  const script = '/a b/quote\'s/$(echo wrong)`echo wrong`.ts';
  const args = advisoryHookArgs(process.execPath, script);
  assert.equal(args[0], '-c');
  const encoded = args[1].match(/command=("(?:[^"\\]|\\.)*")/)!;
  const command = JSON.parse(encoded[1]);
  // Substitute only the fixed Node invocation to observe its argument boundaries.
  const output = execFileSync('/bin/sh', ['-c', `set -- ${command}; printf '%s\\n' "$@"`], { encoding: 'utf8' });
  assert.deepEqual(output.trimEnd().split('\n'), [process.execPath, '--', script]);
  assert.ok(!args[1].includes('bypass'));
});

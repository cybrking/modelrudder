import test from 'node:test';
import assert from 'node:assert/strict';
import { runDoctor } from '../src/doctor.ts';
import { createRuntimePolicy } from '../src/runtime-policy.ts';

test('doctor preserves an existing API login while reporting subscription authentication unavailable', async () => {
  const calls: string[][] = [];
  const result = await runDoctor({}, async args => {
    calls.push(args);
    if (args[0] === '--version') return { stdout: 'codex-cli 0.160.1', stderr: '' };
    if (args[0] === 'login') return { stdout: '', stderr: 'Logged in using an API key' };
    return { stdout: args[0] === 'app-server' ? '--stdio' : '--remote', stderr: '' };
  }, createRuntimePolicy({ mode: 'pinned' }));
  assert.equal(result.ok, false);
  assert.match(result.text, /Codex subscription login: required/);
  assert.deepEqual(calls.find(args => args[0] === 'login'), ['login', 'status']);
  assert.ok(!calls.flat().some(arg => arg.includes('forced_login_method')));
  assert.ok(!result.text.includes('Logged in using an API key'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { codexCompatibility } from '../src/compatibility.ts';
import { runDoctor } from '../src/doctor.ts';
import { createRuntimePolicy } from '../src/runtime-policy.ts';

test('protocol-tested Codex 0.162.0 passes launcher compatibility and doctor readiness', async () => {
  assert.equal(codexCompatibility('codex-cli 0.162.0\n').protocolTested, true);
  const result = await runDoctor({}, async args => ({
    stdout: args[0] === '--version' ? 'codex-cli 0.162.0\n'
      : args[0] === 'login' ? 'Logged in using ChatGPT'
      : args[0] === '--help' ? '--remote <ADDR>\n' : '--stdio\n',
    stderr: '',
  }), createRuntimePolicy({ mode: 'pinned' }));
  assert.equal(result.ok, true);
  assert.match(result.text, /Codex CLI: 0\.162\.0; protocol evidence recorded/);
});

test('compatibility keeps historical builds and rejects untested versions and malformed output', () => {
  for (const version of ['0.159.3', '0.160.1', '0.161.0']) {
    assert.equal(codexCompatibility(`codex-cli ${version}`).protocolTested, true);
  }
  for (const output of ['codex-cli 0.163.0', 'codex-cli 0.162.1', 'codex-cli 0.162.0-beta.1',
    'codex-cli 0.162.0+modified', 'another-cli 0.162.0', 'codex-cli 0.162.0\nextra output', '']) {
    assert.equal(codexCompatibility(output).protocolTested, false, output);
  }
  assert.equal(codexCompatibility('codex-cli 0.161.0').nativeTuiCertified, false);
});

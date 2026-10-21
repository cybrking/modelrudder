import test from 'node:test';
import assert from 'node:assert/strict';
import { codexCompatibility } from '../src/compatibility.ts';
import { cliCompatibilityData } from '../src/cli-compatibility-data.ts';
import { runDoctor } from '../src/doctor.ts';
import { createRuntimePolicy } from '../src/runtime-policy.ts';

const latestRecorded = cliCompatibilityData.codex.latestRecorded;
const unrecorded = (version: string) => {
  let [major, minor, patch] = version.split('.').map(Number);
  do { patch++; } while (cliCompatibilityData.codex.tested.includes(`${major}.${minor}.${patch}`));
  return `${major}.${minor}.${patch}`;
};

test('latest recorded Codex passes launcher compatibility and doctor readiness', async () => {
  assert.equal(codexCompatibility(`codex-cli ${latestRecorded}\n`).protocolTested, true);
  const result = await runDoctor({}, async args => ({
    stdout: args[0] === '--version' ? `codex-cli ${latestRecorded}\n`
      : args[0] === 'login' ? 'Logged in using ChatGPT'
      : args[0] === '--help' ? '--remote <ADDR>\n' : '--stdio\n',
    stderr: '',
  }), createRuntimePolicy({ mode: 'pinned' }));
  assert.equal(result.ok, true);
  assert.ok(result.text.includes(`Codex CLI: ${latestRecorded}; protocol evidence recorded`));
});

test('compatibility retains historical builds and accepts every recorded version without TUI certification', () => {
  for (const version of ['0.159.3', '0.160.1', '0.161.0']) {
    assert.equal(codexCompatibility(`codex-cli ${version}`).protocolTested, true);
  }
  for (const version of cliCompatibilityData.codex.tested) {
    const result = codexCompatibility(`codex-cli ${version}`);
    assert.equal(result.protocolTested, true, version);
    assert.equal(result.nativeTuiCertified, false, version);
  }
});

test('eligible but unrecorded versions still require probing after compatibility promotions', () => {
  // Derive absent fixtures instead of pinning a future release that can be promoted.
  for (const version of [unrecorded(latestRecorded), unrecorded(cliCompatibilityData.codex.minimum)]) {
    const result = codexCompatibility(`codex-cli ${version}`);
    assert.equal(result.eligible, true, version);
    assert.equal(result.protocolTested, false, version);
    assert.equal(result.status, 'probe-required', version);
  }
});

test('compatibility rejects prereleases, modified builds and malformed output', () => {
  for (const output of [`codex-cli ${latestRecorded}-beta.1`, `codex-cli ${latestRecorded}+modified`,
    `another-cli ${latestRecorded}`, `codex-cli ${latestRecorded}\nextra output`, '']) {
    assert.equal(codexCompatibility(output).protocolTested, false, output);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { cliCompatibility } from '../src/cli-compatibility.ts';
import { cliCompatibilityData } from '../src/cli-compatibility-data.ts';
import { checkCodexCompatibility } from '../src/codex-protocol-probe.ts';
import { checkClaudeNative } from '../src/smart-claude.ts';
import { promoteCliEvidence } from '../scripts/promote-cli-compatibility.ts';

const nextPatch = (version: string) => version.replace(/(\d+)$/, (_, patch: string) => String(Number(patch) + 1));
const codexBaseline = cliCompatibilityData.codex.latestRecorded;
const claudeBaseline = cliCompatibilityData.claude.latestRecorded;
const codexCandidate = nextPatch(cliCompatibilityData.codex.latestRecorded);
const claudeCandidate = nextPatch(cliCompatibilityData.claude.latestRecorded);
const codexNative = (version = codexCandidate) => ({ ok: true, version, inferenceCalls: 0, nativeTuiCertified: false,
  checks: ['remote-capability', 'stdio-capability', 'stdio-initialize', 'fresh-thread-start', 'model-setting', 'read-only-permissions'] });
const claudeNative = (version = claudeCandidate) => ({ version: `${version} (Claude Code)`, provider: 'synthetic loopback only', paidInference: false,
  realAuthentication: false, interactiveTuiQualified: false,
  results: [ ['alias-is-not-resolved', 'haiku'], ['haiku-full-id', 'claude-haiku-5-5'],
    ['sonnet-full-id', 'claude-sonnet-5-5'], ['opus-full-id', 'claude-opus-5-5'],
    ['haiku-obeys-native-allowlist', 'claude-sonnet-5-5'], ['opus-obeys-native-allowlist', 'claude-sonnet-5-5'] ]
    .map(([name, emitted]) => ({ name, requested: emitted, emitted })) });

test('new stable releases require a successful probe; failed or swapped CLIs cannot launch', async () => {
  let calls = 0;
  const probe = async () => { calls++; return codexNative(); };
  assert.equal((await checkCodexCompatibility('codex-cli 0.161.0', {}, probe)).protocolTested, true);
  assert.equal(calls, 0);
  assert.equal((await checkCodexCompatibility(`codex-cli ${codexCandidate}`, {}, probe)).status, 'probe-required');
  assert.equal(calls, 1);
  await assert.rejects(checkCodexCompatibility(`codex-cli ${codexCandidate}`, {}, async () => { throw new Error('Contract broke'); }), /Contract broke/);
  await assert.rejects(checkCodexCompatibility(`codex-cli ${codexCandidate}`, {}, async () => codexNative(nextPatch(codexCandidate))), /changed/);
  for (const version of ['0.158.0', '1.0.0', '0.162.1-beta.1', '0.162.1+custom', '00.162.1']) {
    assert.equal(cliCompatibility('codex', version).eligible, false);
  }
});

test('Claude candidates must pass plugin and synthetic wire checks before native account launch', async () => {
  const command = { file: 'claude', args: [] };
  const checks: string[] = [];
  const run = async (_: unknown, args: string[]) => {
    checks.push(args[0]);
    return args[0] === '--version' ? `${claudeCandidate} (Claude Code)` : args[0] === 'auth' ? '{"authMethod":"claude.ai"}' : 'valid';
  };
  const result = await checkClaudeNative(command, {}, '/plugin', run, async () => { checks.push('wire'); return claudeNative(); });
  assert.equal(result.offlineTested, false);
  assert.deepEqual(checks, ['--version', 'plugin', 'wire', 'auth']);
  await assert.rejects(checkClaudeNative(command, {}, '/plugin', run, async () => { throw new Error('PRIVATE payload'); }), /native protocol probe failed/);
  await assert.rejects(checkClaudeNative(command, {}, '/plugin', run, async () => ({ ...claudeNative(), version: `${nextPatch(claudeCandidate)} (Claude Code)` })), /native protocol probe failed/);
});

test('known broken releases override eligibility even if recorded', async () => {
  const blocked = cliCompatibilityData.codex.blocked;
  blocked.push({ version: '0.161.0', reason: 'Synthetic regression fixture' });
  try {
    assert.equal(cliCompatibility('codex', '0.161.0').status, 'blocked');
    await assert.rejects(checkCodexCompatibility('codex-cli 0.161.0', {}, async () => { throw new Error('must not probe'); }), /Unsupported Codex/);
  } finally { blocked.pop(); }
});

test('promotion requires complete matching evidence from every provider platform and source revision', () => {
  const sha = 'a'.repeat(40);
  const candidates = ['codex', 'claude'].flatMap(provider => ['ubuntu-latest', 'macos-latest', 'windows-latest']
    .map(os => ({ provider, version: provider === 'codex' ? codexCandidate : claudeCandidate, os })));
  const evidence = candidates.map(c => ({ ...c, sourceSha: sha, native: c.provider === 'codex' ? codexNative(c.version) : claudeNative(c.version) }));
  const result = promoteCliEvidence(candidates, evidence, sha);
  assert.equal(result.codex.latestRecorded, codexCandidate);
  assert.equal(result.claude.latestRecorded, claudeCandidate);
  assert.equal(cliCompatibilityData.codex.latestRecorded, codexBaseline);
  assert.equal(cliCompatibilityData.claude.latestRecorded, claudeBaseline);
  for (const bad of [evidence.slice(1), [...evidence, evidence[0]],
    evidence.map((e, i) => i ? e : { ...e, sourceSha: 'b'.repeat(40) }),
    evidence.map((e, i) => i ? e : { ...e, native: { ...e.native, inferenceCalls: 1 } }),
    evidence.map(e => e.provider === 'claude' ? { ...e, native: { ...e.native, paidInference: true } } : e),
    evidence.map(e => e.provider === 'codex' ? { ...e, native: { ...e.native, checks: ['stdio-initialize'] } } : e)]) {
    assert.throws(() => promoteCliEvidence(candidates, bad, sha));
  }
  assert.throws(() => promoteCliEvidence(candidates.slice(1), evidence, sha), /platform matrix/);
});

test('promotion command produces a proposal that still passes compatibility regression tests', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm, cp } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const { fileURLToPath } = await import('node:url');
  const root = await mkdtemp(join(tmpdir(), 'cli-promotion-'));
  const sha = 'a'.repeat(40);
  const candidates = ['codex', 'claude'].flatMap(provider => ['ubuntu-latest', 'macos-latest', 'windows-latest']
    .map(os => ({ provider, version: provider === 'codex' ? codexCandidate : claudeCandidate, os })));
  try {
    const artifacts = join(root, 'artifacts');
    await mkdir(join(artifacts, 'upstream-release-report'), { recursive: true });
    await cp(fileURLToPath(new URL('../src', import.meta.url)), join(root, 'src'), { recursive: true });
    await cp(fileURLToPath(new URL('../package.json', import.meta.url)), join(root, 'package.json'));
    await mkdir(join(root, 'test'));
    await cp(fileURLToPath(new URL('./codex-compatibility.test.ts', import.meta.url)), join(root, 'test/codex-compatibility.test.ts'));
    await writeFile(join(artifacts, 'upstream-release-report', 'upstream-releases.json'), JSON.stringify({ matrix: { include: candidates } }));
    for (const c of candidates) {
      const folder = join(artifacts, `upstream-${c.provider}-${c.version}-${c.os}`);
      await mkdir(folder);
      await writeFile(join(folder, 'validation.json'), JSON.stringify({ ...c, sourceSha: sha,
        native: c.provider === 'codex' ? codexNative(c.version) : claudeNative(c.version) }));
    }
    await promisify(execFile)(process.execPath, [fileURLToPath(new URL('../scripts/promote-cli-compatibility.ts', import.meta.url)), artifacts, sha], { cwd: root });
    assert.ok((await readFile(join(root, 'src/cli-compatibility-data.ts'), 'utf8')).includes(codexCandidate));
    assert.equal(JSON.parse(await readFile(join(root, 'docs/compatibility/latest.json'), 'utf8')).evidence.length, 6);
    assert.match(await readFile(join(root, 'compatibility-pr-body.md'), 'utf8'), /does not merge or publish automatically/);
    await promisify(execFile)(process.execPath, ['--test', 'test/codex-compatibility.test.ts'], { cwd: root });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('promotion workflow validates generated changes before opening or pushing the proposal', async () => {
  const { readFile } = await import('node:fs/promises');
  const workflow = await readFile(new URL('../.github/workflows/upstream-releases.yml', import.meta.url), 'utf8');
  const promote = workflow.slice(workflow.indexOf('\n  promote:'));
  assert.match(promote, /run: node scripts\/promote-cli-compatibility\.ts[^\n]*\n\s+- name: Install dependencies for the generated proposal\n\s+run: npm ci --ignore-scripts\n\s+- name: Typecheck the generated proposal\n\s+run: npm run typecheck\n\s+- name: Test the generated proposal\n\s+run: npm test\n\s+- name: Open a reviewed promotion PR/);
});

test('native probe rejects lookalike flags and broadened permissions from an actual subprocess', async () => {
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { probeCodexProtocol } = await import('../src/codex-protocol-probe.ts');
  const root = await mkdtemp(join(tmpdir(), 'cli-contract-fixture-'));
  const entry = join(root, 'fixture.mjs');
  try {
    await writeFile(entry, `
import { createInterface } from 'node:readline';
const args = process.argv.slice(2);
if (args[0] === '--version') console.log('codex-cli 0.162.1');
else if (args[0] === '--help') console.log(process.env.FIXTURE_MODE === 'flag' ? '--remote-auth-token-env TOKEN' : '--remote <ADDR>');
else if (args.includes('--help')) console.log('--stdio');
else for await (const line of createInterface({ input: process.stdin })) {
  const request = JSON.parse(line);
  if (request.id === undefined) continue;
  const result = request.method === 'initialize' ? { userAgent: 'fixture' } : {
    thread: { id: 'fixture' }, model: 'gpt-6.1-sol', approvalPolicy: 'never',
    sandbox: { type: process.env.FIXTURE_MODE === 'permission' ? 'workspaceWrite' : 'readOnly' }
  };
  console.log(JSON.stringify({ id: request.id, result }));
}
`);
    const command = { file: process.execPath, args: [entry] };
    await assert.rejects(probeCodexProtocol({ FIXTURE_MODE: 'flag' }, command), /required-cli-capabilities/);
    await assert.rejects(probeCodexProtocol({ FIXTURE_MODE: 'permission' }, command), /thread-response/);
    assert.equal((await probeCodexProtocol({}, command)).inferenceCalls, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

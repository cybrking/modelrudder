import { isPrivatePathSync, protectPrivatePathSync } from '../src/private-files.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runOutcomeCommand } from '../src/outcome.ts';
import { createSessionUsage } from '../src/session-usage.ts';
import { createUsageLog } from '../src/usage-log.ts';
import { createUsageReport, formatUsageReport, runUsageReport } from '../src/usage-report.ts';

function snapshot() {
  const u = createSessionUsage();
  u.client({ id: 1, method: 'thread/start' });
  u.server({ id: 1, result: { thread: { id: 'PRIVATE_THREAD' }, model: 'gpt-6-luna' } });
  u.server({ method: 'thread/tokenUsage/updated', params: { threadId: 'PRIVATE_THREAD', tokenUsage: { total: {
    inputTokens: 100, cachedInputTokens: 20, cacheWriteInputTokens: 10, outputTokens: 50, reasoningOutputTokens: 10,
  } } } });
  u.route({ model: 'gpt-6-luna', proposed: 'FAST', reportedConfidence: .99, reason: 'experimental_route',
    routingLatencyMs: 35.5, modelOverridden: true, effortOverridden: false, collaborationSettingsOverridden: false });
  u.finish();
  return u.snapshot();
}

test('report preserves observed tokens and uncertainty without inventing outcomes or effective model', () => {
  const s = snapshot(), report = createUsageReport(s);
  assert.equal(report.tokens.input, 100);
  assert.equal(report.tokens.output, 50);
  assert.equal(report.routing.latestRequestedModel, 'gpt-6-luna');
  assert.equal(report.routing.latestVerifiedEffectiveModel, null);
  assert.equal(report.routing.latencyMs, 35.5);
  assert.equal(report.routing.modelOverridden, true);
  assert.equal(report.outcomes.acceptedTasks, null);
  assert.equal(report.outcomes.actualSubscriptionMoneySaved, null);
  assert.equal(report.referenceComparison.coveredRateDifferenceAfterReportedClassifierUsd,
    s.solReferenceUsd - s.apiEquivalentUsd - s.jev.estimatedUsd);
  assert.match(formatUsageReport(report), /not a counterfactual baseline run or measured savings/);
});

test('export allowlist omits arbitrary content and unsafe routing values', () => {
  const s: any = snapshot();
  s.prompt = 'PRIVATE_PROMPT'; s.timestamp = 'PRIVATE_TIMESTAMP'; s.path = '/PRIVATE_PATH';
  s.latestRoute.reason = 'PRIVATE_REASON'; s.latestRoute.model = 'PRIVATE_MODEL';
  s.latestRoute.proposed = 'PRIVATE_PROFILE'; s.latestRoute.confidence = Infinity;
  const report = createUsageReport(s);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  assert.equal(report.routing.latestRequestedModel, null);
  assert.equal(report.routing.reason, 'unknown');
  assert.equal(report.routing.reportedConfidence, null);
});

test('partial and unknown classifier usage remain visibly incomplete', () => {
  const s = snapshot(); s.jev.calls = 1; s.jev.unknownCalls = 1;
  const report = createUsageReport(s);
  assert.equal(report.session.coverage, 'partial');
  assert.equal(report.classifier.unknownUsageCalls, 1);
  assert.match(formatUsageReport(report), /coverage: partial/);
});

test('malformed, inconsistent and unsupported snapshots are rejected rather than repaired into savings', () => {
  const invalid: any[] = [null, {}, { ...snapshot(), version: 2 },
    { ...snapshot(), tokens: { ...snapshot().tokens, input: 1 } },
    { ...snapshot(), apiEquivalentUsd: NaN },
    { ...snapshot(), apiEquivalentUsd: 999 },
    { ...snapshot(), solReferenceUsd: 999 },
    { ...snapshot(), jev: { ...snapshot().jev, estimatedUsd: 999 } },
    { ...snapshot(), byModel: { PRIVATE_MODEL: snapshot().tokens } },
    { ...snapshot(), jev: { ...snapshot().jev, unknownCalls: 2 } }];
  for (const s of invalid) assert.throws(() => createUsageReport(s), /Invalid usage snapshot/);
});

test('CLI selects latest log, writes private JSON and refuses overwrite without leaking paths', () => {
  const directory = mkdtempSync(join(tmpdir(), 'router-report-'));
  protectPrivatePathSync(directory, true);
  try {
    const log = createUsageLog(directory); log.write(snapshot()); log.close();
    const output = join(directory, 'PRIVATE_REPORT.json'); let errors = '', stdout = '';
    const out = (s: string) => { stdout += s; }, err = (s: string) => { errors += s; };
    assert.equal(runUsageReport(['--format', 'json', '--output', output], directory, out, err), 0);
    assert.equal(isPrivatePathSync(output), true);
    assert.equal(JSON.parse(readFileSync(output, 'utf8')).schema, 'smart-router-session-report');
    assert.equal(runUsageReport(['--format', 'json', '--output', output], directory, out, err), 1);
    assert.ok(!errors.includes('PRIVATE'));
    assert.equal(runUsageReport(['--file', log.path!, '--format', 'markdown'], directory, out, err), 0);
    assert.match(stdout, /Verified effective model: unknown/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('CLI rejects bad flags, empty directories and duplicate options without provider calls', () => {
  const directory = mkdtempSync(join(tmpdir(), 'router-report-'));
  protectPrivatePathSync(directory, true);
  try {
    for (const args of [[], ['--format', 'html'], ['--format'], ['--secret', 'PRIVATE'],
      ['--file', 'PRIVATE', '--file', 'PRIVATE']]) {
      let error = '';
      assert.equal(runUsageReport(args, directory, () => {}, s => { error += s; }), 1);
      assert.ok(!error.includes('PRIVATE'));
    }
    let help = ''; assert.equal(runUsageReport(['--help'], directory, s => { help += s; }), 0);
    assert.match(help, /No inference calls/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('longitudinal report retains all recorded decisions and labels without private snapshot fields', () => {
  const directory = mkdtempSync(join(tmpdir(), 'router-decisions-'));
  protectPrivatePathSync(directory, true);
  try {
    const log = createUsageLog(directory), usage = createSessionUsage();
    usage.route({ model: 'gpt-6-luna', proposed: 'FAST', reason: 'experimental_route', reportedConfidence: .99 });
    const first = usage.snapshot(); log.write(first); log.write(first);
    assert.equal(runOutcomeCommand(['--result', 'accepted', '--file', log.path!], directory, () => {}), 0);
    assert.equal(runOutcomeCommand(['--result', 'rejected', '--file', log.path!], directory, () => {}), 0);
    usage.route({ model: 'gpt-6.1-sol', reason: 'classifier_circuit_open' });
    usage.finish(); log.write(usage.snapshot()); log.close();
    let output = '';
    assert.equal(runUsageReport(['--file', log.path!, '--decisions'], directory, text => { output += text; }), 0);
    const report = JSON.parse(output);
    assert.equal(report.recordedDecisionCount, 2); assert.equal(report.expectedDecisionCount, 2);
    assert.equal(report.coverage, 'recorded-decisions-only'); assert.equal(report.perDecisionUsage, null);
    assert.equal(report.decisions[1].reason, 'classifier_circuit_open');
    assert.deepEqual(report.outcomes.map((o: any) => o.result), ['accepted', 'rejected']);
    assert.ok(!output.includes('threadId'));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

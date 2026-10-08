import { isPrivatePathSync } from '../src/private-files.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, statSync, existsSync, utimesSync, symlinkSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createSessionUsage } from '../src/session-usage.ts';
import { createUsageLog, runLogCleanup } from '../src/usage-log.ts';
import { readLatestOutcome, runOutcomeCommand } from '../src/outcome.ts';
import { createUsageReport, runUsageReport } from '../src/usage-report.ts';

test('decision IDs are independent of native identifiers; snapshots and exported provenance are isolated', () => {
  const usage = createSessionUsage();
  usage.route({ model: 'gpt-6-luna', proposed: 'FAST', reason: 'experimental_route', reportedConfidence: .9,
    threadId: 'PRIVATE_THREAD', decisionId: 'PRIVATE_ID', policyVersion: '1', policyHash: 'a'.repeat(64),
    classifierVersion: 'jev-latest:rubric-2026-10-01' });
  const one = usage.snapshot();
  const id = one.latestRoute!.decisionId;
  one.latestRoute!.model = 'PRIVATE_MODEL';
  assert.equal(usage.snapshot().latestRoute!.model, 'gpt-6-luna');
  assert.ok(!JSON.stringify(usage.snapshot()).includes('PRIVATE'));
  usage.route({ model: 'gpt-6.1-sol', reason: 'observe' });
  assert.notEqual(usage.snapshot().latestRoute!.decisionId, id);
  assert.equal(usage.snapshot().decisionCount, 2);
  const report = createUsageReport(usage.snapshot());
  assert.equal(report.routing.policyHash, null);
  assert.equal(report.outcomes.taskSuccessRate, null);
});

test('outcomes correlate to the latest decision, corrections append, and export never invents aggregate quality', () => {
  const directory = mkdtempSync(join(tmpdir(), 'router-outcome-'));
  try {
    const usage = createSessionUsage(), log = createUsageLog(directory);
    usage.route({ model: 'gpt-6-luna', reason: 'pinned' }); log.write(usage.snapshot());
    const id = usage.snapshot().latestRoute!.decisionId;
    const args = ['--file', log.path!, '--decision', id, '--result', 'accepted', '--review-minutes', '2.5'];
    assert.equal(runOutcomeCommand(args, directory, () => {}, () => {}), 0);
    assert.equal(readLatestOutcome(log.path!, id)!.reviewMinutes, 2.5);
    assert.equal(isPrivatePathSync(`${log.path}.outcomes.jsonl`), true);
    assert.equal(runOutcomeCommand(['--file', log.path!, '--result', 'rejected'], directory, () => {}, () => {}), 0);
    let output = '';
    assert.equal(runUsageReport(['--file', log.path!, '--format', 'json'], directory, s => { output += s; }), 0);
    const report = JSON.parse(output);
    assert.equal(report.outcomes.latestUserReportedOutcome.result, 'rejected');
    assert.equal(report.outcomes.acceptedTasks, null);
    usage.route({ model: 'gpt-6.1-sol', reason: 'pinned' }); log.write(usage.snapshot()); log.close();
    assert.equal(runOutcomeCommand(args, directory, () => {}, () => {}), 1);
    assert.equal(readLatestOutcome(log.path!, usage.snapshot().latestRoute!.decisionId), null);
    assert.equal(readFileSync(`${log.path}.outcomes.jsonl`, 'utf8').trim().split('\n').length, 2);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('outcome writer rejects unsafe options and symlink destinations without modifying targets', () => {
  const directory = mkdtempSync(join(tmpdir(), 'router-outcome-'));
  try {
    const usage = createSessionUsage(), log = createUsageLog(directory);
    usage.route({ model: 'gpt-6.1-sol', reason: 'pinned' }); log.write(usage.snapshot()); log.close();
    for (const args of [['--result', 'PRIVATE'], ['--result', 'accepted', '--review-minutes', '-1'],
      ['--result', 'accepted', '--result', 'rejected'], ['--result', 'accepted', '--review-minutes', 'Infinity']]) {
      let error = '';
      assert.equal(runOutcomeCommand(args, directory, () => {}, s => { error += s; }), 1);
      assert.ok(!error.includes('PRIVATE'));
    }
    const target = join(directory, 'target'); writeFileSync(target, 'untouched', { mode: 0o600 });
    symlinkSync(target, `${log.path}.outcomes.jsonl`, 'file');
    assert.equal(runOutcomeCommand(['--file', log.path!, '--result', 'accepted'], directory, () => {}, () => {}), 1);
    assert.equal(readFileSync(target, 'utf8'), 'untouched');
    if (process.platform !== 'win32') {
      chmodSync(log.path!, 0o644);
      assert.equal(runOutcomeCommand(['--file', log.path!, '--result', 'accepted'], directory, () => {}, () => {}), 1);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('cleanup previews and deletes only expired completed regular logs and their outcomes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'router-retention-'));
  try {
    const completed = createUsageLog(directory), active = createUsageLog(directory), recent = createUsageLog(directory);
    const usage = createSessionUsage(); active.write(usage.snapshot()); active.close();
    usage.route({ model: 'gpt-6.1-sol', reason: 'pinned' }); usage.finish();
    completed.write(usage.snapshot()); completed.close(); recent.write(usage.snapshot()); recent.close();
    runOutcomeCommand(['--file', completed.path!, '--result', 'accepted'], directory, () => {}, () => {});
    const old = new Date(Date.now() - 40 * 86400000);
    utimesSync(completed.path!, old, old); utimesSync(active.path!, old, old);
    const linked = join(directory, '1-aaaaaaaa.jsonl'); symlinkSync(completed.path!, linked);
    assert.equal(runLogCleanup(['--older-than-days', '30'], directory, () => {}), 0);
    assert.equal(existsSync(completed.path!), true);
    assert.equal(runLogCleanup(['--older-than-days', '30', '--apply'], directory, () => {}), 0);
    assert.equal(existsSync(completed.path!), false);
    assert.equal(existsSync(`${completed.path}.outcomes.jsonl`), false);
    assert.equal(existsSync(active.path!), true); assert.equal(existsSync(recent.path!), true);
    assert.equal(runLogCleanup(['--older-than-days', '0', '--apply'], directory, () => {}), 1);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('thread deletion marks active usage incomplete and does not reuse historical cumulative baseline', () => {
  const u = createSessionUsage();
  u.client({ id: 1, method: 'thread/start' });
  u.server({ id: 1, result: { thread: { id: 't' }, model: 'gpt-6-luna' } });
  u.client({ id: 2, method: 'turn/start', params: { threadId: 't', model: 'gpt-6-luna' } });
  u.server({ method: 'thread/deleted', params: { threadId: 't' } });
  assert.equal(u.snapshot().partial, true);
  u.finish(); assert.equal(u.snapshot().tokens.input, 0);
});

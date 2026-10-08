import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, appendFileSync, statSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionUsage, formatSessionUsage } from '../src/session-usage.ts';
import { createUsageLog, readUsageTail } from '../src/usage-log.ts';

const counts = (input = 100, output = 20, cached = 10, write = 5, reasoning = 8) => ({
  inputTokens: input, outputTokens: output, cachedInputTokens: cached, cacheWriteInputTokens: write,
  reasoningOutputTokens: reasoning, totalTokens: input + output,
});
function start(u: ReturnType<typeof createSessionUsage>, kind = 'start', model = 'gpt-6-luna') {
  u.client({ id: 1, method: `thread/${kind}`, params: {} });
  u.server({ id: 1, result: { thread: { id: 'thread' }, model } });
}
function usage(u: ReturnType<typeof createSessionUsage>, total = counts(), last = total) {
  u.server({ method: 'thread/tokenUsage/updated', params: { threadId: 'thread', turnId: 'turn', tokenUsage: { total, last } } });
}
function turn(u: ReturnType<typeof createSessionUsage>, model = 'gpt-6-luna') {
  u.client({ id: 2, method: 'turn/start', params: { threadId: 'thread', model, input: [{ type: 'text', text: 'SECRET_TASK' }] } });
  u.server({ method: 'turn/started', params: { threadId: 'thread', turn: { id: 'turn' } } });
}

test('cumulative usage deduplicates events and accounts cache writes and reasoning without double counting', () => {
  const u = createSessionUsage(); start(u); turn(u); usage(u); usage(u);
  const s = u.snapshot();
  assert.equal(s.tokens.input, 100); assert.equal(s.tokens.output, 20); assert.equal(s.tokens.reasoning, 8);
  assert.ok(Math.abs(s.apiEquivalentUsd - (85 * .1 + 10 * .01 + 5 * .125 + 20 * .5) / 1e6) < 1e-12);
  assert.equal(s.tokenSavings, null); assert.equal(s.subscriptionMoneySaved, null);
});

test('per-turn model changes produce separate totals and Astra can increase estimated cost', () => {
  const u = createSessionUsage(); start(u); turn(u); usage(u);
  turn(u, 'gpt-6-astra'); usage(u, counts(200, 40, 20, 10, 16));
  const s = u.snapshot();
  assert.equal(s.byModel['gpt-6-luna'].input, 100); assert.equal(s.byModel['gpt-6-astra'].input, 100);
  assert.ok(s.estimatedDifferenceUsd! < 0);
  assert.match(formatSessionUsage(s), /higher vs Sol/);
});

test('resumed history is excluded when baseline arrives before a new turn', () => {
  const u = createSessionUsage(); start(u, 'resume'); usage(u, counts(10000, 2000, 1000, 500, 800));
  turn(u); usage(u, counts(10100, 2020, 1010, 505, 808));
  assert.equal(u.snapshot().tokens.input, 100); assert.equal(u.snapshot().partial, false);
});

test('resume without baseline counts only last new request and marks comparison incomplete', () => {
  const u = createSessionUsage(); start(u, 'resume'); turn(u);
  usage(u, counts(10100, 2020, 1010, 505, 808), counts());
  assert.equal(u.snapshot().tokens.input, 100); assert.equal(u.snapshot().estimatedDifferenceUsd, null);
});

test('counter resets, invalid snapshots and backend rerouting never manufacture savings', () => {
  const u = createSessionUsage(); start(u); turn(u); usage(u);
  usage(u, counts(50, 10, 5, 2, 4));
  assert.equal(u.snapshot().tokens.input, 100);
  u.server({ method: 'model/rerouted', params: { threadId: 'thread', toModel: 'unknown' } });
  usage(u, counts(150, 30, 15, 7, 12));
  usage(u, counts(1, 1, 20));
  assert.equal(u.snapshot().byModel.unattributed.input, 100);
  assert.equal(u.snapshot().estimatedDifferenceUsd, null);
  assert.match(formatSessionUsage(u.snapshot()), /Partial coverage/);
  assert.match(formatSessionUsage(u.snapshot()), /covered only/);
});

test('native steering preserves attribution when it omits a model', () => {
  const u = createSessionUsage(); start(u); turn(u);
  u.client({ id: 3, method: 'turn/start', params: { threadId: 'thread', input: [{ type: 'text', text: 'steering' }] } });
  usage(u);
  assert.equal(u.snapshot().byModel['gpt-6-luna'].input, 100);
  assert.equal(u.snapshot().partial, false);
});

test('classifier usage counts canceled requests and failed or pending usage remains unknown', () => {
  const u = createSessionUsage(); const call = u.classificationStarted();
  assert.equal(u.snapshot().estimatedDifferenceUsd, null);
  u.classificationFinished(call, { inputTokens: 1000, outputTokens: 40 });
  u.classificationFinished(call, { inputTokens: 1000, outputTokens: 40 });
  assert.equal(u.snapshot().jev.inputTokens, 1000);
  assert.equal(u.snapshot().jev.estimatedUsd, .000042);
  assert.equal(u.snapshot().estimatedDifferenceUsd, -.000042);
  u.classificationFinished(u.classificationStarted());
  assert.equal(u.snapshot().jev.unknownCalls, 1);
  assert.equal(u.snapshot().estimatedDifferenceUsd, null);
  assert.match(formatSessionUsage(u.snapshot()), /1 call with unknown usage/);
  assert.match(formatSessionUsage(u.snapshot()), /Partial coverage/);
});

test('compaction completion is deduplicated and snapshots exclude supplied content', () => {
  const u = createSessionUsage(); start(u); turn(u);
  const event = { method: 'item/completed', params: { threadId: 'thread', item: { type: 'contextCompaction', id: 'c', text: 'SECRET_RESPONSE' } } };
  u.server(event); u.server(event);
  u.route({ model: 'gpt-6-luna', proposed: 'FAST', reportedConfidence: .99, reason: 'experimental_route', input: 'SECRET_TASK' });
  u.finish();
  assert.equal(u.snapshot().compactions, 1);
  assert.ok(!JSON.stringify(u.snapshot()).includes('SECRET'));
  assert.equal(u.snapshot().partial, true);
});

test('private usage logs preserve final summary and ignore incomplete writes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'usage-test-'));
  try {
    const log = createUsageLog(directory); const u = createSessionUsage(); start(u); usage(u);
    log.write(u.snapshot()); u.finish(); log.write(u.snapshot()); log.close();
    assert.equal(statSync(log.path!).mode & 0o777, 0o600);
    assert.equal(readUsageTail(log.path!)!.ended, true);
    appendFileSync(log.path!, '{"incomplete":');
    assert.equal(readUsageTail(log.path!)!.tokens.input, 100);
    assert.ok(!readFileSync(log.path!, 'utf8').includes('SECRET'));
    symlinkSync(directory, join(directory, 'symlink'));
    assert.equal(createUsageLog(join(directory, 'symlink')).failed, true);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

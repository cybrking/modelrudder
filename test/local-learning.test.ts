import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalLearning } from '../src/local-learning.ts';
import { createSessionUsage } from '../src/session-usage.ts';
import { createTurnRelay } from '../src/turn-relay.ts';
import { isPrivatePathSync, protectPrivatePathSync } from '../src/private-files.ts';

test('local capture is opt-in, private, separate from usage metadata, and never overwrites', async () => {
  const folder = mkdtempSync(join(tmpdir(), 'rudder-learning-'));
  protectPrivatePathSync(folder, true);
  try {
    const usage = createSessionUsage();
    const disabled = createLocalLearning();
    const capture = createLocalLearning(folder);
    const upstream: unknown[] = [];
    const relay = createTurnRelay({ mode: 'pinned', model: 'gpt-6.1-sol',
      upstream: m => upstream.push(m), downstream() {},
      onRoute(metadata, task) {
        usage.route(metadata);
        disabled.write(task, usage.snapshot().latestRoute);
        capture.write(task, usage.snapshot().latestRoute);
      } });
    await relay.client({ id: 1, method: 'thread/start', params: {} });
    relay.server({ id: 1, result: { thread: { id: 'PRIVATE_THREAD' } } });
    await relay.client({ id: 2, method: 'turn/start', params: { threadId: 'PRIVATE_THREAD',
      input: [{ type: 'text', text: 'PRIVATE_TASK_TEXT' }] } });
    assert.equal(disabled.saved, 0);
    assert.equal(capture.saved, 1);
    assert.equal(upstream.length, 2);
    const path = join(folder, readdirSync(folder)[0]);
    const raw = readFileSync(path, 'utf8'), row = JSON.parse(raw);
    assert.equal(row.task, 'PRIVATE_TASK_TEXT');
    assert.equal(row.id, usage.snapshot().latestRoute!.decisionId);
    assert.equal(row.opaqueContext, false);
    assert.ok(!raw.includes('PRIVATE_THREAD'));
    assert.ok(!JSON.stringify(usage.snapshot()).includes('PRIVATE_TASK_TEXT'));
    assert.ok(isPrivatePathSync(path));
    capture.write({ task: 'replacement', previousUserTasks: [], opaqueContext: false }, usage.snapshot().latestRoute);
    assert.equal(capture.failed, true);
    assert.equal(readFileSync(path, 'utf8'), raw);
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('unsafe capture directory fails without throwing or touching its destination', () => {
  const folder = mkdtempSync(join(tmpdir(), 'rudder-learning-'));
  try {
    const target = join(folder, 'target'); writeFileSync(target, 'unchanged');
    const link = join(folder, 'link'); symlinkSync(target, link);
    const capture = createLocalLearning(link);
    const usage = createSessionUsage(); usage.route({ model: 'gpt-6.1-sol', reason: 'pinned' });
    capture.write({ task: 'task', previousUserTasks: [], opaqueContext: false }, usage.snapshot().latestRoute);
    assert.equal(capture.failed, true);
    assert.equal(capture.saved, 0);
    assert.equal(readFileSync(target, 'utf8'), 'unchanged');
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

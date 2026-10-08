import test from 'node:test';
import assert from 'node:assert/strict';
import { createClassifierLifecycle } from '../src/classifier-lifecycle.ts';
import { ClassificationError, withDeadline } from '../src/classifier-contract.ts';
import { recommendRoute } from '../src/routing-decision.ts';
import { defaultPolicy, routes } from '../src/config.ts';

const decision = { profile: 'FAST', confidence: null, reportedConfidence: .99 };
test('circuit skips repeated outages, allows one recovery probe and resumes after success', async () => {
  let now = 0, calls = 0, recover = false;
  let finish!: (v: unknown) => void;
  const classifier = createClassifierLifecycle(async () => {
    calls++; if (!recover) throw new Error('PRIVATE');
    return new Promise(r => { finish = r; });
  }, 100, { now: () => now });
  for (let i = 0; i < 3; i++) await assert.rejects(classifier({ input: 'task' }));
  await assert.rejects(classifier({ input: 'task' }), { code: 'circuit_open' }); assert.equal(calls, 3);
  now = 30_000; recover = true;
  const probe = classifier({ input: 'task' });
  await assert.rejects(classifier({ input: 'task' }), { code: 'circuit_open' }); assert.equal(calls, 4);
  finish(decision); await probe;
  const next = classifier({ input: 'task' }); finish(decision); await next; assert.equal(calls, 5);
});

test('cancellation reaches a stalled transport and does not trip the circuit', async () => {
  let seen: AbortSignal | undefined;
  const classifier = createClassifierLifecycle(async (_r, signal) => { seen = signal; return new Promise(() => {}); }, 100);
  for (let i = 0; i < 4; i++) {
    const controller = new AbortController();
    const pending = classifier({ input: 'task' }, controller.signal);
    controller.abort(); await assert.rejects(pending); assert.equal(seen?.aborted, true);
  }
  const controller = new AbortController(); controller.abort();
  let called = false;
  await assert.rejects(withDeadline(100, async () => { called = true; }, controller.signal));
  assert.equal(called, false);
});

test('invalid access opens cooldown immediately; calibrated and experimental scores stay separate', async () => {
  let calls = 0;
  const classifier = createClassifierLifecycle(async () => { calls++; throw new ClassificationError('access_denied'); }, 100);
  await assert.rejects(classifier({ input: 'task' }), { code: 'access_denied' });
  await assert.rejects(classifier({ input: 'task' }), { code: 'circuit_open' }); assert.equal(calls, 1);
  assert.equal(recommendRoute(decision as any, defaultPolicy, routes, 'calibrated').recommendation.profile, 'DEEP');
  assert.equal(recommendRoute(decision as any, defaultPolicy, routes, 'reported').recommendation.profile, 'FAST');
});

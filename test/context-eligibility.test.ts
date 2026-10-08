import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnRelay, type RpcMessage } from '../src/turn-relay.ts';
import { createRuntimePolicy } from '../src/runtime-policy.ts';
import { createSessionUsage } from '../src/session-usage.ts';
import { createUsageReport } from '../src/usage-report.ts';

const confident = { profile: 'FAST', confidence: null, reportedConfidence: .99 };
const task = (id: number, extra: RpcMessage[] = [], threadId = 'thread') => ({ id, method: 'turn/start',
  params: { threadId, input: [{ type: 'text', text: 'PRIVATE_TASK' }, ...extra],
    approvalPolicy: 'onRequest', sandboxPolicy: { type: 'workspaceWrite' },
    collaborationMode: { mode: 'plan', settings: { model: 'gpt-6-luna', reasoning_effort: 'low',
      developer_instructions: 'PRIVATE_INSTRUCTIONS' } }, futureField: 'native' } });

function setup(options: { fresh?: boolean; mode?: 'auto' | 'observe' | 'pinned'; classifier?: (input: { input: string }) => Promise<unknown> } = {}) {
  const upstream: RpcMessage[] = [], downstream: RpcMessage[] = [], routes: RpcMessage[] = [], inputs: string[] = [];
  const runtimePolicy = createRuntimePolicy({ mode: options.mode ?? 'auto',
    model: options.mode === 'pinned' ? 'gpt-6-astra' : 'gpt-6.1-sol' });
  const relay = createTurnRelay({ mode: runtimePolicy.mode, model: runtimePolicy.model, runtimePolicy,
    classifier: input => { inputs.push(input.input); return options.classifier?.(input) ?? Promise.resolve(confident); },
    upstream: message => upstream.push(message), downstream: message => downstream.push(message),
    onRoute: route => routes.push(route) });
  let nextOrigin = 100;
  const fresh = (threadId = 'thread') => {
    const id = nextOrigin++;
    void relay.client({ id, method: 'thread/start', params: {} });
    relay.server({ id, result: { thread: { id: threadId } } });
  };
  const complete = (threadId = 'thread') => relay.server({ method: 'turn/completed', params: { threadId } });
  if (options.fresh !== false) { fresh(); upstream.length = 0; downstream.length = 0; }
  return { relay, upstream, downstream, routes, inputs, fresh, complete };
}

test('native references and media bypass high-confidence classification and remain opaque on later text turns', async () => {
  const inputs = [
    { type: 'skill', name: 'PRIVATE_SKILL', path: '/PRIVATE/skill.md' },
    { type: 'mention', name: 'PRIVATE_MENTION', path: '/PRIVATE/reference.md' },
    { type: 'futureInput', opaque: ['PRIVATE_DATA'] },
    { type: 'image', url: 'PRIVATE_URL' }, { type: 'localImage', path: '/PRIVATE/image.png' },
    { type: 'audio', url: 'PRIVATE_AUDIO' }, { type: 'localAudio', path: '/PRIVATE/audio.wav' },
  ];
  for (const mode of ['auto', 'observe'] as const) for (const input of inputs) {
    const h = setup({ mode }); const message = task(1, [input]);
    await h.relay.client(message);
    const actual = h.upstream[0];
    assert.equal(actual.params.model, 'gpt-6.1-sol'); assert.equal(actual.params.effort, 'medium');
    assert.deepEqual(actual.params.input, message.params.input);
    assert.equal(actual.params.approvalPolicy, message.params.approvalPolicy);
    assert.deepEqual(actual.params.sandboxPolicy, message.params.sandboxPolicy);
    assert.equal(actual.params.futureField, 'native');
    assert.equal(actual.params.collaborationMode.settings.reasoning_effort, 'medium');
    assert.equal(actual.params.collaborationMode.settings.developer_instructions, 'PRIVATE_INSTRUCTIONS');
    assert.equal(h.routes[0].reason, ['skill', 'mention', 'futureInput'].includes(input.type)
      ? 'reference_context_baseline' : 'media_baseline');
    h.complete(); h.relay.server({ method: 'item/completed', params: { threadId: 'thread', item: { type: 'contextCompaction' } } });
    await h.relay.client(task(2));
    assert.equal(h.upstream.at(-1)!.params.model, 'gpt-6.1-sol');
    assert.equal(h.inputs.length, 0); assert.equal(h.routes[1].proposed, null);
    assert.ok(!JSON.stringify(h.routes).includes('PRIVATE')); h.relay.close();
  }
});

test('unobserved origin fails closed but successful fresh creation enables ordinary classification', async () => {
  const h = setup({ fresh: false });
  await h.relay.client(task(1));
  assert.equal(h.routes[0].reason, 'unclassified_context_baseline'); assert.equal(h.inputs.length, 0);
  h.complete(); h.fresh(); await h.relay.client(task(2));
  assert.equal(h.upstream.at(-1)!.params.model, 'gpt-6-luna');
  assert.equal(h.upstream.at(-1)!.params.effort, 'low'); assert.equal(h.inputs.length, 1); h.relay.close();
});

test('successful resume/fork preserve opaque history, while failed requests cannot clear reference context', async () => {
  for (const method of ['thread/resume', 'thread/fork']) {
    const h = setup();
    await h.relay.client({ id: 20, method, params: { threadId: 'thread' } });
    h.relay.server({ id: 20, result: { thread: { id: 'thread' } } });
    await h.relay.client(task(1));
    assert.equal(h.routes[0].reason, 'unclassified_context_baseline'); assert.equal(h.inputs.length, 0);
    h.complete(); h.fresh(); await h.relay.client(task(2));
    assert.equal(h.inputs.length, 1); h.relay.close();
  }
  for (const method of ['thread/start', 'thread/resume']) {
    const h = setup(); await h.relay.client(task(1, [{ type: 'skill', name: 'skill', path: '/PRIVATE/skill' }]));
    h.complete(); await h.relay.client({ id: 20, method, params: { threadId: 'thread' } });
    h.relay.server({ id: 20, error: { code: -1, message: 'failed' }, result: { thread: { id: 'thread' } } });
    await h.relay.client(task(2));
    assert.equal(h.routes.at(-1)!.reason, 'reference_context_baseline'); assert.equal(h.inputs.length, 0); h.relay.close();
  }
});

test('fresh start resets prior excerpts only after success and failed resume preserves visible context', async () => {
  const h = setup(); await h.relay.client(task(1)); h.complete();
  await h.relay.client({ id: 20, method: 'thread/resume', params: { threadId: 'thread' } });
  h.relay.server({ id: 20, error: { code: -1 } });
  await h.relay.client(task(2));
  assert.deepEqual(JSON.parse(h.inputs[1]).previousUserTasks, ['PRIVATE_TASK']); h.complete();
  h.fresh(); await h.relay.client(task(3));
  assert.deepEqual(JSON.parse(h.inputs[2]).previousUserTasks, []); h.relay.close();
});

test('pending resumes block same-thread routing, including outstanding classifications', async () => {
  const h = setup();
  await h.relay.client({ id: 20, method: 'thread/resume', params: { threadId: 'thread' } });
  await h.relay.client(task(1));
  assert.equal(h.routes[0].reason, 'unclassified_context_baseline'); assert.equal(h.inputs.length, 0);
  h.complete(); h.relay.server({ id: 20, error: { code: -1 } }); await h.relay.client(task(2));
  assert.equal(h.inputs.length, 1); h.relay.close();
  let finish!: (value: unknown) => void;
  const race = setup({ classifier: () => new Promise(resolve => { finish = resolve; }) });
  const turn = race.relay.client(task(1));
  await race.relay.client({ id: 20, method: 'thread/resume', params: { threadId: 'thread' } });
  race.relay.server({ id: 20, result: { thread: { id: 'thread' } } }); finish(confident); await turn;
  assert.equal(race.routes[0].reason, 'unclassified_context_baseline');
  assert.equal(race.upstream.at(-1)!.params.model, 'gpt-6.1-sol');
  assert.equal(race.upstream.at(-1)!.params.effort, 'medium'); race.relay.close();
});

test('multiple pending resumes remain blocked until every response is settled', async () => {
  const h = setup();
  for (const id of [20, 21]) await h.relay.client({ id, method: 'thread/resume', params: { threadId: 'thread' } });
  h.relay.server({ id: 20, error: { code: -1 } }); await h.relay.client(task(1));
  assert.equal(h.inputs.length, 0); h.complete();
  h.relay.server({ id: 21, error: { code: -1 } }); await h.relay.client(task(2));
  assert.equal(h.inputs.length, 1); h.relay.close();
});

test('references supplied through active start steering or explicit steer affect future turns without replay', async () => {
  for (const method of ['turn/start', 'turn/steer']) {
    const h = setup(); await h.relay.client(task(1));
    const steering = { ...task(2, [{ type: 'mention', name: 'PRIVATE', path: '/PRIVATE/reference' }]), method };
    await h.relay.client(steering);
    assert.equal(h.upstream.at(-1), steering);
    assert.equal(h.upstream[0].params.model, 'gpt-6-luna'); assert.equal(h.routes.length, 1);
    h.complete(); await h.relay.client(task(3));
    assert.equal(h.routes[1].reason, 'reference_context_baseline');
    assert.equal(h.inputs.length, 1); assert.equal(h.upstream.at(-1)!.params.model, 'gpt-6.1-sol'); h.relay.close();
  }
});

test('a reference arriving during classification cannot authorize a late downgrade', async () => {
  let finish!: (value: unknown) => void;
  const h = setup({ classifier: () => new Promise(resolve => { finish = resolve; }) });
  const first = h.relay.client(task(1));
  await h.relay.client({ ...task(2, [{ type: 'skill', name: 'skill', path: '/PRIVATE/skill' }]), method: 'turn/steer' });
  finish(confident); await first;
  assert.equal(h.routes.length, 1); assert.equal(h.routes[0].reason, 'reference_context_baseline');
  assert.equal(h.upstream.at(-1)!.params.model, 'gpt-6.1-sol'); h.relay.close();
});

test('closed histories and stale origin replies cannot restore eligibility, and reused IDs require a new start', async () => {
  for (const method of ['thread/closed', 'thread/deleted']) {
    const h = setup();
    await h.relay.client({ id: 20, method: 'thread/start', params: {} });
    h.relay.server({ method, params: { threadId: 'thread' } });
    h.relay.server({ id: 20, result: { thread: { id: 'thread' } } });
    await h.relay.client(task(1));
    assert.equal(h.routes[0].reason, 'unclassified_context_baseline'); assert.equal(h.inputs.length, 0);
    h.complete(); h.fresh(); await h.relay.client(task(2)); assert.equal(h.inputs.length, 1); h.relay.close();
  }
});

test('explicit pins and native helper threads bypass classification without altering input', async () => {
  const pinned = setup({ fresh: false, mode: 'pinned' });
  await pinned.relay.client(task(1, [{ type: 'skill', name: 'skill', path: '/PRIVATE/skill' }]));
  assert.equal(pinned.upstream[0].params.model, 'gpt-6-astra'); assert.equal(pinned.upstream[0].params.effort, 'medium');
  assert.equal(pinned.routes[0].reason, 'pinned'); assert.equal(pinned.inputs.length, 0); pinned.relay.close();
  const h = setup(); await h.relay.client({ id: 20, method: 'thread/start', params: { ephemeral: true } });
  h.relay.server({ id: 20, result: { thread: { id: 'helper' } } });
  const helper = task(1, [{ type: 'mention', name: 'PRIVATE', path: '/PRIVATE' }], 'helper');
  await h.relay.client(helper); assert.equal(h.upstream.at(-1), helper);
  assert.equal(h.inputs.length, 0); assert.equal(h.routes.length, 0); h.relay.close();
});

test('bounded context reasons and policy version survive accounting/reporting without reference content', async () => {
  for (const fresh of [false, true]) {
    const h = setup({ fresh });
    await h.relay.client(task(1, fresh ? [{ type: 'skill', name: 'PRIVATE', path: '/PRIVATE' }] : []));
    const usage = createSessionUsage(); usage.route(h.routes[0]);
    const snapshot = usage.snapshot(); const report = createUsageReport(snapshot);
    assert.equal(report.routing.reason, fresh ? 'reference_context_baseline' : 'unclassified_context_baseline');
    assert.equal(report.routing.effortReason, report.routing.reason); assert.equal(report.routing.policyVersion, '4');
    assert.equal(report.routing.latestRequestedEffort, 'medium'); assert.equal(report.routing.proposedProfile, null);
    assert.equal(report.classifier.calls, 0); assert.ok(!JSON.stringify(snapshot).includes('PRIVATE'));
    assert.ok(!JSON.stringify(report).includes('PRIVATE'));
    for (const version of ['1', '2', '3', '4']) {
      snapshot.latestRoute!.policyVersion = version; assert.equal(createUsageReport(snapshot).routing.policyVersion, version);
    }
    snapshot.latestRoute!.policyVersion = 'PRIVATE'; assert.equal(createUsageReport(snapshot).routing.policyVersion, null);
    usage.route({ ...h.routes[0], reason: 'PRIVATE_REASON', effortReason: 'PRIVATE_REASON' });
    assert.equal(usage.snapshot().latestRoute!.reason, 'unknown');
    assert.ok(!JSON.stringify(usage.snapshot()).includes('PRIVATE'));
    h.relay.close();
  }
});

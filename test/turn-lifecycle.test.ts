import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnRelay, type RpcMessage } from '../src/turn-relay.ts';
import { createRuntimePolicy } from '../src/runtime-policy.ts';

const decision = { profile: 'FAST', confidence: .99 };
const request = (id: number, text = 'Read source') => ({ id, method: 'turn/start', params: {
  threadId: 'thread', input: [{ type: 'text', text }],
} });
function setup(extra: Record<string, any> = {}) {
  const upstream: RpcMessage[] = [], downstream: RpcMessage[] = [], routes: Record<string, unknown>[] = [];
  const relay = createTurnRelay({ mode: 'auto', model: 'gpt-6.1-sol', classifier: async () => decision,
    upstream: message => upstream.push(message), downstream: message => downstream.push(message),
    onRoute: route => routes.push(route), ...extra });
  void relay.client({ id: 'bootstrap', method: 'thread/start', params: {} });
  relay.server({ id: 'bootstrap', result: { thread: { id: 'thread' } } });
  upstream.length = 0; downstream.length = 0;
  return { relay, upstream, downstream, routes };
}

test('close and delete notifications cancel routing exactly once, with no late execution', async () => {
  for (const method of ['thread/closed', 'thread/deleted']) {
    let finish!: (value: unknown) => void;
    const h = setup({ classifier: () => new Promise(resolve => { finish = resolve; }) });
    const pending = h.relay.client(request(1));
    const event = { method, params: { threadId: 'thread' } };
    h.relay.server(event); h.relay.server(event);
    await pending;
    assert.deepEqual(h.downstream.filter(message => message.id === 1), [
      { id: 1, error: { code: -32800, message: 'Routing canceled before turn started' } },
    ]);
    finish(decision); await Promise.resolve();
    assert.equal(h.upstream.length, 0);
    assert.equal(h.routes.length, 0);
    h.relay.close();
  }
});

test('interrupted classifier cannot remove or execute a newer pending turn', async () => {
  const finishes: ((value: unknown) => void)[] = [];
  const inputs: string[] = [];
  const h = setup({ classifier: ({ input }: { input: string }) => {
    inputs.push(input); return new Promise(resolve => finishes.push(resolve));
  } });
  const old = h.relay.client(request(1, 'Canceled task'));
  await h.relay.client({ id: 2, method: 'turn/interrupt', params: { threadId: 'thread' } });
  await old;
  const current = h.relay.client(request(3, 'Current task'));
  finishes[0](decision); await Promise.resolve();
  await h.relay.client(request(4));
  assert.equal(h.downstream.at(-1)?.error.code, -32001);
  finishes[1](decision); await current;
  assert.deepEqual(h.upstream.map(message => message.id), [3]);
  assert.equal(h.routes.length, 1);
  assert.deepEqual(JSON.parse(inputs[1]).previousUserTasks, []);
  h.relay.close();
});

test('reused thread IDs discard old context, pending state, and stale start responses', async () => {
  const inputs: string[] = [];
  const h = setup({ classifier: async ({ input }: { input: string }) => { inputs.push(input); return decision; } });
  await h.relay.client(request(1, 'Old task'));
  h.relay.server({ method: 'thread/deleted', params: { threadId: 'thread' } });
  await h.relay.client({ id: 'new-origin', method: 'thread/start', params: {} });
  h.relay.server({ id: 'new-origin', result: { thread: { id: 'thread' } } });
  h.upstream.pop(); h.downstream.pop();
  await h.relay.client(request(2, 'New task'));
  h.relay.server({ id: 1, error: { code: -1, message: 'Old failure' } });
  const steering = request(3); await h.relay.client(steering);
  assert.equal(h.upstream.at(-1), steering);
  assert.equal(h.routes.length, 2);
  assert.deepEqual(JSON.parse(inputs[1]).previousUserTasks, []);
  h.relay.close();
});

test('late completion cannot release a newer active turn, including before its start response', async () => {
  const h = setup();
  await h.relay.client(request(1));
  h.relay.server({ method: 'turn/started', params: { threadId: 'thread', turn: { id: 'old' } } });
  h.relay.server({ method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'old' } } });
  await h.relay.client(request(2));
  h.relay.server({ method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'old' } } });
  const firstSteering = request(3); await h.relay.client(firstSteering);
  assert.equal(h.upstream.at(-1), firstSteering);
  h.relay.server({ id: 2, result: { turn: { id: 'current' } } });
  h.relay.server({ method: 'turn/started', params: { threadId: 'thread', turn: { id: 'old' } } });
  h.relay.server({ method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'old' } } });
  const nextSteering = request(4); await h.relay.client(nextSteering);
  assert.equal(h.upstream.at(-1), nextSteering);
  assert.equal(h.routes.length, 2);
  h.relay.server({ method: 'turn/completed', params: { threadId: 'thread', turn: { id: 'current' } } });
  await h.relay.client(request(5));
  assert.equal(h.routes.length, 3);
  h.relay.close();
});

test('disconnect settles a hung classifier and ignores all later messages', async () => {
  const h = setup({ classifier: () => new Promise(() => {}) });
  const pending = h.relay.client(request(1));
  h.relay.close(); h.relay.close();
  await pending;
  h.relay.server({ method: 'turn/started', params: { threadId: 'thread' } });
  await h.relay.client(request(2));
  assert.deepEqual(h.upstream, []); assert.deepEqual(h.downstream, []); assert.deepEqual(h.routes, []);
});

test('classifier deadline executes fallback once and late completion cannot replay the request', async () => {
  let finish!: (value: unknown) => void;
  const h = setup({ runtimePolicy: createRuntimePolicy({ mode: 'auto', model: 'gpt-6.1-sol', classificationTimeoutMs: 5 }),
    classifier: () => new Promise(resolve => { finish = resolve; }) });
  await h.relay.client(request(1));
  assert.equal(h.upstream.length, 1);
  assert.equal(h.upstream[0].params.model, 'gpt-6.1-sol');
  assert.equal(h.routes[0].reason, 'classifier_failed');
  finish(decision); await Promise.resolve();
  assert.equal(h.upstream.length, 1); assert.equal(h.routes.length, 1);
  h.relay.close();
});

test('malformed inspected fields pass untouched to Codex without leaking partial input to classifier', async () => {
  let calls = 0;
  const h = setup({ classifier: async () => { calls++; return decision; } });
  for (const input of [[null], [42], [['text']], [{ type: 'text', text: 12 }], [{ text: 'private' }]]) {
    const message = { ...request(1), params: { ...request(1).params, input } };
    await h.relay.client(message);
    assert.equal(h.upstream.at(-1), message);
  }
  for (const collaborationMode of [true, [], { settings: 'invalid' }, { settings: [] }]) {
    const message = { ...request(1), params: { ...request(1).params, collaborationMode } };
    await h.relay.client(message);
    assert.equal(h.upstream.at(-1), message);
  }
  await h.relay.client(null as any); h.relay.server(null as any);
  assert.equal(calls, 0); assert.equal(h.routes.length, 0);
  h.relay.close();
});

test('unknown valid input fields and native approval messages survive routing unchanged', async () => {
  const h = setup();
  const message = { ...request(1), params: { ...request(1).params,
    futureField: { opaque: true }, approvalPolicy: { granular: { sandbox_approval: true } },
    input: [{ type: 'text', text: 'Read source', futureField: 'opaque' }, { type: 'futureInput', opaque: ['value'] }],
  } };
  await h.relay.client(message);
  assert.deepEqual(h.upstream[0], { ...message, params: { ...message.params, model: 'gpt-6.1-sol', effort: 'medium' } });
  const approval = { id: 900, method: 'item/commandExecution/requestApproval', params: { command: 'node --test', futureField: true } };
  h.relay.server(approval);
  assert.equal(h.downstream.at(-1), approval);
  const reply = { id: 900, result: { decision: 'acceptForSession', futureField: 1 } };
  await h.relay.client(reply); assert.equal(h.upstream.at(-1), reply);
  h.relay.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createTurnRelay } from '../src/turn-relay.ts';
import { createRuntimePolicy } from '../src/runtime-policy.ts';
import { launchSmartCodex, nativeTuiArgs, parseSmartCodexArgs, smartCodexChildEnv, startSmartRelay } from '../src/smart-codex.ts';

const task = (id = 1, text = 'Fix typo') => ({ id, method: 'turn/start', params: {
  threadId: 'thread', input: [{ type: 'text', text }], approvalPolicy: 'onRequest',
  sandboxPolicy: { type: 'workspaceWrite', networkAccess: false },
} });
function setup(extra: Record<string, any> = {}) {
  const upstream: any[] = []; const downstream: any[] = []; const metadata: any[] = [];
  const relay = createTurnRelay({ mode: 'auto', model: 'gpt-6.1-sol',
    runtimePolicy: createRuntimePolicy({ mode: extra.mode ?? 'auto', model: extra.model ?? 'gpt-6.1-sol', effortMode: 'fixed' }),
    classifier: async () => ({ profile: 'FAST', confidence: null, reportedConfidence: .99 }),
    upstream: m => upstream.push(m), downstream: m => downstream.push(m), onRoute: m => metadata.push(m), ...extra });
  void relay.client({ id: 'bootstrap', method: 'thread/start', params: {} });
  relay.server({ id: 'bootstrap', result: { thread: { id: 'thread' } } });
  upstream.length = 0; downstream.length = 0;
  return { relay, upstream, downstream, metadata };
}

test('interactive routing preserves approvals, sandbox, input, and request IDs with fixed medium effort', async () => {
  const { relay, upstream, metadata } = setup();
  const request = task(); await relay.client(request);
  assert.deepEqual(upstream[0], { ...request, params: { ...request.params, model: 'gpt-6-luna', effort: 'medium' } });
  assert.equal(request.params.model, undefined);
  assert.equal(metadata[0].model, 'gpt-6-luna');
  assert.ok(!JSON.stringify(metadata).includes('Fix typo'));
});

test('turns route independently and share only bounded earlier user task excerpts', async () => {
  const inputs: string[] = [];
  const { relay, upstream } = setup({ classifier: async ({ input }: { input: string }) => {
    inputs.push(input); return { profile: inputs.length === 1 ? 'FAST' : 'DEEP', confidence: .99 };
  } });
  await relay.client(task());
  relay.server({ method: 'turn/completed', params: { threadId: 'thread' } });
  await relay.client(task(2, 'Design complex migration'));
  assert.equal(upstream[1].params.model, 'gpt-6.1-sol');
  assert.deepEqual(JSON.parse(inputs[1]).previousUserTasks, ['Fix typo']);
  for (let i = 3; i <= 6; i++) {
    relay.server({ method: 'turn/completed', params: { threadId: 'thread' } });
    await relay.client(task(i, 'a'.repeat(5000)));
  }
  const context = JSON.parse(inputs.at(-1)!);
  assert.equal(context.previousUserTasks.length, 2);
  assert.equal(context.previousUserTasks[0].length, 4000);
});

test('ordinary populated composer settings still route and report recognized overrides', async () => {
  const { relay, upstream, metadata } = setup(); const request = task() as any;
  request.params.model = 'gpt-6.1-sol'; request.params.effort = 'high';
  await relay.client(request);
  assert.equal(upstream[0].params.model, 'gpt-6-luna');
  assert.equal(upstream[0].params.effort, 'medium');
  assert.equal(metadata[0].modelOverridden, true);
  assert.equal(metadata[0].effortOverridden, true);
  assert.equal(metadata[0].collaborationSettingsOverridden, false);
  assert.ok(Number.isFinite(metadata[0].routingLatencyMs));
  assert.ok(metadata[0].routingLatencyMs >= 0);
});

test('override metadata never copies arbitrary incoming model, effort, or task text', async () => {
  const { relay, metadata } = setup(); const request = task(1, 'private task text') as any;
  request.params.model = 'private model string'; request.params.effort = 'private effort string';
  request.params.collaborationMode = { mode: 'plan', settings: {
    model: 'private collaboration model', reasoning_effort: 'private collaboration effort',
    developer_instructions: 'private instructions',
  } };
  await relay.client(request);
  assert.equal(metadata[0].modelOverridden, false);
  assert.equal(metadata[0].effortOverridden, false);
  assert.equal(metadata[0].collaborationSettingsOverridden, false);
  assert.ok(!JSON.stringify(metadata).includes('private'));
});

test('matching recognized settings are not reported as overrides', async () => {
  const { relay, metadata } = setup(); const request = task() as any;
  request.params.model = 'gpt-6-luna'; request.params.effort = 'medium';
  request.params.collaborationMode = { mode: 'plan', settings: {
    model: 'gpt-6-luna', reasoning_effort: 'medium', developer_instructions: null,
  } };
  await relay.client(request);
  assert.equal(metadata[0].modelOverridden, false);
  assert.equal(metadata[0].effortOverridden, false);
  assert.equal(metadata[0].collaborationSettingsOverridden, false);
});

test('observe, uncertainty, malformed decisions, and outages use baseline', async () => {
  for (const extra of [
    { mode: 'observe' },
    { classifier: async () => ({ profile: 'FAST', confidence: .2 }) },
    { classifier: async () => ({ profile: 'MAX', confidence: .79 }) },
    { classifier: async () => ({ profile: 'bogus', confidence: .99 }) },
    { classifier: async () => { throw new Error('secret'); } },
  ]) {
    const { relay, upstream } = setup(extra); await relay.client(task());
    assert.equal(upstream[0].params.model, 'gpt-6.1-sol');
  }
});

test('confident MAX routes to Astra medium; observe retains Sol and Astra can be pinned', async () => {
  const classifier = async () => ({ profile: 'MAX', confidence: null, reportedConfidence: .8 });
  const auto = setup({ classifier }); await auto.relay.client(task());
  assert.equal(auto.upstream[0].params.model, 'gpt-6-astra');
  assert.equal(auto.upstream[0].params.effort, 'medium');
  const observe = setup({ classifier, mode: 'observe' }); await observe.relay.client(task());
  assert.equal(observe.upstream[0].params.model, 'gpt-6.1-sol');
  assert.equal(parseSmartCodexArgs(['--model', 'gpt-6-astra'], '/repo').mode, 'pinned');
});

test('pinned mode and media tasks do not send input to Jev', async () => {
  let calls = 0;
  const classifier = async () => { calls++; throw new Error(); };
  const pinned = setup({ mode: 'pinned', model: 'gpt-6-luna', classifier });
  await pinned.relay.client(task()); assert.equal(pinned.upstream[0].params.model, 'gpt-6-luna');
  const media = setup({ classifier }); const message = task();
  message.params.input.push({ type: 'localImage', path: '/private/image.png' } as any);
  await media.relay.client(message); assert.equal(media.upstream[0].params.model, 'gpt-6.1-sol');
  assert.equal(calls, 0);
});

test('plan mode gets the routed model without losing its developer instructions', async () => {
  const { relay, upstream, metadata } = setup(); const request = task() as any;
  request.params.collaborationMode = { mode: 'plan', settings: {
    model: 'gpt-6.1-sol', reasoning_effort: 'high', developer_instructions: 'Plan only',
  } };
  await relay.client(request);
  assert.deepEqual(upstream[0].params.collaborationMode, { mode: 'plan', settings: {
    model: 'gpt-6-luna', reasoning_effort: 'medium', developer_instructions: 'Plan only',
  } });
  assert.equal(metadata[0].collaborationSettingsOverridden, true);
  assert.equal(metadata[0].modelOverridden, false);
  assert.equal(metadata[0].effortOverridden, false);
});

test('Codex background helper threads are not classified', async () => {
  let calls = 0; const { relay, upstream } = setup({ classifier: async () => { calls++; throw new Error(); } });
  await relay.client({ id: 10, method: 'thread/start', params: { ephemeral: true } });
  relay.server({ id: 10, result: { thread: { id: 'thread' } } });
  await relay.client(task());
  assert.equal(calls, 0); assert.deepEqual(upstream[1], task());
});

test('tool outputs, active turn steering, approvals, streams, and resume pass through', async () => {
  let calls = 0;
  const { relay, upstream, downstream } = setup({ classifier: async () => { calls++; throw new Error(); } });
  const messages = [
    { id: 1, method: 'thread/resume', params: { threadId: 'thread' } },
    { id: 2, method: 'turn/steer', params: { threadId: 'thread', input: [] } },
    { id: 3, result: { decision: 'accept' } },
    { ...task(4), params: { ...task().params, input: [], toolOutput: { name: 'test', output: 'ok' } } },
  ];
  for (const message of messages) await relay.client(message);
  relay.server({ method: 'turn/started', params: { threadId: 'thread' } });
  const steer = task(5); await relay.client(steer);
  assert.deepEqual(upstream, [...messages, steer]);
  const stream = { method: 'item/agentMessage/delta', params: { delta: 'answer' } };
  relay.server(stream); assert.equal(downstream.at(-1), stream); assert.equal(calls, 0);
});

test('interrupt during classification cancels the pending turn without executing it', async () => {
  let finish!: (value: unknown) => void;
  const { relay, upstream, downstream } = setup({ classifier: () => new Promise(resolve => { finish = resolve; }) });
  const running = relay.client(task());
  await relay.client({ id: 2, method: 'turn/interrupt', params: { threadId: 'thread' } });
  finish({ profile: 'FAST', confidence: .99 }); await running;
  assert.deepEqual(upstream, []);
  assert.equal(downstream[0].error.code, -32800);
  assert.deepEqual(downstream[1], { id: 2, result: {} });
});

test('disconnect prevents pending classification from starting a turn; failed start releases model pin', async () => {
  let finish!: (value: unknown) => void;
  const one = setup({ classifier: () => new Promise(resolve => { finish = resolve; }) });
  const pending = one.relay.client(task()); one.relay.close();
  finish({ profile: 'FAST', confidence: .99 }); await pending; assert.deepEqual(one.upstream, []);
  const two = setup(); await two.relay.client(task());
  two.relay.server({ id: 1, error: { code: -1, message: 'failed' } });
  await two.relay.client(task(2)); assert.equal(two.metadata.length, 2);
});

test('launcher defaults auto, preserves native resume/options, and makes explicit model pinned', () => {
  const args = parseSmartCodexArgs(['resume', '--last', '-C', '../target', '-a', 'on-request', '--no-alt-screen'], '/repo');
  assert.equal(args.mode, 'auto'); assert.equal(args.directory, resolve('/target'));
  assert.deepEqual(args.tui, ['resume', '--last', '-C', '../target', '-a', 'on-request', '--no-alt-screen']);
  assert.equal(parseSmartCodexArgs(['--model=gpt-6-luna'], '/repo').mode, 'pinned');
  assert.equal(parseSmartCodexArgs(['-m', 'gpt-6-luna', '--routing', 'observe'], '/repo').mode, 'observe');
  for (const invalid of [['--remote', 'ws://host'], ['--routing', 'invalid'], ['-m', 'other'],
    ['exec', 'prompt'], ['-c', 'model_provider="custom"'], ['-c', 'model_providers.openai.base_url="http://host"']]) {
    assert.throws(() => parseSmartCodexArgs(invalid, '/repo'));
  }
});

test('relay children never inherit TypeSafe or OpenAI API credentials; parent is unchanged', () => {
  const source = { GITHUB_TOKEN: 'tool-auth', SMART_CODEX_AUTH_CLIENT_SECRET: 'identity-secret', SMART_CODEX_ADMIN_TOKEN: 'operator-secret', STRIPE_SECRET_KEY: 'billing-secret', TYPESAFE_API_KEY: 'secret', OPENAI_API_KEY: 'other', PATH: '/bin', CODEX_HOME: '/codex',
    PROJECT_OPTION: 'keep', ALLOW_JEV_CLASSIFICATION: 'true' };
  const env = smartCodexChildEnv(source);
  assert.equal(env.GITHUB_TOKEN, 'tool-auth');
  assert.equal(env.SMART_CODEX_ADMIN_TOKEN, undefined);
  assert.equal(env.SMART_CODEX_AUTH_CLIENT_SECRET, undefined);
  assert.equal(env.STRIPE_SECRET_KEY, undefined);
  assert.equal(env.TYPESAFE_API_KEY, undefined); assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(env.CODEX_HOME, '/codex'); assert.equal(env.PROJECT_OPTION, 'keep');
  assert.equal(source.TYPESAFE_API_KEY, 'secret');
});

test('the prompt separator cannot disable the routing connection or turn options into prompt text', () => {
  const parsed = parseSmartCodexArgs(['--', 'Describe --model and --remote'], '/repo');
  const args = nativeTuiArgs(parsed.tui, '/private/relay.sock', parsed.model);
  assert.ok(args.indexOf('--remote') < args.indexOf('--'));
  assert.deepEqual(args.slice(args.indexOf('--')), ['--', 'Describe --model and --remote']);
});

test('help and version text after the prompt separator cannot short-circuit argument validation', async () => {
  for (const text of ['--help', '--version', '-h', '-V']) {
    await assert.rejects(launchSmartCodex(['--routing', 'invalid', '--', text]), /Invalid --routing/);
  }
});

test('private WebSocket transport forwards bidirectional RPC, strips keys, and cleans up its child', { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'smart-relay-test-'));
  const socketPath = join(directory, 'relay.sock'); const binary = join(directory, 'fake-codex.cjs');
  await writeFile(binary, `
const rl = require('node:readline').createInterface({ input: process.stdin });
rl.on('line', line => { const message = JSON.parse(line);
 console.log(JSON.stringify({ id: message.id, result: { message, thread: message.method === 'thread/start' ? { id: 'thread' } : undefined,
 keyPresent: Boolean(process.env.TYPESAFE_API_KEY || process.env.OPENAI_API_KEY), args: process.argv.slice(2),
 metadata: message.method === 'plugin/list' ? 'x'.repeat(5*1024*1024) : null } }));
 if (message.method === 'turn/start') console.log(JSON.stringify({ method: 'item/commandExecution/requestApproval', id: 900, params: { command: 'node --test' } }));
});
`, { mode: 0o700 });
  let server: Awaited<ReturnType<typeof startSmartRelay>> | undefined; let ws: WebSocket | undefined;
  const observedClient: any[] = []; const observedServer: any[] = [];
  try {
    const token = 'a'.repeat(64);
    server = await startSmartRelay({ ...(process.platform === 'win32' ? { localToken: token } : { socketPath }), cwd: directory, env: { ...process.env, TYPESAFE_API_KEY: 'hidden', OPENAI_API_KEY: 'hidden' },
      command: { file: process.execPath, args: ['--', binary] }, mode: 'auto', model: 'gpt-6.1-sol', classifier: async () => ({ profile: 'FAST', confidence: .99 }),
      onClient: m => observedClient.push(m), onServer: m => observedServer.push(m) });
    if (process.platform !== 'win32') assert.equal((await stat(socketPath)).mode & 0o777, 0o600);
    ws = process.platform === 'win32' ? new WebSocket(server.endpoint, { headers: { Authorization: `Bearer ${token}` } }) : new WebSocket(`ws+unix://${socketPath}:/`);
    await once(ws, 'open');
    const received: any[] = []; ws.on('message', data => received.push(JSON.parse(data.toString())));
    const fresh = once(ws, 'message'); ws.send(JSON.stringify({ id: 'bootstrap', method: 'thread/start', params: {} })); await fresh;
    received.length = 0; observedClient.length = 0; observedServer.length = 0;
    const response = once(ws, 'message'); ws.send(JSON.stringify(task())); await response;
    assert.equal(received[0].result.message.params.model, 'gpt-6-luna');
    assert.equal(observedClient[0].params.model, 'gpt-6-luna');
    assert.deepEqual(observedServer[0], received[0]);
    assert.equal(received[0].result.keyPresent, false);
    assert.ok(received[0].result.args.includes('forced_login_method="chatgpt"'));
    if (received.length < 2) await once(ws, 'message');
    assert.equal(received[1].id, 900);
    const approved = once(ws, 'message'); ws.send(JSON.stringify({ id: 900, result: { decision: 'accept' } }));
    await approved; assert.deepEqual(received.at(-1).result.message, { id: 900, result: { decision: 'accept' } });
    const large = once(ws, 'message'); ws.send(JSON.stringify({ id: 901, method: 'plugin/list', params: {} }));
    await large; assert.equal(received.at(-1).result.metadata.length, 5 * 1024 * 1024);
  } finally { ws?.terminate(); await server?.close(); await rm(directory, { recursive: true, force: true }); }
});


test('Windows child environment strips every case variant without removing tool authentication', () => {
  const source = { typesafe_api_key: 'fixture', Typesafe_Api_Key: 'fixture', openai_api_key: 'fixture',
    model_rudder_relay_token: 'fixture', Smart_Codex_Gateway_Token: 'fixture', Openai_Base_Url: 'http://fixture',
    Github_Token: 'tool-auth', Path: '/tools' };
  const child = smartCodexChildEnv(source, 'win32');
  assert.deepEqual(child, { Github_Token: 'tool-auth', Path: '/tools' });
  assert.equal(source.typesafe_api_key, 'fixture');
  assert.equal(smartCodexChildEnv(source, 'linux').typesafe_api_key, 'fixture');
});

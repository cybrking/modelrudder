import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimePolicy } from '../src/runtime-policy.ts';
import { createTurnRelay } from '../src/turn-relay.ts';
import { parseSmartCodexArgs } from '../src/smart-codex.ts';
import { createSessionUsage, formatSessionUsage } from '../src/session-usage.ts';
import { createUsageReport, formatUsageReport } from '../src/usage-report.ts';
import { runDoctor } from '../src/doctor.ts';
import { routes, defaultPolicy } from '../src/config.ts';
import type { Profile } from '../src/types.ts';

const request = () => ({ id: 1, method: 'turn/start', params: { threadId: 'PRIVATE_THREAD',
  input: [{ type: 'text', text: 'PRIVATE_TASK' }], model: 'gpt-6.1-sol', effort: 'medium',
  collaborationMode: { mode: 'plan', settings: { model: 'gpt-6.1-sol', reasoning_effort: 'medium', developer_instructions: 'Plan only' } } } });

function setup(options: Parameters<typeof createRuntimePolicy>[0] = {}, classification: unknown = {
  profile: 'FAST', confidence: null, reportedConfidence: .99,
}) {
  const runtimePolicy = createRuntimePolicy(options);
  const upstream: any[] = [], metadata: any[] = [];
  let calls = 0;
  const relay = createTurnRelay({ mode: runtimePolicy.mode, model: runtimePolicy.model, runtimePolicy,
    classifier: async () => { calls++; if (classification instanceof Error) throw classification; return classification; },
    upstream: m => upstream.push(m), downstream: () => {}, onRoute: r => metadata.push(r) });
  void relay.client({ id: 'bootstrap', method: 'thread/start', params: {} });
  relay.server({ id: 'bootstrap', result: { thread: { id: 'PRIVATE_THREAD' } } });
  upstream.length = 0;
  return { runtimePolicy, relay, upstream, metadata, calls: () => calls };
}

test('effort modes execute medium for fixed/observe and low only for confident auto FAST', async () => {
  const defaults = parseSmartCodexArgs([], '/');
  const defaultRun = setup({ mode: defaults.mode, effortMode: defaults.runtimePolicy.effortMode });
  await defaultRun.relay.client(request());
  assert.equal(defaultRun.upstream[0].params.model, 'gpt-6-luna');
  assert.equal(defaultRun.upstream[0].params.effort, 'low');
  assert.equal(defaultRun.metadata[0].effortMode, 'auto'); defaultRun.relay.close();
  for (const effortMode of ['fixed', 'observe', 'auto'] as const) {
    const r = setup({ effortMode }); const original = request();
    await r.relay.client(original);
    const effort = effortMode === 'auto' ? 'low' : 'medium';
    assert.equal(r.upstream[0].params.model, 'gpt-6-luna');
    assert.equal(r.upstream[0].params.effort, effort);
    assert.equal(r.upstream[0].params.collaborationMode.settings.reasoning_effort, effort);
    assert.equal(r.upstream[0].params.collaborationMode.settings.developer_instructions, 'Plan only');
    assert.equal(original.params.effort, 'medium');
    assert.equal(r.metadata[0].proposedEffort, 'low');
    assert.equal(r.metadata[0].effortMode, effortMode);
    assert.equal(r.metadata[0].effortOverridden, effort === 'low');
    assert.equal(r.metadata[0].collaborationSettingsOverridden, true); // Sol composer switches to Luna.
    assert.equal(r.metadata[0].policyVersion, '4');
    assert.equal(r.calls(), 1); r.relay.close();
  }
});

test('BALANCED, DEEP and MAX remain medium in effort auto', async () => {
  for (const profile of ['BALANCED', 'DEEP', 'MAX'] as Profile[]) {
    const r = setup({ effortMode: 'auto' }, { profile, confidence: null, reportedConfidence: .8 });
    await r.relay.client(request());
    assert.equal(r.upstream[0].params.model, routes[profile].model);
    assert.equal(r.upstream[0].params.effort, 'medium');
    assert.equal(r.metadata[0].effortReason, 'profile_medium'); r.relay.close();
  }
});

test('model observe and pinned keep medium regardless of effort mode', async () => {
  for (const mode of ['observe', 'pinned'] as const) for (const effortMode of ['observe', 'auto'] as const) {
    const r = setup({ mode, effortMode }); await r.relay.client(request());
    assert.equal(r.upstream[0].params.model, 'gpt-6.1-sol');
    assert.equal(r.upstream[0].params.effort, 'medium');
    assert.equal(r.calls(), mode === 'pinned' ? 0 : 1);
    assert.equal(r.metadata[0].proposedEffort, mode === 'pinned' ? null : 'low'); r.relay.close();
  }
});

test('uncertainty, invalid classifications, outages, deadlines and policy clamps preserve medium', async () => {
  for (const raw of [{ profile: 'FAST', confidence: null, reportedConfidence: .79 },
    { profile: 'FAST', confidence: null }, { profile: 'INVALID', confidence: .99 }, new Error('PRIVATE')]) {
    const r = setup({ effortMode: 'auto' }, raw); await r.relay.client(request());
    assert.equal(r.upstream[0].params.model, 'gpt-6.1-sol');
    assert.equal(r.upstream[0].params.effort, 'medium'); r.relay.close();
  }
  const clamped = setup({ effortMode: 'auto', policy: { ...defaultPolicy, minimum: 'DEEP' } });
  await clamped.relay.client(request());
  assert.equal(clamped.metadata[0].proposedEffort, 'medium');
  assert.equal(clamped.upstream[0].params.effort, 'medium'); clamped.relay.close();
  let resolve!: (value: unknown) => void; const upstream: any[] = [];
  const relay = createTurnRelay({ mode: 'auto', model: 'gpt-6.1-sol',
    runtimePolicy: createRuntimePolicy({ effortMode: 'auto', classificationTimeoutMs: 5 }),
    classifier: () => new Promise(r => { resolve = r; }), upstream: m => upstream.push(m), downstream: () => {} });
  await relay.client({ id: 'bootstrap', method: 'thread/start', params: {} });
  relay.server({ id: 'bootstrap', result: { thread: { id: 'PRIVATE_THREAD' } } });
  upstream.length = 0;
  await relay.client(request()); assert.equal(upstream[0].params.effort, 'medium');
  resolve({ profile: 'FAST', confidence: .99 }); await Promise.resolve();
  assert.equal(upstream.length, 1); relay.close();
});

test('media and disabled classification use medium; steering/tools retain native settings', async () => {
  const disabled = setup({ effortMode: 'auto', policy: { ...defaultPolicy, allowClassification: false } });
  await disabled.relay.client(request()); assert.equal(disabled.upstream[0].params.effort, 'medium');
  assert.equal(disabled.calls(), 0); disabled.relay.close();
  const media = setup({ effortMode: 'auto' }); const withMedia: any = request();
  withMedia.params.input.push({ type: 'image', url: 'private' }); await media.relay.client(withMedia);
  assert.equal(media.upstream[0].params.effort, 'medium'); assert.equal(media.calls(), 0); media.relay.close();
  const r = setup({ effortMode: 'auto' }); await r.relay.client(request());
  const steering = { ...request(), id: 2 }; await r.relay.client(steering);
  assert.deepEqual(r.upstream[1], steering); assert.equal(r.calls(), 1);
  r.relay.server({ method: 'turn/completed', params: { threadId: 'PRIVATE_THREAD', turn: { status: 'completed' } } });
  const tool = { ...request(), id: 3, params: { ...request().params, toolOutput: true } };
  await r.relay.client(tool); assert.deepEqual(r.upstream[2], tool); assert.equal(r.calls(), 1); r.relay.close();
});

test('recognized effort override flags compare against the selected effort', async () => {
  const r = setup({ effortMode: 'auto' }); const matching = request();
  matching.params.effort = 'low'; matching.params.collaborationMode.settings.model = 'gpt-6-luna';
  matching.params.collaborationMode.settings.reasoning_effort = 'low';
  await r.relay.client(matching);
  assert.equal(r.metadata[0].effortOverridden, false); assert.equal(r.metadata[0].collaborationSettingsOverridden, false);
  r.relay.close();
});

test('CLI effort flags are consumed locally, validate values, respect prompt separator and fingerprint policy', () => {
  const defaults = parseSmartCodexArgs([], '/');
  assert.equal(defaults.runtimePolicy.effortMode, 'auto');
  for (const mode of ['fixed', 'observe'] as const) {
    const parsed = parseSmartCodexArgs([`--effort-mode=${mode}`, '--sandbox', 'workspace-write'], '/');
    assert.equal(parsed.runtimePolicy.effortMode, mode);
    assert.deepEqual(parsed.tui, ['--sandbox', 'workspace-write']);
    assert.equal(parsed.server.includes('--effort-mode'), false);
    assert.notEqual(parsed.runtimePolicy.hash, defaults.runtimePolicy.hash);
    assert.equal(createRuntimePolicy(parsed.runtimePolicy).hash, parsed.runtimePolicy.hash);
  }
  for (const args of [['--effort-mode', 'high'], ['--effort-mode'], ['--effort-mode='],
    ['--effort-mode', 'auto', '--effort-mode', 'fixed']]) assert.throws(() => parseSmartCodexArgs(args, '/'));
  const prompt = parseSmartCodexArgs(['--', '--effort-mode', 'fixed'], '/');
  assert.equal(prompt.runtimePolicy.effortMode, 'auto'); assert.deepEqual(prompt.tui, ['--', '--effort-mode', 'fixed']);
  assert.throws(() => createRuntimePolicy({ effortMode: 'high' } as any));
  assert.throws(() => createRuntimePolicy({ routes: { ...routes, MAX: { model: 'gpt-6-astra', effort: 'low' } } }));
  assert.throws(() => createRuntimePolicy({ routes: { ...routes, DEEP: { model: 'gpt-6.1-sol', effort: 'low' } } }));
  assert.throws(() => createRuntimePolicy({ routes: { ...routes, BALANCED: { model: 'gpt-6-luna', effort: 'low' } } }));
  assert.throws(() => createRuntimePolicy({ routes: { ...routes, DEEP: { model: 'gpt-6-luna', effort: 'low' } } }));
  assert.throws(() => createRuntimePolicy({ policy: { ...defaultPolicy, fallback: 'FAST' } }));
});

test('effort proposals/settings appear in monitor and exports; historical and unsafe values stay unknown', async () => {
  const r = setup({ effortMode: 'observe' }); await r.relay.client(request());
  const usage = createSessionUsage(); usage.route(r.metadata[0]);
  const report = createUsageReport(usage.snapshot());
  assert.equal(report.routing.latestRequestedEffort, 'medium'); assert.equal(report.routing.proposedEffort, 'low');
  assert.equal(report.routing.effortMode, 'observe'); assert.equal(report.routing.effortReason, 'observe');
  assert.equal(report.routing.latestVerifiedEffectiveEffort, null); assert.equal(report.routing.policyVersion, '4');
  assert.match(formatSessionUsage(usage.snapshot()), /Last route\s+Luna \/ medium/);
  assert.match(formatUsageReport(report), /Effort: proposed low; executed setting medium; mode observe/);
  assert.ok(!JSON.stringify(report).includes('PRIVATE')); r.relay.close();
  const old: any = usage.snapshot();
  for (const key of ['effort', 'proposedEffort', 'effortMode', 'effortReason']) delete old.latestRoute[key];
  old.latestRoute.policyVersion = '1';
  assert.equal(createUsageReport(old).routing.latestRequestedEffort, null);
  assert.equal(createUsageReport(old).routing.policyVersion, '1');
  for (const key of ['effort', 'proposedEffort', 'effortMode', 'effortReason']) old.latestRoute[key] = 'PRIVATE';
  assert.ok(!JSON.stringify(createUsageReport(old)).includes('PRIVATE'));
  usage.route(old.latestRoute); assert.ok(!JSON.stringify(usage.snapshot()).includes('PRIVATE'));
});

test('classifier evidence survives relay, private accounting and shareable report without changing the gate', async () => {
  const probabilities = { FAST: .51, BALANCED: .48, DEEP: .01, MAX: 0 };
  const r = setup({ effortMode: 'auto' }, { profile: 'FAST', confidence: null, reportedConfidence: .47,
    probabilities, servedModel: 'jev-1.13.0', private: 'PRIVATE_PROVIDER_PAYLOAD' });
  await r.relay.client(request());
  assert.equal(r.upstream[0].params.model, 'gpt-6.1-sol');
  assert.equal(r.upstream[0].params.effort, 'medium');
  assert.equal(r.metadata[0].reason, 'uncertain_classification');
  assert.deepEqual(r.metadata[0].probabilities, probabilities);
  assert.equal(r.metadata[0].servedModel, 'jev-1.13.0');
  const usage = createSessionUsage(); usage.route(r.metadata[0]);
  const snapshot = usage.snapshot();
  snapshot.latestRoute!.probabilities!.FAST = 0;
  r.metadata[0].probabilities.FAST = 0;
  const report = createUsageReport(usage.snapshot());
  assert.deepEqual(report.routing.probabilities, probabilities);
  assert.equal(report.routing.servedModel, 'jev-1.13.0');
  assert.match(formatSessionUsage(usage.snapshot()), /Low Jev confidence \(47%\); kept baseline/);
  assert.ok(!formatSessionUsage(usage.snapshot()).includes('Profile probabilities'));
  assert.match(formatUsageReport(report), /Jev served model: jev-1.13.0/);
  assert.ok(!JSON.stringify(report).includes('PRIVATE'));
  const old: any = usage.snapshot(); delete old.latestRoute.probabilities; delete old.latestRoute.servedModel;
  assert.equal(createUsageReport(old).routing.probabilities, null);
  assert.equal(createUsageReport(old).routing.servedModel, null);
  old.latestRoute.probabilities = { ...probabilities, PRIVATE: .1 };
  old.latestRoute.servedModel = 'PRIVATE_PROVIDER_PAYLOAD';
  assert.equal(createUsageReport(old).routing.probabilities, null);
  assert.ok(!JSON.stringify(createUsageReport(old)).includes('PRIVATE'));
  usage.route(old.latestRoute);
  assert.equal(usage.snapshot().latestRoute!.probabilities, null);
  assert.equal(usage.snapshot().latestRoute!.servedModel, null);
  r.relay.close();
});

test('doctor reports selected effort mode without model execution', async () => {
  const result = await runDoctor({}, async args => ({ stdout: args[0] === '--version' ? 'codex-cli 0.159.3'
    : args[0] === 'login' ? 'Logged in using ChatGPT' : args[0] === '--help' ? '--remote <ADDR>' : '--stdio', stderr: '' }),
  createRuntimePolicy({ mode: 'pinned', effortMode: 'observe' }));
  assert.equal(result.ok, true); assert.match(result.text, /Interactive effort mode: observe/);
});

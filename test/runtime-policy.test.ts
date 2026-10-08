import test from 'node:test';
import assert from 'node:assert/strict';
import { createRuntimePolicy, routerVersion } from '../src/runtime-policy.ts';
import { defaultPolicy, routes } from '../src/config.ts';
import { runDoctor } from '../src/doctor.ts';

test('interactive snapshot is deeply immutable and isolates caller policy and routes', () => {
  const policy = structuredClone(defaultPolicy), sourceRoutes = structuredClone(routes);
  const snapshot = createRuntimePolicy({ policy, routes: sourceRoutes });
  const hash = snapshot.hash;
  policy.confidenceThreshold = 0.1;
  policy.allowedModels = [];
  sourceRoutes.DEEP.model = 'gpt-6-luna';
  assert.equal(snapshot.policy.confidenceThreshold, 0.8);
  assert.equal(snapshot.routes.DEEP.model, 'gpt-6.1-sol');
  assert.equal(snapshot.routes.FAST.effort, 'low');
  assert.equal(snapshot.effortMode, 'auto');
  assert.equal(snapshot.version, '4');
  assert.equal(snapshot.contextEligibility, 'fresh-text-only-history-v1');
  assert.throws(() => { (snapshot as any).contextEligibility = 'unrestricted'; }, TypeError);
  assert.equal(routes.FAST.effort, 'low');
  assert.equal(snapshot.hash, hash);
  assert.throws(() => { (snapshot.policy as any).confidenceThreshold = 0; }, TypeError);
  assert.throws(() => { (snapshot.policy.allowedModels as string[]).push('other'); }, TypeError);
  assert.throws(() => { (snapshot.routes.DEEP as any).model = 'other'; }, TypeError);
});

test('policy fingerprint identifies effective routing settings deterministically', () => {
  const policy = createRuntimePolicy();
  assert.equal(policy.hash, createRuntimePolicy(policy).hash);
  assert.equal(policy.hash, createRuntimePolicy({ policy: {
    ...defaultPolicy, allowedModels: [...defaultPolicy.allowedModels].reverse(),
  } }).hash);
  for (const options of [{ mode: 'observe' as const }, { classificationTimeoutMs: 1000 },
    { policy: { ...defaultPolicy, confidenceThreshold: 0.9 } },
    { routes: { ...routes, MAX: { ...routes.MAX, model: 'gpt-6.1-sol' } } }]) {
    assert.notEqual(policy.hash, createRuntimePolicy(options).hash);
  }
  assert.equal(createRuntimePolicy({ mode: 'pinned' }).policy.allowClassification, false);
});

test('invalid policy fails before execution, including prohibited fallback and malformed timeout', () => {
  for (const options of [
    { policy: { ...defaultPolicy, allowedModels: [] } },
    { policy: { ...defaultPolicy, allowedModels: ['unknown'] } },
    { policy: { ...defaultPolicy, allowedModels: ['gpt-6-luna'] } },
    { policy: { ...defaultPolicy, maximum: 'BALANCED' } },
    { policy: { ...defaultPolicy, confidenceThreshold: NaN } },
    { policy: { ...defaultPolicy, allowClassification: 'true' } },
    { mode: 'invalid' }, { model: 'unknown' },
    { classificationTimeoutMs: 0 }, { classificationTimeoutMs: 1.1 }, { classificationTimeoutMs: 30_001 },
  ]) assert.throws(() => createRuntimePolicy(options as any));
});

const healthyProbe = async (args: string[]) => ({ stdout: args[0] === '--version' ? 'codex-cli 0.160.1'
  : args[0] === 'login' ? 'Logged in using ChatGPT'
  : args[0] === '--help' ? '  --remote <ADDR>\n' : '  --stdio\n', stderr: '' });

test('doctor accurately separates text observe from interactive auto and probes only advertised compatibility', async () => {
  const result = await runDoctor({ ALLOW_JEV_CLASSIFICATION: 'true', TYPESAFE_API_KEY: 'SECRET' }, healthyProbe);
  assert.equal(result.ok, true);
  assert.match(result.text, /Router: smart-codex /);
  assert.ok(result.text.includes(routerVersion));
  assert.match(result.text, /Text commands: observe/);
  assert.match(result.text, /Interactive routing: auto/);
  assert.match(result.text, /Interactive effort mode: auto/);
  assert.match(result.text, /Context eligibility: fresh-text-only-history-v1/);
  assert.match(result.text, /--remote present; app-server --stdio present/);
  assert.match(result.text, /exact protocol-tested builds/);
  assert.ok(!result.text.includes('SECRET'));
});

test('doctor checks effective configuration and cannot mistake similarly named flags for required options', async () => {
  assert.equal((await runDoctor({}, healthyProbe)).ok, false);
  const pinned = await runDoctor({}, healthyProbe, createRuntimePolicy({ mode: 'pinned' }));
  assert.equal(pinned.ok, true);
  assert.match(pinned.text, /Interactive routing: pinned/);
  assert.match(pinned.text, /no credentials required/);
  const missing = await runDoctor({}, async args => args[0] === '--help'
    ? { stdout: '--remote-auth-token-env SECRET', stderr: '' } : healthyProbe(args), createRuntimePolicy({ mode: 'pinned' }));
  assert.equal(missing.ok, false);
  assert.match(missing.text, /--remote missing/);
  assert.ok(!missing.text.includes('SECRET'));
});

test('doctor rejects untested native builds without treating available flags as protocol evidence', async () => {
  const result = await runDoctor({}, async args => args[0] === '--version'
    ? { stdout: 'codex-cli 99.0.0', stderr: '' } : healthyProbe(args), createRuntimePolicy({ mode: 'pinned' }));
  assert.equal(result.ok, false); assert.match(result.text, /protocol evidence missing/);
  assert.match(result.text, /task quality and confidence calibration remain unverified/);
});

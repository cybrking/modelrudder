import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { createServer } from 'node:http';
import { createTevClassifier, inspectTev, localTevEndpoint } from '../src/adapters/tev.ts';
import { createConfiguredClassifier, readClassifierConfig, classifierOverride, classificationEnabled } from '../src/classifier.ts';
import { createClaudeClassifier } from '../src/claude-classifier.ts';
import { createTurnRelay } from '../src/turn-relay.ts';
import { createClaudeRouter } from '../src/claude-routing.ts';
import { parseDecision } from '../src/policy.ts';
import { runSetup } from '../src/setup.ts';
import { protectPrivatePathSync } from '../src/private-files.ts';
import { createSessionUsage, formatSessionUsage } from '../src/session-usage.ts';
import { createUsageReport } from '../src/usage-report.ts';
import { smartCodexChildEnv } from '../src/smart-codex.ts';
import { claudeChildEnv } from '../src/claude-command.ts';

const valid = () => ({ model: 'tev1:latest', answers: { route: { type: 'choice', choice: 'FAST', confidence: 0.9,
  probabilities: { FAST: 1, BALANCED: 0, DEEP: 0, MAX: 0 } } }, usage: { input_tokens: 10, output_tokens: 2 } });
const enabled = { SMART_CODEX_CLASSIFIER: 'tev', ALLOW_CLASSIFICATION: 'true' };

test('local Tev has strict loopback configuration and independent activation; legacy Jev consent survives', () => {
  assert.equal(readClassifierConfig(enabled).provider, 'tev');
  assert.equal(classificationEnabled(enabled), true);
  assert.equal(classificationEnabled({ ...enabled, SMART_CODEX_CLASSIFIER: 'jev' }), false);
  assert.equal(classificationEnabled({ ALLOW_JEV_CLASSIFICATION: 'true' }), true);
  assert.equal(classificationEnabled({ ALLOW_JEV_CLASSIFICATION: 'true', ALLOW_CLASSIFICATION: 'false' }), false);
  assert.equal(classificationEnabled({ SMART_CODEX_CLASSIFIER: 'tev', ALLOW_JEV_CLASSIFICATION: 'true' }), false);
  for (const url of ['https://example.com', 'http://example.com', 'http://127.0.0.1/path', 'http://user:pass@127.0.0.1', 'http://127.0.0.1?secret=x', 'http://127.0.0.1#x']) assert.throws(() => localTevEndpoint(url));
  assert.equal(localTevEndpoint('http://[::1]:11434'), 'http://[::1]:11434');
  assert.throws(() => readClassifierConfig({ ...enabled, SMART_CODEX_TEV_MODEL: 'arbitrary\nsecret' }));
});

test('session override is ephemeral, respects -- boundary, rejects ambiguous flags and requires hosted consent', () => {
  const env = { ...enabled };
  const result = classifierOverride(['--classifier=jev', '--routing', 'observe', '--', '--classifier=tev'], env);
  assert.equal(result.env.SMART_CODEX_CLASSIFIER, 'direct');
  assert.equal(env.SMART_CODEX_CLASSIFIER, 'tev');
  assert.equal(classificationEnabled(result.env), false);
  assert.deepEqual(result.args, ['--routing', 'observe', '--', '--classifier=tev']);
  for (const args of [['--classifier'], ['--classifier', 'bad'], ['--classifier', 'jev', '--classifier', 'tev']]) assert.throws(() => classifierOverride(args, env));
});

test('Tev transport records only observable identity, sends no credentials, validates schema and redacts failures', async () => {
  let options: RequestInit | undefined;
  const classify = createTevClassifier({ url: 'http://127.0.0.1:11434', model: 'tev1:latest', fetch: async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:11434/v1/systemone'); options = init;
    return Response.json(valid());
  } });
  const decision = parseDecision(await classify({ input: 'synthetic task' }));
  assert.equal(decision.servedModel, 'tev1:latest');
  assert.equal(decision.usage?.inputTokens, 10);
  assert.equal(options?.redirect, 'error');
  assert.deepEqual(options?.headers, { 'Content-Type': 'application/json' });
  assert.match(JSON.parse(String(options?.body)).questions.route.criteria.FAST, /Luna/);
  for (const raw of [{ ...valid(), model: 'jev-1.13.0' }, { ...valid(), usage: {} }, { answers: {} }]) {
    const invalid = createTevClassifier({ url: 'http://127.0.0.1', model: 'tev1:latest', fetch: async () => Response.json(raw) });
    await assert.rejects(invalid({ input: 'private' }), { message: 'Tev request failed' });
  }
  const old = { ...valid(), model: undefined };
  const unknown = createTevClassifier({ url: 'http://127.0.0.1', model: 'tev1:latest', fetch: async () => Response.json(old) });
  assert.equal(parseDecision(await unknown({ input: 'task' })).servedModel, undefined);
});

test('Tev deadlines and cancellation bound a transport that ignores abort without hosted retry', async () => {
  let calls = 0;
  const hanging = createTevClassifier({ url: 'http://127.0.0.1', model: 'tev1:latest', timeoutMs: 10,
    fetch: async () => { calls++; return new Promise(() => {}); } });
  await assert.rejects(hanging({ input: 'task' }), /Tev request failed/);
  assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(hanging({ input: 'task' }, controller.signal), /Tev request failed/);
  assert.equal(calls, 1);
});

test('Tev metadata check distinguishes absent service, missing model and model presence without inference', async () => {
  assert.equal((await inspectTev('http://127.0.0.1', 'tev1:latest', async () => { throw Error('PRIVATE'); })).ready, false);
  assert.match((await inspectTev('http://127.0.0.1', 'tev1:latest', async () => Response.json({ models: [] }))).message, /missing/);
  const status = await inspectTev('http://127.0.0.1', 'tev1:latest', async (url, init) => {
    assert.equal(url, 'http://127.0.0.1/api/tags'); assert.equal(init?.body, undefined);
    return Response.json({ models: [{ name: 'tev1:latest', digest: 'a'.repeat(64) }] });
  });
  assert.equal(status.ready, true); assert.match(status.message, /not been tested/);
});

test('setup switches atomically, preserves credentials and other settings, and leaves prior selection on failure', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tev-setup-'));
  try {
    const file = join(dir, 'env');
    const old = 'TYPESAFE_API_KEY=PRIVATE_FIXTURE\nALLOW_JEV_CLASSIFICATION=false\nSMART_CODEX_CLASSIFIER=direct\nOTHER="keep this"\n';
    await writeFile(file, old, { mode: 0o600 }); protectPrivatePathSync(file);
    const env = { SMART_CODEX_ENV_FILE: file };
    let output = '';
    const out = (text: string) => { output += text; };
    const args = ['--classifier', 'tev', '--no-open'];
    assert.equal(await runSetup(args, env, out, async () => {}, async () => ({ ready: false, message: 'unavailable' })), 1);
    assert.equal(await readFile(file, 'utf8'), old);
    assert.equal(await runSetup(args, env, out, async () => { throw Error('Tev does not need key editor'); }, async () => ({ ready: true, message: 'present' })), 0);
    const saved = parseEnv(await readFile(file, 'utf8'));
    assert.equal(saved.SMART_CODEX_CLASSIFIER, 'tev'); assert.equal(saved.ALLOW_CLASSIFICATION, 'true');
    assert.equal(saved.ALLOW_JEV_CLASSIFICATION, 'false'); assert.equal(saved.TYPESAFE_API_KEY, 'PRIVATE_FIXTURE');
    assert.equal(saved.OTHER, 'keep this'); assert.ok(!output.includes('PRIVATE_FIXTURE'));
    output = '';
    await runSetup(['--no-open'], { ...env, ...saved }, out);
    assert.match(output, /Existing Tev selection preserved/); assert.ok(!output.includes('Enter your key'));
    assert.equal(await runSetup(['--classifier', 'jev', '--no-open'], { ...env, ...saved }, out), 1);
    assert.equal(parseEnv(await readFile(file, 'utf8')).SMART_CODEX_CLASSIFIER, 'tev');
    await writeFile(file, (await readFile(file, 'utf8')).replace('ALLOW_JEV_CLASSIFICATION=false', 'ALLOW_JEV_CLASSIFICATION=true'));
    const ready = parseEnv(await readFile(file, 'utf8'));
    await runSetup(['--classifier', 'jev', '--no-open'], { ...env, ...ready }, out);
    const jev = parseEnv(await readFile(file, 'utf8'));
    assert.equal(jev.SMART_CODEX_CLASSIFIER, 'direct'); assert.equal(classificationEnabled(jev), true);
    await assert.rejects(runSetup(args, { ...env, SMART_CODEX_CLASSIFIER: 'hosted' }, out), /override/);
    assert.equal(parseEnv(await readFile(file, 'utf8')).SMART_CODEX_CLASSIFIER, 'direct');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('both native paths use local adapter, distinct rubrics, per-turn choice and local failure fallback', async () => {
  const requests: any[] = [];
  let fail = false;
  const server = createServer(async (req, res) => {
    assert.equal(req.url, '/v1/systemone'); assert.equal(req.headers.authorization, undefined);
    let text = ''; for await (const chunk of req) text += chunk;
    requests.push(JSON.parse(text));
    res.writeHead(fail ? 503 : 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(fail ? { error: 'PRIVATE' } : valid()));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address() as { port: number };
    const env = { ...enabled, SMART_CODEX_TEV_URL: `http://127.0.0.1:${address.port}`, TYPESAFE_API_KEY: 'NEVER_SEND' };
    const codex = createConfiguredClassifier(env);
    const upstream: any[] = [], routes: any[] = [];
    const relay = createTurnRelay({ mode: 'auto', model: 'gpt-6.1-sol', classifier: codex,
      upstream: m => upstream.push(m), downstream: () => {}, onRoute: m => routes.push(m) });
    await relay.client({ id: 'bootstrap', method: 'thread/start', params: {} });
    relay.server({ id: 'bootstrap', result: { thread: { id: 'thread1' } } });
    upstream.length = 0;
    await relay.client({ id: 'turn1', method: 'turn/start', params: { threadId: 'thread1', input: [{ type: 'text', text: 'synthetic' }] } });
    assert.equal(upstream[0].params.model, 'gpt-6-luna'); assert.equal(upstream[0].params.effort, 'low');
    assert.equal(routes[0].classifierVersion, 'tev1:latest:rubric-2026-10-01'); relay.close();
    assert.match(requests[0].questions.route.criteria.FAST, /Luna/);
    let metadata: any;
    const router = createClaudeRouter({ mode: 'auto', model: 'sonnet', classifier: createClaudeClassifier(env), onRoute: m => { metadata = m; } });
    const task = { sessionId: 'session1', turnId: 'turn1', task: 'synthetic', contextReason: null };
    const first = await router.route(task);
    assert.equal(first.model, 'haiku'); assert.match(requests[1].questions.route.criteria.FAST, /Haiku/);
    assert.equal(metadata.classifierVersion, 'tev1:latest:claude-rubric-2026-10-08');
    await router.route(task); assert.equal(requests.length, 2);
    fail = true;
    const fallback = await router.route({ ...task, turnId: 'turn2' });
    assert.equal(fallback.model, 'sonnet'); assert.equal(fallback.reason, 'classifier_failed');
    assert.equal(requests.length, 3); router.close();
    for (const child of [smartCodexChildEnv(env), claudeChildEnv(env)]) {
      assert.equal(child.TYPESAFE_API_KEY, undefined); assert.equal(child.ALLOW_CLASSIFICATION, undefined); assert.equal(child.SMART_CODEX_TEV_URL, undefined);
    }
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});

test('local usage never receives Jev pricing and reports preserve Tev identity', () => {
  const usage = createSessionUsage('tev');
  usage.classificationFinished(usage.classificationStarted(), { inputTokens: 1000, outputTokens: 10 });
  const snapshot = usage.snapshot();
  assert.equal(snapshot.jev.estimatedUsd, null); assert.equal(snapshot.estimatedDifferenceUsd, null);
  assert.match(formatSessionUsage(snapshot), /Tev \(local\)/);
  const report = createUsageReport(snapshot);
  assert.equal(report.classifier.provider, 'tev'); assert.equal(report.classifier.estimatedUsd, null);
});


test('Claude classifier status rejects the Codex-only hosted gateway', () => {
  const result = spawnSync(process.execPath, ['src/smart-claude.ts', 'classifier', 'status'], {
    encoding: 'utf8', env: { ...process.env, SMART_CODEX_CLASSIFIER: 'hosted',
      ALLOW_JEV_CLASSIFICATION: 'true', ALLOW_CLASSIFICATION: 'true',
      SMART_CODEX_GATEWAY_URL: 'https://example.com/classify', SMART_CODEX_GATEWAY_TOKEN: 'x'.repeat(32) },
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /hosted gateway is unsupported/);
  assert.match(result.stdout, /setup --classifier/);
});

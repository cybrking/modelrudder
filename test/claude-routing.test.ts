import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClaudeRouter, parseClaudeTask, startClaudeBridge, claudeRoutes, readClaudeModelIds } from '../src/claude-routing.ts';
import { claudeJevInput, createClaudeClassifier } from '../src/claude-classifier.ts';
import { createJevClassifier, jevInput } from '../src/adapters/jev.ts';
import { createClaudeUsage, runClaudeReport } from '../src/claude-usage.ts';
import { protectPrivatePathSync } from '../src/private-files.ts';

const task = (turnId = 'turn1', text = 'Fix the typo', sessionId = 'session1') => ({ turnId, sessionId, task: text, contextReason: null });
const result = (profile = 'FAST', score = 0.95) => ({ profile, confidence: null, reportedConfidence: score });
const usage = { model: 'claude-sonnet-4-6', input_tokens: 4, output_tokens: 3, cache_read_input_tokens: 2, cache_creation_input_tokens: 1 };

test('Claude profiles are distinct from Codex and reported confidence remains experimental', async () => {
  assert.deepEqual(claudeRoutes, { FAST: 'haiku', BALANCED: 'sonnet', DEEP: 'sonnet', MAX: 'opus' });
  assert.match(claudeJevInput('task').questions.route.criteria.FAST, /Haiku/);
  assert.match(jevInput('task').questions.route.criteria.FAST, /GPT-6 Luna/);
  assert.throws(() => createClaudeClassifier({}), /ALLOW_JEV/);
  assert.throws(() => createClaudeClassifier({ ALLOW_JEV_CLASSIFICATION: 'true', SMART_CODEX_CLASSIFIER: 'hosted', SMART_CODEX_GATEWAY_URL: 'https://example.com/classify', SMART_CODEX_GATEWAY_TOKEN: 'a'.repeat(32) }), /Codex rubric/);
  let request;
  const classify = createJevClassifier({ apiKey: 'synthetic', buildInput: claudeJevInput, fetch: async (_url, init) => {
    request = JSON.parse(init!.body as string);
    return new Response(JSON.stringify({ answers: { route: { type: 'choice', choice: 'FAST', confidence: 0.95, probabilities: { FAST: 1, BALANCED: 0, DEEP: 0, MAX: 0 } } }, usage: { input_tokens: 5, output_tokens: 1 } }));
  } });
  const decision = await classify({ input: 'synthetic task' }) as any;
  assert.match(request.questions.route.criteria.FAST, /Haiku/);
  assert.equal(decision.confidence, null);
  assert.equal(decision.reportedConfidence, 0.95);
});

test('Claude full model IDs are family-bounded and never arbitrary redirects', () => {
  assert.equal(readClaudeModelIds({}).haiku, 'claude-haiku-5-5');
  assert.equal(readClaudeModelIds({ SMART_CLAUDE_SONNET_MODEL: 'claude-sonnet-4-6' }).sonnet, 'claude-sonnet-4-6');
  for (const value of ['opus', 'claude-opus-5-5', 'http://untrusted', 'claude-haiku-5-5\n', 'claude-haiku-5-5[1m]']) assert.throws(() => readClaudeModelIds({ SMART_CLAUDE_HAIKU_MODEL: value }), /full IDs/);
});

test('auto routes every eligible new turn, observe uses baseline, pinned never classifies', async () => {
  const profiles = ['FAST', 'BALANCED', 'DEEP', 'MAX'];
  for (const mode of ['auto', 'observe', 'pinned'] as const) {
    let calls = 0;
    const router = createClaudeRouter({ mode, model: 'opus', classifier: async () => result(profiles[calls++]) });
    for (let i = 0; i < profiles.length; i++) {
      const selected = await router.route(task('turn' + i));
      assert.equal(selected.model, mode === 'pinned' ? 'opus' : mode === 'observe' ? 'sonnet' : claudeRoutes[profiles[i]]);
      router.complete({ sessionId: 'session1', turnId: 'turn' + i, isAborted: false });
    }
    assert.equal(calls, mode === 'pinned' ? 0 : 4); router.close();
  }
});

test('uncertainty, invalid output and classifier failures use Sonnet without retrying', async () => {
  for (const classify of [async () => result('FAST', 0.79), async () => ({ profile: 'BAD', confidence: 1 }), async () => { throw new Error('SECRET task credential'); }]) {
    let calls = 0; const records = [];
    const router = createClaudeRouter({ mode: 'auto', model: 'sonnet', classifier: async (...args) => { calls++; return classify(...args); }, onRoute: r => records.push(r) });
    const decision = await router.route(task());
    assert.equal(decision.model, 'sonnet'); assert.equal(calls, 1);
    assert.doesNotMatch(JSON.stringify(records), /SECRET/); router.close();
  }
});

test('opaque, unsupported and empty tasks do not reach Jev; context is bounded by session', async () => {
  const requests = [];
  const router = createClaudeRouter({ mode: 'auto', model: 'sonnet', classifier: async r => { requests.push(JSON.parse(r.input)); return result(); } });
  for (const contextReason of ['media_baseline', 'reference_context_baseline', 'unclassified_context_baseline', 'unsupported_input_baseline']) {
    const decision = await router.route({ ...task(contextReason, ''), contextReason });
    assert.equal(decision.model, 'sonnet');
  }
  await router.route(task('empty', ''));
  assert.equal(requests.length, 0);
  for (let i = 0; i < 4; i++) await router.route(task('fresh' + i, String(i).repeat(5000)));
  assert.equal(requests[3].previousUserTasks.length, 2);
  assert.equal(requests[3].previousUserTasks[0].length, 4000);
  assert.equal(requests[3].previousUserTasks[0][0], '1');
  await router.route(task('other', 'new session', 'session2'));
  assert.deepEqual(requests.at(-1).previousUserTasks, []);
  assert.throws(() => parseClaudeTask({ ...task(), contextReason: 'media_baseline' }), /withheld/);
  assert.throws(() => parseClaudeTask({ ...task(), task: 'a'.repeat(100001) }), /Invalid/);
  router.close();
});

test('concurrent duplicate routes share one classification and conflicting reuse is rejected', async () => {
  let release; let calls = 0;
  const router = createClaudeRouter({ mode: 'auto', model: 'sonnet', classifier: async () => { calls++; return await new Promise(done => { release = done; }); } });
  const first = router.route(task()), second = router.route(task());
  assert.equal(first, second);
  await assert.rejects(router.route(task('turn1', 'different')), /Conflicting/);
  release(result());
  assert.equal((await first).model, 'haiku'); assert.equal(calls, 1);
  assert.deepEqual(await router.route(task()), await first); router.close();
});

test('abort/complete/close cancel classification and cannot publish a late choice', async () => {
  for (const how of ['signal', 'complete', 'close']) {
    const records = []; let aborted = false;
    const router = createClaudeRouter({ mode: 'auto', model: 'sonnet', classifier: (_r, signal) => new Promise((_done, reject) => {
      signal?.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); });
    }), onRoute: r => records.push(r) });
    const controller = new AbortController();
    const pending = router.route(task(), controller.signal);
    if (how === 'signal') controller.abort();
    if (how === 'complete') router.complete({ sessionId: 'session1', turnId: 'turn1', isAborted: true });
    if (how === 'close') router.close();
    await assert.rejects(pending, /cancelled/);
    assert.equal(aborted, true); assert.equal(records.length, 0); router.close();
  }
});

test('missing completion reports cannot exhaust the settled-route cache', async () => {
  const router = createClaudeRouter({ mode: 'pinned', model: 'sonnet' });
  for (let i = 0; i < 130; i++) assert.equal((await router.route(task('turn' + i))).model, 'sonnet');
  await assert.rejects(router.route(task('turn0')), /already completed/);
  router.close();
});

test('cancellation before routing is tombstoned and cancelled text never enters later classifier context', async () => {
  const requests = [];
  const router = createClaudeRouter({ mode: 'auto', model: 'sonnet', classifier: async request => { requests.push(JSON.parse(request.input)); return result(); } });
  router.complete({ sessionId: 'session1', turnId: 'early', isAborted: true });
  await assert.rejects(router.route(task('early', 'cancelled early')), /already completed/);
  await router.route(task('late', 'cancelled after classification'));
  router.complete({ sessionId: 'session1', turnId: 'late', isAborted: true });
  await router.route(task('new', 'next task'));
  assert.deepEqual(requests.at(-1).previousUserTasks, []);
  router.close();
});

test('completion records are allowlisted and duplicates do not double count', async () => {
  const records = [];
  const router = createClaudeRouter({ mode: 'pinned', model: 'sonnet', onComplete: r => records.push(r) });
  await router.route(task());
  const complete = { sessionId: 'session1', turnId: 'turn1', isAborted: false, answer: 'PRIVATE', usage: { ...usage, secret: 'PRIVATE' } };
  router.complete(complete); router.complete(complete);
  assert.deepEqual(records, [{ isAborted: false, usage }]);
  await assert.rejects(router.route(task()), /already completed/);
  await router.route(task('turn2'));
  router.complete({ ...complete, turnId: 'turn2', usage: { ...usage, model: 'PRIVATE data' } });
  assert.deepEqual(records[1], { isAborted: false, usageUnavailable: true }); router.close();
});

test('local bridge authenticates, rejects browser origins/malformed input, never leaks diagnostics', async () => {
  const token = 'a'.repeat(64); let ready = 0, calls = 0;
  const bridge = await startClaudeBridge({ token, mode: 'auto', model: 'sonnet', classifier: async () => { calls++; return result(); }, onReady: () => ready++ });
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  try {
    assert.match(bridge.endpoint, /^http:\/\/127\.0\.0\.1:/);
    assert.equal((await fetch(bridge.endpoint + '/health')).status, 403);
    assert.equal((await fetch(bridge.endpoint + '/health', { headers: { ...headers, Origin: 'http://evil.test' } })).status, 403);
    assert.deepEqual(await (await fetch(bridge.endpoint + '/health', { headers })).json(), { protocol: 1 });
    assert.equal(ready, 1);
    assert.equal((await fetch(bridge.endpoint + '/route', { method: 'POST', headers, body: '{"PRIVATE":' })).status, 400);
    const response = await fetch(bridge.endpoint + '/route', { method: 'POST', headers, body: JSON.stringify(task()) });
    assert.equal((await response.json()).model, 'haiku'); assert.equal(calls, 1);
    assert.equal((await fetch(bridge.endpoint + '/complete', { method: 'POST', headers, body: JSON.stringify({ sessionId: 'session1', turnId: 'turn1', isAborted: false, usage }) })).status, 200);
    assert.equal((await fetch(bridge.endpoint + '/route?token=x', { method: 'POST', headers, body: '{}' })).status, 404);
  } finally { await bridge.close(); }
});

test('private Claude usage contains metadata only and reports native token fields without savings claims', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'claude-usage-'));
  try {
    protectPrivatePathSync(directory, true);
    const log = createClaudeUsage(directory);
    const router = createClaudeRouter({ mode: 'auto', model: 'sonnet', classifier: async () => ({ ...result(), usage: { inputTokens: 7, outputTokens: 1 } }), onRoute: log.route, onComplete: log.complete });
    await router.route(task('turn1', 'PRIVATE TASK'));
    router.complete({ sessionId: 'session1', turnId: 'turn1', isAborted: false, usage });
    log.close(); router.close();
    const text = await readFile(log.path!, 'utf8');
    assert.doesNotMatch(text, /PRIVATE TASK|session1|turn1/);
    assert.equal(log.snapshot().tokens.input_tokens, 4);
    let output = ''; assert.equal(runClaudeReport([], directory, text => { output += text; }), 0);
    assert.match(output, /1 decisions, 1 classifications/); assert.match(output, /no quota\/savings estimate/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

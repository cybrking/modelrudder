import test from 'node:test';
import assert from 'node:assert/strict';
import { recommend, recommendationNote, advisoryTimeoutMs } from '../src/advisory.ts';
import type { AdvisoryProvider } from '../src/advisory.ts';
import type { Classifier, Profile } from '../src/types.ts';

const consent = { ALLOW_JEV_CLASSIFICATION: 'true', SMART_CODEX_CLASSIFIER: 'direct' };
const decision = (profile: Profile) => ({ profile, confidence: null });

test('advice covers every provider profile and never exposes provider extras', () => {
  const mappings = {
    codex: { FAST: 'gpt-6-luna', BALANCED: 'gpt-6-luna', DEEP: 'gpt-6.1-sol', MAX: 'gpt-6-astra' },
    claude: { FAST: 'haiku', BALANCED: 'sonnet', DEEP: 'sonnet', MAX: 'opus' },
  };
  for (const provider of ['codex', 'claude'] as const) {
    for (const profile of ['FAST', 'BALANCED', 'DEEP', 'MAX'] as const) {
      const raw = { ...decision(profile), explanation: 'PRIVATE PROVIDER TEXT', model: 'untrusted-model' };
      const note = recommendationNote(provider, raw, 'different-model');
      assert.equal(note, `ModelRudder suggests ${mappings[provider][profile]} for this task. Use /model if you want to switch; your current model is unchanged.`);
      assert.equal(recommendationNote(provider, raw, mappings[provider][profile]), null);
    }
  }
});

test('Claude family aliases, full versions and context suffixes compare as the same model', () => {
  for (const [profile, family] of [['FAST', 'haiku'], ['DEEP', 'sonnet'], ['MAX', 'opus']] as const) {
    for (const current of [family, `${family}[1m]`, `claude-${family}-5-5`, `claude-${family}-4-5-20251001[1m]`]) {
      assert.equal(recommendationNote('claude', decision(profile), current), null, current);
    }
  }
});

test('only the supplied task reaches the classifier; same-model advice stays silent', async () => {
  const requests: unknown[] = [];
  const classifier: Classifier = async (request, signal) => {
    requests.push(JSON.parse(request.input));
    assert.ok(signal instanceof AbortSignal);
    return decision('DEEP');
  };
  assert.equal(await recommend('codex', 'Debug the queue', 'gpt-6.1-sol', consent, classifier), null);
  assert.deepEqual(requests, [{ previousUserTasks: [], currentTask: 'Debug the queue' }]);
});

test('missing or disabled consent, invalid consent and unsupported Claude gateway never classify', async () => {
  let calls = 0;
  const classifier: Classifier = async () => { calls++; return decision('FAST'); };
  for (const env of [{}, { ...consent, ALLOW_CLASSIFICATION: 'false' },
    { ...consent, ALLOW_CLASSIFICATION: 'bad' }, { ...consent, ALLOW_JEV_CLASSIFICATION: 'false' }]) {
    assert.equal(await recommend('codex', 'Task', 'gpt-6-astra', env, classifier), null);
  }
  assert.equal(await recommend('claude', 'Task', 'opus', { ...consent, SMART_CODEX_CLASSIFIER: 'hosted' }, classifier), null);
  assert.equal(calls, 0);
});

test('invalid or unsupported input is withheld before classification', async () => {
  let calls = 0;
  const classifier: Classifier = async () => { calls++; return decision('FAST'); };
  for (const task of ['', '  ', 'x'.repeat(64001), '/model opus', ' !git status', 'Review @private.txt', null]) {
    assert.equal(await recommend('codex', task as string, 'gpt-6-astra', consent, classifier), null);
  }
  for (const model of ['', 'bad\nmodel', 'x'.repeat(129), null]) {
    assert.equal(await recommend('codex', 'Task', model as string, consent, classifier), null);
  }
  assert.equal(await recommend('other' as AdvisoryProvider, 'Task', 'opus', consent, classifier), null);
  assert.equal(calls, 0);
});

test('classifier rejection and invalid results fail open without exposing diagnostics', async () => {
  const classifiers: Classifier[] = [async () => { throw new Error('SECRET'); },
    ...[null, {}, { profile: 'PRIVATE', confidence: null }, { profile: 'FAST', confidence: 2 }].map(raw => async () => raw)];
  for (const classifier of classifiers) {
    assert.equal(await recommend('codex', 'Task', 'gpt-6-astra', consent, classifier), null);
  }
});

test('deadline bounds a classifier that ignores cancellation and discards its late result', async () => {
  let signal: AbortSignal | undefined;
  let finish!: (result: unknown) => void;
  const classifier: Classifier = async (_request, cancellation) => {
    signal = cancellation;
    return new Promise(resolve => { finish = resolve; });
  };
  const started = performance.now();
  assert.equal(await recommend('codex', 'Task', 'gpt-6-astra', consent, classifier), null);
  assert.ok(performance.now() - started < advisoryTimeoutMs + 1500);
  assert.equal(signal?.aborted, true);
  finish(decision('FAST'));
});

test('outer hook cancellation aborts an in-flight classifier before its own deadline', async () => {
  const controller = new AbortController();
  let observed: AbortSignal | undefined;
  const classifier: Classifier = async (_request, signal) => {
    observed = signal;
    controller.abort();
    return new Promise(() => {});
  };
  assert.equal(await recommend('codex', 'Task', 'gpt-6-astra', consent, classifier, controller.signal), null);
  assert.equal(observed?.aborted, true);
});

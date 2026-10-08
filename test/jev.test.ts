import test from 'node:test';
import assert from 'node:assert/strict';
import { createJevClassifier } from '../src/adapters/jev.ts';

const valid = () => ({ model: 'jev-1.13.0', usage: { input_tokens: 318, output_tokens: 34 },
  answers: { route: { type: 'choice', choice: 'FAST', confidence: 0.81,
    probabilities: { FAST: 0.88, BALANCED: 0.12, DEEP: 0, MAX: 0 } } } });

test('Jev preserves numeric observation evidence without prompt or provider extras', async () => {
  const raw = { ...valid(), private: 'Secret provider payload' };
  const classifier = createJevClassifier({ apiKey: 'test', fetch: async () => Response.json(raw) });
  assert.deepEqual(await classifier({ input: 'Private task' }), {
    profile: 'FAST', confidence: null, reportedConfidence: 0.81,
    probabilities: valid().answers.route.probabilities,
    servedModel: 'jev-1.13.0',
    usage: { inputTokens: 318, outputTokens: 34 },
  });
});

test('Jev rejects contradictory distributions and malformed confidence or usage', async () => {
  const malformed = [
    { ...valid(), answers: { route: { ...valid().answers.route, choice: 'BALANCED' } } },
    { ...valid(), answers: { route: { ...valid().answers.route, probabilities: { FAST: 0.8, BALANCED: 0.1, DEEP: 0, MAX: 0 } } } },
    { ...valid(), answers: { route: { ...valid().answers.route, probabilities: { ...valid().answers.route.probabilities, UNKNOWN: 0 } } } },
    ...[undefined, null, -1, 1.1, '0.81'].map(confidence => ({ ...valid(), answers: { route: { ...valid().answers.route, confidence } } })),
    ...[undefined, null, {}, { input_tokens: -1, output_tokens: 3 }, { input_tokens: 1.2, output_tokens: 3 },
      { input_tokens: 3, output_tokens: '4' }].map(usage => ({ ...valid(), usage })),
  ];
  for (const raw of malformed) {
    const classifier = createJevClassifier({ apiKey: 'test', fetch: async () => Response.json(raw) });
    await assert.rejects(classifier({ input: 'Task' }), /Invalid Jev/);
  }
});

test('Jev accepts tied maximum choices and floating point rounding', async () => {
  const raw = valid();
  raw.answers.route.probabilities = { FAST: 0.3333333, BALANCED: 0.3333333, DEEP: 0.3333333, MAX: 0 };
  const classifier = createJevClassifier({ apiKey: 'test', fetch: async () => Response.json(raw) });
  assert.equal((await classifier({ input: 'Task' }) as { profile: string }).profile, 'FAST');
});

test('Jev accepts historical missing model identity but rejects unsafe served identity', async () => {
  const old: any = valid(); delete old.model;
  const classifier = createJevClassifier({ apiKey: 'test', fetch: async () => Response.json(old) });
  assert.equal(Object.hasOwn(await classifier({ input: 'Task' }) as object, 'servedModel'), false);
  for (const model of [null, 123, 'PRIVATE_PROVIDER_PAYLOAD', 'jev-1.13.0\n', 'jev-', `jev-${'a'.repeat(65)}`]) {
    const invalid = createJevClassifier({ apiKey: 'test', fetch: async () => Response.json({ ...valid(), model }) });
    await assert.rejects(invalid({ input: 'Task' }), { message: 'Invalid Jev model response' });
  }
});

test('Jev timeout bounds response body reads even when transport ignores abort', async () => {
  let signal: AbortSignal | null | undefined;
  const classifier = createJevClassifier({ apiKey: 'test', timeoutMs: 10, fetch: async (_url, init) => {
    signal = init?.signal;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')); } }));
  } });
  await assert.rejects(classifier({ input: 'Task' }), { message: 'Jev request failed' });
  assert.equal(signal?.aborted, true);
});

test('Jev redacts malformed JSON and thrown transport diagnostics', async () => {
  for (const transport of [async () => new Response('Secret payload'), async () => { throw new Error('Secret key and task'); }]) {
    const classifier = createJevClassifier({ apiKey: 'test', fetch: transport });
    await assert.rejects(classifier({ input: 'Private task' }), { message: 'Jev request failed' });
  }
});

test('pinned evaluation version is sent and missing or differing served revisions fail closed', async () => {
  let requested: string | undefined;
  const classifier = createJevClassifier({ apiKey: 'test', model: 'jev-1.13.0', fetch: async (_url, init) => {
    requested = JSON.parse(String(init?.body)).model;
    return Response.json(valid());
  } });
  await classifier({ input: 'public synthetic task' });
  assert.equal(requested, 'jev-1.13.0');
  for (const model of [undefined, 'jev-1.14.0']) {
    const mismatch = createJevClassifier({ apiKey: 'test', model: 'jev-1.13.0',
      fetch: async () => Response.json({ ...valid(), model }) });
    await assert.rejects(mismatch({ input: 'task' }), /served model/);
  }
  assert.throws(() => createJevClassifier({ apiKey: 'test', model: 'untrusted' }), /model/);
});

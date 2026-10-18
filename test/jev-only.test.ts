import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { readClassifierConfig, classifierOverride, classificationEnabled } from '../src/classifier.ts';
import { runSetup } from '../src/setup.ts';
import { isPrivatePathSync, protectPrivatePathSync } from '../src/private-files.ts';

test('removed and unknown classifiers cannot activate or silently fall back to Jev', () => {
  for (const provider of ['tev', 'unknown']) {
    const env = { SMART_CODEX_CLASSIFIER: provider, TYPESAFE_API_KEY: 'PRIVATE_FIXTURE',
      ALLOW_CLASSIFICATION: 'true', ALLOW_JEV_CLASSIFICATION: 'true' };
    assert.throws(() => readClassifierConfig(env), /SMART_CODEX_CLASSIFIER/);
    assert.equal(classificationEnabled(env), false);
  }
  assert.equal(classificationEnabled({ ALLOW_CLASSIFICATION: 'true' }), false);
  assert.equal(classificationEnabled({ ALLOW_JEV_CLASSIFICATION: 'true' }), true);
});

test('session classifier override accepts only Jev and preserves native arguments after --', () => {
  const env = { SMART_CODEX_CLASSIFIER: 'tev', ALLOW_CLASSIFICATION: 'true' };
  for (const args of [['--classifier=jev'], ['--classifier', 'jev']]) {
    const result = classifierOverride([...args, '--routing', 'observe', '--', '--classifier=tev'], env);
    assert.equal(result.env.SMART_CODEX_CLASSIFIER, 'direct');
    assert.equal(env.SMART_CODEX_CLASSIFIER, 'tev');
    assert.equal(classificationEnabled(result.env), false);
    assert.deepEqual(result.args, ['--routing', 'observe', '--', '--classifier=tev']);
  }
  for (const args of [['--classifier'], ['--classifier', 'tev'], ['--classifier=tev'],
    ['--classifier', 'unknown'], ['--classifier', 'jev', '--classifier=jev']]) {
    assert.throws(() => classifierOverride(args, env), /classifier/);
  }
});

test('legacy setup requires explicit migration, a key and Jev consent before changing private configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-jev-migration-'));
  try {
    const file = join(directory, 'env');
    const env = { SMART_CODEX_ENV_FILE: file };
    const legacy = 'SMART_CODEX_CLASSIFIER=tev\nALLOW_CLASSIFICATION=true\n  SMART_CODEX_TEV_URL=http://127.0.0.1:11434\n  export SMART_CODEX_TEV_MODEL=tev1:latest\nOTHER="keep this"\n';
    let output = '';
    const out = (text: string) => { output += text; };
    for (const credentials of ['', 'TYPESAFE_API_KEY=PRIVATE_FIXTURE\n', 'ALLOW_JEV_CLASSIFICATION=true\n']) {
      const saved = legacy + credentials;
      await writeFile(file, saved, { mode: 0o600 }); protectPrivatePathSync(file);
      assert.equal(await runSetup(['--classifier', 'jev', '--no-open'], env, out), 1);
      assert.equal(await readFile(file, 'utf8'), saved);
    }
    const ready = legacy + 'TYPESAFE_API_KEY=PRIVATE_FIXTURE\nALLOW_JEV_CLASSIFICATION=true\n';
    await writeFile(file, ready);
    assert.equal(await runSetup(['--no-open'], env, out), 1);
    assert.equal(await readFile(file, 'utf8'), ready);
    await assert.rejects(runSetup(['--classifier', 'tev', '--no-open'], env, out), /classifier/);
    assert.equal(await readFile(file, 'utf8'), ready);
    assert.equal(await runSetup(['--classifier', 'jev', '--no-open'], env, out), 0);
    const saved = parseEnv(await readFile(file, 'utf8'));
    assert.equal(saved.SMART_CODEX_CLASSIFIER, 'direct');
    assert.equal(saved.SMART_CODEX_TEV_URL, undefined);
    assert.equal(saved.SMART_CODEX_TEV_MODEL, undefined);
    assert.equal(saved.TYPESAFE_API_KEY, 'PRIVATE_FIXTURE');
    assert.equal(saved.ALLOW_JEV_CLASSIFICATION, 'true');
    assert.equal(saved.OTHER, 'keep this');
    assert.equal(classificationEnabled(saved), true);
    assert.equal(isPrivatePathSync(file), true);
    assert.ok(!output.includes('PRIVATE_FIXTURE'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('both launchers retain their Jev rubrics and new usage records identify Jev', async t => {
  const { createConfiguredClassifier } = await import('../src/classifier.ts');
  const { createClaudeClassifier, claudeJevInput } = await import('../src/claude-classifier.ts');
  const { jevInput } = await import('../src/adapters/jev.ts');
  const { createSessionUsage } = await import('../src/session-usage.ts');
  const { createClaudeUsage } = await import('../src/claude-usage.ts');
  const requests: unknown[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    return Response.json({ model: 'jev-latest', answers: { route: { type: 'choice', choice: 'FAST', confidence: 0.9,
      probabilities: { FAST: 1, BALANCED: 0, DEEP: 0, MAX: 0 } } }, usage: { input_tokens: 10, output_tokens: 2 } });
  });
  const env = { TYPESAFE_API_KEY: 'PRIVATE_FIXTURE', ALLOW_JEV_CLASSIFICATION: 'true' };
  const codex = createConfiguredClassifier(env);
  const claude = createClaudeClassifier(env);
  await codex({ input: 'synthetic task' });
  await claude({ input: 'synthetic task' });
  assert.deepEqual(requests, [
    { model: 'jev-latest', ...jevInput('synthetic task') },
    { model: 'jev-latest', ...claudeJevInput('synthetic task') },
  ]);
  assert.equal(codex.metadata.provider, 'jev');
  assert.equal(claude.metadata.provider, 'jev');
  assert.equal(createSessionUsage().snapshot().classifierProvider, 'jev');
  assert.equal(createClaudeUsage().snapshot().classifierProvider, 'jev');
});

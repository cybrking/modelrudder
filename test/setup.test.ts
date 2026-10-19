import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseEnv, promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runSetup, setupTemplate, startEditor } from '../src/setup.ts';
import { isPrivatePathSync, protectPrivatePathSync } from '../src/private-files.ts';
import { readLiveConfig } from '../src/live-config.ts';

test('setup creates a private minimal disabled configuration, opens the file and never prints its contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-setup-'));
  try {
    const file = join(directory, "settings space 'quoted'", 'env');
    let output = ''; const opened: string[] = [];
    assert.equal(await runSetup([], { SMART_CODEX_ENV_FILE: file }, text => { output += text; }, async path => { opened.push(path); }), 0);
    const contents = await readFile(file, 'utf8');
    assert.equal(contents, setupTemplate);
    assert.equal(contents, 'TYPESAFE_API_KEY=\nALLOW_JEV_CLASSIFICATION=false\nSMART_CODEX_CLASSIFIER=direct\n');
    assert.deepEqual(opened, [file]);
    assert.equal(isPrivatePathSync(file), true);
    assert.equal(readLiveConfig({}).allowClassification, false);
    assert.ok(!output.includes('TYPESAFE_API_KEY='));
    await writeFile(file, 'TYPESAFE_API_KEY=PRIVATE_TEST_VALUE\n', { mode: 0o600 });
    protectPrivatePathSync(file);
    output = ''; opened.length = 0;
    await runSetup(['--no-open'], { SMART_CODEX_ENV_FILE: file }, text => { output += text; }, async path => { opened.push(path); });
    assert.equal(await readFile(file, 'utf8'), 'TYPESAFE_API_KEY=PRIVATE_TEST_VALUE\n');
    assert.ok(!output.includes('PRIVATE_TEST_VALUE'));
    assert.deepEqual(opened, []);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('setup rejects unknown options before writing configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-setup-invalid-'));
  try {
    const file = join(directory, 'env');
    await assert.rejects(runSetup(['--print-key'], { SMART_CODEX_ENV_FILE: file }), /only --no-open/);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('keeping settings exits without writing or opening an editor on new and existing installations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-switch-keep-'));
  try {
    const file = join(directory, 'env');
    const editor = async () => { throw new Error('Keep should not open an editor'); };
    assert.equal(await runSetup([], { SMART_CODEX_ENV_FILE: file }, () => {}, editor, async current => {
      assert.equal(current, 'Not configured'); return 'keep';
    }), 0);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
    const saved = 'SMART_CODEX_CLASSIFIER=direct\nOTHER=preserved\n';
    await writeFile(file, saved, { mode: 0o600 }); protectPrivatePathSync(file);
    assert.equal(await runSetup([], { SMART_CODEX_ENV_FILE: file }, () => {}, editor, async () => 'keep'), 0);
    assert.equal(await readFile(file, 'utf8'), saved);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('choosing direct Jev preserves a working gateway until direct credentials and consent are ready', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-switch-gateway-'));
  try {
    const file = join(directory, 'env');
    const saved = 'SMART_CODEX_CLASSIFIER=hosted\nSMART_CODEX_GATEWAY_URL=https://gateway.example\nSMART_CODEX_GATEWAY_TOKEN=PRIVATE_GATEWAY_FIXTURE\nALLOW_JEV_CLASSIFICATION=true\n';
    await writeFile(file, saved, { mode: 0o600 }); protectPrivatePathSync(file);
    const opened: string[] = []; let output = '';
    const out = (text: string) => { output += text; };
    const choose = async (current: string): Promise<'jev'> => {
      assert.equal(current, 'Jev (hosted gateway)'); return 'jev';
    };
    assert.equal(await runSetup([], { SMART_CODEX_ENV_FILE: file }, out, async path => { opened.push(path); }, choose), 1);
    assert.equal(await readFile(file, 'utf8'), saved);
    assert.deepEqual(opened, [file]);
    assert.match(output, /gateway selection preserved/);
    assert.ok(!output.includes('PRIVATE_GATEWAY_FIXTURE'));
    const ready = saved + 'TYPESAFE_API_KEY=PRIVATE_DIRECT_FIXTURE\n';
    await writeFile(file, ready);
    assert.equal(await runSetup([], { SMART_CODEX_ENV_FILE: file }, out,
      async () => { throw new Error('Ready Jev should not open an editor'); }, choose), 0);
    const direct = parseEnv(await readFile(file, 'utf8'));
    assert.equal(direct.SMART_CODEX_CLASSIFIER, 'direct');
    assert.equal(direct.SMART_CODEX_GATEWAY_TOKEN, 'PRIVATE_GATEWAY_FIXTURE');
    assert.ok(!output.includes('PRIVATE_DIRECT_FIXTURE'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('editing stays available and explicit or noninteractive setup never prompts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-switch-edit-'));
  try {
    const file = join(directory, 'env'); const opened: string[] = [];
    const env = { SMART_CODEX_ENV_FILE: file };
    const editor = async (path: string) => { opened.push(path); };
    assert.equal(await runSetup([], env, () => {}, editor, async () => 'edit'), 0);
    assert.deepEqual(opened, [file]);
    assert.equal(await readFile(file, 'utf8'), setupTemplate);
    const unexpectedPrompt = async (): Promise<never> => { throw new Error('Should not prompt'); };
    assert.equal(await runSetup(['--no-open'], env, () => {}, editor, unexpectedPrompt), 0);
    await writeFile(file, 'TYPESAFE_API_KEY=PRIVATE_FIXTURE\nALLOW_JEV_CLASSIFICATION=true\nSMART_CODEX_CLASSIFIER=direct\n');
    assert.equal(await runSetup(['--classifier', 'jev'], env, () => {}, editor, unexpectedPrompt), 0);
    assert.deepEqual(opened, [file]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test('editor launch rejects a process that starts but exits unsuccessfully', async () => {
  await assert.rejects(startEditor(process.execPath, ['-e', 'process.exit(23)']), /Could not start editor/);
});

test('editor launch accepts successful handoff and missing executables fail safely', async () => {
  await startEditor(process.execPath, ['-e', 'process.exit(0)']);
  await assert.rejects(startEditor('missing-editor-for-fixture', []), /Could not start editor/);
});

test('Jev setup preserves a saved classification kill switch and reports disabled routing', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-disabled-'));
  try {
    const file = join(directory, 'env');
    for (const override of [undefined, 'false', 'true']) {
      const saved = 'SMART_CODEX_CLASSIFIER=direct\nTYPESAFE_API_KEY=PRIVATE_FIXTURE\nALLOW_JEV_CLASSIFICATION=true\nALLOW_CLASSIFICATION=false\n';
      await writeFile(file, saved, { mode: 0o600 }); protectPrivatePathSync(file);
      let output = '';
      await runSetup(['--classifier', 'jev', '--no-open'], {
        SMART_CODEX_ENV_FILE: file, ...(override === undefined ? {} : { ALLOW_CLASSIFICATION: override }),
      }, text => { output += text; });
      assert.equal(parseEnv(await readFile(file, 'utf8')).ALLOW_CLASSIFICATION, 'false');
      assert.match(output, /disabled/);
      assert.doesNotMatch(output, /Hosted classification enabled/);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('a setup-only kill switch stays disabled in a fresh process for both launchers', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-transient-disabled-'));
  const run = promisify(execFile);
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  // Deliberately exclude inherited router settings, credentials and Node options.
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR,
    HOME: directory, USERPROFILE: directory, TMPDIR: directory, TEMP: directory, TMP: directory };
  try {
    const file = join(directory, 'env');
    for (const launcher of ['smart-codex', 'smart-claude']) {
      for (const previous of ['', 'ALLOW_CLASSIFICATION=true\n', 'ALLOW_CLASSIFICATION=false\n']) {
        const saved = 'SMART_CODEX_CLASSIFIER=direct\nTYPESAFE_API_KEY=SYNTHETIC_FIXTURE\nALLOW_JEV_CLASSIFICATION=true\nOTHER=preserved\n' + previous;
        await writeFile(file, saved, { mode: 0o600 }); protectPrivatePathSync(file);
        const setup = await run(process.execPath, [`--env-file=${file}`, '--', `src/${launcher}.ts`,
          'setup', '--classifier', 'jev', '--no-open'], {
          cwd, env: { ...env, SMART_CODEX_ENV_FILE: file, ALLOW_CLASSIFICATION: 'false' },
        });
        assert.match(setup.stdout, /Classification remains disabled/);
        assert.doesNotMatch(setup.stdout, /Hosted classification enabled|SYNTHETIC_FIXTURE/);
        // A genuinely new Node process loads only the saved file, without the transient flag.
        // Even the positive control uses a mock transport and synthetic task/credentials.
        const runtime = await run(process.execPath, [`--env-file=${file}`, '--input-type=module', '-e', `
          import { classificationEnabled, createConfiguredClassifier } from './src/classifier.ts';
          import { createClaudeClassifier } from './src/claude-classifier.ts';
          let calls = 0;
          globalThis.fetch = async () => {
            calls++;
            return Response.json({ model: 'jev-latest', answers: { route: { type: 'choice', choice: 'FAST',
              confidence: 0.9, probabilities: { FAST: 1, BALANCED: 0, DEEP: 0, MAX: 0 } } },
              usage: { input_tokens: 10, output_tokens: 2 } });
          };
          const enabled = classificationEnabled(process.env);
          let claudeBlocked = false;
          try { createClaudeClassifier(process.env); } catch { claudeBlocked = true; }
          if (enabled) await createConfiguredClassifier(process.env)({ input: 'synthetic task' });
          const disabledCalls = calls;
          await createConfiguredClassifier({ ...process.env, ALLOW_CLASSIFICATION: 'true' })({ input: 'synthetic control' });
          console.log(JSON.stringify({ enabled, claudeBlocked, disabledCalls, controlCalls: calls - disabledCalls }));
        `], { cwd, env });
        assert.deepEqual(JSON.parse(runtime.stdout), { enabled: false, claudeBlocked: true, disabledCalls: 0, controlCalls: 1 });
        const persisted = parseEnv(await readFile(file, 'utf8'));
        assert.equal(persisted.ALLOW_CLASSIFICATION, 'false');
        assert.equal(persisted.ALLOW_JEV_CLASSIFICATION, 'true');
        assert.equal(persisted.TYPESAFE_API_KEY, 'SYNTHETIC_FIXTURE');
        assert.equal(persisted.OTHER, 'preserved');
        assert.equal(isPrivatePathSync(file), true);
      }
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('keeping a retired provider does not open an editor or change configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-legacy-keep-'));
  try {
    const file = join(directory, 'env');
    const saved = 'SMART_CODEX_CLASSIFIER=tev\n';
    await writeFile(file, saved, { mode: 0o600 }); protectPrivatePathSync(file);
    let output = '';
    const result = await runSetup([], { SMART_CODEX_ENV_FILE: file }, text => { output += text; },
      async () => { assert.fail('Keeping settings must not launch an editor'); }, async () => 'keep');
    assert.equal(result, 1);
    assert.equal(await readFile(file, 'utf8'), saved);
    assert.match(output, /setup --classifier jev/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

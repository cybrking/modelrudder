import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseEnv } from 'node:util';
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

test('interactive setup switches an existing provider in both directions without opening a ready configuration', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-switch-'));
  try {
    const file = join(directory, 'env');
    await writeFile(file, 'TYPESAFE_API_KEY=PRIVATE_TEST_VALUE\nALLOW_JEV_CLASSIFICATION=true\nSMART_CODEX_CLASSIFIER=direct\nOTHER="keep this"\n', { mode: 0o600 });
    protectPrivatePathSync(file);
    let output = ''; const current: string[] = []; let checks = 0;
    const out = (text: string) => { output += text; };
    const editor = async () => { throw new Error('Ready provider switching should not open an editor'); };
    const inspect = async () => { checks++; return { ready: true, message: 'Tev available' }; };
    assert.equal(await runSetup([], { SMART_CODEX_ENV_FILE: file }, out, editor, inspect, async label => {
      current.push(label); return 'tev';
    }), 0);
    const tev = parseEnv(await readFile(file, 'utf8'));
    assert.equal(tev.SMART_CODEX_CLASSIFIER, 'tev');
    assert.equal(tev.ALLOW_CLASSIFICATION, 'true');
    assert.equal(checks, 1);
    assert.equal(await runSetup([], { ...tev, SMART_CODEX_ENV_FILE: file }, out, editor, inspect, async label => {
      current.push(label); return 'jev';
    }), 0);
    const jev = parseEnv(await readFile(file, 'utf8'));
    assert.equal(jev.SMART_CODEX_CLASSIFIER, 'direct');
    assert.equal(jev.TYPESAFE_API_KEY, 'PRIVATE_TEST_VALUE');
    assert.equal(jev.ALLOW_JEV_CLASSIFICATION, 'true');
    assert.equal(jev.OTHER, 'keep this');
    assert.deepEqual(current, ['Jev (hosted)', 'Tev (local)']);
    assert.match(output, /Restart sessions/);
    assert.ok(!output.includes('PRIVATE_TEST_VALUE'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('interactive setup preserves the selected provider when the replacement is not ready', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-switch-unready-'));
  try {
    const file = join(directory, 'env');
    const jev = 'SMART_CODEX_CLASSIFIER=direct\n';
    await writeFile(file, jev, { mode: 0o600 }); protectPrivatePathSync(file);
    const env = { SMART_CODEX_ENV_FILE: file };
    assert.equal(await runSetup([], env, () => {}, async () => {}, async () => ({ ready: false, message: 'Tev unavailable' }), async () => 'tev'), 1);
    assert.equal(await readFile(file, 'utf8'), jev);
    const tev = 'SMART_CODEX_CLASSIFIER=tev\nALLOW_CLASSIFICATION=true\n';
    await writeFile(file, tev);
    const opened: string[] = [];
    assert.equal(await runSetup([], env, () => {}, async path => { opened.push(path); }, undefined, async () => 'jev'), 1);
    assert.equal(await readFile(file, 'utf8'), tev);
    assert.deepEqual(opened, [file]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('keeping settings exits without writing or opening an editor on new and existing installations', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-switch-keep-'));
  try {
    const file = join(directory, 'env');
    const editor = async () => { throw new Error('Keep should not open an editor'); };
    assert.equal(await runSetup([], { SMART_CODEX_ENV_FILE: file }, () => {}, editor, undefined, async current => {
      assert.equal(current, 'Not configured'); return 'keep';
    }), 0);
    await assert.rejects(readFile(file), { code: 'ENOENT' });
    const saved = 'SMART_CODEX_CLASSIFIER=tev\nOTHER=preserved\n';
    await writeFile(file, saved, { mode: 0o600 }); protectPrivatePathSync(file);
    assert.equal(await runSetup([], { SMART_CODEX_ENV_FILE: file }, () => {}, editor, undefined, async () => 'keep'), 0);
    assert.equal(await readFile(file, 'utf8'), saved);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('editing stays available and explicit or noninteractive setup never prompts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-switch-edit-'));
  try {
    const file = join(directory, 'env'); const opened: string[] = [];
    const env = { SMART_CODEX_ENV_FILE: file };
    const editor = async (path: string) => { opened.push(path); };
    assert.equal(await runSetup([], env, () => {}, editor, undefined, async () => 'edit'), 0);
    assert.deepEqual(opened, [file]);
    assert.equal(await readFile(file, 'utf8'), setupTemplate);
    const unexpectedPrompt = async (): Promise<never> => { throw new Error('Should not prompt'); };
    assert.equal(await runSetup(['--no-open'], env, () => {}, editor, undefined, unexpectedPrompt), 0);
    assert.equal(await runSetup(['--classifier', 'tev'], env, () => {}, editor,
      async () => ({ ready: true, message: 'available' }), unexpectedPrompt), 0);
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

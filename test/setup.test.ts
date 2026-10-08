import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runSetup, setupTemplate } from '../src/setup.ts';
import { isPrivatePathSync, protectPrivatePathSync } from '../src/private-files.ts';
import { readLiveConfig } from '../src/live-config.ts';

test('setup creates a private fully commented template, opens the file and never prints its contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-setup-'));
  try {
    const file = join(directory, "settings space 'quoted'", 'env');
    let output = ''; const opened: string[] = [];
    assert.equal(await runSetup([], { SMART_CODEX_ENV_FILE: file }, text => { output += text; }, async path => { opened.push(path); }), 0);
    const contents = await readFile(file, 'utf8');
    assert.equal(contents, setupTemplate);
    assert.ok(contents.split('\n').every(line => !line.trim() || line.startsWith('#')));
    assert.ok(contents.includes('https://console.typesafe.ai/keys'));
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

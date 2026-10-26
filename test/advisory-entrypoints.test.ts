import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, delimiter, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifierStatus } from '../src/setup.ts';

test('public doctor and subcommand help use PATH native entrypoints without managed installation', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const directory = await mkdtemp(join(tmpdir(), 'advisory-doctor-'));
  try {
    const marker = join(directory, 'calls.json');
    const script = `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.TEST_CALLS, JSON.stringify(process.argv.slice(2))); console.log('codex-cli 0.164.0');\n`;
    await writeFile(join(directory, 'codex'), script, { mode: 0o700 });
    const npmEntry = join(directory, 'node_modules', '@openai', 'codex', 'bin');
    await mkdir(npmEntry, { recursive: true });
    await writeFile(join(npmEntry, 'codex.js'), script);
    const [node, ...args] = pkg.scripts.doctor.split(' ');
    assert.equal(node, 'node');
    let output = '';
    try {
      const result = await promisify(execFile)(process.execPath, args, { cwd: root,
        env: { ...process.env, PATH: [directory, dirname(process.execPath)].join(delimiter),
          SMART_CODEX_STATE_DIR: join(directory, 'no-managed-runtime'), TYPESAFE_API_KEY: 'fixture',
          SMART_CODEX_CLASSIFIER: 'direct', ALLOW_CLASSIFICATION: 'false', TEST_CALLS: marker }, timeout: 10000 });
      output = result.stdout;
    } catch (error) { output = (error as { stdout: string }).stdout; }
    assert.match(output, /Native codex on PATH starts/);
    assert.doesNotMatch(output, /Interactive routing:|Pinned mode|Text commands: observe/);
    assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')), ['--version']);
    for (const subcommand of ['exec', 'resume']) {
      await promisify(execFile)(process.execPath, ['src/smart-codex.ts', subcommand, '--help'], { cwd: root,
        env: { ...process.env, PATH: [directory, dirname(process.execPath)].join(delimiter),
          ALLOW_CLASSIFICATION: 'false', TEST_CALLS: marker }, timeout: 10000 });
      assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')), [subcommand, '--help']);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('classifier status never recommends retired pinned mode', async () => {
  for (const env of [{}, { TYPESAFE_API_KEY: 'fixture', ALLOW_CLASSIFICATION: 'false' }]) {
    const result = await classifierStatus(env);
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.text, /pinned mode/i);
    assert.match(result.text, /native launch/i);
  }
});

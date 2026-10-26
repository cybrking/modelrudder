import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { advisoryChildEnv, canAttachAdvisoryHook, parseRecommendation } from '../src/advisory-launcher.ts';

const exec = promisify(execFile);
const modulePath = fileURLToPath(new URL('../src/advisory-launcher.ts', import.meta.url));

test('Codex hook registration respects explicit hook config and the native argument separator', () => {
  const env = { ALLOW_JEV_CLASSIFICATION: 'true' };
  for (const args of [['-c', 'hooks.UserPromptSubmit=[]'], ['--config', 'hooks.UserPromptSubmit=[]'],
    ['--config=hooks.UserPromptSubmit=[]'], ['-chooks.UserPromptSubmit=[]'], ['--config', 'hooks={}'],
    ['--config', 'features.hooks=false'], ['--config=features.hooks=false'], ['-cfeatures.hooks=false'],
    ['--disable', 'hooks'], ['--enable', 'hooks'], ['--disable=hooks'],
    ['-c', ' "hooks".UserPromptSubmit=[]'], ['--config', "'hooks'.UserPromptSubmit=[]"],
    ['-c=hooks.UserPromptSubmit=[]'], ['--remote', 'unix:///tmp/native.sock'], ['--remote=ws://127.0.0.1:7777']]) {
    assert.equal(canAttachAdvisoryHook(args, env), false, JSON.stringify(args));
  }
  assert.equal(canAttachAdvisoryHook(['--model', 'gpt-6-astra'], env), true);
  assert.equal(canAttachAdvisoryHook(['--', '--config=hooks.UserPromptSubmit=[]'], env), true);
  assert.equal(canAttachAdvisoryHook([], { ...env, ALLOW_CLASSIFICATION: 'false' }), false);
  assert.equal(canAttachAdvisoryHook([], { ...env, ALLOW_CLASSIFICATION: 'invalid' }), false);
});

test('Codex session hook receives private paths, keeps native arguments, and cleans state on exit or spawn error',
  { skip: process.platform === 'win32' }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'modelrudder-hook-launch-'));
    try {
      const marker = join(directory, 'native.json');
      const config = join(directory, 'private.env');
      const executable = join(directory, 'codex');
      await writeFile(config, 'TYPESAFE_API_KEY=SYNTHETIC_PRIVATE_KEY\nALLOW_JEV_CLASSIFICATION=true\n', { mode: 0o600 });
      await writeFile(executable, `#!${process.execPath}\nconst fs = require('node:fs');
const state = process.env.MODEL_RUDDER_ADVISORY_STATE_DIR;
fs.writeFileSync(process.env.TEST_MARKER, JSON.stringify({args: process.argv.slice(2), env: process.env,
  stateMode: state ? fs.statSync(state).mode & 0o777 : null}));\n`, { mode: 0o700 });
      const env = { PATH: directory, TEST_MARKER: marker, TMPDIR: directory, TEMP: directory, TMP: directory,
        SMART_CODEX_ENV_FILE: config, ALLOW_JEV_CLASSIFICATION: 'true', TYPESAFE_API_KEY: 'SYNTHETIC_PRIVATE_KEY' };
      const entry = fileURLToPath(new URL('../src/smart-codex.ts', import.meta.url));
      const args = ['--model', 'gpt-6-astra', '--', 'Task with $shell text'];
      const result = await exec(process.execPath, [entry, ...args], { env, timeout: 10000 });
      const seen = JSON.parse(await readFile(marker, 'utf8'));
      assert.equal(seen.args[0], '-c');
      assert.match(seen.args[1], /^hooks\.UserPromptSubmit=/);
      assert.equal(seen.args[2], '--no-daemon');
      assert.deepEqual(seen.args.slice(3), args);
      assert.equal(seen.env.MODEL_RUDDER_ADVISORY_ENV_FILE, config);
      assert.ok(seen.env.MODEL_RUDDER_ADVISORY_STATE_DIR.startsWith(directory));
      assert.equal(seen.stateMode, 0o700);
      assert.equal(seen.env.TYPESAFE_API_KEY, undefined);
      assert.equal(seen.env.ALLOW_JEV_CLASSIFICATION, undefined);
      assert.equal(seen.env.SMART_CODEX_ENV_FILE, undefined);
      assert.doesNotMatch(JSON.stringify(seen) + result.stdout + result.stderr, /SYNTHETIC_PRIVATE_KEY/);
      await assert.rejects(access(seen.env.MODEL_RUDDER_ADVISORY_STATE_DIR), { code: 'ENOENT' });

      for (const [nativeArgs, overrides] of [
        [args, { ALLOW_CLASSIFICATION: 'false' }],
        [args, { TYPESAFE_API_KEY: 'DIFFERENT_PRIVATE_KEY' }],
        [args, { SMART_CODEX_CLASSIFIER: 'hosted', SMART_CODEX_GATEWAY_URL: 'https://gateway.example/classify', SMART_CODEX_GATEWAY_TOKEN: 'x'.repeat(40) }],
        [['--config', 'hooks.UserPromptSubmit=[]', ...args], {}],
        [['--config=hooks.UserPromptSubmit=[]', ...args], {}],
      ] as const) {
        await exec(process.execPath, [entry, ...nativeArgs], { env: { ...env, ...overrides }, timeout: 10000 });
        const direct = JSON.parse(await readFile(marker, 'utf8'));
        assert.deepEqual(direct.args, nativeArgs);
        assert.equal(direct.env.MODEL_RUDDER_ADVISORY_STATE_DIR, undefined);
        assert.equal(direct.env.MODEL_RUDDER_ADVISORY_ENV_FILE, undefined);
      }

      await rm(executable);
      await assert.rejects(exec(process.execPath, [entry, ...args], { env, timeout: 10000 }),
        (error: any) => /could not start codex on PATH/.test(error.stderr));
      assert.deepEqual((await readdir(directory)).filter(name => name.startsWith('modelrudder-advisory-')), []);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

test('child environment preserves native authentication and removes only router settings', () => {
  const native = { PATH: '/bin', HOME: '/home/test', OPENAI_API_KEY: 'native-openai', ANTHROPIC_API_KEY: 'native-claude',
    ANTHROPIC_BASE_URL: 'https://native.example', DISABLE_AUTOUPDATER: '0', KEEP: 'yes' };
  assert.deepEqual(advisoryChildEnv({ ...native, TYPESAFE_API_KEY: 'secret', ALLOW_CLASSIFICATION: 'true',
    ALLOW_JEV_CLASSIFICATION: 'true', ROUTER_MODE: 'auto', SMART_CODEX_STATE_DIR: '/state', SMART_CLAUDE_MODEL: 'opus',
    MODEL_RUDDER_RELAY_TOKEN: 'secret', typesafe_api_key: 'case-insensitive-secret' }), native);
});

test('recommendation arguments require an explicit current model and bounded quoted task', () => {
  assert.deepEqual(parseRecommendation(['--current-model', 'claude-opus-5[1m]', '--', 'Review architecture']),
    { currentModel: 'claude-opus-5[1m]', task: 'Review architecture' });
  for (const args of [[], ['--current-model', 'opus', 'task'], ['--current-model', 'bad\nmodel', '--', 'task'],
    ['--current-model', 'opus', '--', ' '], ['--current-model', 'opus', '--', 'x'.repeat(64001)],
    ['--current-model', 'opus', '--', 'task', 'extra']]) {
    assert.throws(() => parseRecommendation(args), /Usage: recommend/);
  }
});

test('Claude doctor rejects a hosted Codex classifier instead of reporting readiness', { skip: process.platform === 'win32' }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-claude-doctor-'));
  try {
    await writeFile(join(directory, 'claude'), `#!${process.execPath}\nconsole.log('2.1.303 (Claude Code)');\n`, { mode: 0o700 });
    const entry = fileURLToPath(new URL('../src/smart-claude.ts', import.meta.url));
    await assert.rejects(exec(process.execPath, [entry, 'doctor'], { env: {
      PATH: directory, ALLOW_JEV_CLASSIFICATION: 'true', SMART_CODEX_CLASSIFIER: 'hosted',
      SMART_CODEX_GATEWAY_URL: 'https://gateway.example/classify', SMART_CODEX_GATEWAY_TOKEN: 'x'.repeat(40),
    }, timeout: 10000 }), (error: any) => error.code === 1 && /Claude recommendations require direct Jev/.test(error.stdout));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

for (const provider of ['codex', 'claude'] as const) {
  const entry = fileURLToPath(new URL(`../src/smart-${provider}.ts`, import.meta.url));
  test(`${provider} public CLI defaults and resumes leave native model selection untouched`, { skip: process.platform === 'win32' }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'modelrudder-advisory-entry-'));
    try {
      const marker = join(directory, 'args.json');
      await writeFile(join(directory, provider), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.TEST_MARKER, JSON.stringify(process.argv.slice(2)));\n`, { mode: 0o700 });
      const env = { PATH: directory, TEST_MARKER: marker, ALLOW_CLASSIFICATION: 'false' };
      for (const args of [[], ['--model', 'user-chosen', '--', 'Task'],
        provider === 'codex' ? ['resume', '--last'] : ['--continue']]) {
        const result = await exec(process.execPath, [entry, ...args], { env, timeout: 10000 });
        assert.deepEqual(JSON.parse(await readFile(marker, 'utf8')), args);
        assert.match(result.stderr, /advisory/);
      }
      await assert.rejects(exec(process.execPath, [entry, '--routing', 'auto'], { env, timeout: 10000 }),
        (error: any) => /automatic routing is retired/.test(error.stderr) && !/at launchAdvisory/.test(error.stderr));
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test(`${provider} public recommendation command shows a verified provider result without a native CLI`, async () => {
    const exportName = provider === 'codex' ? 'launchSmartCodex' : 'launchSmartClaude';
    const program = `
      import assert from 'node:assert/strict';
      import { ${exportName} as launch } from ${JSON.stringify(entry)};
      let calls = 0;
      globalThis.fetch = async (_url, options) => {
        calls++;
        const request = JSON.parse(options.body);
        assert.deepEqual(JSON.parse(request.state), { previousUserTasks: [], currentTask: 'Design the queue' });
        return Response.json({ model: 'jev-1.13.0', usage: { input_tokens: 1, output_tokens: 1 },
          answers: { route: { type: 'choice', choice: 'MAX', confidence: 0.9,
            probabilities: { FAST: 0, BALANCED: 0, DEEP: 0, MAX: 1 } } } });
      };
      process.exitCode = await launch(['recommend', '--current-model', 'different-model', '--', 'Design the queue'], process.env);
      assert.equal(calls, 1);
    `;
    const result = await exec(process.execPath, ['--input-type=module', '-e', program], { env: {
      PATH: '', TYPESAFE_API_KEY: 'SYNTHETIC_FIXTURE', ALLOW_JEV_CLASSIFICATION: 'true', SMART_CODEX_CLASSIFIER: 'direct',
    }, timeout: 10000 });
    assert.match(result.stdout, new RegExp(`ModelRudder suggests ${provider === 'codex' ? 'gpt-6-astra' : 'opus'}`));
    assert.equal(result.stderr, '');
    assert.doesNotMatch(result.stdout, /SYNTHETIC_FIXTURE/);
  });

  test(`${provider} launches PATH CLI with exact native args and ignores an invalid managed installation`, { skip: process.platform === 'win32' }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'modelrudder-advisory-launch-'));
    try {
      const marker = join(directory, 'native.json');
      const state = join(directory, 'state');
      await mkdir(join(state, 'native', provider), { recursive: true });
      await writeFile(join(state, 'native', provider, 'selection.json'), 'invalid managed selection');
      await writeFile(join(directory, provider), `#!${process.execPath}\nrequire('node:fs').writeFileSync(process.env.TEST_MARKER, JSON.stringify({args: process.argv.slice(2), env: process.env}));\n`, { mode: 0o700 });
      const args = ['--model', 'my-native-model', '--', 'a task with "quotes" and $(not-a-command)'];
      const program = `import { launchAdvisory } from ${JSON.stringify(modulePath)}; process.exitCode = await launchAdvisory(${JSON.stringify(provider)}, ${JSON.stringify(args)}, process.env);`;
      const result = await exec(process.execPath, ['--input-type=module', '-e', program], { env: {
        PATH: directory, TEST_MARKER: marker, SMART_CODEX_STATE_DIR: state,
        TYPESAFE_API_KEY: 'synthetic-router-secret', ALLOW_JEV_CLASSIFICATION: 'true', ALLOW_CLASSIFICATION: 'false',
        OPENAI_API_KEY: 'synthetic-native-openai', ANTHROPIC_API_KEY: 'synthetic-native-claude', MODEL_RUDDER_RELAY_TOKEN: 'synthetic-token',
      }, timeout: 10000 });
      const seen = JSON.parse(await readFile(marker, 'utf8'));
      assert.deepEqual(seen.args, args);
      assert.equal(seen.env.OPENAI_API_KEY, 'synthetic-native-openai');
      assert.equal(seen.env.ANTHROPIC_API_KEY, 'synthetic-native-claude');
      assert.equal(seen.env.TYPESAFE_API_KEY, undefined);
      assert.equal(seen.env.MODEL_RUDDER_RELAY_TOKEN, undefined);
      assert.equal(seen.env.SMART_CODEX_STATE_DIR, undefined);
      assert.doesNotMatch(result.stdout + result.stderr, /synthetic-router-secret|synthetic-token/);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test(`${provider} explicit recommendation neither resolves nor launches a native CLI`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'modelrudder-advisory-explicit-'));
    try {
      const marker = join(directory, 'native-called');
      const result = await exec(process.execPath, [entry, 'recommend', '--current-model', 'opus', '--', 'Task'], {
        env: { PATH: '', ALLOW_CLASSIFICATION: 'false', TEST_MARKER: marker }, timeout: 10000,
      });
      assert.equal(result.stdout, '');
      assert.equal(result.stderr, '');
      await assert.rejects(access(marker), { code: 'ENOENT' });
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  test(`${provider} retired routing flags fail clearly before resolving the native CLI`, async () => {
    for (const args of [['--routing', 'auto'], ['--routing=observe'], ['--effort-mode', 'auto']]) {
      const program = `import { launchAdvisory } from ${JSON.stringify(modulePath)}; await launchAdvisory(${JSON.stringify(provider)}, ${JSON.stringify(args)}, process.env);`;
      await assert.rejects(exec(process.execPath, ['--input-type=module', '-e', program], { env: { PATH: '' }, timeout: 10000 }),
        (error: any) => /automatic routing is retired/.test(error.stderr) && /Native model and effort are unchanged/.test(error.stderr));
    }
  });
}

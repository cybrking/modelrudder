import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeChildEnv, claudeCompatibility, hasNativeClaudeLogin, validateClaudeAuthEnvironment } from '../src/claude-command.ts';
import { checkClaudeNative, nativeClaudeArgs, parseSmartClaudeArgs } from '../src/smart-claude.ts';

test('Claude argument parsing defaults auto and explicit models pin without ambiguous overrides', () => {
  assert.equal(parseSmartClaudeArgs([]).mode, 'auto');
  assert.equal(parseSmartClaudeArgs(['--model', 'opus']).mode, 'pinned');
  assert.deepEqual(parseSmartClaudeArgs(['--routing=observe', '--resume', 'abc', '--add-dir', '/a b', 'hello']).native, ['--resume', 'abc', '--add-dir', '/a b']);
  for (const args of [['--model', 'gpt'], ['--routing', 'bogus'], ['--model', 'haiku', '--routing', 'auto'], ['--routing=auto', '--routing=auto'], ['--model=opus', '-m', 'haiku'], ['one', 'two'], ['--', '--settings=evil'], ['--effort'], ['auth'], ['--settings', 'evil'], ['--dangerously-skip-permissions'], ['-p'], ['--permission-mode', 'bypassPermissions']]) {
    assert.throws(() => parseSmartClaudeArgs(args));
  }
  const parsed = parseSmartClaudeArgs(['--model', 'haiku', '--permission-mode', 'plan', 'literal $(echo x); &']);
  assert.deepEqual(nativeClaudeArgs(parsed, '/plugins with spaces'), ['--permission-mode', 'plan', '--model', 'claude-haiku-5-5', '--plugin-dir', '/plugins with spaces', 'literal $(echo x); &']);
  assert.deepEqual(nativeClaudeArgs(parseSmartClaudeArgs(['--resume', 'abc']), '/plugin'), ['--resume', 'abc', '--plugin-dir', '/plugin']);
  assert.ok(nativeClaudeArgs(parseSmartClaudeArgs(['--continue', '--model', 'opus']), '/plugin').includes('claude-opus-5-5'));
});

test('native child never inherits Jev/gateway secrets but Claude manages its own configuration', () => {
  const source = { PATH: '/bin', TYPESAFE_API_KEY: 'PRIVATE', ALLOW_JEV_CLASSIFICATION: 'true', SMART_CODEX_GATEWAY_TOKEN: 'PRIVATE', SMART_CODEX_ENV_FILE: '/private/config', MODEL_RUDDER_CLAUDE_TOKEN: 'stale', CLAUDE_CONFIG_DIR: '/native/config', TERM: 'xterm' };
  assert.deepEqual(claudeChildEnv(source), { PATH: '/bin', CLAUDE_CONFIG_DIR: '/native/config', TERM: 'xterm' });
  assert.equal(source.TYPESAFE_API_KEY, 'PRIVATE');
  assert.deepEqual(claudeChildEnv({ typesafe_api_key: 'PRIVATE', smart_codex_gateway_token: 'PRIVATE', Path: 'windows' }, 'win32'), { Path: 'windows' });
});

test('auth rejects conflicting billing/provider credentials without logging or changing them', () => {
  for (const name of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY']) {
    const env = { [name]: 'PRIVATE' };
    assert.throws(() => validateClaudeAuthEnvironment(env), error => /native claude.ai/.test(error.message) && !error.message.includes('PRIVATE'));
    assert.equal(env[name], 'PRIVATE');
  }
  assert.equal(hasNativeClaudeLogin('{"authMethod":"claude.ai","email":"not-read"}'), true);
  for (const method of ['api_key', 'oauth_token', 'api_key_helper', 'third_party', 'none']) assert.equal(hasNativeClaudeLogin(JSON.stringify({ authMethod: method })), false);
  assert.equal(hasNativeClaudeLogin('bad json'), false);
  assert.equal(hasNativeClaudeLogin('{"authMethod":"claude.ai","loggedIn":false}'), false);
});

test('Mods version guidance is separate from actual offline test evidence', () => {
  assert.equal(claudeCompatibility('2.1.286 (Claude Code)').supportsMods, false);
  assert.equal(claudeCompatibility('2.1.287 (Claude Code)').supportsMods, false);
  assert.equal(claudeCompatibility('2.1.293 (Claude Code)').supportsMods, true);
  assert.equal(claudeCompatibility('2.1.295 (Claude Code)').offlineTested, true);
  assert.equal(claudeCompatibility('2.2.0 (Claude Code)').supportsMods, false);
  assert.equal(claudeCompatibility('garbage').supportsMods, false);
});

test('native preflight only checks version, static plugin validation and auth status, with sanitized child env', async () => {
  const calls = [];
  const command = { file: 'claude', args: [] };
  const version = await checkClaudeNative(command, { TYPESAFE_API_KEY: 'PRIVATE' }, '/plugin', async (_command, args, env) => {
    calls.push(args); assert.equal(env.TYPESAFE_API_KEY, undefined);
    return args[0] === '--version' ? '2.1.295 (Claude Code)' : args[0] === 'auth' ? '{"authMethod":"claude.ai"}' : 'valid';
  });
  assert.equal(version.offlineTested, true);
  assert.deepEqual(calls, [['--version'], ['plugin', 'validate', '/plugin'], ['auth', 'status']]);
  await assert.rejects(checkClaudeNative(command, {}, '/plugin', async (_cmd, args) => args[0] === '--version' ? '2.1.295 (Claude Code)' : args[0] === 'auth' ? '{"authMethod":"api_key"}' : 'valid'), /native claude.ai/);
  await assert.rejects(checkClaudeNative(command, {}, '/plugin', async () => { throw new Error('PRIVATE diagnostic'); }), error => !error.message.includes('PRIVATE'));
});

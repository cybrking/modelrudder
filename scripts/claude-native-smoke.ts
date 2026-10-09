// Optional actual-CLI protocol probe. Every provider request is answered by a
// synthetic loopback server. No account, real key, paid inference, tools or user
// configuration is used. This qualifies wire behavior, not interactive TUI use.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const binary = process.argv[2] || 'claude';
if (process.argv.length > 3) throw new Error('Usage: node scripts/claude-native-smoke.ts [path-to-official-claude]');
const root = await mkdtemp(join(tmpdir(), 'modelrudder-claude-smoke-'));
type Capture = { path: string; model: string | null };
type ProbeCase = { name: string; requested: string; expected: string; allowlist?: string[] };
const cases: ProbeCase[] = [
  { name: 'alias-is-not-resolved', requested: 'haiku', expected: 'haiku' },
  { name: 'haiku-full-id', requested: 'claude-haiku-5-5', expected: 'claude-haiku-5-5' },
  { name: 'sonnet-full-id', requested: 'claude-sonnet-5-5', expected: 'claude-sonnet-5-5' },
  { name: 'opus-full-id', requested: 'claude-opus-5-5', expected: 'claude-opus-5-5' },
  { name: 'haiku-obeys-native-allowlist', requested: 'claude-haiku-5-5', expected: 'claude-sonnet-5-5', allowlist: ['sonnet'] },
  { name: 'opus-obeys-native-allowlist', requested: 'claude-opus-5-5', expected: 'claude-sonnet-5-5', allowlist: ['sonnet'] },
];
let captures: Capture[] = [];
const server = createServer(async (request, response) => {
  try {
    let raw = '';
    for await (const chunk of request) {
      raw += chunk.toString();
      if (raw.length > 2 * 1024 * 1024) { response.writeHead(413).end(); request.destroy(); return; }
    }
    const body = raw ? JSON.parse(raw) : {};
    const path = request.url ?? '/';
    captures.push({ path, model: typeof body.model === 'string' ? body.model : null });
    if (path.includes('count_tokens')) {
      response.writeHead(200, { 'content-type': 'application/json' }).end('{"input_tokens":1}');
      return;
    }
    if (!path.startsWith('/v1/messages')) {
      response.writeHead(404, { 'content-type': 'application/json' }).end('{"error":{"type":"not_found_error","message":"Synthetic endpoint"}}');
      return;
    }
    const message = { id: 'msg_synthetic', type: 'message', role: 'assistant', model: body.model,
      content: [{ type: 'text', text: 'synthetic ok' }], stop_reason: 'end_turn', stop_sequence: null,
      usage: { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } };
    if (!body.stream) {
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(message));
      return;
    }
    response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    const send = (event: string, value: unknown) => response.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
    send('message_start', { type: 'message_start', message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } });
    send('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    send('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'synthetic ok' } });
    send('content_block_stop', { type: 'content_block_stop', index: 0 });
    send('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 2 } });
    send('message_stop', { type: 'message_stop' });
    response.end();
  } catch { if (!response.headersSent) response.writeHead(400); response.end(); }
});

// Deliberately construct this environment instead of copying process.env.
function environment(home: string, baseUrl: string): NodeJS.ProcessEnv {
  return { HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: join(home, 'config'),
    PATH: process.env.PATH || '/usr/bin:/bin', ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot || 'C:\\Windows' } : {}),
    ANTHROPIC_API_KEY: 'sk-ant-api03-synthetic-offline-probe-not-a-real-key', ANTHROPIC_BASE_URL: baseUrl,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1', DISABLE_AUTOUPDATER: '1', DISABLE_TELEMETRY: '1',
    DISABLE_ERROR_REPORTING: '1', NO_PROXY: '127.0.0.1', CI: '1' };
}

function run(args: string[], home: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd: home, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    let stdout = '', stderr = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), 20_000);
    child.stdout.on('data', (data) => { stdout += data; if (stdout.length > 256_000) child.kill('SIGKILL'); });
    child.stderr.on('data', (data) => { stderr += data; if (stderr.length > 64_000) child.kill('SIGKILL'); });
    child.on('error', (error) => { clearTimeout(timer); reject(error); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
  });
}

try {
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const version = await run(['--version'], root, environment(root, baseUrl));
  assert.equal(version.code, 0, 'Official Claude executable must run without login');
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+ \(Claude Code\)$/);
  const results: { name: string; requested: string; emitted: string }[] = [];
  for (const probe of cases) {
    const home = join(root, probe.name), plugin = join(home, 'probe');
    await mkdir(join(plugin, '.claude-plugin'), { recursive: true });
    await mkdir(join(plugin, 'hooks'));
    await writeFile(join(plugin, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'modelrudder-wire-probe', version: '0.0.1', description: 'Synthetic local provider probe' }));
    await writeFile(join(plugin, 'hooks', 'hooks.json'), JSON.stringify({ modules: ['./register.js'] }));
    await writeFile(join(plugin, 'hooks', 'register.js'), `export function register(on) { on('turn.step', async function* ($, e, next) { return yield* next({...e, model: ${JSON.stringify(probe.requested)}}); }); }\n`);
    captures = [];
    const result = await run(['-p', 'Synthetic offline probe: say OK.', '--model', 'claude-sonnet-5-5',
      ...(probe.allowlist ? ['--settings', JSON.stringify({ availableModels: probe.allowlist })] : []),
      '--plugin-dir', plugin, '--tools', '', '--permission-mode', 'manual', '--permission-prompts', 'none',
      '--max-turns', '1', '--no-session-persistence', '--output-format', 'json'], home, environment(home, baseUrl));
    assert.equal(result.code, 0, `${probe.name}: native CLI failed or needs setup; no login or agreement was accepted`);
    const messageRequests = captures.filter((capture) => capture.path.startsWith('/v1/messages') && !capture.path.includes('count_tokens'));
    assert.equal(messageRequests.length, 1, `${probe.name}: expected exactly one synthetic model request`);
    assert.equal(messageRequests[0].model, probe.expected, `${probe.name}: model wire contract changed`);
    const output = JSON.parse(result.stdout);
    assert.equal(output.result, 'synthetic ok');
    assert.equal(output.is_error, false);
    results.push({ name: probe.name, requested: probe.requested, emitted: messageRequests[0].model! });
  }
  process.stdout.write(JSON.stringify({ version: version.stdout.trim(), provider: 'synthetic loopback only',
    realAuthentication: false, paidInference: false, interactiveTuiQualified: false, results }, null, 2) + '\n');
} finally {
  server.closeAllConnections();
  if (server.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}

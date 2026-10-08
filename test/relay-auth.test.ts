import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { startSmartRelay, nativeRemoteTuiArgs } from '../src/smart-codex.ts';

test('loopback relay rejects absent/wrong credentials, browser origins and unexpected paths before spawning backend', { timeout: 30_000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'modelrudder-relay-auth-'));
  const token = 'b'.repeat(64); let started = false;
  const server = await startSmartRelay({ localToken: token, cwd: directory, env: process.env, mode: 'pinned', model: 'gpt-6.1-sol',
    command: { file: 'missing-backend-for-auth-test', args: [] }, onFailure: () => { started = true; } });
  try {
    assert.match(server.endpoint, /^ws:\/\/127\.0\.0\.1:\d+$/);
    for (const [url, headers] of [
      [server.endpoint, {}], [server.endpoint, { Authorization: `Bearer ${'c'.repeat(64)}` }],
      [server.endpoint, { Authorization: `Bearer ${token}`, Origin: 'https://example.com' }],
      [`${server.endpoint}/other`, { Authorization: `Bearer ${token}` }],
    ] as const) {
      const ws = new WebSocket(url, { headers });
      await assert.rejects(once(ws, 'open'));
      ws.terminate();
    }
    assert.equal(started, false);
    const args = nativeRemoteTuiArgs(['--', 'literal prompt'], server.endpoint, 'gpt-6.1-sol', 'MODEL_RUDDER_RELAY_TOKEN');
    assert.ok(args.indexOf('--remote-auth-token-env') < args.indexOf('--'));
    assert.deepEqual(args.slice(args.indexOf('--')), ['--', 'literal prompt']);
    assert.ok(!args.includes(token));
  } finally { await server.close(); await rm(directory, { recursive: true, force: true }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { advisoryHook } from '../src/advisory-hook.ts';
import { protectPrivatePathSync } from '../src/private-files.ts';

test('session-scoped advisory state survives simulated resume and respects a manual model change', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'advisory-journeys-'));
  protectPrivatePathSync(directory, true);
  const event = { hook_event_name: 'UserPromptSubmit', session_id: 'session-a', model: 'gpt-6.1-sol', prompt: 'Synthetic task' };
  const note = 'ModelRudder suggests gpt-6-luna; current model unchanged.';
  try {
    const original = structuredClone(event);
    assert.deepEqual(await advisoryHook(event, directory, async () => note), { systemMessage: note });
    assert.equal(await advisoryHook(structuredClone(event), directory, async () => note), null);
    assert.deepEqual(await advisoryHook({ ...event, session_id: 'session-b' }, directory, async () => note), { systemMessage: note });
    assert.equal(await advisoryHook({ ...event, model: 'gpt-6-luna' }, directory, async () => null), null);
    assert.deepEqual(await advisoryHook(event, directory, async () => note), { systemMessage: note });
    assert.deepEqual(event, original);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

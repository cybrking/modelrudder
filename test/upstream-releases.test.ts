import test from 'node:test';
import assert from 'node:assert/strict';
import { parseStableRelease, releasePlan, fetchStableRelease } from '../scripts/check-upstream-releases.ts';

const release = (tag_name: string) => ({ tag_name, draft: false, prerelease: false });

test('official stable tags produce bounded versions and canonical release links', () => {
  assert.deepEqual(parseStableRelease('codex', release('rust-v0.162.0')), {
    provider: 'codex', version: '0.162.0', url: 'https://github.com/openai/codex/releases/tag/rust-v0.162.0',
  });
  assert.equal(parseStableRelease('claude', release('v2.1.296')).version, '2.1.296');
  for (const value of [null, [], {}, release('rust-v0.162.0-alpha.1'), release('rust-v0.162.0; echo unsafe'),
    release('rust-v00.162.0'), release('rust-v999999999999.0.0'),
    { ...release('rust-v0.162.0'), prerelease: true }, { ...release('rust-v0.162.0'), draft: true },
    { ...release('rust-v0.162.0'), draft: undefined }, release('v0.162.0')]) {
    assert.throws(() => parseStableRelease('codex', value));
  }
});

test('only releases newer than recorded evidence get candidate platform checks', () => {
  const plan = releasePlan([
    parseStableRelease('codex', release('rust-v0.999.0')),
    parseStableRelease('claude', release('v2.999.0')),
  ]);
  assert.equal(plan.matrix.include.length, 6);
  assert.deepEqual(new Set(plan.matrix.include.map(entry => entry.os)),
    new Set(['ubuntu-latest', 'macos-latest', 'windows-latest']));
  assert.equal(plan.releases[0].launcherAccepted, false);
  assert.equal(plan.releases[1].launcherAccepted, false);
  const unchanged = releasePlan([
    parseStableRelease('codex', release('rust-v0.161.0')),
    parseStableRelease('claude', release('v2.1.295')),
  ]);
  assert.deepEqual(unchanged.matrix.include, []);
  assert.equal(releasePlan([
    parseStableRelease('codex', release('rust-v0.161.0')),
    parseStableRelease('claude', release('v2.1.295')),
  ], true).matrix.include.length, 6);
  assert.deepEqual(releasePlan([parseStableRelease('codex', release('rust-v0.150.0'))]).matrix.include, []);
});

test('GitHub lookup uses fixed official endpoints and rejects failure without exposing response bodies', async () => {
  let requested = '';
  const goodFetch: typeof fetch = async input => {
    requested = String(input);
    return new Response(JSON.stringify(release('v2.1.296')));
  };
  assert.equal((await fetchStableRelease('claude', goodFetch)).version, '2.1.296');
  assert.equal(requested, 'https://api.github.com/repos/anthropics/claude-code/releases/latest');
  const denied: typeof fetch = async () => new Response('private upstream error contents', { status: 403 });
  await assert.rejects(fetchStableRelease('codex', denied), error => {
    assert.match((error as Error).message, /HTTP 403/);
    assert.ok(!(error as Error).message.includes('private upstream'));
    return true;
  });
});

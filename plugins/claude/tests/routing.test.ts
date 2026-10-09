import { expect, test, mock } from 'claude-code/testing';

function setup(on, captured, mode = 'auto', count = 0) {
  mock.clock(on);
  mock.env(on, {
    MODEL_RUDDER_CLAUDE_ENDPOINT: 'http://127.0.0.1:32123',
    MODEL_RUDDER_CLAUDE_TOKEN: 'a'.repeat(64),
    MODEL_RUDDER_CLAUDE_MODE: mode,
    MODEL_RUDDER_CLAUDE_MODEL: mode === 'pinned' ? 'opus' : 'sonnet',
  });
  on('session.turns', () => ({ value: count }));
  on('session.id', () => ({ value: 'session_native_test' }));
  on('ui.log', () => ({ value: undefined }));
  on('session.start', () => ({ cwd: '/work' }));
  on('session.end', () => ({ sessionId: 'session_native_test' }));
  on('prompt.submit', ($, e) => ({ text: e.text }));
  on('turn.start', ($, e) => ({ turnId: e.turnId }));
  on('turn.complete', () => ({ text: '' }));
  on('http.fetch', ($, e) => {
    const request = e.init?.body ? JSON.parse(e.init.body) : null;
    captured.requests.push({ url: e.url, request });
    return { value: { ok: true, status: 200, headers: {}, text: JSON.stringify(e.url.endsWith('/health')
      ? { protocol: 1 } : e.url.endsWith('/route') ? { model: 'haiku', proposed: 'FAST', reason: 'experimental_route' } : {}) } };
  });
  on('turn.step', async function* ($, e) {
    captured.models.push(e.model);
    yield { kind: 'text', index: 0, text: 'ok' };
    return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null };
  });
}

async function start($) {
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' });
}

async function prompt($, id, text, extra = {}) {
  await $.prompt.submit({ text, origin: { kind: 'composer' }, wait: false, ...extra });
  await $.turn.start({ turnId: id, text });
}

async function step($, id, extra = {}) {
  const stream = $.turn.step({ turnId: id, index: 0, model: 'claude-sonnet-5-5', messageCount: 1, ...extra });
  let row = await stream.next();
  while (row.done !== true) row = await stream.next();
  return row.value;
}

test('native loader routes every model step once and preserves the stream result', async ($, on) => {
  const captured = { requests: [], models: [] };
  setup(on, captured);
  await start($); await prompt($, 'turn_1', 'Explain a loop');
  const result = await step($, 'turn_1'); await step($, 'turn_1', { index: 1 });
  expect(result.answer).toBe('ok'); expect(captured.models).toEqual(['claude-haiku-5-5', 'claude-haiku-5-5']);
  expect(captured.requests.filter((r) => r.url.endsWith('/route')).length).toBe(1);
  expect(captured.requests.find((r) => r.url.endsWith('/route')).request.task).toBe('Explain a loop');
});

test('native loader leaves unobserved and subagent model requests alone', async ($, on) => {
  const captured = { requests: [], models: [] };
  setup(on, captured); await start($); await prompt($, 'turn_1', 'Explain a loop');
  await step($, 'turn_1', { agentId: 'subagent' }); await step($, 'unobserved');
  expect(captured.models).toEqual(['claude-sonnet-5-5', 'claude-sonnet-5-5']);
});

test('native loader withholds media and resumed context from routing transport', async ($, on) => {
  const captured = { requests: [], models: [] };
  setup(on, captured, 'auto', 2); await start($); await prompt($, 'turn_1', 'PRIVATE FOLLOW UP');
  await step($, 'turn_1');
  const route = captured.requests.find((r) => r.url.endsWith('/route')).request;
  expect(route.task).toBe(''); expect(route.contextReason).toBe('unclassified_context_baseline');
  expect(captured.models).toEqual(['claude-sonnet-5-5']);
});

test('native loader preserves engine fallback for subsequent model requests', async ($, on) => {
  const captured = { requests: [], models: [] };
  setup(on, captured); await start($); await prompt($, 'turn_1', 'Explain a loop');
  await step($, 'turn_1'); await step($, 'turn_1', { model: 'claude-opus-5-5' }); await step($, 'turn_1');
  expect(captured.models).toEqual(['claude-haiku-5-5', 'claude-opus-5-5', 'claude-sonnet-5-5']);
});

test('native loader honors explicit pinned mode without sending prompt text', async ($, on) => {
  const captured = { requests: [], models: [] };
  setup(on, captured, 'pinned'); await start($); await prompt($, 'turn_1', 'PRIVATE PINNED TASK'); await step($, 'turn_1');
  expect(captured.requests.find((r) => r.url.endsWith('/route')).request.task).toBe('');
  expect(captured.models).toEqual(['claude-opus-5-5']);
});

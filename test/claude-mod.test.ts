import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from '../plugins/claude/hooks/register.js';
import { createClaudeRouter } from '../src/claude-routing.ts';

type Options = { mode?: string; model?: string; turns?: number; endpoint?: string; token?: string; sessionId?: string;
  complete?: (body: any) => void; modelIds?: Record<string, string>; route?: (body: any) => any; timeout?: boolean; turnsError?: boolean; health?: any; routeError?: boolean };

function harness(options: Options = {}) {
  const hooks = new Map<string, any>();
  register((name: string, fn: any) => { hooks.set(name, fn); return { catch() {} }; });
  const requests: { path: string; body: any; init: any }[] = [];
  const logs: string[] = [];
  const envReads: string[] = [];
  const env: Record<string, string> = {
    MODEL_RUDDER_CLAUDE_ENDPOINT: options.endpoint ?? 'http://127.0.0.1:32123',
    MODEL_RUDDER_CLAUDE_TOKEN: options.token ?? 'a'.repeat(64),
    MODEL_RUDDER_CLAUDE_MODE: options.mode ?? 'auto',
    MODEL_RUDDER_CLAUDE_MODEL: options.model ?? 'sonnet',
    ...(options.modelIds ?? {}),
  };
  let sessionId = options.sessionId ?? 'session_1';
  const api = {
    env: { get: async (name: string) => { envReads.push(name); return env[name]; } },
    session: { turns: async () => { if (options.turnsError) throw Error('private'); return options.turns ?? 0; }, id: async () => sessionId },
    ui: { log: async (text: string) => { logs.push(text); } },
    clock: { sleep: (ms: number, { signal }: { signal: AbortSignal }) => new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(Error('aborted'));
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, options.timeout ? 5 : ms);
      function abort() { clearTimeout(timer); signal.removeEventListener('abort', abort); reject(Error('aborted')); }
      signal.addEventListener('abort', abort, { once: true });
    }) },
    http: { fetch: async (url: string, init: any) => {
      const path = new URL(url).pathname;
      const body = init.body === undefined ? undefined : JSON.parse(init.body);
      requests.push({ path, body, init });
      if (path === '/health') return { ok: true, text: JSON.stringify(options.health ?? { protocol: 1 }) };
      if (path === '/complete') { options.complete?.(body); return { ok: true, text: '{}' }; }
      if (options.routeError) throw Error('PRIVATE CREDENTIALS');
      const result = options.route ? await options.route(body) : { model: 'haiku', reason: 'experimental_route' };
      return { ok: true, text: JSON.stringify(result) };
    } },
  };
  async function event(name: string, e: any, core: (e: any) => any = (v) => v, signal = new AbortController().signal) {
    const next = Object.assign(core, { signal });
    return hooks.get(name)(api, e, next);
  }
  async function start() { await event('session.start', { cwd: '/work', surface: 'terminal', isInteractive: true }); }
  async function begin(id: string, text: string, extra: any = {}) {
    const e = { text, origin: { kind: 'composer' }, wait: false, ...extra };
    return event('prompt.submit', e, async (v) => {
      await event('turn.start', { turnId: id, text: v.text }, () => ({ turnId: id }));
      return { text: v.text };
    });
  }
  async function step(id: string, model = 'claude-sonnet-5-5', extra: any = {}, usage?: any) {
    let seen: any;
    const chunks = [{ kind: 'text', index: 0, text: 'answer' }, { kind: 'engine', ref: 77 }];
    const result = { turnId: id, index: 0, answer: 'answer', toolUses: [], stopReason: 'end_turn', usage: usage ?? null };
    const next = Object.assign(async function* (e: any) { seen = e; yield* chunks; return result; }, { signal: new AbortController().signal });
    const input = { turnId: id, index: 0, model, messageCount: 1, ...extra };
    const stream = hooks.get('turn.step')(api, input, next);
    const output = [];
    let current = await stream.next();
    while (!current.done) { output.push(current.value); current = await stream.next(); }
    return { seen, input, output, chunks, result, returned: current.value };
  }
  async function complete(id: string, extra: any = {}) {
    return event('turn.complete', { turnId: id, answer: 'PRIVATE ANSWER', durationMs: 100, isAborted: false, usage: null, ...extra });
  }
  return { hooks, requests, logs, envReads, api, event, start, begin, step, complete,
    routes: () => requests.filter((r) => r.path === '/route'), setSession: (id: string) => { sessionId = id; } };
}

test('Claude mod chooses once per turn and preserves prompts, efforts, stream chunks and final result', async () => {
  const h = harness(); await h.start();
  const submitted = await h.begin('a', 'Explain a loop'); assert.deepEqual(submitted, { text: 'Explain a loop' });
  const first = await h.step('a', 'claude-sonnet-5-5', { effort: 'high' });
  const second = await h.step('a', 'claude-sonnet-5-5', { index: 1 });
  assert.equal(first.seen.model, 'claude-haiku-5-5'); assert.equal(second.seen.model, 'claude-haiku-5-5');
  assert.equal(first.seen.effort, 'high'); assert.equal(first.returned, first.result);
  first.output.forEach((chunk, i) => assert.equal(chunk, first.chunks[i]));
  assert.equal(h.routes().length, 1); assert.equal(h.routes()[0].body.task, 'Explain a loop');
  await h.complete('a'); assert.equal((await h.step('a')).seen.model, 'claude-sonnet-5-5');
});

test('consumed prompt results cannot disable classification of later user turns', async () => {
  const inputs: any[] = [];
  const router = createClaudeRouter({ mode: 'auto', model: 'sonnet', classifier: async ({ input }) => {
    const parsed = JSON.parse(input); inputs.push(parsed);
    return { profile: parsed.currentTask === 'Design a distributed scheduler' ? 'MAX' : 'FAST', confidence: 0.96 };
  } });
  const h = harness({ route: (body) => router.route(body), complete: (body) => router.complete(body) });
  await h.start();
  const tasks = ['Explain a loop', 'Design a distributed scheduler', 'Fix a typo'];
  for (const [index, text] of tasks.entries()) {
    const turnId = `turn_${index}`;
    await h.event('prompt.submit', { text, origin: { kind: 'composer' }, wait: false }, async (e) => {
      await h.event('turn.start', { turnId, text: e.text });
      // A downstream hook can change the returned receipt after the prompt
      // entered. That result does not change the text observed by turn.start.
      return { text: '' };
    });
    const expected = index === 1 ? 'claude-opus-5-5' : 'claude-haiku-5-5';
    assert.equal((await h.step(turnId)).seen.model, expected);
    assert.equal((await h.step(turnId, 'claude-sonnet-5-5', { index: 1 })).seen.model, expected);
    await h.complete(turnId);
  }
  assert.deepEqual(inputs.map(input => input.currentTask), tasks);
  assert.deepEqual(inputs[2].previousUserTasks, tasks.slice(0, 2));
  assert.equal(h.routes().length, 3);
  router.close();
});

test('context attached after routing but before the first step blocks a pending downgrade', async () => {
  const h = harness(); await h.start(); await h.begin('late_context', 'Edit the label');
  await h.event('prompt.attachment', { type: 'file', text: 'PRIVATE file contents' });
  assert.equal((await h.step('late_context', 'claude-opus-5-5')).seen.model, 'claude-opus-5-5');
  assert.doesNotMatch(JSON.stringify(h.requests), /PRIVATE file contents/);
});

test('queued prompt is bound to its new turn, not prompt.submit existing turnId', async () => {
  const h = harness({ route: (body) => ({ model: body.task === 'hard task' ? 'opus' : 'haiku' }) }); await h.start();
  await h.begin('a', 'easy task');
  await h.event('prompt.submit', { text: 'hard task', origin: { kind: 'composer' }, wait: true, turnId: 'a' }, (e) => ({ text: e.text }));
  assert.equal((await h.step('a')).seen.model, 'claude-haiku-5-5');
  await h.complete('a');
  await h.event('turn.start', { text: 'hard task', turnId: 'b' });
  assert.equal((await h.step('b')).seen.model, 'claude-opus-5-5'); assert.equal(h.routes().length, 2);
});

test('subagents and unobserved helpers pass through unchanged', async () => {
  const h = harness(); await h.start(); await h.begin('a', 'easy');
  const child = await h.step('a', 'child-model', { agentId: 'child' }); assert.equal(child.seen, child.input);
  const helper = await h.step('helper', 'helper-model'); assert.equal(helper.seen, helper.input);
  await h.complete('a', { agentId: 'child' }); assert.equal((await h.step('a')).seen.model, 'claude-haiku-5-5');
});

test('native engine model changes win for the rest of the turn', async () => {
  const h = harness(); await h.start(); await h.begin('a', 'easy');
  assert.equal((await h.step('a')).seen.model, 'claude-haiku-5-5');
  assert.equal((await h.step('a', 'claude-opus-5-5')).seen.model, 'claude-opus-5-5');
  assert.equal((await h.step('a')).seen.model, 'claude-sonnet-5-5');
});

test('reported native fallback releases the route instead of forcing a failed model again', async () => {
  const h = harness(); await h.start(); await h.begin('a', 'easy');
  await h.step('a', 'claude-sonnet-5-5', {}, { model: 'claude-sonnet-5-5' });
  assert.equal((await h.step('a')).seen.model, 'claude-sonnet-5-5');
});

test('bridge failure and malformed responses use Sonnet without printing errors', async () => {
  for (const options of [{ routeError: true }, { route: () => ({ model: 'unknown', reason: 'PRIVATE TASK' }) }]) {
    const h = harness(options); await h.start(); await h.begin('a', 'task');
    assert.equal((await h.step('a')).seen.model, 'claude-sonnet-5-5'); assert.doesNotMatch(h.logs.join('\n'), /PRIVATE/);
  }
});

test('aborted routing result cannot affect another turn and completion cancels server bookkeeping', async () => {
  let finish!: (value: any) => void;
  const h = harness({ route: (body) => body.turnId === 'a' ? new Promise((resolve) => { finish = resolve; }) : { model: 'opus' } });
  await h.start();
  await h.event('prompt.submit', { text: 'old task', origin: { kind: 'composer' }, wait: false }, (e) => ({ text: e.text }));
  const controller = new AbortController();
  const pending = h.event('turn.start', { text: 'old task', turnId: 'a' }, (e) => e, controller.signal);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  controller.abort(); await pending;
  await h.complete('a', { isAborted: true });
  await h.begin('b', 'new task'); finish({ model: 'haiku' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await h.step('b')).seen.model, 'claude-opus-5-5');
  assert.equal(h.requests.find((r) => r.path === '/complete')?.body.isAborted, true);
});

test('classifier timeout falls back, and the late answer never changes the held decision', async () => {
  let finish!: (value: any) => void;
  const h = harness({ timeout: true, route: () => new Promise((resolve) => { finish = resolve; }) });
  await h.start(); await h.begin('a', 'task');
  assert.equal((await h.step('a')).seen.model, 'claude-sonnet-5-5');
  finish({ model: 'haiku' }); await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await h.step('a')).seen.model, 'claude-sonnet-5-5');
});

for (const [label, extra, reason] of [
  ['media', { attachments: [{ type: 'image' }] }, 'media_baseline'],
  ['references', { text: 'Read @private.txt' }, 'reference_context_baseline'],
  ['context', { context: ['SECRET CONTEXT'] }, 'unsupported_input_baseline'],
  ['foreign origin', { origin: { kind: 'peer' } }, 'unclassified_context_baseline'],
  ['command', { text: '/skill SECRET INPUT' }, 'unsupported_input_baseline'],
] as const) {
  test(`Claude ${label} context stays opaque until /clear and is never transmitted`, async () => {
    const h = harness(); await h.start(); await h.begin('a', 'SECRET', extra);
    assert.deepEqual(h.routes()[0].body, { sessionId: 'session_1', turnId: 'a', task: '', contextReason: reason });
    assert.equal((await h.step('a')).seen.model, 'claude-sonnet-5-5');
    await h.complete('a'); await h.begin('b', 'Follow up');
    assert.equal(h.routes()[1].body.task, '');
    await h.event('session.end', { reason: 'clear' }); h.setSession('session_2');
    await h.begin('c', 'Fresh task'); assert.equal(h.routes()[2].body.task, 'Fresh task');
  });
}

test('resumed or unreadable history never gets read or transmitted', async () => {
  for (const options of [{ turns: 5 }, { turnsError: true }]) {
    const h = harness(options); await h.start(); await h.begin('a', 'Continue');
    assert.equal(h.routes()[0].body.task, ''); assert.equal(h.routes()[0].body.contextReason, 'unclassified_context_baseline');
  }
});

test('compaction and in-process resume invalidate plain-text context eligibility', async () => {
  const h = harness(); await h.start(); await h.begin('a', 'first'); await h.complete('a');
  await h.event('session.compact', {}); await h.begin('b', 'next'); assert.equal(h.routes()[1].body.task, '');
  await h.event('session.end', { reason: 'resume' }); h.setSession('session_2');
  await h.begin('c', 'continue'); assert.equal(h.routes()[2].body.task, '');
});

test('rewritten, dropped, ambiguous and unobserved prompt text never goes to the classifier', async () => {
  const h = harness(); await h.start();
  await h.event('prompt.submit', { text: 'original', origin: { kind: 'composer' }, wait: false }, async () => {
    await h.event('turn.start', { turnId: 'a', text: 'HIDDEN REWRITE' }); return { text: 'HIDDEN REWRITE' };
  });
  assert.equal(h.routes()[0].body.task, '');
  await h.event('session.end', { reason: 'clear' });
  await h.event('prompt.submit', { text: 'dropped', origin: { kind: 'composer' }, wait: false }, () => ({ drop: 'blocked' }));
  await h.event('turn.start', { turnId: 'b', text: 'dropped' }); assert.equal(h.routes()[1].body.task, '');
  await h.event('session.end', { reason: 'clear' });
  for (let i = 0; i < 2; i++) await h.event('prompt.submit', { text: 'duplicate', origin: { kind: 'composer' }, wait: true }, (e) => ({ text: e.text }));
  await h.event('turn.start', { turnId: 'c', text: 'duplicate' }); assert.equal(h.routes()[2].body.task, '');
  await h.event('session.end', { reason: 'clear' });
  await h.event('turn.start', { turnId: 'd', text: 'SECRET UNOBSERVED' }); assert.equal(h.routes()[3].body.task, '');
});

test('a late route after /clear cannot modify the new session', async () => {
  let finish!: (value: any) => void;
  const h = harness({ route: (body) => body.turnId === 'a' ? new Promise((r) => { finish = r; }) : { model: 'opus' } });
  await h.start(); const old = h.begin('a', 'old');
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  await h.event('session.end', { reason: 'clear' }); h.setSession('session_2');
  await h.begin('b', 'new'); finish({ model: 'haiku' }); await old;
  assert.equal((await h.step('b')).seen.model, 'claude-opus-5-5');
  assert.equal((await h.step('a')).seen.model, 'claude-sonnet-5-5');
});

test('pinned mode withholds task text but records turns; observe does not override native selection', async () => {
  const pinned = harness({ mode: 'pinned', model: 'opus' }); await pinned.start(); await pinned.begin('a', 'SECRET TASK');
  assert.equal(pinned.routes()[0].body.task, ''); assert.equal((await pinned.step('a')).seen.model, 'claude-opus-5-5');
  const observed = harness({ mode: 'observe' }); await observed.start(); await observed.begin('a', 'task');
  const step = await observed.step('a', 'claude-opus-5-5'); assert.equal(step.seen, step.input);
});

test('completion sends only approved usage fields and never answer or other native metadata', async () => {
  const h = harness(); await h.start(); await h.begin('a', 'task');
  await h.complete('a', { usage: { model: 'claude-haiku-5-5', input_tokens: 7, output_tokens: 4,
    cache_read_input_tokens: 3, cache_creation_input_tokens: 2, SECRET: 'credential' }, another: 'secret' });
  const report = h.requests.find((r) => r.path === '/complete')!.body;
  assert.deepEqual(report, { sessionId: 'session_1', turnId: 'a', isAborted: false, usage: {
    model: 'claude-haiku-5-5', input_tokens: 7, output_tokens: 4, cache_read_input_tokens: 3, cache_creation_input_tokens: 2 } });
  assert.doesNotMatch(JSON.stringify(report), /SECRET|answer|credential/i);
});

test('invalid endpoint, mode, token or bridge protocol leaves Claude untouched', async () => {
  for (const options of [{ endpoint: 'https://example.com:32123' }, { endpoint: 'http://127.0.0.1:32123/evil' },
    { mode: 'bad' }, { token: 'short' }, { health: { protocol: 2 } }]) {
    const h = harness(options); await h.start(); await h.begin('a', 'SECRET');
    assert.equal(h.routes().length, 0); const step = await h.step('a'); assert.equal(step.seen, step.input);
  }
});

test('only literal bridge environment variables are read; no tool or permission hooks exist', async () => {
  const h = harness(); await h.start();
  assert.deepEqual(h.envReads.sort(), ['MODEL_RUDDER_CLAUDE_ENDPOINT', 'MODEL_RUDDER_CLAUDE_HAIKU_MODEL', 'MODEL_RUDDER_CLAUDE_MODE', 'MODEL_RUDDER_CLAUDE_MODEL', 'MODEL_RUDDER_CLAUDE_OPUS_MODEL', 'MODEL_RUDDER_CLAUDE_SONNET_MODEL', 'MODEL_RUDDER_CLAUDE_TOKEN']);
  assert.equal([...h.hooks.keys()].some((name) => /tool|permission|config/.test(name)), false);
  assert.equal(h.requests[0].path, '/health'); assert.equal(h.requests[0].init.method, 'GET');
});

test('known hidden attachment kinds taint context without reading or transmitting their text', async () => {
  const h = harness(); await h.start(); await h.begin('a', 'Task');
  const attachment = { type: 'file', text: 'PRIVATE FILE CONTENT' };
  const result = await h.event('prompt.attachment', attachment); assert.equal(result, attachment);
  assert.equal((await h.step('a')).seen.model, 'claude-sonnet-5-5');
  await h.complete('a'); await h.begin('b', 'Next');
  assert.equal(h.routes()[1].body.task, ''); assert.equal(h.routes()[1].body.contextReason, 'reference_context_baseline');
  assert.doesNotMatch(JSON.stringify(h.requests), /PRIVATE FILE CONTENT/);
});

test('ordinary tool reminders do not disable routing', async () => {
  const h = harness(); await h.start(); await h.begin('a', 'Task');
  await h.event('prompt.attachment', { type: 'todo_reminder', text: 'reminder' });
  assert.equal((await h.step('a')).seen.model, 'claude-haiku-5-5');
});

for (const kind of ['instructions', 'nested_memory']) {
  test(`native ${kind} announcements preserve routing across three user turns`, async () => {
    const inputs: any[] = [];
    const router = createClaudeRouter({ mode: 'auto', model: 'sonnet', classifier: async (request) => {
      const input = JSON.parse(request.input); inputs.push(input);
      return { profile: input.currentTask === 'Design a scheduler' ? 'MAX' : 'FAST', confidence: null, reportedConfidence: 0.99 };
    } });
    try {
      const h = harness({ route: (body) => router.route(body), complete: (body) => router.complete(body) });
      await h.start();
      const tasks = ['Explain a loop', 'Design a scheduler', 'Fix a typo'];
      for (const [index, text] of tasks.entries()) {
        const id = `turn_${index}`;
        await h.begin(id, text);
        if (index === 0) {
          // Project instructions arrive before the first model call; nested
          // memory can also arrive after a tool discovers a child directory.
          if (kind === 'nested_memory') await h.step(id);
          const attachment = { type: kind, origin: { kind: 'engine' }, text: 'PRIVATE PROJECT INSTRUCTIONS' };
          assert.equal(await h.event('prompt.attachment', attachment), attachment);
        }
        const expected = index === 1 ? 'claude-opus-5-5' : 'claude-haiku-5-5';
        assert.equal((await h.step(id)).seen.model, expected);
        await h.complete(id);
      }
      assert.deepEqual(inputs.map(input => input.currentTask), tasks);
      assert.deepEqual(inputs[2].previousUserTasks, tasks.slice(0, 2));
      assert.doesNotMatch(JSON.stringify(h.requests), /PRIVATE PROJECT INSTRUCTIONS/);
    } finally { router.close(); }
  });
}

test('non-native instruction announcements still invalidate context eligibility', async () => {
  for (const type of ['instructions', 'nested_memory']) {
    for (const origin of [undefined, { kind: 'hook', event: 'UserPromptSubmit' }, { kind: 'plugin', event: 'prompt.submit' }]) {
      const h = harness(); await h.start(); await h.begin('a', 'First task');
      await h.event('prompt.attachment', { type, origin, text: 'PRIVATE INJECTED CONTEXT' });
      assert.equal((await h.step('a', 'claude-opus-5-5')).seen.model, 'claude-opus-5-5');
      await h.complete('a'); await h.begin('b', 'Next task');
      assert.equal(h.routes()[1].body.contextReason, 'unclassified_context_baseline');
      assert.equal(h.routes()[1].body.task, '');
      assert.doesNotMatch(JSON.stringify(h.requests), /PRIVATE INJECTED CONTEXT/);
    }
  }
});

test('engine provenance does not make referenced files or queued input eligible', async () => {
  for (const type of ['file', 'queued_command']) {
    const h = harness(); await h.start(); await h.begin('a', 'First task');
    await h.event('prompt.attachment', { type, origin: { kind: 'engine' }, text: 'PRIVATE EXTRA INPUT' });
    assert.equal((await h.step('a', 'claude-opus-5-5')).seen.model, 'claude-opus-5-5');
    await h.complete('a'); await h.begin('b', 'Next task');
    assert.equal(h.routes()[1].body.task, '');
    assert.equal(h.routes()[1].body.contextReason, type === 'file' ? 'reference_context_baseline' : 'unclassified_context_baseline');
    assert.doesNotMatch(JSON.stringify(h.requests), /PRIVATE EXTRA INPUT/);
  }
});

test('repeated turn.start does not classify twice and malformed ID is never forwarded', async () => {
  const h = harness(); await h.start(); await h.begin('a', 'Task');
  await h.event('turn.start', { turnId: 'a', text: 'Task' }); assert.equal(h.routes().length, 1);
  await h.event('turn.start', { turnId: 'a'.repeat(129), text: 'PRIVATE' }); assert.equal(h.routes().length, 1);
});

test('hidden context arriving during classification prevents a late downgrade', async () => {
  let finish!: (value: any) => void;
  const h = harness({ route: () => new Promise((resolve) => { finish = resolve; }) });
  await h.start(); const begin = h.begin('a', 'Task');
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  await h.event('prompt.attachment', { type: 'instructions', text: 'SECRET' });
  finish({ model: 'haiku' }); await begin;
  assert.equal((await h.step('a')).seen.model, 'claude-sonnet-5-5');
});

test('observe notices show only validated proposed profiles and never arbitrary provider text', async () => {
  const h = harness({ mode: 'observe', route: () => ({ model: 'sonnet', proposed: 'FAST', reason: 'PRIVATE TEXT' }) });
  await h.start(); await h.begin('a', 'Task');
  assert.match(h.logs.join('\n'), /Suggested haiku/); assert.doesNotMatch(h.logs.join('\n'), /PRIVATE/);
});

test('turn.step uses validated same-family full IDs, never CLI family aliases', async () => {
  const h = harness({ modelIds: { MODEL_RUDDER_CLAUDE_HAIKU_MODEL: 'claude-haiku-4-5-20251001' } });
  await h.start(); await h.begin('a', 'Task');
  assert.equal((await h.step('a')).seen.model, 'claude-haiku-4-5-20251001');
  for (const value of ['haiku', 'claude-opus-5-5', 'claude-haiku-5-5\nSECRET', 'https://example.com']) {
    const invalid = harness({ modelIds: { MODEL_RUDDER_CLAUDE_HAIKU_MODEL: value } });
    await invalid.start(); await invalid.begin('a', 'SECRET'); assert.equal(invalid.routes().length, 0);
    const step = await invalid.step('a'); assert.equal(step.seen, step.input);
  }
});

test('opaque resumed and media turns retain stronger native models instead of downshifting', async () => {
  const resumed = harness({ turns: 2 }); await resumed.start(); await resumed.begin('a', 'Continue');
  const a = await resumed.step('a', 'claude-opus-5-5'); assert.equal(a.seen, a.input);
  const media = harness(); await media.start(); await media.begin('a', 'Explain this', { attachments: [{ type: 'image' }] });
  const b = await media.step('a', 'claude-opus-5-5'); assert.equal(b.seen, b.input);
  assert.match(media.logs.join('\n'), /Native model retained/);
});

test('abort immediately cancels the bridge even when native completion reuses the aborted signal', async () => {
  let finish!: (value: any) => void;
  const h = harness({ route: (body) => body.turnId === 'a' ? new Promise((resolve) => { finish = resolve; }) : { model: 'opus' } });
  await h.start();
  await h.event('prompt.submit', { text: 'CANCELLED TASK', origin: { kind: 'composer' }, wait: false }, (e) => ({ text: e.text }));
  const controller = new AbortController();
  const started = h.event('turn.start', { text: 'CANCELLED TASK', turnId: 'a' }, (e) => e, controller.signal);
  while (!finish) await new Promise((resolve) => setImmediate(resolve));
  controller.abort(); await started;
  assert.equal(h.requests.filter((r) => r.path === '/complete').length, 1, 'abort itself must notify the service');
  await h.event('turn.complete', { turnId: 'a', isAborted: true }, (e) => e, controller.signal);
  assert.equal(h.requests.filter((r) => r.path === '/complete').length, 2, 'an aborted completion signal must not suppress cleanup');
  await h.begin('b', 'NEXT TASK'); finish({ model: 'haiku' });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await h.step('b')).seen.model, 'claude-opus-5-5');
});

test('same-family native version fallback is not overwritten on the next model step', async () => {
  const h = harness(); await h.start(); await h.begin('a', 'Task');
  await h.step('a', 'claude-sonnet-5-5', {}, { model: 'claude-haiku-4-5-20251001' });
  const next = await h.step('a', 'claude-sonnet-5-5'); assert.equal(next.seen, next.input);
});

test('adapter and router together remove aborted tasks from subsequent classifier context', async () => {
  const inputs: any[] = [];
  let finish!: (value: any) => void;
  const router = createClaudeRouter({ mode: 'auto', model: 'sonnet', classifier: async (request) => {
    const input = JSON.parse(request.input); inputs.push(input);
    if (input.currentTask === 'CANCELLED TASK') return new Promise((resolve) => { finish = resolve; });
    return { profile: 'MAX', confidence: null, reportedConfidence: 0.99 };
  } });
  try {
    const h = harness({ route: (body) => router.route(body), complete: (body) => router.complete(body) });
    await h.start();
    await h.event('prompt.submit', { text: 'CANCELLED TASK', origin: { kind: 'composer' }, wait: false }, (e) => ({ text: e.text }));
    const controller = new AbortController();
    const pending = h.event('turn.start', { text: 'CANCELLED TASK', turnId: 'a' }, (e) => e, controller.signal);
    while (!finish) await new Promise((resolve) => setImmediate(resolve));
    controller.abort(); await pending;
    await h.event('turn.complete', { turnId: 'a', isAborted: true }, (e) => e, controller.signal);
    finish({ profile: 'FAST', confidence: null, reportedConfidence: 0.99 });
    await h.begin('b', 'NEXT TASK');
    assert.deepEqual(inputs[1].previousUserTasks, []);
    assert.doesNotMatch(JSON.stringify(inputs[1]), /CANCELLED/);
    assert.equal((await h.step('b')).seen.model, 'claude-opus-5-5');
  } finally { router.close(); }
});

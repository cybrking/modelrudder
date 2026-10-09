// Claude Code Mods API, CLI 2.1.293+. No Node imports or credential access.
// Only explicit, observed plain-text user prompts reach the loopback classifier.
// Native tools, permission decisions, prompt text and response chunks are untouched.

const MODELS = ['haiku', 'sonnet', 'opus'];
const BRIDGE_DEADLINE_MS = 6500;
const MAX_PENDING_PROMPTS = 16;
const MAX_TASK_CHARS = 64000;
const PROPOSED_MODELS = { FAST: 'haiku', BALANCED: 'sonnet', DEEP: 'sonnet', MAX: 'opus' };
const REASON_LABELS = {
  experimental_route: 'experimental route', uncertain_classification: 'uncertain classification',
  classification_disabled: 'classification disabled', classifier_failed: 'classifier unavailable',
  classifier_access_denied: 'classifier access denied', classifier_quota_exceeded: 'classifier quota reached',
  classifier_circuit_open: 'classifier cooldown', bridge_failure: 'classifier unavailable',
  media_baseline: 'media context', reference_context_baseline: 'referenced context',
  unclassified_context_baseline: 'unclassified context', unsupported_input_baseline: 'unsupported input',
  pinned: 'pinned', observe: 'observe only', classified: 'classified',
};

function isModel(value) {
  return MODELS.includes(value);
}

function isModelId(value, family) {
  return typeof value === 'string' && new RegExp('^claude-' + family + '-[a-z0-9][a-z0-9.-]{0,80}$').test(value);
}

function safeId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function validEndpoint(value) {
  if (typeof value !== 'string' || !/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}\/?$/.test(value)) return null;
  const url = new URL(value);
  if (!url.port || Number(url.port) > 65535) return null;
  return url.origin;
}

function promptReason(event) {
  if (!['composer', 'bridge'].includes(event.origin?.kind)) return 'unclassified_context_baseline';
  if (event.attachments !== undefined && (!Array.isArray(event.attachments) || event.attachments.length)) return 'media_baseline';
  if (event.context !== undefined && (!Array.isArray(event.context) || event.context.length)) return 'unsupported_input_baseline';
  if (typeof event.text !== 'string' || !event.text.trim() || event.text.length > MAX_TASK_CHARS) return 'unsupported_input_baseline';
  if (/(^|\s)@\S/.test(event.text)) return 'reference_context_baseline';
  if (/^\s*[!/]/.test(event.text)) return 'unsupported_input_baseline';
  return null;
}

function safeUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined;
  const result = {};
  for (const key of ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
    if (Number.isSafeInteger(usage[key]) && usage[key] >= 0) result[key] = usage[key];
  }
  if (typeof usage.model === 'string' && /^(haiku|sonnet|opus|claude-(haiku|sonnet|opus)-[a-z0-9.-]+)(\[1m\])?$/.test(usage.model)) {
    result.model = usage.model;
  }
  return Object.keys(result).length ? result : undefined;
}

// $.http.fetch has a plain-data response, not the web Response interface.
// The Mods API currently exposes no portable fetch AbortSignal option. The
// deadline/abort race stops waiting; generation checks discard every late result.
async function bridgeRequest($, endpoint, token, path, body, signal) {
  if (signal?.aborted) throw new Error('cancelled');
  const timer = new AbortController();
  let rejectAbort;
  const aborted = new Promise((_, reject) => { rejectAbort = reject; });
  const onAbort = () => rejectAbort(new Error('cancelled'));
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    const timeout = $.clock.sleep(BRIDGE_DEADLINE_MS, { signal: timer.signal }).then(() => { throw new Error('bridge_timeout'); });
    const request = $.http.fetch(endpoint + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const response = await Promise.race([request, timeout, aborted]);
    if (signal?.aborted) throw new Error('cancelled');
    if (!response || response.ok !== true || typeof response.text !== 'string' || response.text.length > 16384) throw new Error('bridge_invalid');
    return JSON.parse(response.text);
  } finally {
    timer.abort();
    signal?.removeEventListener('abort', onAbort);
  }
}

async function notice($, text) {
  try { await $.ui.log(text); } catch { /* A UI failure must never replay a request. */ }
}

function cancelReportedTurn($, endpoint, token, decision, turnId) {
  decision.cancelled = true;
  if (!decision.requested || !decision.sessionId || decision.cancelNotified) return;
  decision.cancelNotified = true;
  // The abandoned event's signal must not cancel the cancellation message.
  // Start it immediately; cancellation cannot wait for a stuck local service.
  void bridgeRequest($, endpoint, token, '/complete', {
    turnId, sessionId: decision.sessionId, isAborted: true,
  }, undefined).catch(() => {});
}

export function register(on) {
  let enabled = false;
  let endpoint = null;
  let token = '';
  let mode = 'auto';
  let configuredModel = 'sonnet';
  let modelIds = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' };
  let opaqueReason = 'unclassified_context_baseline';
  let generation = 0;
  let pending = [];
  const turns = new Map();

  function makeOpaque(reason) {
    opaqueReason ||= reason;
    if (mode !== 'pinned') {
      for (const decision of turns.values()) decision.passthrough = true;
    }
  }

  function removePending(candidate) {
    pending = pending.filter((entry) => entry !== candidate);
  }

  on('session.start', async ($, e, next) => {
    generation++;
    pending = [];
    turns.clear();
    enabled = false;
    opaqueReason = 'unclassified_context_baseline';
    try {
      endpoint = validEndpoint(await $.env.get('MODEL_RUDDER_CLAUDE_ENDPOINT'));
      token = await $.env.get('MODEL_RUDDER_CLAUDE_TOKEN');
      mode = await $.env.get('MODEL_RUDDER_CLAUDE_MODE');
      configuredModel = await $.env.get('MODEL_RUDDER_CLAUDE_MODEL');
      modelIds = {
        haiku: (await $.env.get('MODEL_RUDDER_CLAUDE_HAIKU_MODEL')) ?? 'claude-haiku-5-5',
        sonnet: (await $.env.get('MODEL_RUDDER_CLAUDE_SONNET_MODEL')) ?? 'claude-sonnet-5-5',
        opus: (await $.env.get('MODEL_RUDDER_CLAUDE_OPUS_MODEL')) ?? 'claude-opus-5-5',
      };
      if (endpoint && typeof token === 'string' && /^[A-Za-z0-9_-]{32,256}$/.test(token)
          && ['auto', 'observe', 'pinned'].includes(mode) && isModel(configuredModel)
          && MODELS.every((family) => isModelId(modelIds[family], family)) && e.isInteractive === true) {
        const health = await bridgeRequest($, endpoint, token, '/health', undefined, next.signal);
        if (health?.protocol !== 1 || next.signal?.aborted) throw new Error('bridge_protocol');
        enabled = true;
        try {
          const count = await $.session.turns();
          if (count === 0) opaqueReason = null;
        } catch { /* Unknown or resumed history stays opaque. */ }
      }
    } catch { /* Missing or invalid configuration leaves native Claude unchanged. */ }
    return next(e);
  });

  on('prompt.submit', async ($, e, next) => {
    if (!enabled) return next(e);
    const reason = promptReason(e);
    if (reason) makeOpaque(reason);
    const candidate = { text: typeof e.text === 'string' ? e.text : '', reason, generation, consumed: false, cancelled: false };
    if (pending.length >= MAX_PENDING_PROMPTS) {
      pending = [];
      makeOpaque('unclassified_context_baseline');
    }
    pending.push(candidate);
    const cancelled = () => {
      candidate.cancelled = true;
      removePending(candidate);
    };
    next.signal?.addEventListener('abort', cancelled, { once: true });
    if (next.signal?.aborted) cancelled();
    try {
      const result = await next(e);
      if (candidate.generation !== generation) return result;
      // Once turn.start matched the exact text, the prompt has entered.
      // A changed return receipt cannot rewrite that already observed input.
      if (result?.drop || (!candidate.consumed && result?.text !== e.text)) {
        removePending(candidate);
        makeOpaque('unclassified_context_baseline');
      }
      return result;
    } catch (error) {
      removePending(candidate);
      makeOpaque('unclassified_context_baseline');
      throw error;
    } finally {
      next.signal?.removeEventListener('abort', cancelled);
    }
  });

  on('turn.start', async ($, e, next) => {
    if (!enabled || e.agentId !== undefined || !safeId(e.turnId) || turns.has(e.turnId)) return next(e);
    const epoch = generation;
    const matches = pending.filter((entry) => !entry.cancelled && entry.generation === epoch && entry.text === e.text);
    let candidate;
    if (matches.length === 1) {
      candidate = matches[0];
      candidate.consumed = true;
      removePending(candidate);
    } else {
      pending = [];
      makeOpaque('unclassified_context_baseline');
    }
    const contextReason = opaqueReason || candidate?.reason || (!candidate ? 'unclassified_context_baseline' : null);
    const decision = { model: mode === 'pinned' ? configuredModel : 'sonnet', reason: contextReason || 'bridge_failure', proposed: null, sessionId: null, requested: false, nativeModel: null, released: false, cancelled: false, cancelNotified: false, passthrough: mode !== 'pinned' && Boolean(contextReason) };
    // Installed before waiting: an interrupted lookup cannot populate another turn.
    turns.set(e.turnId, decision);
    try {
      const sessionId = await $.session.id();
      if (!safeId(sessionId)) throw new Error('session_unknown');
      decision.sessionId = sessionId;
      if (generation !== epoch || next.signal?.aborted || turns.get(e.turnId) !== decision) {
        cancelReportedTurn($, endpoint, token, decision, e.turnId);
        return next(e);
      }
      {
        decision.requested = true;
        const response = await bridgeRequest($, endpoint, token, '/route', {
          turnId: e.turnId,
          sessionId,
          task: contextReason || mode === 'pinned' ? '' : candidate.text,
          contextReason,
        }, next.signal);
        if (generation !== epoch || next.signal?.aborted || turns.get(e.turnId) !== decision) {
          cancelReportedTurn($, endpoint, token, decision, e.turnId);
          return next(e);
        }
        if (!response || !isModel(response.model)) throw new Error('route_invalid');
        decision.model = mode === 'pinned' ? configuredModel : (contextReason || opaqueReason ? configuredModel : response.model);
        decision.passthrough = mode !== 'pinned' && Boolean(contextReason || opaqueReason);
        if (Object.hasOwn(PROPOSED_MODELS, response.proposed)) decision.proposed = PROPOSED_MODELS[response.proposed];
        // Do not print arbitrary classifier output or task text.
        decision.reason = contextReason || opaqueReason || (Object.hasOwn(REASON_LABELS, response.reason) ? response.reason : 'classified');
      }
    } catch {
      // A cancelled or stale lookup is never inherited by a later prompt.
      if (generation !== epoch || next.signal?.aborted || turns.get(e.turnId) !== decision) {
        cancelReportedTurn($, endpoint, token, decision, e.turnId);
        return next(e);
      }
      decision.reason = 'bridge_failure';
    }
    if (generation !== epoch || next.signal?.aborted) {
      cancelReportedTurn($, endpoint, token, decision, e.turnId);
      return next(e);
    }
    if (mode !== 'pinned' && opaqueReason) {
      decision.passthrough = true;
      decision.reason = opaqueReason;
    }
    await notice($, decision.passthrough
      ? 'Native model retained (' + REASON_LABELS[decision.reason] + ').'
      : mode === 'observe'
      ? (decision.proposed ? 'Suggested ' + decision.proposed + '; ' : '') + 'native model unchanged (observe).'
      : 'Routing this turn to ' + decision.model + ' (' + REASON_LABELS[decision.reason] + ').');
    return next(e);
  });

  on('turn.step', async function* ($, e, next) {
    const decision = e.agentId === undefined && turns.get(e.turnId);
    // Native context can be attached after turn.start has settled but before
    // its first model request. It must not authorize a pending downgrade.
    if (decision && decision.nativeModel === null && opaqueReason && mode !== 'pinned') decision.passthrough = true;
    if (!enabled || !decision || decision.cancelled || decision.passthrough || mode === 'observe' || next.signal?.aborted) return yield* next(e);
    if (decision.nativeModel === null) decision.nativeModel = e.model;
    else if (e.model !== decision.nativeModel && !decision.released) {
      decision.released = true;
      await notice($, 'Native model change detected; preserving Claude’s model for the rest of this turn.');
    }
    if (decision.released) return yield* next(e);
    // Do not replace prompts, permission state, effort or any response chunks.
    // Unlike --model, turn.step does not resolve family aliases. This was
    // verified against the real CLI and a synthetic loopback Messages endpoint.
    const result = yield* next({ ...e, model: modelIds[decision.model] });
    if (result?.usage?.model && result.usage.model !== modelIds[decision.model]) decision.released = true;
    return result;
  });

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e);
    const decision = turns.get(e.turnId);
    turns.delete(e.turnId);
    if (enabled && decision?.requested && decision.sessionId) {
      try {
        await bridgeRequest($, endpoint, token, '/complete', {
          turnId: e.turnId,
          sessionId: decision.sessionId,
          isAborted: decision.cancelled || e.isAborted === true || e.reason === 'aborted',
          usage: safeUsage(e.usage),
        }, undefined);
      } catch { /* Reporting is best-effort; it cannot retry the completed turn. */ }
    }
    return next(e);
  });

  on('session.compact', async ($, e, next) => {
    makeOpaque('unclassified_context_baseline');
    pending = [];
    return next(e);
  });

  on('prompt.attachment', async ($, e, next) => {
    // Native project instructions are part of Claude's normal environment,
    // like its system prompt. Only the typed tasks go to the classifier.
    // Files, queued input and non-native instructions still invalidate routing.
    const nativeInstructions = e.origin?.kind === 'engine' && ['instructions', 'nested_memory'].includes(e.type);
    if (e.agentId === undefined && !nativeInstructions && ['file', 'queued_command', 'instructions', 'nested_memory'].includes(e.type)) {
      makeOpaque(e.type === 'file' ? 'reference_context_baseline' : 'unclassified_context_baseline');
    }
    return next(e);
  });

  on('session.end', async ($, e, next) => {
    generation++;
    pending = [];
    for (const [turnId, decision] of turns) cancelReportedTurn($, endpoint, token, decision, turnId);
    turns.clear();
    // Claude does not emit another session.start after /clear or /resume.
    opaqueReason = e.reason === 'clear' ? null : 'unclassified_context_baseline';
    return next(e);
  });
}

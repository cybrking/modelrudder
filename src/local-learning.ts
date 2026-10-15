import { closeSync, constants, fstatSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPrivatePath, protectPrivatePath } from './private-files.ts';
import { decisionIdPattern } from './outcome.ts';
import type { UsageSnapshot } from './session-usage.ts';
import { routerVersion } from './runtime-policy.ts';
import { randomUUID } from 'node:crypto';

export type LearningTask = { task: string; previousUserTasks: string[]; opaqueContext: boolean };

/** Explicit local opt-in; task text never enters the ordinary usage log. */
export function createLocalLearning(directory?: string, privacy = { isPrivatePath, protectPrivatePath }) {
  const sessionId = randomUUID();
  const controller = new AbortController();
  let closing = false, closed: Promise<void> | undefined;
  let failed = false, saved = 0, ready = false;
  let pending = (async () => {
    if (directory) {
      try {
        const created = mkdirSync(directory, { recursive: true, mode: 0o700 });
        if (created && process.platform === 'win32') await privacy.protectPrivatePath(directory, true, controller.signal);
        if (!await privacy.isPrivatePath(directory, true, controller.signal) || controller.signal.aborted) throw new Error('Private directory required');
        ready = true;
      } catch { failed = true; }
    }
  })();
  return {
    get enabled() { return Boolean(directory); },
    get failed() { return failed; },
    get saved() { return saved; },
    flush() { return pending; },
    // Optional capture must not hold the native terminal open indefinitely.
    // Cancel the active ACL process and drop queued work after the grace period.
    close(timeoutMs = 2000): Promise<void> {
      if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 0) throw new Error('Invalid capture shutdown timeout');
      if (closed) return closed;
      closing = true;
      closed = (async () => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([pending, new Promise<void>(resolve => {
            timer = setTimeout(() => { failed = Boolean(directory); controller.abort(); resolve(); }, timeoutMs);
          })]);
        } finally { if (timer) clearTimeout(timer); }
      })();
      return closed;
    },
    write(task: LearningTask, route: UsageSnapshot['latestRoute']) {
      if (closing) return;
      pending = pending.then(async () => {
        if (!ready || !directory || !route || controller.signal.aborted) return;
        try {
          if (!decisionIdPattern.test(route.decisionId) || !task.task.trim() || task.task.length > 100_000 ||
              task.previousUserTasks.length > 2 || task.previousUserTasks.some(t => t.length > 4000) ||
              !await privacy.isPrivatePath(directory, true, controller.signal) || controller.signal.aborted) throw new Error('Invalid capture');
          const fd = openSync(join(directory, `${route.decisionId}.json`),
            constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
          try {
            if (!fstatSync(fd).isFile()) throw new Error('Regular file required');
            writeFileSync(fd, JSON.stringify({ schema: 'modelrudder-local-example', version: 1,
              id: route.decisionId, sessionId, provider: 'codex', recordedAt: new Date().toISOString(),
              routerVersion, task: task.task, previousUserTasks: task.previousUserTasks,
              opaqueContext: task.opaqueContext, route,
              qualification: 'Unreviewed user task; routing metadata is not a correct-label or success assertion.' }, null, 2) + '\n');
          } finally { closeSync(fd); }
          if (process.platform === 'win32') await privacy.protectPrivatePath(join(directory, `${route.decisionId}.json`), false, controller.signal);
          controller.signal.throwIfAborted();
          saved++;
        } catch { failed = true; }
      });
    },
  };
}


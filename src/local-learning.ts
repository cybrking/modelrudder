import { closeSync, constants, fstatSync, mkdirSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPrivatePathSync, protectPrivatePathSync } from './private-files.ts';
import { decisionIdPattern } from './outcome.ts';
import type { UsageSnapshot } from './session-usage.ts';
import { routerVersion } from './runtime-policy.ts';
import { randomUUID } from 'node:crypto';

export type LearningTask = { task: string; previousUserTasks: string[]; opaqueContext: boolean };

/** Explicit local opt-in; task text never enters the ordinary usage log. */
export function createLocalLearning(directory?: string) {
  const sessionId = randomUUID();
  let failed = false, saved = 0, ready = false;
  if (directory) {
    try {
      const created = mkdirSync(directory, { recursive: true, mode: 0o700 });
      if (created && process.platform === 'win32') protectPrivatePathSync(directory, true);
      if (!isPrivatePathSync(directory, true)) throw new Error('Private directory required');
      ready = true;
    } catch { failed = true; }
  }
  return {
    get enabled() { return Boolean(directory); },
    get failed() { return failed; },
    get saved() { return saved; },
    write(task: LearningTask, route: UsageSnapshot['latestRoute']) {
      if (!ready || !directory || !route) return;
      try {
        if (!decisionIdPattern.test(route.decisionId) || !task.task.trim() || task.task.length > 100_000 ||
            task.previousUserTasks.length > 2 || task.previousUserTasks.some(t => t.length > 4000) ||
            !isPrivatePathSync(directory, true)) throw new Error('Invalid capture');
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
        if (process.platform === 'win32') protectPrivatePathSync(join(directory, `${route.decisionId}.json`));
        saved++;
      } catch { failed = true; }
    },
  };
}

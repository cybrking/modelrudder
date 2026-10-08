import { appendFileSync, closeSync, constants, fchmodSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, unlinkSync } from 'node:fs';
import { isPrivatePathSync, protectPrivatePathSync } from './private-files.ts';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { formatSessionUsage } from './session-usage.ts';
import type { UsageSnapshot } from './session-usage.ts';

export const usageDirectory = process.env.SMART_CODEX_STATE_DIR
  ? join(process.env.SMART_CODEX_STATE_DIR, 'logs') : fileURLToPath(new URL('../.smart-codex/', import.meta.url));

export function latestUsageFile(directory = usageDirectory): string | undefined {
  const latest = readdirSync(directory).filter(name => /^\d+-[\da-f-]+\.jsonl$/.test(name)).sort().at(-1);
  return latest ? join(directory, latest) : undefined;
}

// Only explicit --apply removes old completed sessions; active/unknown logs stay.
export function runLogCleanup(args: string[], directory = usageDirectory, out = (s: string) => process.stdout.write(s)) {
  try {
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
      out('Usage: smart-codex logs cleanup --older-than-days DAYS [--apply]\nDefaults to a preview; retains active, unknown, and symbolic-link logs.\n'); return 0;
    }
    if (args[0] !== '--older-than-days' || !/^\d+$/.test(args[1] ?? '') ||
        ![2, 3].includes(args.length) || (args.length === 3 && args[2] !== '--apply')) throw new Error();
    const days = Number(args[1]);
    if (!Number.isSafeInteger(days) || days < 1) throw new Error();
    const cutoff = Date.now() - days * 86400000;
    let sessions = 0;
    for (const name of readdirSync(directory)) {
      if (!/^\d+-[\da-f-]+\.jsonl$/.test(name)) continue;
      const path = join(directory, name), info = lstatSync(path);
      if (!info.isFile() || info.isSymbolicLink() || info.mtimeMs >= cutoff) continue;
      try { if (readUsageTail(path)?.ended !== true) continue; } catch { continue; }
      if (args[2] === '--apply') {
        unlinkSync(path);
        const outcomePath = `${path}.outcomes.jsonl`;
        try { const outcome = lstatSync(outcomePath); if (outcome.isFile() && !outcome.isSymbolicLink()) unlinkSync(outcomePath); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      sessions++;
    }
    out(`${args[2] === '--apply' ? 'Removed' : 'Would remove'} ${sessions} completed session logs and associated outcome records older than ${days} days.\n`);
    return 0;
  } catch { out('Could not clean logs. Use --older-than-days DAYS [--apply] with a readable log directory.\n'); return 1; }
}

// Writes only the accounting snapshot: no raw RPC, prompts, paths, credentials,
// response text, or thread IDs. A telemetry failure never blocks execution.
export function createUsageLog(directory = usageDirectory) {
  let path: string | undefined, fd: number | undefined, failed = false;
  try {
    const created = mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (process.platform === 'win32' && created) protectPrivatePathSync(directory, true);
    const info = lstatSync(directory);
    if (!info.isDirectory() || info.isSymbolicLink() || !isPrivatePathSync(directory, true)) throw new Error('Private directory required');
    path = join(directory, `${Date.now()}-${randomUUID()}.jsonl`);
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
    fchmodSync(fd, 0o600);
    if (process.platform === 'win32') protectPrivatePathSync(path);
  } catch { failed = true; if (fd !== undefined) closeSync(fd); fd = undefined; path = undefined; }
  return {
    get path() { return path; }, get failed() { return failed; },
    write(snapshot: UsageSnapshot) {
      if (fd === undefined) return;
      try { appendFileSync(fd, `${JSON.stringify({ ...snapshot, timestamp: new Date().toISOString() })}\n`); }
      catch { failed = true; closeSync(fd); fd = undefined; }
    },
    close() { if (fd !== undefined) { closeSync(fd); fd = undefined; } },
  };
}

export function readUsageTail(path: string): UsageSnapshot | undefined {
  if (!isPrivatePathSync(path)) throw new Error('Private regular usage file required');
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || (process.platform !== 'win32' && (info.mode & 0o077))) throw new Error('Private regular usage file required');
    const size = info.size;
    const start = Math.max(0, size - 32 * 1024);
    const buffer = Buffer.alloc(size - start);
    const bytes = readSync(fd, buffer, 0, buffer.length, start);
    const text = buffer.subarray(0, bytes).toString('utf8');
    const lines = text.split('\n'); lines.pop(); // Ignore an incomplete append.
    if (start) lines.shift();
    const last = lines.at(-1);
    if (!last) return;
    const s = JSON.parse(last);
    if (s.version !== 1 || typeof s.timestamp !== 'string' || !s.tokens || !s.jev || !s.byModel) throw new Error('Invalid usage log');
    return s;
  } finally { closeSync(fd); }
}

export async function monitorUsage(path?: string) {
  if (!path) {
    try {
      const latest = readdirSync(usageDirectory).filter(name => /^\d+-[\da-f-]+\.jsonl$/.test(name)).sort().at(-1);
      if (latest) path = join(usageDirectory, latest);
    } catch { /* The first session may not have been launched yet. */ }
  }
  if (!path) { process.stdout.write('No smart-codex session log yet. Start smart-codex first.\n'); return; }
  process.stdout.write(`Monitoring ${path}\n`);
  let stopped = false, previous = '';
  const stop = () => { stopped = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  try {
    while (!stopped) {
      let snapshot: UsageSnapshot | undefined;
      try { snapshot = readUsageTail(path); }
      catch { process.stdout.write('Cannot read session usage log.\n'); return; }
      if (snapshot) {
        const serialized = JSON.stringify(snapshot);
        if (serialized !== previous) {
          if (process.stdout.isTTY) process.stdout.write('\x1b[2J\x1b[H');
          process.stdout.write(`${formatSessionUsage(snapshot, {
            emphasis: Boolean(process.stdout.isTTY && !('NO_COLOR' in process.env) && process.env.TERM !== 'dumb'),
          })}\n`); previous = serialized;
        }
        if (snapshot.ended) return;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } finally { process.off('SIGINT', stop); process.off('SIGTERM', stop); }
}

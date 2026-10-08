import { appendFileSync, closeSync, constants, fchmodSync, fstatSync, openSync, readFileSync } from 'node:fs';
import { latestUsageFile, readUsageTail, usageDirectory } from './usage-log.ts';

export const decisionIdPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export type ReportedOutcome = {
  version: 1; decisionId: string; result: 'accepted' | 'rejected'; reviewMinutes: number | null;
  source: 'user-reported'; recordedAt: string;
};
export function parseReportedOutcome(value: unknown): ReportedOutcome {
  const v = value as Record<string, unknown>;
  if (!v || typeof v !== 'object' || Array.isArray(v) || v.version !== 1 ||
      typeof v.decisionId !== 'string' || !decisionIdPattern.test(v.decisionId) ||
      !['accepted', 'rejected'].includes(String(v.result)) || v.source !== 'user-reported' ||
      !(v.reviewMinutes === null || (typeof v.reviewMinutes === 'number' && Number.isFinite(v.reviewMinutes) && v.reviewMinutes >= 0)) ||
      typeof v.recordedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v.recordedAt) || !Number.isFinite(Date.parse(v.recordedAt))) throw new Error('Invalid outcome');
  return { version: 1, decisionId: v.decisionId, result: v.result as 'accepted' | 'rejected',
    reviewMinutes: v.reviewMinutes as number | null, source: 'user-reported', recordedAt: v.recordedAt };
}
function readRecords(fd: number): ReportedOutcome[] {
  const info = fstatSync(fd);
  if (!info.isFile() || info.size > 1024 * 1024 || (info.mode & 0o077)) throw new Error('Invalid outcome file');
  const text = readFileSync(fd, 'utf8');
  if (text && !text.endsWith('\n')) throw new Error('Incomplete outcome file');
  return text.split('\n').filter(Boolean).map(line => parseReportedOutcome(JSON.parse(line)));
}
export function readOutcomeEvents(logPath: string): ReportedOutcome[] {
  let fd: number;
  try { fd = openSync(`${logPath}.outcomes.jsonl`, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  try { return readRecords(fd); }
  finally { closeSync(fd); }
}
export function readLatestOutcome(logPath: string, decisionId: string | null | undefined): ReportedOutcome | null {
  if (!decisionId || !decisionIdPattern.test(decisionId)) return null;
  return readOutcomeEvents(logPath).findLast(r => r.decisionId === decisionId) ?? null;
}

export function runOutcomeCommand(args: string[], directory = usageDirectory,
  out = (s: string) => process.stdout.write(s), err = (s: string) => process.stderr.write(s)) {
  try {
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
      out('Usage: smart-codex outcome --result accepted|rejected [--review-minutes N] [--file SESSION.jsonl] [--decision UUID]\nLabels the latest routing decision. --decision guards against labeling a newer turn. Repeating a label appends a correction. User reports are not independent quality verification.\n'); return 0;
    }
    const values = new Map<string, string>();
    for (let i = 0; i < args.length; i += 2) {
      if (!['--result', '--review-minutes', '--file', '--decision'].includes(args[i]) || values.has(args[i]) ||
          !args[i + 1] || args[i + 1].startsWith('--')) throw new Error();
      values.set(args[i], args[i + 1]);
    }
    if (!['accepted', 'rejected'].includes(values.get('--result') ?? '')) throw new Error();
    const minutes = values.get('--review-minutes');
    if (minutes !== undefined && !/^\d+(?:\.\d+)?$/.test(minutes)) throw new Error();
    const logPath = values.get('--file') ?? latestUsageFile(directory);
    if (!logPath) throw new Error();
    const decisionId = readUsageTail(logPath)?.latestRoute?.decisionId;
    if (!decisionId || (values.has('--decision') && values.get('--decision') !== decisionId)) throw new Error();
    const outcome = parseReportedOutcome({ version: 1, decisionId, result: values.get('--result'),
      reviewMinutes: minutes === undefined ? null : Number(minutes), source: 'user-reported', recordedAt: new Date().toISOString() });
    const fd = openSync(`${logPath}.outcomes.jsonl`, constants.O_CREAT | constants.O_APPEND | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
    try {
      readRecords(fd); fchmodSync(fd, 0o600);
      const line = `${JSON.stringify(outcome)}\n`;
      if (fstatSync(fd).size + Buffer.byteLength(line) > 1024 * 1024) throw new Error('Outcome file limit');
      appendFileSync(fd, line);
    } finally { closeSync(fd); }
    out(`Recorded ${outcome.result} for decision ${decisionId} (user-reported).\n`); return 0;
  } catch {
    err('Could not record outcome. Check options, a private valid session log, and its latest decision ID.\n'); return 1;
  }
}

if (import.meta.main) process.exitCode = runOutcomeCommand(process.argv.slice(2));

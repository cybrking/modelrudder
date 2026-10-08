import { routingQualification } from './compatibility.ts';
import { closeSync, constants, fstatSync, openSync, readSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readUsageTail, usageDirectory } from './usage-log.ts';
import { profiles, effortModes, effortReasons, routingReasons } from './types.ts';
import { jevInputPrice, referencePrices } from './session-usage.ts';
import { decisionIdPattern, parseReportedOutcome, readLatestOutcome, readOutcomeEvents } from './outcome.ts';
import { parseProbabilities, parseServedModel } from './policy.ts';
import type { ProfileProbabilities } from './types.ts';

const tokenFields = ['input', 'cached', 'cacheWrite', 'output', 'reasoning'] as const;
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const count = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const amount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const reasons: ReadonlySet<string> = new Set(routingReasons);
function tokenCounts(v: unknown) {
  if (!record(v) || !tokenFields.every(k => count(v[k])) ||
      v.cached + v.cacheWrite > v.input || v.reasoning > v.output) throw new Error('Invalid usage snapshot');
  return Object.fromEntries(tokenFields.map(k => [k, v[k]])) as Record<typeof tokenFields[number], number>;
}
function tokenCost(t: ReturnType<typeof tokenCounts>, rates: readonly number[]) {
  return ((t.input - t.cached - t.cacheWrite) * rates[0] + t.cached * rates[1] +
    t.cacheWrite * rates[2] + t.output * rates[3]) / 1e6;
}
const matchesCost = (stored: number, calculated: number) =>
  Math.abs(stored - calculated) <= Math.max(1e-12, Math.abs(calculated) * 1e-10);

// Reconstruct a shareable report from an allowlist. Never export arbitrary log
// fields, paths, raw messages, or user-supplied model names.
export function createUsageReport(raw: unknown, reportedOutcome?: unknown) {
  if (!record(raw) || raw.version !== 1 || typeof raw.ended !== 'boolean' || typeof raw.partial !== 'boolean' ||
      !record(raw.byModel) || !record(raw.jev) || !count(raw.compactions) ||
      !['calls', 'unknownCalls', 'inputTokens', 'outputTokens'].every(k => count(raw.jev[k])) ||
      raw.jev.unknownCalls > raw.jev.calls || !amount(raw.jev.estimatedUsd) ||
      !amount(raw.apiEquivalentUsd) || !amount(raw.solReferenceUsd) ||
      raw.priceBasis !== '2026-10-01 standard short context') throw new Error('Invalid usage snapshot');
  const tokens = tokenCounts(raw.tokens);
  const byModel: Record<string, ReturnType<typeof tokenCounts>> = {};
  const sum = { input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0 };
  let equivalent = 0, solReference = 0;
  for (const [model, values] of Object.entries(raw.byModel)) {
    if (!Object.hasOwn(referencePrices, model) && model !== 'unattributed') throw new Error('Invalid usage snapshot');
    byModel[model] = tokenCounts(values);
    for (const k of tokenFields) sum[k] += byModel[model][k];
    if (Object.hasOwn(referencePrices, model)) {
      equivalent += tokenCost(byModel[model], referencePrices[model as keyof typeof referencePrices]);
      solReference += tokenCost(byModel[model], referencePrices['gpt-6.1-sol']);
    }
  }
  if (!tokenFields.every(k => Number.isSafeInteger(sum[k]) && sum[k] === tokens[k])) throw new Error('Invalid usage snapshot');
  const classifierUsd = raw.jev.inputTokens * jevInputPrice / 1e6;
  if (!matchesCost(raw.apiEquivalentUsd, equivalent) || !matchesCost(raw.solReferenceUsd, solReference) ||
      !matchesCost(raw.jev.estimatedUsd, classifierUsd)) throw new Error('Invalid usage snapshot');
  const r = record(raw.latestRoute) ? raw.latestRoute : null;
  let probabilities: ProfileProbabilities | null = null;
  let servedModel: string | null = null;
  try { probabilities = parseProbabilities(r?.probabilities, r?.proposed); } catch {}
  try { servedModel = parseServedModel(r?.servedModel); } catch {}
  const requestedModel = r && Object.hasOwn(referencePrices, r.model) ? r.model as string : null;
  const decisionId = r && typeof r.decisionId === 'string' && decisionIdPattern.test(r.decisionId) ? r.decisionId : null;
  const outcome = reportedOutcome == null ? null : parseReportedOutcome(reportedOutcome);
  if (outcome && outcome.decisionId !== decisionId) throw new Error('Outcome does not match latest decision');
  const partial = raw.partial || !!byModel.unattributed || raw.jev.unknownCalls > 0;
  return {
    schema: 'smart-router-session-report', version: 1,
    qualification: { status: routingQualification.status, taskQualityVerified: false, confidenceCalibrated: false },
    session: { ended: raw.ended, coverage: partial ? 'partial' : 'reported-events-only' },
    tokens, byModel,
    attribution: 'Inferred from session model settings; backend reroutes are unattributed. Not verified per-response model identity.',
    routing: {
      decisionId, decisionCount: count(raw.decisionCount) ? raw.decisionCount : null,
      policyVersion: ['1', '2', '3', '4'].includes(r?.policyVersion) ? r!.policyVersion as string : null,
      policyHash: typeof r?.policyHash === 'string' && /^[a-f0-9]{64}$/.test(r.policyHash) ? r.policyHash : null,
      classifierVersion: r?.classifierVersion === 'jev-latest:rubric-2026-10-01' ? r.classifierVersion : null,
      probabilities, servedModel,
      latestRequestedModel: requestedModel, latestVerifiedEffectiveModel: null,
      latestRequestedEffort: r?.effort === 'low' || r?.effort === 'medium' ? r.effort as string : null,
      latestVerifiedEffectiveEffort: null,
      proposedEffort: r?.proposedEffort === 'low' || r?.proposedEffort === 'medium' ? r.proposedEffort as string : null,
      effortMode: r && effortModes.includes(r.effortMode) ? r.effortMode as string : null,
      effortReason: r && effortReasons.includes(r.effortReason) ? r.effortReason as string : null,
      proposedProfile: r && profiles.includes(r.proposed) ? r.proposed : null,
      reportedConfidence: r && typeof r.confidence === 'number' && Number.isFinite(r.confidence) && r.confidence >= 0 && r.confidence <= 1 ? r.confidence : null,
      reason: r && reasons.has(r.reason) ? r.reason : 'unknown',
      latencyMs: r && amount(r.routingLatencyMs) ? r.routingLatencyMs : null,
      modelOverridden: r && typeof r.modelOverridden === 'boolean' ? r.modelOverridden : null,
      effortOverridden: r && typeof r.effortOverridden === 'boolean' ? r.effortOverridden : null,
      collaborationSettingsOverridden: r && typeof r.collaborationSettingsOverridden === 'boolean' ? r.collaborationSettingsOverridden : null,
    },
    classifier: {
      calls: raw.jev.calls as number, unknownUsageCalls: raw.jev.unknownCalls as number,
      reportedInputTokens: raw.jev.inputTokens as number, reportedOutputTokens: raw.jev.outputTokens as number,
      estimatedUsd: classifierUsd,
    },
    referenceComparison: {
      priceBasis: raw.priceBasis as string,
      pricedUsageApiEquivalentUsd: equivalent,
      sameObservedTokensAtSolUsd: solReference,
      coveredRateDifferenceAfterReportedClassifierUsd: solReference - equivalent - classifierUsd,
      interpretation: 'Same-token rate comparison only; not a counterfactual baseline run or measured savings.',
    },
    compactions: raw.compactions as number,
    outcomes: { latestUserReportedOutcome: outcome, acceptedTasks: null, reviewMinutes: null, taskSuccessRate: null,
      actualSubscriptionMoneySaved: null, tokensAvoided: null },
    limitations: [
      'Only received usage events are counted; missing usage can remain undetected.',
      'Classifier confidence does not measure task success.',
      'API equivalents do not measure subscription charges or allowance consumption.',
      'Reference rates exclude service tiers, long context, region, tools and unreported usage.',
      'Quality and savings require matched baseline runs and task-specific outcome scoring.',
    ],
  };
}
// Reconstruct all recorded decisions from snapshots, never infer per-turn usage.
// Bounds and strict allowlists also apply to this longitudinal export.
export function readDecisionReport(path: string) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  let text: string;
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > 16 * 1024 * 1024 || (info.mode & 0o077)) throw new Error('Invalid decision log');
    const buffer = Buffer.alloc(info.size);
    const bytes = readSync(fd, buffer, 0, buffer.length, 0);
    text = buffer.subarray(0, bytes).toString('utf8');
  } finally { closeSync(fd); }
  const lines = text.split('\n'); lines.pop();
  const decisions = new Map<string, UsageReport['routing']>();
  let expected = 0, ended = false, incomplete = false;
  for (const line of lines) {
    const snapshot = JSON.parse(line), report = createUsageReport(snapshot);
    if (!count(snapshot.decisionCount) || snapshot.decisionCount < expected) throw new Error('Invalid decision sequence');
    expected = snapshot.decisionCount; ended = report.session.ended;
    const id = report.routing.decisionId;
    if (id) decisions.set(id, report.routing);
    if (decisions.size > 10_000) throw new Error('Decision limit exceeded');
    if (expected !== decisions.size) incomplete = true;
  }
  if (!lines.length) throw new Error('No complete snapshots');
  const outcomes = readOutcomeEvents(path);
  return { schema: 'smart-router-decision-report', version: 1, ended,
    coverage: incomplete || expected !== decisions.size ? 'incomplete' : 'recorded-decisions-only',
    expectedDecisionCount: expected, recordedDecisionCount: decisions.size,
    taskQualityVerified: false, perDecisionUsage: null,
    decisions: [...decisions.values()], outcomes: outcomes.filter(o => decisions.has(o.decisionId)),
    unmatchedOutcomeCount: outcomes.filter(o => !decisions.has(o.decisionId)).length,
    limitations: ['User outcome labels are not independent quality validation.',
      'Snapshot logging can miss decisions. Per-decision tokens and complete task context are unavailable.'] };
}
export type UsageReport = ReturnType<typeof createUsageReport>;

export function formatUsageReport(r: UsageReport) {
  const money = (n: number) => `$${n.toFixed(6)}`;
  const lines = ['# Smart Router session evidence', '',
    `Session: ${r.session.ended ? 'finished' : 'live'}; coverage: ${r.session.coverage}.`, '',
    `Reported tokens: ${r.tokens.input} input, ${r.tokens.output} output, ${r.tokens.cached} cached input.`, '',
    '| Model attribution | Input | Output |', '|---|---:|---:|',
    ...Object.entries(r.byModel).map(([model, t]) => `| ${model} | ${t.input} | ${t.output} |`), '',
    r.attribution, '',
    `Latest requested model: ${r.routing.latestRequestedModel ?? 'unknown'}. Verified effective model: unknown.`,
    `Effort: proposed ${r.routing.proposedEffort ?? 'unknown'}; executed setting ${r.routing.latestRequestedEffort ?? 'unknown'}; mode ${r.routing.effortMode ?? 'unknown'}; ${r.routing.effortReason ?? 'unknown'}. Verified effective effort: unknown.`,
    `Decision: ${r.routing.decisionId ?? 'unknown'}; policy ${r.routing.policyVersion ?? 'unknown'} / ${r.routing.policyHash ?? 'unknown'}.`,
    `Routing reason: ${r.routing.reason}; reported confidence: ${r.routing.reportedConfidence ?? 'unknown'}.`,
    `Jev served model: ${r.routing.servedModel ?? 'unknown'}.`,
    `Profile probabilities: ${r.routing.probabilities ? Object.entries(r.routing.probabilities).map(([profile, probability]) => `${profile} ${probability.toFixed(3)}`).join('; ') : 'unknown'}.`,
    `Latest routing latency: ${r.routing.latencyMs === null ? 'unknown' : `${r.routing.latencyMs.toFixed(1)} ms`}.`,
    `Recognized incoming settings overridden: model ${r.routing.modelOverridden ?? 'unknown'}, effort ${r.routing.effortOverridden ?? 'unknown'}, collaboration ${r.routing.collaborationSettingsOverridden ?? 'unknown'}.`, '',
    `Classifier: ${r.classifier.calls} calls, ${r.classifier.unknownUsageCalls} with unknown usage; reported usage estimate ${money(r.classifier.estimatedUsd)}.`, '',
    `Priced usage API equivalent: ${money(r.referenceComparison.pricedUsageApiEquivalentUsd)}. Same observed tokens at Sol: ${money(r.referenceComparison.sameObservedTokensAtSolUsd)}.`,
    `Covered rate difference after reported classifier: ${money(r.referenceComparison.coveredRateDifferenceAfterReportedClassifierUsd)}.`,
    r.referenceComparison.interpretation, `Rate basis: ${r.referenceComparison.priceBasis}.`, '',
    'Accepted tasks, review time, success rate, subscription dollars saved and tokens avoided: unknown.', '',
    ...(r.outcomes.latestUserReportedOutcome ? [`Latest decision user report: ${r.outcomes.latestUserReportedOutcome.result}; review minutes ${r.outcomes.latestUserReportedOutcome.reviewMinutes ?? 'unknown'}. This is a user label, not independent validation.`, ''] : []),
    ...r.limitations.map(l => `- ${l}`), ''];
  return lines.join('\n');
}

export const reportHelp = `Usage: smart-codex report [--file SESSION.jsonl] [--format markdown|json] [--output FILE]
       npm run report -- [same options]

Export the last complete accounting snapshot, or the latest session by default.
No inference calls. Output contains allowlisted metadata, not prompts or paths.
--decisions exports all recorded decisions and user outcome corrections as bounded JSON.
Output files are private (0600); an existing file is never overwritten.
This report does not measure task quality, subscription savings or tokens avoided.
`;
export function runUsageReport(args: string[], directory = usageDirectory,
  out: (text: string) => void = text => process.stdout.write(text),
  err: (text: string) => void = text => process.stderr.write(text)) {
  try {
    if (args.length === 1 && ['--help', '-h'].includes(args[0])) { out(reportHelp); return 0; }
    const decisions = args.includes('--decisions');
    if (args.filter(a => a === '--decisions').length > 1) throw new Error();
    args = args.filter(a => a !== '--decisions');
    let file: string | undefined, output: string | undefined, format = decisions ? 'json' : 'markdown';
    const seen = new Set<string>();
    for (let i = 0; i < args.length; i += 2) {
      const option = args[i], value = args[i + 1];
      if (!['--file', '--format', '--output'].includes(option) || seen.has(option) || !value || value.startsWith('--')) throw new Error();
      seen.add(option);
      if (option === '--file') file = value;
      if (option === '--output') output = value;
      if (option === '--format') format = value;
    }
    if (decisions && format !== 'json') throw new Error();
    if (!['markdown', 'json'].includes(format)) throw new Error();
    if (!file) {
      const latest = readdirSync(directory).filter(name => /^\d+-[\da-f-]+\.jsonl$/.test(name)).sort().at(-1);
      if (latest) file = join(directory, latest);
    }
    if (!file) throw new Error();
    const snapshot = decisions ? undefined : readUsageTail(file);
    const report = decisions ? readDecisionReport(file) : createUsageReport(snapshot, readLatestOutcome(file, snapshot?.latestRoute?.decisionId));
    const text = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : formatUsageReport(report as UsageReport);
    if (output) writeFileSync(output, text, { flag: 'wx', mode: 0o600 });
    else out(text);
    return 0;
  } catch {
    err('Could not export report. Check options, a valid complete session log, and a new writable output file.\n');
    return 1;
  }
}
if (import.meta.main) process.exitCode = runUsageReport(process.argv.slice(2));

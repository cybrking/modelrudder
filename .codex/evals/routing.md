# Routing lifecycle regression evaluation

Defined October 9, 2026, before running `npm run eval:routing`.

Scope: both local adapters, with synthetic classifier responses and native event fixtures. These evaluate routing correctness and disclosure boundaries, not classifier accuracy or task quality. The command reuses the actual runtime regression tests; it does not introduce a second implementation of the routing policy.

## Command and acceptance criteria

```sh
npm ci --ignore-scripts
npm run eval:routing
```

Run on Node 24 or 26 with local loopback access. Every test in the five selected suites must pass, with zero failures, cancellations or skips. Assertion failures are the grader; test totals are not quality statistics.

| Named evaluation | Fixtures and grader |
| --- | --- |
| successive-user-turns | `claude-mod.test.ts`: three distinct user tasks with consumed prompt receipts must each classify exactly once, select Haiku/Opus/Haiku, and hold the choice across tool steps. Previous task excerpts must be bounded. |
| execution-mode-contract | `claude-routing.test.ts`, `claude-mod.test.ts`, `effort-routing.test.ts`: auto applies qualified choices; observe executes its baseline/native choice; pinned never classifies. Effort and stream forwarding must match the adapter contract. |
| opaque-context | `claude-mod.test.ts`, `context-eligibility.test.ts`: media, references, resume, compaction, hidden instructions and unobserved input must not authorize a downgrade or disclose hidden text. Fresh creation or Claude `/clear` restores only observed context eligibility. |
| cancellation-and-late-results | `claude-routing.test.ts`, `claude-mod.test.ts`, `turn-lifecycle.test.ts`: interrupted/deleted/closed turns must cancel once, never execute late results, and never mutate a newer turn. Aborted Claude tasks must leave classifier context. |
| fallback-and-native-control | `claude-routing.test.ts`, `claude-mod.test.ts`: uncertainty, timeout, invalid output and provider failure must use fallback without replay; native model changes and version fallback must remain authoritative. |
| bridge-and-report-boundaries | `claude-routing.test.ts`, `claude-mod.test.ts`: reject wrong credentials, browser origins and malformed input; completion/report metadata must exclude prompts, answers and arbitrary provider diagnostics. |

## Separate native qualification

`claude plugin test plugins/claude` runs the adapter fixtures through the official Mods loader. `npm run test:claude-native` checks model IDs on the official CLI's provider wire using synthetic loopback responses. `npm run test:native-protocol` checks Codex initialization and read-only thread creation without inference. Normal PR CI pins Claude 2.1.295 and Codex 0.161.0 on macOS, Ubuntu and Windows with Node 24/26.

These checks do not qualify an authenticated Claude terminal session. See [release readiness](../../docs/RELEASE_READINESS.md) for evidence and remaining terminal journeys.

## Task-quality evaluation: pending

Before claiming routing quality, run the same representative tasks through routed and baseline execution in disposable workspaces. Include small edits, multi-file changes, debugging, concurrency/security review and architectural work. Define expected behavior and executable tests or a documented independent review rubric before each run. Record the requested and executed model, classification latency, fallback reason, and grader result for both runs. Report failed routed tasks that pass at baseline as potential incorrect downgrades; do not infer unnecessary escalation from a profile label alone.

No live classifier/executor comparisons, calibrated confidence, aggregate latency, quality rates or savings figures are established by this regression evaluation.

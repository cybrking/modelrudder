# Live Claude qualification

> **Historical scope:** This procedure and its recorded results apply to the previous Claude Mods routing adapter. Advisory smart-claude uses the native CLI on PATH and explicit recommendations without loading that mod. These results do not qualify the new advisory path; see [current Claude support](CLAUDE_CODE.md).

Use the installed `smart-claude` in a real terminal with the user's native Claude subscription login and a disposable repository. Synthetic bridge checks and successful classifier responses are prerequisites, not substitutes for this exercise. Never copy credentials, disable permissions or bypass plugin/organization trust.

## Bounded first pass

Use at most eight coding prompts and ten minutes of model execution for the first pass. Stop on authentication, billing, permissions or routing failures. Record native and ModelRudder versions, requested classifier/model, classifier version where available, routing mode, native effort and starting repository state. Count retries and interruptions in usage; mark unobservable native cost/effective model as unknown. Keep private native transcripts local; publish only sanitized evidence.

| Journey | Acceptance evidence |
| --- | --- |
| Authentication and startup | Native terminal is logged in; routing plugin reports ready; selected provider is visible; native permission mode and effort are preserved. A doctor result alone does not prove the token remains valid. |
| Observe mode | Submit a simple edit request. Observe recommendation is recorded while Sonnet executes. Independently inspect the edit and run its acceptance check. |
| Automatic routing | Submit successive unrelated plain-text tasks, waiting for each completion. Each eligible turn gets one classification; tool steps retain the selected model. Record actual model only where native evidence exposes it. |
| Permission acceptance and denial | Request a harmless file write/command in the disposable directory; exercise native accept and deny. Denied action must not execute or be silently retried through a different tool. |
| Interruption | Interrupt a bounded running task. No late classification may start or alter another turn; the next prompt works normally. |
| Resume | Exit normally and resume the disposable session. Restored/opaque context must not authorize an unsafe downgrade; native session continuity is retained. |
| Compaction | Use native compaction on the test conversation. Verify the router treats the changed context conservatively, then use a fresh clear/new conversation to restore eligibility. Do not manufacture a large token bill just to fill context. |
| Classifier failure and recovery | With an isolated test configuration, exercise a bounded Jev failure and verify native fallback without changing permissions. Restore the valid configuration in a new session and verify routing recovers. Do not alter shared credentials or services. |
| Exit and reports | Normal exit restores terminal state. Metadata reports agree with observed routes, native completion events and available usage. A completion event is not proof of task success: native permission denial may appear as an interrupted turn in the UI while the Mods event reports a normal completion. Check the task outcome separately. No keys, task text or private transcript content appear in default reports. |

Run the routing journeys with Jev and existing explicit classification consent. Test native effort preservation separately from Codex's effort selection. Add Linux/Windows desktop checks before claiming cross-platform live qualification. Task quality requires frozen executable acceptance tests and held-out comparisons beyond this smoke pass.

## October 22 macOS evidence

Authenticated checks used Claude Code 2.1.303, native manual permissions and medium effort in a disposable arithmetic fixture. Jev was selected with existing explicit consent. Observe mode displayed a Haiku recommendation while native Sonnet executed an edit; automatic routing selected Haiku for eligible coding turns. Accepted edits passed independent Node tests, growing the fixture suite from three to five tests. Native UI model displays and routing recommendations are separate observations; subscription cost and effective backend model are not independently observable.

| Journey | Observed result |
| --- | --- |
| Authentication/startup | Native login succeeded; the routing plugin launched and medium effort/manual permissions remained visible. |
| Approvals | Native edit/test approvals were accepted individually. A denied marker-file request created no file. An earlier denied read-only MCP request interrupted its turn; that coding request was retried and is included in the usage observations. |
| Resume/compaction | A resumed session and the turn after native `/compact` retained the native model with `Unclassified context` and no classifier call. After `/clear`, a fresh prompt classified again. |
| Classifier failure/recovery | An isolated fake-key configuration produced `Classifier unavailable` and native Sonnet fallback. A fresh session using the valid configuration classified and selected Haiku. Shared credentials were unchanged. |
| Interruption/recovery | Ctrl-C canceled a running cube-edit request before any requested edit remained on disk. The report recorded one native abort signal. A resumed harmless prompt answered correctly without a new classifier call. |
| Exit/accounting | Sessions exited normally and restored terminal state. A denied native permission could still emit a normal completion event; the report's event counts do not prove task success or every UI interruption. Failed Jev invocations are labeled attempts. |

The initial coding/denial tasks used the rebuilt payload after PR #37. Resume, compaction, classifier failure/recovery and interruption used installer `0.1.0-preview.14-b22bbc59c3cf217c` from `62cc451`. PRs #38 and #39 corrected reporting labels after the live observations; their regressions and the final `f1be9ff` revision passed automated checks. The final installer is `0.1.0-preview.14-031574e47215d93f`. These records do not claim every live journey was repeated on that final artifact. Applicable Linux/Windows interactive journeys remain untested.

## Historical preview.12 evidence

The following predates Jev-only support and does not qualify the current setup.

On 2026-10-15, managed Claude 2.1.295 launched in a disposable macOS directory with local Tev and native manual permissions. Native workspace trust was shown and accepted for the newly created test directory. The UI preserved medium effort and displayed Sonnet 5.5. The `/status` screen then reported **Login: Expired — log in again**. No coding prompt was submitted; the launcher exited normally with zero decisions, classifications and completed turns.

At that time, native login had to be refreshed before coding journeys could run. Preview.12 does not claim this table passed. Its separate automated release-candidate suite passed 204 tests with one Windows-only skip; the earlier live local classifier smoke passed five requests across both rubrics.

# Live Claude qualification

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
| Exit and reports | Normal exit restores terminal state. Metadata reports agree with observed routes, completions and available usage. No keys, task text or private transcript content appear in default reports. |

Run the routing journeys with Jev and existing explicit classification consent. Test native effort preservation separately from Codex's effort selection. Add Linux/Windows desktop checks before claiming cross-platform live qualification. Task quality requires frozen executable acceptance tests and held-out comparisons beyond this smoke pass.

## Historical preview.12 evidence

The following predates Jev-only support and does not qualify the current setup.

On 2026-10-15, managed Claude 2.1.295 launched in a disposable macOS directory with local Tev and native manual permissions. Native workspace trust was shown and accepted for the newly created test directory. The UI preserved medium effort and displayed Sonnet 5.5. The `/status` screen then reported **Login: Expired — log in again**. No coding prompt was submitted; the launcher exited normally with zero decisions, classifications and completed turns.

The user must refresh native login before the remaining live journeys can be qualified. Preview.12 does not claim this table has passed. Its separate automated release-candidate suite passed 204 tests with one Windows-only skip; the earlier live local classifier smoke passed five requests across both rubrics.

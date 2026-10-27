# Advisory live qualification — October 26, 2026

## Exact candidate and environment

- Merged source: `b0e1b64992455c3ea0b888d50c32c8d2b6e217a6` (PR #41).
- Runtime: `0.1.0-preview.15-b89f18c2ce4c307f`.
- Installer SHA-256: `fd7e8cd17886c1a1c9d65ae9d365d1e70890e3d1e03aaee5b3cc40a7d97b07b7`.
- macOS 26.6.2 (25G83), Node 26.8.1, existing native Codex 0.164.0.
- Downloaded draft assets passed checksum verification. The exact installer was installed into disposable runtime/bin paths, using the existing private classifier file without printing or modifying its contents. The active ModelRudder installation, native CLI, login and PATH were not replaced.
- All six jobs in [post-merge CI 40419251270](https://github.com/cybrking/modelrudder/actions/runs/40419251270) passed. Installers downloaded from all six jobs were identical to this candidate.

## Observed results

| Check | Result |
| --- | --- |
| Prerequisites | Installed classifier status and doctor passed; existing classification was enabled. No saved consent or kill switch was changed. |
| Explicit advice | Sol + arithmetic produced a Luna suggestion; current Luna produced no note. Claude current Sonnet produced a Haiku suggestion. Commands exited zero. |
| Native hook trust | Native review identified the new candidate hook as requiring trust. After explicit user authorization, only that hook was trusted through the native UI. Existing hooks remained present; UserPromptSubmit showed two active hooks. No trust-bypass option was used. |
| Advice and model preservation | Arithmetic displayed the Luna suggestion, returned `4`, and retained Sol medium. Repeating it returned `4` without another note. |
| Manual selection | `/model gpt-6-luna` changed only the native session model. Arithmetic returned `6`, retaining Luna medium without stale advice. |
| Compaction | Native `/compact` completed. A subsequent arithmetic task returned `8`, retaining Luna medium. |
| Interruption | Escape interrupted an in-progress no-tools explanation; native UI displayed “Conversation interrupted.” An earlier short attempt finished before interruption and is not counted. |
| Resume | Normal exit returned zero. Resuming the same session retained Luna medium and read-only/ask-for-approval permissions; a fresh arithmetic task returned `10`. |
| Manual denial | With session-only `approvals_reviewer="user"`, the native command dialog was denied. Independent filesystem inspection confirmed the requested marker did not exist, including after the following accepted operation. No retry was observed. |
| Manual acceptance | The next native command dialog was accepted for that invocation only. Independent inspection confirmed the expected empty marker existed. No persistent prefix approval was selected. |
| Final exit | The resumed session exited normally with code zero. Disposable runtime and marker files were removed after verification. |

## Approval-test qualification

The first marker attempt inherited the user's saved `approvals_reviewer="auto_review"`, even with `-a on-request`, and was automatically approved. That attempt does not qualify manual denial. The successful denial/acceptance checks used `-c 'approvals_reviewer="user"'` for the resumed invocation only; the saved automatic-review setting was unchanged.

After denial, the native transcript included a generic “Ran” entry despite also showing cancellation. Filesystem absence, not that generic entry, establishes the denied marker outcome.

The user authorized bounded live classifier/model requests and the specific hook trust decision. Native workspace/approval controls were retained. No private account identifiers, credentials or raw transcripts are included here. This is bounded smoke evidence, not a reliability, task-quality or savings claim.

## Future platform qualification

Linux and Windows authenticated native terminal journeys have not been run. No configured SSH host or installed Windows VM was available in this workspace; access or independent tester evidence is required. Cross-platform CI and synthetic native smoke do not substitute for these journeys.

Repeat the exact-candidate checks above on each platform, including normal trust review, advice/model preservation, duplicate suppression, manual switch, compaction, interruption, resume, approval denial/acceptance and exit. Use local native login and private classifier configuration; do not copy credentials between environments. The maintainer subsequently scoped preview.15 to macOS only. These remaining platform journeys do not block this macOS release; Linux and Windows remain coming soon until their own evidence is recorded.

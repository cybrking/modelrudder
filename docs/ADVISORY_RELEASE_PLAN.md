# Advisory release plan

Release `0.1.0-preview.15` for macOS only. On October 26 the maintainer authorized publication with Linux and Windows excluded and marked coming soon. Preserve the verified runtime payload, native trust, private configuration and recovery paths.

## Acceptance criteria

- Bare `smart-codex` and `smart-claude` launch the native executable on PATH. Model, effort, tools, approvals and login remain native.
- Explicit `recommend` classifies only the supplied task, never executes it, and stays silent for a matching model, disabled consent or unavailable advice.
- Codex notes use normal native hook trust, preserve existing hooks, never inject model context or rewrite execution, and bound failures and cancellation. Repeated identical notes are suppressed; model changes and resumed sessions cannot reuse stale advice.
- Existing configurations, credentials, usage/learning records and retained releases survive installation, upgrade and rollback. Classifier credentials never reach native child environments or public artifacts.
- Public commands, npm scripts, CI and docs describe advisory behavior. Legacy recovery checks are labeled separately.
- Every readiness claim names the tested revision, platform and scope. Unperformed journeys remain blockers.

## Work sequence

| Step | Scope | Validation |
| --- | --- | --- |
| Review and fix | `src/advisory*.ts`, native launchers, classifier and their callers | ECC code/security review; reproduce confirmed defects with failing tests, then apply minimal fixes |
| Evaluate | `test/advisory*.test.ts`, advisory eval contract and native smoke script | Deterministic recommendation, failure, consent, deduplication, model-change, session and interruption checks; isolate synthetic native-provider work from paid inference |
| Align entrypoints and CI | `package.json`, lockfile, `.github/workflows/client.yml` | Advisory diagnostic/evaluation commands; six OS/Node jobs; native hook discovery/warning smoke; retain recovery coverage |
| Prepare candidate | Version metadata, `scripts/release.ts`, installer tests | Exact allowlist, reproducible build, checksum, isolated upgrade/rollback and preserved fixture state |
| Document and hand off | README, command/install/upgrade guides, release evidence | Current claims match code; release notes link evidence and accurately limit support to macOS |

## Release notes

ModelRudder now recommends model changes and leaves switching to the user. Codex can show a native prompt-time note; both tools offer `recommend --current-model MODEL -- "TASK"`. Claude uses explicit recommendations because its prompt-hook input does not reliably expose the current model.

Normal launches no longer require a managed native CLI or start ModelRudder's execution relay, classifier bridge or model-rewriting mod. Remove retired `--routing` and `--effort-mode` flags from saved commands. Keep native `--model` arguments where desired. Existing managed versions and historical report commands remain available for recovery; they do not select the PATH executable used by advisory launches.

Recommendations are prompt-only, can miss conversation/media context, and do not establish task quality or savings. Codex automatic notes need private saved configuration, classification consent and native hook trust. Unsupported environments retain explicit advice as a fallback. See [advisory behavior](ADVISORY.md) and [migration](UPGRADE.md).

## Publication scope

The macOS gates passed for the exact payload: [live qualification](ADVISORY_LIVE_QUALIFICATION.md) and [release readiness](RELEASE_READINESS.md#macos-advisory-preview15) record the results. Publish the existing verified installer and checksum with macOS-only notes and tagged documentation. Documentation-only edits must reproduce the same installer hash.

Linux/Windows live terminal qualification is deferred to future releases. Do not publish installation instructions or claim support for those platforms in this release. Existing automated development coverage is retained.

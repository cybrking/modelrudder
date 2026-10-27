# ModelRudder command reference

The `0.1.0-preview.15` advisory preview is for macOS only; Linux and Windows are coming soon. Normal launches use the native CLI on PATH; model, effort, login, permissions and tool execution stay native.

## Launch and recommend

```sh
smart-codex
smart-codex resume --last
smart-codex --model gpt-6.1-sol
smart-claude
smart-claude --model sonnet
smart-claude --resume SESSION_ID
```

Normal native options pass through. ModelRudder does not supply a startup model or effort. Codex can show native prompt-hook notes with saved Jev configuration and native trust; Claude uses explicit advice. See [advisory behavior](ADVISORY.md).

```sh
smart-codex recommend --current-model gpt-6.1-sol -- "TASK"
smart-claude recommend --current-model sonnet -- "TASK"
```

The explicit command never executes the task. It accepts one quoted task, at most 64,000 characters. Supply the active model. A different recommendation prints a note; a match or unavailable recommendation prints nothing. Use the native `/model` control yourself if the suggestion is useful.

Legacy `--routing auto|observe|pinned` and `--effort-mode` options are rejected with migration guidance. There is no automatic model selection or fallback model imposed by ModelRudder.

## Configuration and diagnostics

```sh
smart-codex setup --classifier jev
smart-codex setup --no-open
smart-codex classifier status
smart-codex doctor
```

Use `smart-claude` for Claude. Setup shares the existing private configuration; classifier status checks configuration and doctor checks native executable startup plus classifier configuration. Neither submits inference or verifies task quality. See [Jev setup](CLASSIFIER_CHOICES.md).

## Source verification commands

```sh
npm run doctor
npm run doctor:claude
npm run eval:advisory
npm run test:advisory-native -- /PATH/TO/OFFICIAL/CODEX/ENTRY
```

The npm doctor commands use the same advisory diagnostics as the launchers. `eval:advisory` runs deterministic advisory tests. `test:advisory-native` uses an isolated Codex home, a static synthetic note and an unreachable loopback provider to check hook discovery, trust, warning delivery, retained model and read-only permissions without Jev credentials or model inference. It does not certify the interactive terminal. The optional entry argument can identify an official executable or npm JavaScript entry; omitting it uses `codex` on PATH.

`eval:routing`, `test:native-protocol` and `test:claude-native` are retained historical routing/recovery checks. They do not substitute for advisory evaluation. See the [advisory evaluation contract](../.codex/evals/advisory.md) and [release gates](RELEASE_READINESS.md#macos-advisory-preview15).

## Reports

Historical reports and maintenance remain available:

```sh
smart-claude report
smart-codex report
smart-codex outcome --result accepted
smart-codex logs cleanup --older-than-days 30
```

These commands operate on existing routing records. Advisory sessions do not create new routing usage reports, outcome decisions or local learning captures. Cleanup is a preview unless `--apply` is supplied. A historical completion event does not establish task success or savings.

`native install`, `native status` and `native rollback` remain for retained managed installations. They do not select the executable used by advisory launches, which use PATH. See [managed-native history and recovery](NATIVE_VERSIONS.md).

## Data and privacy

With explicit consent, recommendations send only the current eligible task text to TypeSafe through Jev. Anything pasted into that text is included. The classifier receives no transcript, prior task excerpts, repository files, attachments or assistant output. Claude requires direct Jev with its own rubric; the existing hosted gateway remains Codex-only.

ModelRudder strips its classifier credentials from the native child environment. The Codex hook reads the saved private configuration directly; only configuration/state paths cross that boundary. Temporary deduplication metadata contains model/note pairs, not prompts. Native providers receive their normal inputs under the user's account terms. There is no ModelRudder telemetry or hosted billing requirement.

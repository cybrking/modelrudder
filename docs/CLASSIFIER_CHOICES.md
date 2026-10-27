# Jev recommendation setup

The macOS advisory preview uses Jev for model recommendations. Both launchers support direct Jev with separate Codex/Claude rubrics. Codex also retains the existing hosted Jev gateway protocol; Claude requires direct Jev. Native execution uses the user's existing tool configuration.

## Private configuration

```sh
smart-codex setup --classifier jev
smart-codex classifier status
smart-codex doctor
```

Use `smart-claude` for Claude. Both share private configuration. Enter `TYPESAFE_API_KEY` in the local editor and explicitly set `ALLOW_JEV_CLASSIFICATION=true` after reviewing the data flow. Direct Jev accepts `SMART_CODEX_CLASSIFIER=direct` or `jev`. `ALLOW_CLASSIFICATION=false` disables classification even with consent; setting it true does not replace consent.

Setup preserves existing configuration or creates a disabled template with `setup --no-open`. When saving a provider choice, a setup-only `ALLOW_CLASSIFICATION=false` is persisted; setup never clears a saved kill switch. Native launching needs no classifier credentials. Setup, status and doctor do not send inference requests or prove service availability.

```sh
smart-codex recommend --current-model gpt-6.1-sol -- "TASK"
smart-claude recommend --current-model sonnet -- "TASK"
```

Only the quoted task is sent, with no prior excerpts or file/transcript reads. Anything pasted into it is included. Classifier calls can consume Jev usage; these explicit commands do not execute the task with a native model. Disabled, failed or invalid classification produces no note and leaves the current model unchanged.

Explicit environment settings override saved configuration for commands. Codex automatic notes require the saved private file because the native child does not inherit the Jev key; see [advisory behavior](ADVISORY.md). Restart sessions after changing configuration. `--classifier jev` chooses direct Jev for the command but grants no consent.

## Migrate a retired local configuration

Tev is no longer supported. Run either launcher's `setup --classifier jev`, enter a Jev key privately and explicitly grant Jev classification consent. Setup requires both before replacing a retired selection; old local activation never authorizes hosted transmission. Preserve unrelated configuration and native credentials. Remove conflicting exported retired settings without printing secrets.

The kill switch remains effective. Historical Tev report files are retained but are not reinterpreted as Jev usage. Retained old releases remain available for explicit rollback.

## Evidence and limits

The profile mapping is experimental guidance, not a measured probability of coding success or subscription savings. Previous routing benchmarks and native relay/Mods checks are historical and do not qualify this advisory integration. See [advisory limits](ADVISORY.md#verification-scope) and the [setup contract](CLASSIFIER_EXPERIENCE.md).

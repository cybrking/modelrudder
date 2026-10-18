# Jev routing setup

Jev is ModelRudder's only routing classifier. Both native launchers support direct Jev with their own tool-specific rubric. Codex also retains its existing hosted Jev gateway protocol; Claude requires direct Jev. Native execution still uses your own Claude or Codex account, approvals and workspace permissions.

## Private configuration

Follow [installation and private configuration](AGENT_INSTALL.md), then run the launcher for your native tool:

```sh
smart-codex setup --classifier jev
smart-codex classifier status
smart-codex doctor
```

Use `smart-claude` in place of `smart-codex` for Claude. Enter your own `TYPESAFE_API_KEY` in the local editor and explicitly enable `ALLOW_JEV_CLASSIFICATION=true` after reviewing the data flow. Never paste the key into chat or command arguments. Direct Jev accepts `SMART_CODEX_CLASSIFIER=direct` or `jev`. `ALLOW_CLASSIFICATION=false` is a global kill switch: it disables classification even when Jev consent is present. Setting it to `true` does not replace Jev consent.

Both launchers share the saved configuration. Restart existing sessions to apply changes. Explicit environment exports override the saved file; `--classifier jev` selects direct Jev for one session but does not grant consent. Unset conflicting exported classifier settings before setup. `setup --no-open` preserves existing configuration or creates a disabled template without opening an editor.

Setup, classifier status and doctor do not submit classification requests. They check configuration and prerequisites, not paid-access eligibility, service availability or task quality. When ready, start with recommendations:

```sh
smart-codex --routing observe
# Or:
smart-claude --routing observe
```

Observe and auto send eligible task text and up to two bounded earlier task excerpts to TypeSafe and consume provider usage. Anything pasted into that text, including code or secrets, is included. Native task execution separately consumes your native provider's allowance. To use an explicit model without classification:

```sh
smart-codex --routing pinned --model gpt-6.1-sol
smart-claude --model sonnet
```

## Migrate a retired local configuration

Tev support has been removed. An old `SMART_CODEX_CLASSIFIER=tev` configuration is rejected with migration instructions; it never silently enables hosted transmission. Run `smart-codex setup --classifier jev` or `smart-claude setup --classifier jev`, enter your Jev key privately, and explicitly grant Jev classification consent. Setup requires both before replacing the retired selection. Existing native credentials and unrelated configuration are retained. Remove any exported retired classifier selection so it does not override the saved file.

The shared `ALLOW_CLASSIFICATION=false` kill switch remains effective after migration. Change it only when you intend to permit classification. A Jev request that fails or times out uses the existing native-tool fallback policy; it does not select another classifier.

Historical Tev report files are preserved but unsupported by current report commands. They are not reinterpreted as Jev usage or charged at Jev prices.

## Qualification and historical evidence

Jev-only setup is a product decision, not a universal reliability or savings claim. Historical benchmark records remain in the local evaluation workspace; they are not installation instructions or supported classifier choices, and raw traces are not included in public releases.

Full native TUI behavior, representative task quality and production qualification remain subject to [release evidence](RELEASE_EVIDENCE.md) and [release readiness](RELEASE_READINESS.md). Offline checks and synthetic protocol coverage do not establish those results. Use the [setup contract](CLASSIFIER_EXPERIENCE.md) for the expected user flow.

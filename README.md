![ModelRudder article thumbnail: Hitting usage limits?](docs/images/modelrudder-article-thumbnail.png)

# ModelRudder

Get a note when a different model may fit your task. You decide whether to switch; your coding tool keeps control of the model, effort, tools, approvals and login.

**0.1.0-preview.15 · macOS advisory preview · MIT licensed**

Want to decide before the agent starts substantive work? The optional [model choice skill](docs/MODEL_CHOICE_SKILL.md) offers four choices and keeps your task in the current conversation. It uses the existing recommendation command; switching stays in the native model picker. The skill is a separate release candidate, not an update to the installed runtime.

**Linux and Windows: coming soon.** This release is for macOS only.

This preview.15 release changes ModelRudder from automatic routing to advice. Existing preview.14 draft artifacts and earlier releases do not contain this change. Follow documentation at the exact revision you use; the [release evidence](docs/RELEASE_EVIDENCE.md) separates advisory checks from historical routing results. See the [macOS release evidence](docs/RELEASE_READINESS.md#macos-advisory-preview15).

| Native tool | Launcher | Advice |
| --- | --- | --- |
| Codex | `smart-codex` | Native prompt-hook note when configured and trusted; explicit `recommend` command also available |
| Claude Code | `smart-claude` | Explicit `recommend` command |

Both launchers run your native CLI on PATH. They do not start ModelRudder's execution relay, routing bridge or model-rewriting plugin, and do not require a managed native installation. Manual model changes and native fallback remain native.

## Start using ModelRudder

```sh
smart-codex
# Or:
smart-claude
```

Ask for advice on a task without executing it:

```sh
smart-codex recommend --current-model gpt-6.1-sol -- "Extract the email addresses from this text."
smart-claude recommend --current-model sonnet -- "Review this cross-system architecture and its failure modes."
```

A different recommendation produces a short note:

> ModelRudder suggests opus for this task. Use /model if you want to switch; your current model is unchanged.

No output means the model already matches or no recommendation is available. Classification being disabled, ineligible input, invalid responses and timeouts also produce no note. Advice is experimental, not a task-quality guarantee. See [commands](docs/COMMANDS.md) and [examples](docs/ROUTING_EXAMPLES.md).

Codex can show the same kind of note through its native `UserPromptSubmit` hook. It needs saved Jev configuration and native hook trust; ModelRudder does not enable disabled hooks or bypass trust. Repeated identical model/suggestion pairs are suppressed within a session. Claude uses the explicit command because its prompt hook does not reliably supply the active model. See [advisory behavior and limits](docs/ADVISORY.md).

## Requirements and Jev setup

- macOS and Node.js 24+, with your official Codex or Claude Code CLI on PATH.
- Codex native-hook journeys were verified on macOS 26.6.2 with Codex 0.164.0. Other native versions are not qualified by those checks.
- Your normal native account/configuration. ModelRudder preserves native authentication and permissions.
- For recommendations: your own [TypeSafe Jev key](https://console.typesafe.ai/keys) and explicit classification consent. Native launching itself needs no classifier key.

```sh
smart-codex setup --classifier jev
smart-codex classifier status
smart-codex doctor
```

Use `smart-claude` for Claude. Both share private configuration. Enter your key in the local editor and explicitly set `ALLOW_JEV_CLASSIFICATION=true` after reviewing the data flow. `ALLOW_CLASSIFICATION=false` disables recommendations. Never paste keys into chat. Setup and doctor do not submit inference. See [Jev configuration](docs/CLASSIFIER_CHOICES.md).

## Install with Codex

Download the [macOS advisory preview.15 release](https://github.com/cybrking/modelrudder/releases/tag/v0.1.0-preview.15), or give your coding agent this instruction:

```text
Install ModelRudder's macOS advisory version for Codex from the official releases at
https://github.com/cybrking/modelrudder/releases. Include previews, exclude drafts,
and require release notes that explicitly include advisory behavior. If none
exists, report that rather than installing an automatic-routing release.
Read the documentation at the selected exact tag, verify its standalone
installer against the same release's SHA256SUMS, and install for my user account.
Preserve existing CLI installations, login, settings, private configuration,
local state and PATH entries. Do not install a separate managed native CLI.
Run smart-codex setup --classifier jev and let me enter missing credentials
and consent privately. Preserve an existing classification kill switch.
Check help, classifier status and doctor without submitting inference.
Explain native hook trust, the explicit recommend command, the installed
release ID and rollback command. Do not bypass native hook or workspace trust.
```

## Install with Claude Code

Use the same procedure above with `smart-claude` and the official Claude CLI. Codex is not required. Explain that Claude recommendations use `smart-claude recommend --current-model MODEL -- "TASK"`; the launcher does not load a routing mod or automatically inspect the conversation.

See [manual installation](docs/AGENT_INSTALL.md) for checksum verification, configuration paths and recovery.

## Upgrade and rollback

### Upgrade with Claude Code or Codex

Ask your coding agent to select a published release explicitly containing advisory behavior, verify its installer/checksum at one exact tag, record the current release ID and upgrade using your existing paths. Preserve keys, configuration, local state and retained releases; do not install or replace the native CLI. See [upgrade and rollback](docs/UPGRADE.md).

Remove old `--routing` and `--effort-mode` options from saved commands. They now fail with migration guidance. An ordinary `--model` option passes directly to the native tool. Old reports and managed-native maintenance commands remain available for recovery; advisory sessions do not produce routing usage reports or local learning captures.

## Data and privacy

Recommendations send only the current supplied task to Jev with your existing consent. They do not read repository files, transcripts, attachments or prior turns. Anything pasted into the task text is included. Codex hook deduplication stores only model/note metadata in a temporary directory removed when the launcher exits. Classifier errors and malformed responses are silent; they cannot switch models or replay a task.

The native child does not receive ModelRudder's classifier credentials. The Codex hook reads the existing private configuration itself. Native Codex and Claude retain their normal provider traffic and account terms. ModelRudder has no client telemetry or account requirement; provider fees still apply.

## Documentation

- [Advisory behavior](docs/ADVISORY.md) · [Commands](docs/COMMANDS.md) · [Examples](docs/ROUTING_EXAMPLES.md)
- [Installation](docs/AGENT_INSTALL.md) · [Jev setup](docs/CLASSIFIER_CHOICES.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Upgrade and rollback](docs/UPGRADE.md) · [Claude support](docs/CLAUDE_CODE.md)
- [Historical release evidence](docs/RELEASE_EVIDENCE.md) · [Historical managed-native workflow](docs/NATIVE_VERSIONS.md)
- [Contributing](CONTRIBUTING.md) · [Security reporting](SECURITY.md)

Licensed under [MIT](LICENSE); retained ws code carries its [upstream MIT notice](THIRD_PARTY_NOTICES/ws-LICENSE). ModelRudder is independent and claims no provider endorsement.

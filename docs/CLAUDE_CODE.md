# Claude Code advisory support

This unreleased source change replaces automatic Claude routing with explicit recommendations. `smart-claude` runs the official `claude` executable on PATH without a routing bridge, Mods plugin or forced model/effort. Native authentication, options, tools, approvals, resume and fallback remain native.

## Setup and commands

Install Node.js 24+ and your normal official Claude CLI, then follow [ModelRudder installation](AGENT_INSTALL.md). Codex and a managed-native installation are not required.

```sh
smart-claude setup --classifier jev
smart-claude classifier status
smart-claude doctor
smart-claude
```

Jev is optional for native launching. For advice, enter your own TypeSafe key and grant classification consent privately through setup. Claude requires direct Jev; the hosted Codex gateway does not use Claude's rubric.

```sh
smart-claude recommend --current-model sonnet -- "Review this architecture and failure modes."
smart-claude --model opus
smart-claude --resume SESSION_ID
```

`recommend` sends only that quoted task and never executes it. Supply the current model yourself; Claude family aliases and recognized family model IDs are compared to avoid redundant suggestions. The profile mapping remains FAST → Haiku, BALANCED/DEEP → Sonnet and MAX → Opus. Suggestions do not promise model availability or task quality. Use Claude's `/model` control if you choose to switch.

## Why the recommendation is explicit

Claude's documented prompt hook does not reliably supply the current model, and it can also receive scheduled/background input. The advisory version avoids reconstructing model state or inspecting transcripts. It does not automatically classify the Claude conversation or install a hook. See [Claude hook inputs](https://code.claude.com/docs/en/hooks#common-input-fields) and [the advisory contract](ADVISORY.md).

## Privacy and failure behavior

Only the supplied task is sent to Jev, with existing explicit consent. No previous tasks, files, transcript or attachments are read. Slash/shell commands, references, invalid or oversized tasks are not classified. Disabled classification, provider failure, timeout or invalid output produces no note. The command never changes the native model or retries native execution.

## Migration and evidence

Remove `--routing auto`, `--routing observe` or `--routing pinned` from saved commands. These options now report migration guidance. Native `--model` still passes through. Old `SMART_CLAUDE_*_MODEL` routing overrides no longer select the executing model. Existing credentials, configuration, reports and managed-native packages remain intact. `smart-claude report` reads historical records; new advisory sessions do not create routing telemetry.

The [October routing qualification](CLAUDE_LIVE_QUALIFICATION.md) describes the previous Mods adapter and is retained as historical evidence. It does not establish advisory behavior or current native compatibility. See [upgrade and rollback](UPGRADE.md) for recovery.

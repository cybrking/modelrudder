# Advisory behavior

This is the unpublished `0.1.0-preview.15` advisory candidate. A recommendation is a note, never an instruction to the native runtime to switch models. Existing automatic-routing releases have different behavior.

## Explicit recommendations

```sh
smart-codex recommend --current-model gpt-6.1-sol -- "TASK"
smart-claude recommend --current-model sonnet -- "TASK"
```

Supply the current model yourself. The command classifies only the quoted task and exits without starting a native session. A different mapped model produces a note suggesting `/model`; a match produces no output. Invalid input syntax reports usage. Disabled classification, unsupported task content, provider failures and invalid classifier responses produce no note.

The existing profiles map to Luna/Sol/Astra for Codex and Haiku/Sonnet/Opus for Claude. Recommendations do not apply reasoning effort or generate a provider-authored explanation. Reported confidence is not a task-success probability. The recommendation has only this prompt's context, so weigh it against the wider task before switching. Native hook input has no reliable attachment indicator; a text-only suggestion can miss media and conversation history.

## Codex native notes

For local sessions, the launcher can register a session-local `UserPromptSubmit` command hook using Codex's native hook system. That hook receives the native active model and prompt and returns only `systemMessage` for a user-visible note. It does not return additional model context, permission decisions or model overrides. Existing user/project hooks remain in their native configuration layers. Native hook trust, disabled hooks and organization policy remain authoritative.

Automatic notes require a saved private configuration file. The native process receives a path, not the Jev key. The hook reads that file itself and honors classification consent and the kill switch. Automatic attachment also requires the effective classifier settings to match the saved file; an environment override uses the explicit recommendation fallback rather than silently selecting the saved account or gateway. Environment-only credentials remain usable with the explicit command but do not enable automatic notes. Direct command-line hook configuration or native feature-toggle flags are left under the user's control instead of being replaced; remote sessions also use the explicit fallback. When attaching the hook, the launcher uses native `--no-daemon` so its private configuration/state paths reach that session's hook runtime. This does not introduce a relay.

Classification has a 1.5-second deadline; the hook also has a process watchdog and native timeout. A failed or unavailable classifier cannot prevent native task execution. No automatic retry occurs. A provider may already have received a request before cancellation or timeout.

A temporary per-launcher directory stores only the last current-model/note pair for each session to suppress repeated identical notes. It never stores prompts and is removed on normal launcher exit. The native session supplies the active model for each eligible prompt, including after a manual switch. Unsupported or malformed input is silent; slash commands, shell commands, `@` references and oversized prompts are not classified.

## Claude uses the explicit command

Claude's documented `UserPromptSubmit` input does not reliably provide the active model, and the hook can also receive scheduled/background input. Tracking model changes and session history would reintroduce the machinery this change removes. `smart-claude` therefore launches ordinary Claude without a routing bridge or mod; use `recommend` for advice when useful.

## Native workflow and migration

Both launchers use the native executable on PATH and forward normal arguments. They do not require managed-native pins, force a baseline model/effort, restrict authentication to subscription login, or rewrite tool-loop requests. Resume, compaction, permissions and native fallback stay native. The launcher prints a migration notice so existing users know automatic routing has ended.

`--routing` and `--effort-mode` are retired and rejected. Remove them; keep native options such as `--model`. Existing private settings, historic usage records, learning records and retained managed releases are preserved. Advisory sessions do not add routing reports or capture task text for learning. See [upgrade instructions](UPGRADE.md).

## Verification scope

Offline tests can verify decision mapping, no-overrides argument forwarding, privacy, bounded failures and hook outputs. An isolated Codex 0.164.0 check confirmed the existing user hook and session advisory hook are both discovered under native trust. The reproducible `npm run test:advisory-native` check confirmed native hook completion can carry a static warning note while preserving the configured model and read-only permissions, without credentials or paid inference. It uses an isolated home and an unreachable loopback provider; it is not interactive terminal certification. On 2026-10-26, a live macOS terminal check with Codex 0.164.0 and the configured Jev account displayed the Luna recommendation for a harmless arithmetic prompt, returned `4`, and retained GPT-6.1-Sol medium. Repeating the prompt returned `4` without repeating the note. The advisory hook was reviewed and trusted through the native hook screen; the existing user hook remained active. Explicit live recommendations also suggested Haiku for Claude and stayed silent for Codex when its supplied model already matched Luna. The installed ModelRudder was not replaced. A further macOS Codex 0.164.0 journey changed the model through `/model gpt-6-luna`, returned `4` while retaining Luna medium, interrupted a longer no-tools task with Escape, and exited normally. Resuming that same session through the native directory picker retained Luna medium and returned `6` for `3 + 3`, then exited normally. No tools were used; native account settings and the installed ModelRudder were unchanged. These bounded checks do not qualify Windows/Linux terminal behavior, approval acceptance/denial or compaction. Historical relay/Mods qualification does not qualify this new path. No task quality, cost savings or model availability guarantee follows from a recommendation.

Official contracts: [Codex hooks](https://developers.openai.com/codex/hooks) and [Claude hook inputs](https://code.claude.com/docs/en/hooks#common-input-fields).

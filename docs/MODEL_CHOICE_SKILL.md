# Model choice skill

Status: release candidate. This optional skill asks for a model choice before substantive task work. It works inside the current conversation using ModelRudder's existing recommendation-only command. It adds no execution wrapper, hook, relay, or automatic model switch.

The native advisory runtime stays at preview.15. This skill is a separately installed text asset; installing it does not require replacing that runtime. Its release assets are `modelrudder-model-choice.SKILL.md` and `MODEL_CHOICE_SHA256SUMS`. `npm run package:pilot -- dist/delivery` packages both the unchanged runtime installer and the skill. The runtime's existing `SHA256SUMS` stays separate so runtime-only downloads still verify. Pin the source revision or release tag when distributing the skill.

## Install and invoke

Requires an installed advisory ModelRudder release, configured classification consent, and a host that supports skills. The recommendation command sends only the supplied task text to Jev. It does not execute a coding task. Do not enable consent or install another native CLI just to run the skill.

Copy `skills/modelrudder-model-choice/SKILL.md` into the host's skill directory under `modelrudder-model-choice/SKILL.md`:

- Codex project: `.agents/skills/modelrudder-model-choice/SKILL.md`.
- Codex user: `~/.agents/skills/modelrudder-model-choice/SKILL.md`.
- Claude Code project: `.claude/skills/modelrudder-model-choice/SKILL.md`.

For a downloaded release asset, download both skill files from the same tag and run `shasum -a 256 -c MODEL_CHOICE_SHA256SUMS` in their directory on macOS. Stop on a mismatch or missing entry. Rename the verified asset to `SKILL.md` inside the chosen skill directory. Preserve any existing skill at that path; review or back it up before replacing it. Start a fresh session if the host has not refreshed its skill catalog.

Host paths and invocation follow the [Codex skill documentation](https://developers.openai.com/codex/skills) and [Claude Code skill documentation](https://code.claude.com/docs/en/skills), checked October 26, 2026.

In Codex, invoke `$modelrudder-model-choice` with the task, for example:

> Use $modelrudder-model-choice before starting: review the queue's retry behavior and fix duplicate processing.

In Claude Code, invoke `/modelrudder-model-choice` with the task. To use it across a session, ask the agent to apply it before each distinct task. Automatic discovery is available, but installing a skill alone does not guarantee that the host invokes it on every prompt.

## Choice flow

When ModelRudder recommends a different model, the agent shows the current and suggested models and waits:

1. Use the recommended model.
2. Keep the current model and continue.
3. Choose another model.
4. Keep the current model and stop asking this session.

For 1 or 3, use the host's native model picker or `/model`, then confirm the change. The agent continues the original task in the same conversation. A number alone does not change a model. No task is replayed by ModelRudder, and the user does not need to retype the original task unless context was lost.

For 2 or 4, the agent continues immediately. Option 4 skips this skill's future checks for the session; existing runtime hook notes are independent. Missing advice lets ordinary task work continue. When a valid recommendation has produced a menu, the agent waits for an actual choice—there is no automatic timeout selection.

This is an instruction-following workflow, not a hard execution boundary. The current model has already processed the prompt to invoke the skill. It does not interrupt running tools, guarantee a mid-turn model change, change effort, or bypass native approvals. Recommendations do not prove task quality or savings. Existing preview.15 native qualification does not certify this new skill's behavior.

## Removal

Remove only the installed `modelrudder-model-choice` skill directory, or restore your previous copy. No runtime, login, hook trust, persistent model setting, or PATH change is needed.

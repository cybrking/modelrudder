# Upgrading ModelRudder

Stop active `smart-codex` and `smart-claude` sessions before changing releases, then start fresh sessions afterward. An already running launcher keeps its loaded code.

Upgrades preserve the existing private key file and local state. You do not need to enter your Jev key again. ModelRudder and the native provider CLIs are separate installations; upgrading ModelRudder does not upgrade Claude or Codex.

If you originally used `--root`, `--bin-dir`, or `--env-file`, repeat those same flags on every installer and maintenance command below. Use your installation's existing paths, rather than creating a second default installation.

## Normal release upgrade

Download the newer release's standalone installer and `SHA256SUMS` from the [official releases page](https://github.com/cybrking/modelrudder/releases). Verify the exact installer checksum and run it with Node.js 24+, following the [release installation instructions](AGENT_INSTALL.md#2-download-and-verify-a-release).

For a clean source checkout of an approved release, update to that release, then run:

```sh
npm ci --ignore-scripts
npm run install-cli -- --list
npm run install-cli
```

Before installing, record the current release ID printed by `--list` for rollback. Keep your downloaded installer if you use the standalone installation method.

## Try the issue #2 fix before release

The fix is currently in [draft PR #3](https://github.com/cybrking/modelrudder/pull/3), not a published release. Reinstalling the existing preview.4 download will not add this fix. Its exact reported interactive trigger still needs a retest; media, resumed history, and other ineligible context intentionally retain the native model.

Review the PR before installing its code. Use a new checkout folder so you do not disturb an existing working tree. These commands work in macOS/Linux shells and Windows PowerShell with Git, npm, and Node.js 24+ installed:

```sh
git clone --single-branch --branch fix/claude-consumed-prompts https://github.com/cybrking/modelrudder.git modelrudder-issue2
cd modelrudder-issue2
git checkout --detach a27a893
npm ci --ignore-scripts
npm run install-cli -- --list
npm run install-cli
```

`a27a893` pins the tested runtime patch instead of installing whichever later changes land on the branch. Save the previous release ID from `--list` before the final command. This installs a versioned copy of both launchers; pulling source alone does not update an existing managed installation.

The package version remains `0.1.0-preview.4`, but the installer prints a different content-based release ID. Use that ID and `--list` to distinguish the patched build from the original preview.4 build.

## Verify the upgrade

Open a fresh terminal, then run:

```sh
smart-claude --help
smart-claude doctor
smart-claude --routing auto
```

Doctor checks prerequisites, not routing outcomes. In the new Claude session, submit three unrelated plain-text prompts, waiting for each answer before sending the next. Avoid attachments, @-references, slash commands, resume, and compaction for this test. Actual tasks consume native provider and Jev usage.

Inspect the routing notices and run `smart-claude report` after exiting. Each eligible new prompt should produce one classification, with the decision held through its tool loop. An uncertain classification can still use Sonnet. If classification stops after the first prompt, report the installed release ID, Claude version, classification count, and route reasons on [issue #2](https://github.com/cybrking/modelrudder/issues/2). Do not share API keys or private transcripts.

## Roll back

From the source checkout, use the previous release ID you saved:

```sh
npm run install-cli -- --rollback PREVIOUS_RELEASE_ID
```

Replace `PREVIOUS_RELEASE_ID` with the exact ID printed by `--list`, and repeat any custom installation flags. Restart active launchers afterward. Rollback preserves configuration and state.

Standalone users can use the retained verified installer with `--list` and `--rollback PREVIOUS_RELEASE_ID`, as described in [recovery instructions](AGENT_INSTALL.md#5-report-and-retain-recovery-options).

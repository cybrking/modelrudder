# Upgrading ModelRudder

For an agent-assisted upgrade, [copy the natural-language prompt](../README.md#upgrade-with-claude-code-or-codex) into Claude Code or Codex. It asks the agent to download and verify the release, preserve your installation paths and configuration, upgrade, check the result, and provide rollback instructions. The manual steps below remain available.

Stop active `smart-codex` and `smart-claude` sessions before changing releases, then start fresh sessions afterward. An already running launcher keeps its loaded code.

Upgrades preserve the existing private key file and local state. You do not need to enter your Jev key again. ModelRudder and the native provider CLIs are separate installations; upgrading ModelRudder does not upgrade Claude or Codex.

If you originally used `--root`, `--bin-dir`, or `--env-file`, repeat those same flags on every installer and maintenance command below. Use your installation's existing paths, rather than creating a second default installation.

## Normal release upgrade

Download the **preview.6** standalone installer and `SHA256SUMS` from the [release page](https://github.com/cybrking/modelrudder/releases/tag/v0.1.0-preview.6). The exact cross-platform commands are in the [README](../README.md#upgrade-to-preview6). Verify the exact installer checksum and run it with Node.js 24+, following the [release installation instructions](AGENT_INSTALL.md#2-download-and-verify-a-release).

The installer filename still begins with `smart-codex`, but preview.4 and newer dual-launcher artifacts update both `smart-claude` and `smart-codex`. You do not need to install each separately. Keep a verified installer and record the current ID before installing the new one.

On macOS/Linux, list the existing installation, then verify and install the downloaded release:

```sh
node -- ~/.local/share/smart-codex/current/src/install-cli.ts --list
shasum -a 256 -c SHA256SUMS
node -- ./smart-codex-RELEASE_ID-install.mjs
```

Run the last two commands in the download directory. Replace `RELEASE_ID` with the actual downloaded filename. If your installation root is custom, use its existing `current/src/install-cli.ts` path for the first command and repeat all original install-path flags.

On Windows PowerShell, use your retained verified installer to list the current installation. Verify the new download's hash against its exact entry in `SHA256SUMS`, then run it:

```powershell
node -- .\smart-codex-PREVIOUS_RELEASE_ID-install.mjs --list
Get-FileHash .\smart-codex-RELEASE_ID-install.mjs -Algorithm SHA256
Get-Content .\SHA256SUMS
node -- .\smart-codex-RELEASE_ID-install.mjs
```

Replace both filename placeholders with your actual files. The old and new files may be in different download directories; use their full paths if needed. Stop if the new installer hash does not match.

For a clean source checkout, select an approved release tag, then install:

```sh
git fetch --tags origin
git checkout --detach APPROVED_RELEASE_TAG
npm ci --ignore-scripts
node -- src/install-cli.ts --list
node -- src/install-cli.ts
```

Replace `APPROVED_RELEASE_TAG` with the release you reviewed. Before installing, record the current release ID printed by `--list` for rollback. Pulling source alone does not update the managed runtime.

The explicit `node -- src/install-cli.ts` command works with older source builds whose npm installer script lacks the `--` boundary. Without it, Node can consume a custom `--env-file` option and report that the file was not found before the installer runs. The installer only needs that path to configure the launchers; it does not need to load the key file during installation.

## Automatic updates and notifications

ModelRudder has no local self-updater or `upgrade` command in this preview. The [daily upstream workflow](UPSTREAM_UPDATES.md) discovers and tests new Claude/Codex versions on GitHub runners; it does not update your ModelRudder installation or native CLIs.

To receive ModelRudder release notifications, open the [repository](https://github.com/cybrking/modelrudder), choose **Watch → Custom**, and select **Releases**. Follow the reviewed release's upgrade steps when notified. See [GitHub's notification instructions](https://docs.github.com/en/subscriptions-and-notifications/get-started/configuring-notifications).

Native Claude/Codex updates are separate. A newer native CLI can exceed the launcher's supported range or recorded evidence; run the matching ModelRudder doctor after either component changes. Automated compatibility discovery is not automatic approval of a release.

## Claude routing fixes in preview.6

Preview.6 includes the native-instruction fix from [PR #10](https://github.com/cybrking/modelrudder/pull/10). In preview.5, Claude's own project-instruction or nested-memory announcements could mark the chat unclassified and stop routing later requests. Preview.6 preserves routing for those engine-authored announcements without transmitting their contents to the classifier. It retains the earlier consumed-prompt-receipt fix and source installer's argument-boundary fix. Reinstalling preview.5 does not install this new patch.

The issue reporter's exact interactive trigger still needs a retest. Media, resumed history and other ineligible context intentionally retain the native model. The package now reports `0.1.0-preview.6`; the full content-based release ID is available through the installer's `--list` command.

## Verify the upgrade

Open a fresh terminal and check the launcher you use:

```sh
# Claude Code
smart-claude --version
smart-claude doctor

# Codex
smart-codex --version
smart-codex doctor
```

Doctor checks prerequisites without submitting a model task. For builds with the same package version, use the content-based release ID from `--list` to identify the installed runtime.

### Retest the Claude multi-turn fixes

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
node -- src/install-cli.ts --rollback PREVIOUS_RELEASE_ID
```

Replace `PREVIOUS_RELEASE_ID` with the exact ID printed by `--list`, and repeat any custom installation flags. Restart active launchers afterward. Rollback preserves configuration and state.

Standalone users can use the retained verified installer with `--list` and `--rollback PREVIOUS_RELEASE_ID`, as described in [recovery instructions](AGENT_INSTALL.md#5-report-and-retain-recovery-options).

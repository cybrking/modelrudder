# Upgrading ModelRudder

For an agent-assisted upgrade, [copy the natural-language prompt](../README.md#upgrade-with-claude-code-or-codex) into Claude Code or Codex. It asks the agent to download and verify the release, preserve your installation paths and configuration, upgrade, check the result, and provide rollback instructions. The manual steps below remain available.

Stop active `smart-codex` and `smart-claude` sessions before changing releases, then start fresh sessions afterward. An already running launcher keeps its loaded code.

Upgrades preserve the existing private key file and local state. You do not need to enter your Jev key again. The ModelRudder runtime and managed native CLIs have separate version selection. Upgrading the runtime preserves an existing native pin; plain Claude and Codex are never replaced. Migrating from preview.8 or earlier requires `native install` once for each launcher you use.

If you originally used `--root`, `--bin-dir`, or `--env-file`, repeat those same flags on every installer and maintenance command below. Use your installation's existing paths, rather than creating a second default installation.

## Normal release upgrade

Select the newest published release by publication date from the [official releases list](https://github.com/cybrking/modelrudder/releases), including preview releases and excluding drafts. GitHub's [`/releases/latest` endpoint](https://docs.github.com/en/rest/releases/releases#get-the-latest-release) excludes prereleases, so it is not suitable for this preview channel.

Resolve the release once and record its exact tag. Read the README and `docs/UPGRADE.md` at that tag for its prerequisites and migration steps. Download its standalone installer and `SHA256SUMS` into a new folder using the exact published asset filenames. Keep the documentation, installer and checksum tied to that same release throughout the upgrade.

Verify the exact installer checksum before running it, following the [release installation instructions](AGENT_INSTALL.md#2-download-and-verify-a-release). The commands below use filename placeholders; replace them with the selected release's actual filenames.

The installer filename still begins with `smart-codex`, but preview.4 and newer dual-launcher artifacts update both `smart-claude` and `smart-codex`. You do not need to install each separately. Keep a verified installer and record the current ID before installing the new one.

On macOS/Linux, list the existing installation, then verify and install the downloaded release:

```sh
node -- ~/.local/share/smart-codex/current/src/install-cli.ts --list
shasum -a 256 -c SHA256SUMS
node -- ./smart-codex-RELEASE_ID-install.mjs
```

On Linux/WSL, use `sha256sum -c SHA256SUMS` instead. Run the last two commands in the download directory. Replace `RELEASE_ID` with the actual downloaded filename. If your installation root is custom, use its existing `current/src/install-cli.ts` path for the first command and repeat all original install-path flags.

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

Plain Claude/Codex updates are independent of ModelRudder. Managed native upgrades require an explicit `native install VERSION`, restricted to versions recorded by the installed release. Candidates are checked before selection; failures leave the current pin intact. Automated compatibility discovery is not approval of a release. See [native upgrade and rollback](NATIVE_VERSIONS.md).

## Migration from preview.8 and earlier

Preview.9 introduces separate managed native CLIs, verification before selection, explicit rollback and actionable missing-pin errors. Run `smart-claude native install` or `smart-codex native install` after upgrading from an older release. These commands download official npm packages and run no-inference/synthetic checks without submitting a real provider task. Earlier routing fixes are retained.

## Claude routing fixes retained from preview.6

Preview.6 includes the native-instruction fix from [PR #10](https://github.com/cybrking/modelrudder/pull/10). In preview.5, Claude's own project-instruction or nested-memory announcements could mark the chat unclassified and stop routing later requests. Preview.6 preserves routing for those engine-authored announcements without transmitting their contents to the classifier. It retains the earlier consumed-prompt-receipt fix and source installer's argument-boundary fix. Reinstalling preview.5 does not install this new patch.

The issue reporter's exact interactive trigger still needs a retest. Media, resumed history and other ineligible context intentionally retain the native model. The full content-based release ID is available through the installer's `--list` command.

## Verify the upgrade

Open a fresh terminal and check the launcher you use:

```sh
# Claude Code
smart-claude --version
smart-claude native install
smart-claude native status
smart-claude doctor

# Codex
smart-codex --version
smart-codex native install
smart-codex native status
smart-codex doctor
```

Verify both launchers report the expected version from the selected release. Doctor checks prerequisites without submitting a model task. For builds with the same package version, use the content-based release ID from `--list` to identify the installed runtime.

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

To roll back only the managed native CLI, use `smart-codex native rollback` or `smart-claude native rollback`. This rechecks the retained previous native version before switching. It is separate from the ModelRudder runtime rollback above; see [Native versions](NATIVE_VERSIONS.md).

## Uninstall and installed maintenance

On macOS/Linux, the shared installed maintenance command manages both launchers:

```sh
node -- ~/.local/share/smart-codex/current/src/install-cli.ts --list
node -- ~/.local/share/smart-codex/current/src/install-cli.ts --rollback RELEASE_ID
node -- ~/.local/share/smart-codex/current/src/install-cli.ts --uninstall
```

On Windows, retain the verified installer and use `node -- .\smart-codex-RELEASE_ID-install.mjs --list`, `--rollback RELEASE_ID` or `--uninstall` instead. Repeat any custom install-path flags used originally.

Uninstall retains your private configuration and local state. Remove those manually if you intend to discard them.

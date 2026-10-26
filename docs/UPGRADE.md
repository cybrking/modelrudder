# Upgrading to advisory ModelRudder

The advisory change is the **unpublished `0.1.0-preview.15` candidate**. Existing preview.14 draft artifacts and older published releases do not include it. Use the exact revision's documentation. A local test, package version or draft installer does not establish publication.

## What changes

- `smart-codex` and `smart-claude` use the native executable on PATH. Managed native pins are retained for recovery but are not required or selected by advisory launches.
- ModelRudder no longer changes model or effort, starts a routing relay/bridge, or loads Claude's model-rewriting mod.
- Remove `--routing auto|observe|pinned` and `--effort-mode` from saved commands. They now produce migration guidance. Native `--model` options still pass through.
- Use `recommend --current-model MODEL -- "TASK"` for explicit advice. Codex can also show native hook notes with saved configuration and native trust. Claude advice is explicit.
- Existing private configuration, credentials, reports, learning data and retained releases are preserved. Advisory sessions do not create routing usage records or local learning captures.

Stop active ModelRudder sessions before changing installed releases, then start fresh sessions. A running launcher retains its loaded code. Changing source alone does not upgrade an installed runtime.

## Normal release upgrade

When an advisory release is published, select it from the [official releases list](https://github.com/cybrking/modelrudder/releases), including previews and excluding drafts. Require release notes explicitly confirming advisory behavior. If none exists or installer/checksum assets are missing, report that instead of substituting an automatic-routing release. Resolve one exact tag and use its matching documentation, installer and `SHA256SUMS` throughout.

Record the current content-based release ID with `--list` and retain the verified prior installer for rollback. Follow [checksum verification](AGENT_INSTALL.md#2-download-and-verify-a-release). Repeat existing custom `--root`, `--bin-dir` and `--env-file` options so the upgrade uses the same installation.

On macOS/Linux, using the existing runtime root:

```sh
node -- ~/.local/share/smart-codex/current/src/install-cli.ts --list
shasum -a 256 -c SHA256SUMS
node -- ./smart-codex-RELEASE_ID-install.mjs
```

Use `sha256sum` on Linux/WSL. On Windows, use the retained verified installer for `--list`, compare the new installer's `Get-FileHash` against its exact entry in `SHA256SUMS`, then run it. Replace filename placeholders with the actual release asset names.

Only use [source installation](AGENT_INSTALL.md#source-installation) when deliberately installing a reviewed source revision. Preserve configuration and native login. Do not install or replace native CLIs as part of this advisory migration.

## Verify the upgrade

```sh
smart-codex --version
smart-codex --help
smart-codex classifier status
smart-codex doctor
# Use smart-claude instead for Claude.
```

The content-based release ID from `--list` distinguishes builds with the same package version. Help must describe advisory behavior. Doctor starts the PATH native executable for a version check and inspects classifier configuration; it does not submit inference or establish live UI behavior. Native launching remains available without classification consent.

For a user-run check, launch a normal session and verify native model/effort, approvals, cancellation and resume remain native. If trying advice, an explicit `recommend` command consumes only Jev usage. Automatic Codex notes also depend on native hook trust and saved configuration. Do not bypass trust or silently enable classification. See [advisory limits](ADVISORY.md).

## Retired local-classifier configurations

Jev setup preserves existing configuration and does not grant hosted consent. If an older build saved Tev, follow [migration](CLASSIFIER_CHOICES.md#migrate-a-retired-local-configuration). Existing `ALLOW_CLASSIFICATION=false` remains effective. The old local setting is not permission to transmit tasks to Jev.

## Roll back

Use the exact retained release ID and original installation-path flags:

```sh
node -- src/install-cli.ts --rollback PREVIOUS_RELEASE_ID
```

For an installed Unix runtime, use its `current/src/install-cli.ts`. On Windows use the retained verified installer with `--rollback PREVIOUS_RELEASE_ID`. Restart launchers afterward. Rollback retains private configuration and state but restores the selected release's behavior, including automatic routing or Tev if that release supported it. Follow that release's documentation and managed-native prerequisites.

`smart-codex native rollback` and `smart-claude native rollback` still manage retained native pins. They do not change the PATH executable used by advisory launches. Runtime rollback and native-pin rollback are separate actions.

## Uninstall and maintenance

Installed maintenance supports `--list`, `--rollback RELEASE_ID` and `--uninstall`. On Unix:

```sh
node -- ~/.local/share/smart-codex/current/src/install-cli.ts --list
node -- ~/.local/share/smart-codex/current/src/install-cli.ts --uninstall
```

On Windows use the retained verified standalone installer. Repeat custom path options. Uninstall preserves private configuration and local state; deleting them is a separate explicit choice. The advisory migration itself deletes none of these.

## Updates

ModelRudder has no self-updater in this change. Plain native CLI updates affect the executable used on PATH. The retained [upstream compatibility workflow](UPSTREAM_UPDATES.md) tests historical routing contracts; those checks do not qualify advisory hooks. Review release-specific evidence before upgrading.

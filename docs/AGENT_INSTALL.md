# Installing ModelRudder

This guide describes the **unpublished `0.1.0-preview.15` advisory candidate**. Existing preview.14 draft installers and previous releases contain the older automatic-routing behavior. A source version or successful test run is not a published release. Use documentation at the exact revision being installed.

Both launchers run the native CLI on PATH. They need no managed-native installation, routing bridge or execution relay. Jev setup is optional for launching the native tool and required for recommendations.

## Jev setup for agent-assisted installs

| Native tool | Jev setup | Check configuration |
| --- | --- | --- |
| Codex | `smart-codex setup --classifier jev` | `smart-codex classifier status`, then `smart-codex doctor` |
| Claude Code | `smart-claude setup --classifier jev` | `smart-claude classifier status`, then `smart-claude doctor` |

Preserve existing private settings, native credentials and the classification kill switch. Missing credentials and consent must be entered privately by the user. Opening an editor alone does not establish readiness. Status and doctor do not submit inference or qualify a live native session.

## Claude Code release installation

Follow the shared steps below with `smart-claude` and an official `claude` on PATH. Codex is not required. A dual-launcher installer includes both launchers despite its `smart-codex-...-install.mjs` filename. After setup, use `smart-claude` normally or request explicit advice with `smart-claude recommend --current-model sonnet -- "TASK"`. No routing mod is loaded. See [Claude support](CLAUDE_CODE.md).

## 1. Inspect the machine

Check Node.js 24+ and the official CLI the user intends to use. Preserve existing native installation, login, authentication environment, settings and permissions. Install missing native tools using their official instructions only within the user's authorized scope. A separate managed CLI is not required.

On Windows/WSL, keep Node, the native tool and ModelRudder in the same environment. Windows and WSL have separate home directories, credentials and PATHs; do not copy credentials between them. Do not claim interactive Windows qualification from checks on another platform.

## 2. Download and verify a release

For a release installation, select a published release on the [official releases page](https://github.com/cybrking/modelrudder/releases) whose notes explicitly include advisory behavior. Include previews, exclude drafts and select by publication date. If no such release or its installer/checksum is available, report that; do not substitute an automatic-routing release or source build. GitHub's `/releases/latest` shortcut excludes prereleases.

Resolve the release once and read its tagged README and installation guide. Download its standalone installer and `SHA256SUMS` into one directory using the exact asset filenames. The following uses `RELEASE_ID` as a placeholder; replace it with the actual downloaded filename.

On macOS:

```sh
shasum -a 256 -c SHA256SUMS
node -- ./smart-codex-RELEASE_ID-install.mjs
```

On Linux/WSL use `sha256sum -c SHA256SUMS`. On Windows PowerShell:

```powershell
Get-FileHash .\smart-codex-RELEASE_ID-install.mjs -Algorithm SHA256
Get-Content .\SHA256SUMS
# Compare the hash with the exact installer entry before running it.
node -- .\smart-codex-RELEASE_ID-install.mjs
```

Stop on a checksum mismatch, missing entry or untrusted origin. Keep documentation, installer and checksums tied to one release. Do not pipe a downloaded script directly into a shell.

The standalone installer contains runtime dependencies. Unix defaults are `~/.local/share/smart-codex` for runtime, `~/.local/bin` for launchers and `~/.config/smart-codex/env` for configuration. Windows defaults are `%LOCALAPPDATA%\ModelRudder\runtime`, `bin` and `config\env`; use the printed paths as authoritative. Add only the printed launcher directory to user PATH, preserving existing entries. Do not overwrite unmanaged launchers or native CLIs.

## 3. Configure Jev

```sh
smart-codex setup --classifier jev
# Or prepare a disabled template without opening an editor:
smart-codex setup --no-open
```

Use `smart-claude` for Claude. Existing ready configuration is reused. Otherwise enter the key privately in the local editor and grant consent after reviewing the data flow. If no editor appears, open the printed path manually. Never read the key file into agent context, print it, paste a key into chat or store keys in shell history.

```dotenv
TYPESAFE_API_KEY=
ALLOW_JEV_CLASSIFICATION=false
SMART_CODEX_CLASSIFIER=direct
```

The user explicitly sets `ALLOW_JEV_CLASSIFICATION=true` when ready. `ALLOW_CLASSIFICATION=false` remains a global kill switch. Existing `SMART_CODEX_ENV_FILE`, classifier and configuration-path names apply to both launchers for compatibility. Direct Jev accepts `direct` or `jev`; the existing hosted gateway is Codex-only. [Jev setup](CLASSIFIER_CHOICES.md) explains retired local configurations.

Recommendations send only the current eligible task text to TypeSafe, including anything pasted into that text. No previous task excerpts or repository files are added. Provider fees are separate from native task execution. Setup never submits inference to test a key. Protect the configuration with private user permissions/ACLs.

Codex automatic notes require saved configuration; the hook reads it without passing the key into native tools. Source commands normally use `.env.local`; set `SMART_CODEX_ENV_FILE` to the intended private file when using a different path. Installed bootstraps use the configured installation path. Automatic hooks require the effective classifier settings to match the saved file. Explicit environment-only credentials or differing environment overrides can support `recommend`, but do not enable automatic hook notes.

## 4. Authenticate and check readiness

Let the native CLI manage its own login. Preserve working subscription/API/custom-provider settings rather than rewriting them. Use native `codex login status` or `claude auth status` if a login check is needed; do not read credential files or extract tokens.

```sh
smart-codex --help
smart-codex classifier status
smart-codex doctor
```

Doctor checks native executable startup and classifier configuration without inference; it does not verify model availability, account entitlement, task quality or visible hook notes. Launch normally with `smart-codex` or `smart-claude`. Native options pass through, including `--model` and resume.

Codex's native hook trust remains authoritative. Do not bypass trust or enable disabled hooks on the user's behalf. The explicit `recommend --current-model MODEL -- "TASK"` command is available for both tools if automatic notes are unavailable. See [advisory behavior](ADVISORY.md).

## 5. Report and retain recovery options

Report the selected revision/release ID, checksum result where applicable, paths, native executable and diagnostic results. State any private setup or interactive checks still pending. No live inference is needed merely to install.

Keep the prior verified installer/release ID. Installed maintenance supports `--list`, `--rollback RELEASE_ID` and `--uninstall`; repeat original custom `--root`, `--bin-dir` and `--env-file` options. On Unix use the installed `current/src/install-cli.ts`; on Windows reuse the retained standalone installer because `current` is a pointer file. Configuration and state survive these operations. Native maintenance remains for retained managed installs but does not select the executable used by advisory launches. See [recovery](UPGRADE.md#roll-back).

## Source installation

Only install an unreleased source revision deliberately; it is not a substitute for a requested published release. Record the trusted commit and use its matching documentation. From that checkout:

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
node -- src/install-cli.ts
```

Record the current installed release ID first if upgrading, and preserve original installation-path options. Pulling or editing source alone does not update an installed runtime. Configure Jev privately after installation if recommendations are wanted. This development task does not itself publish or install the change.

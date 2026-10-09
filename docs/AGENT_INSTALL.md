# Install ModelRudder with a coding agent

Use the copy-and-paste prompt for [Codex](../README.md#install-with-codex) or [Claude Code](../README.md#install-with-claude-code). This guide covers prerequisites, release installation, private configuration, authentication and removal.

## Claude Code release installation

The published **v0.1.0-preview.6** standalone installer bundles both `smart-codex` and `smart-claude`, despite its `smart-codex-...-install.mjs` filename. No checkout or source build is required. Older Codex-only installers do not include Claude support.

1. Check Node.js 24+ and an independently installed official Claude Code **2.1.293 or newer within 2.1.x**. Codex is not required for `smart-claude`. Use [Claude Code's official setup instructions](https://code.claude.com/docs/en/setup) for missing prerequisites. Preserve an incompatible installation until the user chooses how to resolve it. On Windows/WSL, keep Node, Claude and ModelRudder in the same environment.
2. Follow [Download and verify a release](#2-download-and-verify-a-release) using [v0.1.0-preview.6](https://github.com/cybrking/modelrudder/releases/tag/v0.1.0-preview.6). Verify the checksum, run the standalone installer and preserve existing user PATH entries. Verify `smart-claude --help` (`smart-claude.cmd` on Windows).
3. Run `smart-claude setup` to open the shared private configuration, or `smart-claude setup --no-open` to print its path. Follow the [private-key precautions](#3-prepare-the-private-key-file) below, using `smart-claude` in place of `smart-codex`. The user enters their own key and enables direct Jev classification after reviewing [Claude's data flow](CLAUDE_CODE.md#eligibility-privacy-and-failure-behavior). Do not read the file, enable consent or make classifier requests on their behalf.
4. Check native login with `claude auth status`; guide the user through `claude auth login` if needed. Preserve existing credentials and explain conflicting authentication without replacing it. Run `smart-claude doctor` for version, plugin and native-login checks without submitting a model request.
5. Give the user `smart-claude --routing observe` to run in a fresh terminal after private setup. Native plugin trust and organization policy remain authoritative; do not bypass them. After observing results, the user can try `smart-claude --routing auto`. Pinned mode (`smart-claude --model sonnet`) needs no Jev key or consent. All actual Claude tasks, including pinned turns, consume the user's Claude allowance.
6. Report the OS, Node/Claude versions, release ID, checksum result, installed paths, PATH readiness and doctor findings. Identify private setup and interactive checks still left for the user. Follow the shared [recovery instructions](#5-report-and-retain-recovery-options) below.

Both launchers use the existing private `SMART_CODEX_ENV_FILE` configuration and managed installation paths. Installing does not replace plain `claude`, log in, create API keys, or enable Jev consent. Existing configuration and state survive upgrades and uninstall; rollback to a Codex-only release removes the managed Claude launcher until a dual-launcher release is activated again.

Recorded offline module tests cover Claude Code 2.1.295; they do not establish live TUI behavior or routing quality. See [Claude support and verification limits](CLAUDE_CODE.md).

The remaining prerequisite, setup and login examples use Codex. Release verification, installation paths and recovery are shared by both launchers.

## 1. Inspect the machine

Run `node --version` and `codex --version`. ModelRudder requires **Node.js 24 or newer** and an independently installed native Codex CLI. Protocol-qualified builds are exactly **0.159.3**, **0.160.1** and **0.161.0**; an unknown/newer build is rejected rather than assumed compatible. Node, native Codex and ModelRudder are separate installations.

On macOS/Linux, inspect executable locations with `command -v node` and `command -v codex`. On Windows PowerShell, use `Get-Command node,codex` and identify the native executable. Install missing prerequisites from [Node.js](https://nodejs.org/en/download) and [OpenAI's official Codex installation instructions](https://github.com/openai/codex#quickstart). Select an accepted Codex version rather than blindly upgrading an existing installation. If an existing build is incompatible, report the conflict and preserve it until the user chooses a separate installation or replacement.

**Windows:** use Windows 11 and a real PowerShell terminal. OpenAI supports a native Windows sandbox, which may require its own administrator-approved setup; ModelRudder's installation is per user. Follow [OpenAI's Windows sandbox instructions](https://learn.chatgpt.com/docs/windows/windows-sandbox). Native ModelRudder transport and installer support do not certify the complete interactive Windows TUI.

**WSL:** follow [OpenAI's WSL guidance](https://learn.chatgpt.com/docs/windows/wsl) if the user's tools already run in WSL or native Windows fails. Install Linux Node, Linux Codex and ModelRudder **inside the same WSL distribution**. Run Linux `codex login` there. Windows and WSL have separate home directories, credential/configuration stores and PATHs; do not copy or overwrite credentials to bridge them. Keep the repository in the filesystem used by that environment.

## 2. Download and verify a release

Use the selected tagged release on [github.com/cybrking/modelrudder/releases](https://github.com/cybrking/modelrudder/releases). Download its `smart-codex-RELEASE_ID-install.mjs` and `SHA256SUMS` into the same directory. Replace `RELEASE_ID` with the actual release filename; do not execute this placeholder. Confirm the publisher and release page before running downloaded code. Do not run a script piped from a URL directly into a shell.

On macOS:

```sh
shasum -a 256 -c SHA256SUMS
node -- ./smart-codex-RELEASE_ID-install.mjs
```

On Linux/WSL, use `sha256sum -c SHA256SUMS` before the same `node` command. On Windows PowerShell:

```powershell
Get-FileHash .\smart-codex-RELEASE_ID-install.mjs -Algorithm SHA256
Get-Content .\SHA256SUMS
# Compare the hash to the line for the exact installer filename before continuing.
node -- .\smart-codex-RELEASE_ID-install.mjs
```

Do not run the installer if the checksum differs, the filename has no matching checksum entry, or the origin is untrusted. A checksum downloaded beside a file protects integrity, not publisher identity by itself.

The standalone installer contains the runtime and its dependency; it needs no repository checkout or npm dependency download. Defaults on macOS/Linux are `~/.local/share/smart-codex` for runtime, `~/.local/bin` for the launcher, and `~/.config/smart-codex/env` for configuration. Windows defaults are `%LOCALAPPDATA%\ModelRudder\runtime`, `%LOCALAPPDATA%\ModelRudder\bin` and `%LOCALAPPDATA%\ModelRudder\config\env`; if `LOCALAPPDATA` is absent, the base is the user's `AppData\Local`. The Windows launcher is `smart-codex.cmd`; installation does not require administrator rights or symlinks.

Use the paths printed by the installer as authoritative. Add only the printed launcher directory to the user's PATH, preserving existing entries. Open a fresh terminal and verify `smart-codex --help`. Do not replace plain `codex`, overwrite an unmanaged launcher, or modify machine-wide PATH.

## 3. Prepare the private key file

```sh
smart-codex setup --no-open
```

This creates a minimal configuration with classification disabled if absent and prints the configuration path. An existing file is retained. No setting is enabled by creating the file. When the user is ready:

```sh
smart-codex setup
```

Setup requests an editor and catches immediate startup failures. If no window appears, open the printed configuration path manually; a successful launch request does not establish that an editor window opened. The user enters credentials in their local editor. If the editor cannot open, give the user the printed path so they can open it manually; do not read the file into agent context. The template includes these settings:

```dotenv
TYPESAFE_API_KEY=
ALLOW_JEV_CLASSIFICATION=false
SMART_CODEX_CLASSIFIER=direct
```

The [official Jev quickstart](https://docs.typesafe.ai/introduction/quickstart) links to the [TypeSafe key dashboard](https://console.typesafe.ai/keys), which offers account login/signup if needed. Provider fees are separate from the free client and the user's Codex subscription. The user enters their own key and explicitly changes `ALLOW_JEV_CLASSIFICATION` to `true`. Consent enables sending eligible task text and bounded earlier excerpts to TypeSafe as described in the README. Do not enable consent on their behalf, store keys in shell history or a repository, or automatically submit a classification request to check the key. Existing exported environment variables take precedence; do not print them when diagnosing configuration.

On Unix, keep the configuration private to the user. On Windows, keep it under the user's profile and avoid shared directories; Unix mode bits do not establish Windows ACL protection. If the profile/directory is shared, have the user review access permissions.

## 4. Authenticate and check readiness

Use `codex login status` to check native login. If a ChatGPT login is missing, help the user run `codex login` and complete OpenAI's own flow. Do not read or modify native `auth.json`, extract tokens, or change forced-login settings. If an existing API login conflicts with this community preview's ChatGPT requirement, explain the conflict before any login change.

Run:

```sh
smart-codex doctor
```

Doctor is a prerequisite/protocol check, not proof of task quality, paid-access eligibility or full TUI operation. Give the user this command to run interactively after they finish key setup:

```sh
smart-codex --routing observe --effort-mode fixed
```

Observe mode calls Jev for recommendations while Sol executes the task. It can consume both providers' allowances and is therefore a **user-run** test. Have the user inspect tools/approvals, interruption and normal task completion before considering experimental auto mode. Leaving Jev disabled allows `smart-codex --routing pinned --model gpt-6.1-sol`; submitting a pinned task still uses the user's OpenAI allowance.

Resume an existing thread with `smart-codex resume THREAD_ID`. Codex 0.160.1 rejects permission overrides such as `--sandbox` and `--ask-for-approval` when resuming a remote task; use the thread’s retained permissions. An automatically upgraded, unsupported Codex version is rejected; explain this before changing the user’s CLI.

## 5. Report and retain recovery options

Report the OS, Node/Codex versions, release ID, checksum result, installed paths, PATH readiness and doctor findings. Report whether private setup remains for the user without inspecting its contents. State which interactive checks remain unperformed. Do not include secrets or claim Windows TUI validation from another platform.

On macOS/Linux, run the installed `current/src/install-cli.ts` with Node using the runtime root printed during installation. On Windows, retain and reuse the verified downloaded installer, for example `node -- .\smart-codex-RELEASE_ID-install.mjs --list`; Windows `current` is a pointer file, not a directory. Both maintenance paths support `--list`, `--rollback RELEASE_ID` and `--uninstall`. Repeat any custom install-path flags originally used. Upgrades, rollback and uninstall preserve private configuration and local state; deleting those is a separate explicit user choice. Restart active launchers after changing releases.

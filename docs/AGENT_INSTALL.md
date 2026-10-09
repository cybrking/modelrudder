# Install ModelRudder with a coding agent

Use the single copy-and-paste Codex prompt in the [README](../README.md#install-with-codex). This guide is the detailed reference for checking prerequisites, installing and configuring ModelRudder, authentication, troubleshooting and removal.

## Claude source-build preview

Claude support is available in source builds that include `src/smart-claude.ts` and `plugins/claude`; earlier Codex-only release installers do not contain it. From that checkout, with Node.js 24 or newer:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run install-cli
smart-claude --help
```

The current source installer creates both `smart-codex` and `smart-claude` (`.cmd` launchers on Windows). Both use the existing private `SMART_CODEX_ENV_FILE` configuration and managed installation paths. It does not replace plain `claude`, log in, create API keys, or enable Jev consent. Existing configuration and state survive upgrades and uninstall; rollback to a Codex-only release removes the managed Claude launcher until a dual-launcher release is activated again.

Claude routing requires an independently installed Claude Code **2.1.293 or newer within 2.1.x**, with the user's native `claude.ai` login. Run `smart-claude doctor` for version, plugin and native-login checks without submitting a model request. Use `smart-claude setup --no-open` to locate the shared private configuration; follow the same user-controlled Jev setup precautions below. Pinned mode needs no Jev key or consent. Actual interactive turns, including pinned turns, consume the user's Claude allowance. Recorded offline module tests cover 2.1.295; they do not establish live TUI behavior or routing quality. Have the user perform any live validation, and preserve their existing login and permissions.

The remaining guide covers the Codex release installation and prerequisites.

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

This creates a commented template if absent and prints the configuration path. An existing file is retained. No setting is enabled by creating the file. When the user is ready:

```sh
smart-codex setup
```

Setup requests an editor and catches immediate startup failures. If no window appears, open the printed configuration path manually; a successful launch request does not establish that an editor window opened. The user enters credentials in their local editor. If the editor cannot open, give the user the printed path so they can open it manually; do not read the file into agent context. The template includes these disabled settings:

```dotenv
# Jev account signup/login and API keys: https://console.typesafe.ai/keys
# TYPESAFE_API_KEY=
# ALLOW_JEV_CLASSIFICATION=true
# SMART_CODEX_CLASSIFIER=direct
```

The [official Jev quickstart](https://docs.typesafe.ai/introduction/quickstart) links to the [TypeSafe key dashboard](https://console.typesafe.ai/keys), which offers account login/signup if needed. Provider fees are separate from the free client and the user's Codex subscription. The user must explicitly uncomment all three settings and enter their own key. Consent enables sending eligible task text and bounded earlier excerpts to TypeSafe as described in the README. Do not enable consent on their behalf, store keys in shell history or a repository, or automatically submit a classification request to check the key. Existing exported environment variables take precedence; do not print them when diagnosing configuration.

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

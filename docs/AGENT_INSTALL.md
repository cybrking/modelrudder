# Installing ModelRudder

Use the copy-and-paste prompt for [Codex](../README.md#install-with-codex) or [Claude Code](../README.md#install-with-claude-code). Use this guide for manual installation or as the detailed procedure for your coding agent. It covers prerequisites, release installation, private configuration, authentication and removal.

For classifier choice, see [Jev and local Tev](CLASSIFIER_CHOICES.md). Preview.12 includes both providers. After installing, use `setup --classifier jev` for hosted routing or `setup --classifier tev` for a compatible local service. The detailed private-key steps below apply only to Jev.

## Provider selection for agent-assisted installs

The complete README install prompts cover all four combinations:

| Native tool | Hosted Jev setup | Local Tev setup | Verify the saved choice |
| --- | --- | --- | --- |
| Codex | `smart-codex setup --classifier jev` | `smart-codex setup --classifier tev` | `smart-codex classifier status`, then `smart-codex doctor` |
| Claude Code | `smart-claude setup --classifier jev` | `smart-claude setup --classifier tev` | `smart-claude classifier status`, then `smart-claude doctor` |

Ask the user to choose Jev or Tev unless they have already specified one. Install and check the managed native runtime for their selected tool before completing the provider setup below. Agent-run setup should use the explicit flag from the table: a noninteractive process cannot operate the terminal menu. Both launchers save to the same private configuration, so explain that a provider switch affects both in new sessions.

For Jev, private key entry and hosted consent remain user actions. If setup opens an editor or retains Tev pending Jev credentials, wait for the user to finish, then rerun the same explicit Jev setup command and check status. For Tev, resolve local prerequisites before running setup; a missing service/model leaves the saved provider unchanged. Never fall back to the other provider without the user's choice. Use fresh launcher processes for status and doctor so they reload the saved file. Report the actual provider and whether classification is enabled; setup's exit code or a successful editor launch alone is insufficient.

Do not mark the installation ready if native login, private key entry, consent, local service/model setup, or a conflicting environment override remains unresolved. Describe the remaining action and retain existing credentials/settings. Status and doctor do not submit classifier inference or native model tasks; passing them is not live qualification.

## Claude Code release installation

The published **v0.1.0-preview.12** standalone installer bundles both `smart-codex` and `smart-claude`, despite its `smart-codex-...-install.mjs` filename. No checkout or source build is required. Older Codex-only installers do not include Claude support.

1. Check Node.js 24+, npm/network access for a managed native installation, and a separately installed official Claude CLI for `claude auth login`. Codex is not required for `smart-claude`. Use [Claude Code's official setup instructions](https://code.claude.com/docs/en/setup) for missing prerequisites. Preserve any existing plain Claude installation. On Windows/WSL, keep Node, Claude and ModelRudder in the same environment.
2. Follow [Download and verify a release](#2-download-and-verify-a-release) using [v0.1.0-preview.12](https://github.com/cybrking/modelrudder/releases/tag/v0.1.0-preview.12). Verify the checksum, run the standalone installer and preserve existing user PATH entries. Verify `smart-claude --help` (`smart-claude.cmd` on Windows), then run `smart-claude native install` and `smart-claude native status`. This installs and checks the release-recorded Claude 2.1.300 separately from plain Claude.
3. Follow [provider selection](#provider-selection-for-agent-assisted-installs) and [provider configuration](#3-choose-and-configure-a-routing-provider) below, using `smart-claude` in place of `smart-codex`. Run `smart-claude setup --classifier jev` or `smart-claude setup --classifier tev` for the user's choice. Only the Jev path needs a private key and hosted consent; the Tev path needs a compatible running local service and model. Preserve the previous selection if setup cannot complete. Do not read credentials, grant hosted consent or make inference requests on the user's behalf.
4. Check native login with `claude auth status`; guide the user through `claude auth login` if needed. Preserve existing credentials and explain conflicting authentication without replacing it. Run `smart-claude classifier status` to confirm the chosen provider is enabled, then `smart-claude doctor` for version, plugin and native-login checks without submitting a model request.
5. Give the user `smart-claude --routing observe` to run in a fresh terminal after private setup. Native plugin trust and organization policy remain authoritative; do not bypass them. After observing results, the user can try `smart-claude --routing auto`. Pinned mode (`smart-claude --model sonnet`) needs no Jev key or consent. All actual Claude tasks, including pinned turns, consume the user's Claude allowance.
6. Report the OS, Node/Claude versions, release ID, checksum result, installed paths, PATH readiness and doctor findings. Identify private setup and interactive checks still left for the user. Follow the shared [recovery instructions](#5-report-and-retain-recovery-options) below.

Both launchers use the existing private `SMART_CODEX_ENV_FILE` configuration and managed installation paths. Installing does not replace plain `claude`, log in, create API keys, or enable Jev consent. Existing configuration and state survive upgrades and uninstall; rollback to a Codex-only release removes the managed Claude launcher until a dual-launcher release is activated again.

Recorded compatibility evidence includes Claude Code 2.1.295 and 2.1.300; they do not establish live TUI behavior or routing quality. See [Claude support and verification limits](CLAUDE_CODE.md).

The remaining prerequisite, setup and login examples use Codex. Release verification, installation paths and recovery are shared by both launchers.

## 1. Inspect the machine

Run `node --version` and `npm --version`. ModelRudder requires **Node.js 24 or newer** and npm/network access to install its separate native CLI. Install missing Node/npm from [Node.js](https://nodejs.org/en/download). A separately installed official Codex CLI is required for the `codex login` flow. Install it if missing using [OpenAI’s official instructions](https://github.com/openai/codex#quickstart). Preserve any existing plain Codex installation; its version no longer determines ModelRudder compatibility.

After installing the ModelRudder release, run `smart-codex native install` and `smart-codex native status`. The default is the release-recorded Codex **0.162.1**. Recorded history and explicit blocks are in `src/cli-compatibility-data.ts`. Explicit stable candidates within the supported major must pass checks before activation; unsupported or known-broken builds are rejected before download. See [managed native versions](NATIVE_VERSIONS.md) for migration and rollback. On macOS/Linux inspect Node/npm with `command -v`; on Windows use `Get-Command node,npm`.

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

## 3. Choose and configure a routing provider

For interactive use, `smart-codex setup` (or `smart-claude setup`) shows the saved provider and a Jev/Tev menu in builds that include the provider picker. Agent-run commands and releases without the picker should use the explicit `--classifier` commands below. `setup --no-open` alone preserves existing settings or creates a disabled template; it does not choose or activate Tev.

### Local Tev

Use a running service with `/api/tags`, `/v1/systemone`, and `tev1:latest`, normally at `http://127.0.0.1:11434`. An arbitrary OpenAI-compatible chat endpoint is insufficient. If the service or model is absent, explain the prerequisites and get agreement before downloading a model or installing a persistent service. See [local configuration](CLASSIFIER_CHOICES.md) for a custom numeric loopback origin or supported tagged Tev model.

```sh
smart-codex setup --classifier tev
smart-codex classifier status
```

Use `smart-claude` for Claude. Successful setup saves `SMART_CODEX_CLASSIFIER=tev` and `ALLOW_CLASSIFICATION=true` for both launchers without requesting a Jev key or enabling hosted consent. A failed metadata check leaves the previous provider unchanged. Never silently substitute Jev. Setup/status inspect `/api/tags` only: model presence does not prove `/v1/systemone` inference compatibility or warm-model readiness. Proceed to native login and doctor below; do not run the Jev key steps for a Tev installation.

### Hosted Jev and private key entry

```sh
smart-codex setup --classifier jev
```

Ready Jev credentials and consent are reused. Otherwise setup prints the private configuration path and requests a local editor. If switching from Tev without ready Jev credentials/consent, setup retains Tev until the user completes private entry; rerun the command afterward. To prepare a disabled template or print its path without opening an editor:

```sh
smart-codex setup --no-open
```

This creates a minimal disabled configuration only if absent; an existing file is retained. If no editor window appears after interactive setup, open the printed path manually; a successful launch request does not establish that a window opened. The user enters credentials in their local editor. Do not read the file into agent context. The template includes these settings:

```dotenv
TYPESAFE_API_KEY=
ALLOW_JEV_CLASSIFICATION=false
SMART_CODEX_CLASSIFIER=direct
```

`SMART_CODEX_CLASSIFIER`, `SMART_CODEX_ENV_FILE` and the macOS/Linux `~/.config/smart-codex/env` path are shared legacy names used by **both** launchers. Keep these names as written. Direct Jev uses `SMART_CODEX_CLASSIFIER=direct`; local Tev uses `tev`. Claude supports these two choices, but not the Codex-only hosted gateway. Leaving `ALLOW_JEV_CLASSIFICATION=false` keeps Jev disabled; pinned mode remains available.

The [official Jev quickstart](https://docs.typesafe.ai/introduction/quickstart) links to the [TypeSafe key dashboard](https://console.typesafe.ai/keys), which offers account login/signup if needed. Provider fees are separate from the free client and the user's Codex subscription. The user enters their own key and explicitly changes `ALLOW_JEV_CLASSIFICATION` to `true`. Consent enables sending eligible task text and bounded earlier excerpts to TypeSafe as described in the README. Do not enable consent on their behalf, store keys in shell history or a repository, or automatically submit a classification request to check the key. Existing exported environment variables take precedence; do not print them when diagnosing configuration.

On Unix, keep the configuration private to the user. On Windows, keep it under the user's profile and avoid shared directories; Unix mode bits do not establish Windows ACL protection. If the profile/directory is shared, have the user review access permissions.

## 4. Authenticate and check readiness

Use `codex login status` to check native login. If a ChatGPT login is missing, help the user run `codex login` and complete OpenAI's own flow. Do not read or modify native `auth.json`, extract tokens, or change forced-login settings. If an existing API login conflicts with this community preview's ChatGPT requirement, explain the conflict before any login change.

Run:

```sh
smart-codex classifier status
smart-codex doctor
```

Confirm that classifier status names the chosen provider and reports classification enabled. Jev status checks configured credentials/consent without verifying the key remotely; Tev status checks local metadata without inference. Doctor is a prerequisite/protocol check, not proof of task quality, paid-access eligibility or full TUI operation. Give the user this command to run interactively after they finish the selected provider's setup:

```sh
smart-codex --routing observe --effort-mode fixed
```

Observe mode calls the selected classifier for recommendations while Sol executes the task. Jev consumes hosted classifier resources; Tev consumes local resources. Native execution uses the user's OpenAI allowance in either case, so this is a **user-run** test. Have the user inspect tools/approvals, interruption and normal task completion before considering experimental auto mode. Pinned mode needs neither classifier: `smart-codex --routing pinned --model gpt-6.1-sol`; submitting a pinned task still uses the user's OpenAI allowance.

Resume an existing thread with `smart-codex resume THREAD_ID`. Codex 0.160.1 rejects permission overrides such as `--sandbox` and `--ask-for-approval` when resuming a remote task; use the thread’s retained permissions. Plain Codex updates do not change the managed pin. A missing or invalid pin produces an actionable `native install` instruction.

## 5. Report and retain recovery options

Report the OS, Node/Codex versions, release ID, checksum result, installed paths, PATH readiness and doctor findings. Report whether private setup remains for the user without inspecting its contents. State which interactive checks remain unperformed. Do not include secrets or claim Windows TUI validation from another platform.

On macOS/Linux, run the installed `current/src/install-cli.ts` with Node using the runtime root printed during installation. On Windows, retain and reuse the verified downloaded installer, for example `node -- .\smart-codex-RELEASE_ID-install.mjs --list`; Windows `current` is a pointer file, not a directory. Both maintenance paths support `--list`, `--rollback RELEASE_ID` and `--uninstall`. Repeat any custom install-path flags originally used. Upgrades, rollback and uninstall preserve private configuration and local state; deleting those is a separate explicit user choice. Restart active launchers after changing releases.

Native CLI rollback is separate from ModelRudder release rollback: `smart-codex native rollback` or `smart-claude native rollback` rechecks the previous managed version before selecting it. Report both `native status` and the ModelRudder release ID. See [native version management](NATIVE_VERSIONS.md).

## Source installation

Alternatively, build from a trusted source checkout with Node.js 24+:

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
node -- src/install-cli.ts
```

Then follow the private configuration, native installation and login steps above for your tool. See [development instructions](../CONTRIBUTING.md#development) for CI and native checks.

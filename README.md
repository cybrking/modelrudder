![ModelRudder article thumbnail: Hitting usage limits?](docs/images/modelrudder-article-thumbnail.png)

# ModelRudder

Spend your strongest model on the tasks that need it. ModelRudder adds experimental model routing to native coding tools, while they retain their tools, approvals and workspace permissions.

**Free local community preview · MIT licensed · macOS, Linux/WSL and Windows preview**

Use your own native provider account. ModelRudder uses Jev with your own TypeSafe key and explicit classification consent. This preview requires no ModelRudder account or subscription. Provider charges and usage limits still apply. Clef support is not included.

**Release status, checked October 19, 2026 at 13:02 UTC:** preview.14 is an unreleased Jev-only source candidate. Its GitHub release is a draft with no downloadable assets; the newest published release is [preview.13](https://github.com/cybrking/modelrudder/releases/tag/v0.1.0-preview.13), which still includes Tev. These current-source docs do not describe a published Jev-only installer.

Choose the launcher for your native coding tool; a dual-launcher installer includes both, and you only need the native CLI you intend to use. The installation prompts below check the [official releases page](https://github.com/cybrking/modelrudder/releases) and stop unless a published Jev-only release and its installer/checksum are available. Do not substitute preview.13 or a source build for that request. See [release verification](docs/AGENT_INSTALL.md#2-download-and-verify-a-release); [source installation](docs/AGENT_INSTALL.md#source-installation) is a separate, explicit developer choice.

| Native tool | ModelRudder launcher | Experimental automatic routing |
| --- | --- | --- |
| Claude Code | `smart-claude` | Haiku / Sonnet / Opus |
| Codex | `smart-codex` | Luna / Sol / Astra |

Both launchers choose a model for each eligible new user turn and keep that choice through its tool loop. Codex applies valid classifier choices without a confidence gate, including the profile's reasoning effort; reported confidence is informational. Native tools, approvals and workspace permissions remain in place. ModelRudder is an independent project with no claimed provider endorsement.

## Set up Jev routing

Jev recommends the model and, for Codex, reasoning effort; your native coding tool executes the task. Both launchers share private configuration. Use the complete install prompt below for your native tool. See [Jev setup](docs/CLASSIFIER_CHOICES.md) for consent, configuration and migration from retired local settings.

### Natural-language instructions: choose Jev

Use either installation prompt below. The agent guides you through private key entry and explicit classification consent; existing working Jev settings can be reused.

## Requirements

- Node.js 24+, npm and network access for the managed native CLI installation.
- macOS, Linux/WSL, or Windows 11 with PowerShell. Native Windows support is a preview.
- Your own Claude or ChatGPT account and the corresponding official CLI for native login.
- For routing: your own [TypeSafe Jev key](https://console.typesafe.ai/keys) and explicit classification consent. Pinned mode needs no classifier key.

The installer creates separate managed native CLI versions and reuses your native login. Plain Claude and Codex can update independently. See the [installation guide](docs/AGENT_INSTALL.md) and [native version management](docs/NATIVE_VERSIONS.md).

## Install with Codex

Copy this entire prompt into Codex. The agent installs the launcher and prepares Jev setup; private key entry and native login may require your participation.

```text
Install and set up ModelRudder on this computer for Codex.
Use the official releases at https://github.com/cybrking/modelrudder/releases.
Include previews, exclude drafts, and choose the newest published release by
publication date whose notes confirm Jev-only support. Stop if none exists or
its standalone installer or SHA256SUMS is missing. Do not substitute an older
Tev-capable release or a source build. Resolve the release once and read the README,
docs/AGENT_INSTALL.md and docs/CLASSIFIER_CHOICES.md at that exact release tag.
Verify the standalone installer against that release's SHA256SUMS before use.

1. Use Jev for routing. Explain that Jev sends eligible task text and bounded
   earlier excerpts to TypeSafe; task execution uses my native OpenAI account.
   The private configuration is shared with smart-claude, so changes apply
   to both launchers in new sessions. Preserve native permissions and login.

2. Detect my OS and check Node.js 24+ and npm. Preserve existing native CLIs,
   credentials, configuration, permissions and PATH entries. Install the
   official plain Codex CLI if needed for native login. Follow the release
   installation procedure in docs/AGENT_INSTALL.md for my user account. Add only the printed launcher directory
   to my user PATH and verify smart-codex --help. Do not overwrite an unmanaged
   launcher. Run smart-codex native install and smart-codex native status to
   install and check ModelRudder's separate recorded Codex runtime.

3. Run smart-codex setup --classifier jev. Reuse ready credentials and
   consent; if either is missing, show https://console.typesafe.ai/keys and
   open the printed private configuration path for me. I enter my own
   TYPESAFE_API_KEY and explicitly set ALLOW_JEV_CLASSIFICATION=true after
   reviewing the data flow. Never read or print the key file, ask me to paste
   a key into chat, or enable consent on my behalf. Rerun setup after private
   entry if migration is pending. Keep the ALLOW_CLASSIFICATION=false kill
   switch effective unless I explicitly choose to enable classification.
   Do not claim readiness just because the editor opened or setup succeeded.

4. Check codex login status without replacing my login. If needed, guide me
   through the official codex login flow. Run smart-codex classifier status
   and smart-codex doctor in fresh processes that load the saved configuration.
   Confirm that status names Jev and reports it enabled.
   Explain conflicting environment overrides without printing credentials.
   Do not submit classifier inference or native model tasks automatically.

5. Report the installed release ID, native version, Jev configuration, setup
   result and any remaining blocker. Mark setup pending if private key entry, consent
   or login remains; passing status/doctor checks does not
   certify a live task. Give me smart-codex --routing observe --effort-mode fixed
   to run in a fresh terminal, and explain that bare smart-codex enables auto
   routing. Use smart-codex setup to edit private configuration later.
```

If an editor cannot open, use the printed private path to open it manually. [Detailed agent instructions](docs/AGENT_INSTALL.md) cover Windows, Linux/WSL and macOS.

## Install with Claude Code

Copy this entire prompt into Claude Code. Codex is not required. Private Jev key entry and native Claude login may require your participation.

```text
Install and set up ModelRudder on this computer for Claude Code.
Use the official releases at https://github.com/cybrking/modelrudder/releases.
Include previews, exclude drafts, and choose the newest published release by
publication date whose notes confirm Jev-only support. Stop if none exists or
its standalone installer or SHA256SUMS is missing. Do not substitute an older
Tev-capable release or a source build. Resolve the release once and read the README,
docs/AGENT_INSTALL.md, docs/CLAUDE_CODE.md and docs/CLASSIFIER_CHOICES.md at
that exact release tag. Verify the standalone installer against that release's
SHA256SUMS before use.

1. Use Jev for routing. Explain that Jev sends eligible task text and bounded
   earlier excerpts to TypeSafe; task execution uses my native Claude account.
   The private configuration is shared with smart-codex, so changes apply
   to both launchers in new sessions. Preserve native permissions and login.

2. Detect my OS and check Node.js 24+ and npm. Preserve existing native CLIs,
   credentials, configuration, permissions and PATH entries. Install the
   official plain Claude CLI if needed for native login. Codex is not required.
   Follow the release installation procedure in docs/AGENT_INSTALL.md for my
   user account. The installer includes both launchers. Add only
   the printed launcher directory to my user PATH, and verify smart-claude
   --help. Do not overwrite an unmanaged launcher. Run smart-claude native
   install and smart-claude native status to install and check ModelRudder's
   separate recorded Claude runtime.

3. Run smart-claude setup --classifier jev. Reuse ready credentials and
   consent; if either is missing, show https://console.typesafe.ai/keys and
   open the printed private configuration path for me. I enter my own
   TYPESAFE_API_KEY and explicitly set ALLOW_JEV_CLASSIFICATION=true after
   reviewing the data flow. Never read or print the key file, ask me to paste
   a key into chat, or enable consent on my behalf. Rerun setup after private
   entry if migration is pending. Keep the ALLOW_CLASSIFICATION=false kill
   switch effective unless I explicitly choose to enable classification.
   Do not claim readiness just because the editor opened or setup succeeded.

4. Check claude auth status without replacing my login. If needed, guide me
   through the official claude auth login flow. Run smart-claude classifier
   status and smart-claude doctor in fresh processes that load the saved
   configuration. Confirm that status names Jev and reports
   it enabled. Explain conflicting environment overrides without printing
   credentials. Preserve native plugin trust and organization policy; do not
   bypass either. Do not submit classifier inference or native model tasks
   automatically.

5. Report the installed release ID, native version, Jev configuration, setup
   result and any remaining blocker. Mark setup pending if private key entry, consent
   or login remains; passing status/doctor checks does not
   certify live Claude behavior or task quality. Give me smart-claude --routing
   observe to run in a fresh terminal, and explain that bare smart-claude enables
   auto routing. Use smart-claude setup to edit private configuration later.
```

If an editor cannot open, use the printed private path to open it manually. See the [installation guide](docs/AGENT_INSTALL.md) for manual setup.

## Start using ModelRudder

After installation, Jev setup and a successful doctor check, open a fresh terminal and run the launcher for your tool:

```sh
smart-claude
# Or:
smart-codex
```

Both launchers default to **auto routing**: ModelRudder selects a model for each eligible new message. `smart-codex` also defaults to automatic effort selection. The explicit `--routing auto` and `--effort-mode auto` flags are optional. Plain `claude` or `codex` starts the native tool without ModelRudder routing.

To inspect routing recommendations before enabling model switching, choose **observe** mode. Claude starts on Sonnet and Codex on Sol; ModelRudder recommends routes without switching the model:

```sh
# Claude Code
smart-claude --routing observe
# Codex
smart-codex --routing observe --effort-mode fixed
```

Both observe and auto send eligible task text to Jev and consume provider usage. To switch from observe to auto, exit and start a new session with the bare launcher command above.

For pinned models, reports and detailed routing behavior, see the [command reference](docs/COMMANDS.md). Try the [routing examples](docs/ROUTING_EXAMPLES.md) or consult [troubleshooting](docs/TROUBLESHOOTING.md) if a route is unexpected.

## Upgrade and rollback

### Upgrade with Claude Code or Codex

Copy this prompt into **Claude Code or Codex**. Your coding agent can handle the upgrade; you do not need to copy individual terminal commands. Use a separate native agent session and close active ModelRudder sessions before installation.

```text
Upgrade my existing ModelRudder installation to the newest published release
from https://github.com/cybrking/modelrudder/releases.
Require release notes confirming Jev-only support; stop if no such release is
available or its standalone installer or SHA256SUMS is missing. Explain the
blocker without substituting an older Tev-capable release or a source build.
Include preview releases, exclude drafts, and select by publication date.
Resolve the release once, tell me its exact tag, and use that same release
for all documentation and downloads. Do not use GitHub's /releases/latest
shortcut, which excludes previews. Read the README and docs/UPGRADE.md at
that release tag, then handle the upgrade for me.

Detect my OS, check the selected release's Node/npm requirements, and identify
my existing installation paths. Download that release's standalone installer
and SHA256SUMS into a new folder using the exact published asset filenames.
Verify the checksum before running it; stop if it does not match.
Record my current release ID for rollback, then upgrade both launchers
using my existing runtime, bin and configuration paths.

Preserve my keys, configuration, local state and PATH. Do not read or print
my key file, replace my native CLI or change my login. Verify both launchers
report the expected version from the selected release. Run native install,
native status and doctor for the native tool I am using. Explain that native install selects the latest
recorded version in this release and retains the previous pin for rollback.
Explain any prerequisite or compatibility problem instead of claiming success.
Do not submit model tasks or classifier requests to test the upgrade.

Tell me the result, the command to start a fresh session, and the exact
rollback command using my saved release ID and installation paths.
```

The installer updates both launchers and retains your existing Jev key. The agent should report any remaining native Claude/Codex version requirements. Runtime rollback restores the selected release's features; rolling back to a release that supported Tev restores that historical functionality. See the [upgrade guide](docs/UPGRADE.md) for manual upgrades, rollback and uninstall.

## Data and privacy

Observe and auto send eligible task text and up to two bounded earlier task excerpts to TypeSafe through Jev. Anything pasted into that text, including code or secrets, is included. Enter your Jev key privately in the local editor; never paste it into agent chat.

Native Claude and Codex use your provider account normally. Provider charges and usage limits still apply; no subscription limit is bypassed. ModelRudder has no client telemetry. See [data flow and local reports](docs/COMMANDS.md#data-and-privacy).

For a local Codex learning experiment, `SMART_CODEX_LEARNING_DIR` explicitly enables private task capture separate from usage reports. It saves user task text, up to two earlier task excerpts, and routing metadata for review; it does not upload feedback or train automatically. See [local learning](docs/LOCAL_LEARNING.md). Leave it unset to disable capture.

## Preview status

Automatic routing is experimental: classifier confidence is not a coding success probability. Full native TUI behavior, task quality and a general Codex compatibility range remain unqualified. Start with observe mode, inspect changes and run your own tests. The preview is not a production SLA or a guaranteed savings claim. See [release evidence](docs/RELEASE_EVIDENCE.md).

## Documentation

- [Manual installation and configuration](docs/AGENT_INSTALL.md)
- [Commands and reports](docs/COMMANDS.md) · [Routing examples](docs/ROUTING_EXAMPLES.md) · [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Upgrade and rollback](docs/UPGRADE.md) · [Managed native versions](docs/NATIVE_VERSIONS.md)
- [Claude support and verification limits](docs/CLAUDE_CODE.md) · [Release readiness](docs/RELEASE_READINESS.md)
- [Provider release checks](docs/UPSTREAM_UPDATES.md)
- [Contributing and development](CONTRIBUTING.md) · [Security reporting](SECURITY.md)

Licensed under [MIT](LICENSE); ws retains its [upstream MIT notice](THIRD_PARTY_NOTICES/ws-LICENSE).

CLI update management: the [daily upstream workflow](docs/UPSTREAM_UPDATES.md) tests stable candidates across operating systems and prepares reviewed evidence PRs. Explicit candidate installs must pass native checks before replacing a managed pin; known broken versions are blocked. Plain CLI updates stay independent of ModelRudder's selected runtime.

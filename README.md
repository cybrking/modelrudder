![ModelRudder article thumbnail: Hitting usage limits?](docs/images/modelrudder-article-thumbnail.png)

# ModelRudder

Spend your strongest model on the tasks that need it. ModelRudder adds experimental model routing to native coding tools, while they retain their tools, approvals and workspace permissions.

**Free local community preview · MIT licensed · macOS, Linux/WSL and Windows preview**

Use your own native provider account and your own TypeSafe Jev API key. This preview requires no ModelRudder account or subscription. Provider charges and usage limits still apply. Clef support is not included.

Choose the launcher for your native coding tool. The preview.10 installer includes both; you only need the native CLI you intend to use.

| Native tool | ModelRudder launcher | Experimental automatic routing |
| --- | --- | --- |
| Claude Code | `smart-claude` | Haiku / Sonnet / Opus |
| Codex | `smart-codex` | Luna / Sol / Astra |

Both launchers choose a model for each eligible new user turn and keep that choice through its tool loop. Codex applies valid Jev choices without a confidence gate, including the profile's reasoning effort; reported confidence is informational. Native tools, approvals and workspace permissions remain in place. ModelRudder is an independent project with no claimed provider endorsement.

## Requirements

- Node.js 24+, npm and network access for the managed native CLI installation.
- macOS, Linux/WSL, or Windows 11 with PowerShell. Native Windows support is a preview.
- Your own Claude or ChatGPT account and the corresponding official CLI for native login.
- Your own [TypeSafe Jev key](https://console.typesafe.ai/keys) for observe/auto routing. Pinned mode works without Jev.

The installer creates separate managed native CLI versions and reuses your native login. Plain Claude and Codex can update independently. See the [installation guide](docs/AGENT_INSTALL.md) and [native version management](docs/NATIVE_VERSIONS.md).

## Install with Codex

Copy this entire prompt into Codex. It will install ModelRudder and open the local configuration file; you enter your Jev key privately in the editor.

```text
Install ModelRudder on this computer so I can use model routing in Codex.
Use the official release: https://github.com/cybrking/modelrudder/releases/tag/v0.1.0-preview.10
Read the README and docs/AGENT_INSTALL.md at that release tag and follow them.

Detect my OS and check Node.js 24+ and npm. Preserve existing native CLIs,
credentials and configuration. If plain Codex is missing, install its official
CLI for native login. After installing ModelRudder, run smart-codex
native install to install and check its separate, recorded Codex version.

Download the release installer and SHA256SUMS, verify the checksum, install
for my user account, and add its launcher directory to my user PATH without
removing existing entries. Verify smart-codex --help.

Run smart-codex setup to open my private Jev configuration in a local editor.
Show me https://console.typesafe.ai/keys so I can sign up and get my own key.
Never read or print the key file or ask me to paste a key into chat. Leave new
classification disabled until I enter the key and explicitly enable it.

Check my Codex login without replacing it. If login is needed, guide me through
the official codex login flow. Run smart-codex doctor, explain anything still
needed, and give me the command to start in a fresh terminal. Do not submit
paid model tasks automatically.
```

If an editor cannot open, Codex can give you the file path to open manually. [Detailed agent instructions](docs/AGENT_INSTALL.md) cover Windows, Linux/WSL and macOS.

## Install with Claude Code

Copy this entire prompt into Claude Code. It will install ModelRudder and open the local configuration file; you enter your Jev key privately in the editor.

```text
Install ModelRudder on this computer so I can use model routing in Claude Code.
Use the official release: https://github.com/cybrking/modelrudder/releases/tag/v0.1.0-preview.10
Read docs/AGENT_INSTALL.md and docs/CLAUDE_CODE.md at that release tag
and follow them.

Detect my OS and check Node.js 24+ and npm. Preserve existing native CLIs,
credentials, configuration and permissions. If plain Claude is missing, install
its official CLI for native login. After installing ModelRudder, run
smart-claude native install to install and check its separate Claude version.
Codex is not required for smart-claude.

Download the release installer and SHA256SUMS, verify the checksum, install
for my user account, and add its launcher directory to my user PATH without
removing existing entries. Use the exact installer filename from the release;
it includes smart-claude, so no source build is needed. Verify smart-claude
--help. Do not replace plain claude or an unmanaged launcher.

Run smart-claude setup to open my private Jev configuration in a local editor.
Show me https://console.typesafe.ai/keys so I can sign up and get my own key.
Never read or print the key file or ask me to paste a key into chat. Leave new
classification disabled until I enter the key and explicitly enable it.
Explain that observe/auto sends eligible task text and bounded earlier task
excerpts to TypeSafe, and requires the direct Jev classifier.

Check my native Claude login without replacing it. If login is needed, guide
me through the official claude auth login flow. Run smart-claude doctor and
explain anything still needed. Preserve native plugin trust and organization
policy; do not bypass either. Give me smart-claude --routing observe to run
in a fresh terminal after setup. Do not submit model tasks or classifier
requests automatically.
```

If an editor cannot open, Claude Code can give you the file path to open manually. See the [installation guide](docs/AGENT_INSTALL.md) for manual setup.

## Start using ModelRudder

After installation, private key setup and a successful doctor check, open a fresh terminal and run the launcher for your tool:

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

Both observe and auto send eligible task text to Jev and consume its usage. To switch from observe to auto, exit and start a new session with the bare launcher command above.

For pinned models, reports and detailed routing behavior, see the [command reference](docs/COMMANDS.md). Try the [routing examples](docs/ROUTING_EXAMPLES.md) or consult [troubleshooting](docs/TROUBLESHOOTING.md) if a route is unexpected.

## Upgrade and rollback

### Upgrade with Claude Code or Codex

Copy this prompt into **Claude Code or Codex**. Your coding agent can handle the upgrade; you do not need to copy individual terminal commands. Use a separate native agent session and close active ModelRudder sessions before installation.

```text
Upgrade my existing ModelRudder installation to the newest published release
from https://github.com/cybrking/modelrudder/releases.
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

The installer updates both launchers and retains your existing Jev key. The agent should report any remaining native Claude/Codex version requirements. See the [upgrade guide](docs/UPGRADE.md) for manual upgrades, rollback and uninstall.

## Data and privacy

Observe and auto modes send eligible task text and up to two bounded earlier task excerpts to TypeSafe. Anything pasted into that text, including code or secrets, is included. Enter your Jev key privately in the local editor; never paste it into agent chat.

Native Claude and Codex use your provider account normally. Provider charges and usage limits still apply; no subscription limit is bypassed. ModelRudder has no client telemetry. See [data flow and local reports](docs/COMMANDS.md#data-and-privacy).

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

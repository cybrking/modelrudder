![ModelRudder article thumbnail: Hitting usage limits?](docs/images/modelrudder-article-thumbnail.png)

# ModelRudder

Spend your strongest model on the tasks that need it. ModelRudder adds experimental model routing to native coding tools, while they retain their tools, approvals and workspace permissions.

**Free local community preview · MIT licensed · macOS, Linux/WSL and Windows preview**

Use your own native provider account and your own TypeSafe Jev API key. This preview requires no ModelRudder account or subscription. Provider charges and usage limits still apply. Clef support is not included.

Choose the launcher for your native coding tool. The preview.4 installer includes both; you only need the native CLI you intend to use.

| Native tool | ModelRudder launcher | Experimental automatic routing |
| --- | --- | --- |
| Claude Code | `smart-claude` | Haiku / Sonnet / Opus |
| Codex | `smart-codex` | Luna / Sol / Astra |

Both adapters route each eligible new user turn and hold the decision through its tool loop. Claude uses a session-local Mods adapter; Codex uses a local app-server relay. Read [Claude support and verification limits](docs/CLAUDE_CODE.md) and the [release-readiness results](docs/RELEASE_READINESS.md). Native tools, approvals and model availability remain authoritative. No subscription limit is bypassed, and savings are not guaranteed.

## Install with Codex

Copy this entire prompt into Codex. It will install ModelRudder and open the local configuration file; you enter your Jev key privately in the editor.

```text
Install ModelRudder on this computer so I can use model routing in Codex.
Use the official release: https://github.com/cybrking/modelrudder/releases/tag/v0.1.0-preview.4
Read the README and docs/AGENT_INSTALL.md at that release tag and follow them.

Detect my OS and check Node.js and Codex. Install missing prerequisites using
the official instructions; ModelRudder requires Node 24+ and a supported Codex
version. Preserve existing credentials and configuration, and explain any
incompatible Codex version before changing it.

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
Use the official release: https://github.com/cybrking/modelrudder/releases/tag/v0.1.0-preview.4
Read the current Claude installation guides before continuing:
https://github.com/cybrking/modelrudder/blob/main/docs/AGENT_INSTALL.md
https://github.com/cybrking/modelrudder/blob/main/docs/CLAUDE_CODE.md

Detect my OS and check Node.js and Claude Code. Install missing prerequisites
using official instructions; ModelRudder requires Node 24+ and Claude Code
2.1.293 or newer within the 2.1.x line. Preserve existing credentials,
configuration and permissions. Explain any incompatible version or login
before changing it. Codex is not required to use smart-claude.

Download the release installer and SHA256SUMS, verify the checksum, install
for my user account, and add its launcher directory to my user PATH without
removing existing entries. The smart-codex-named preview.4 installer bundles
both smart-codex and smart-claude; no source build is needed. Verify
smart-claude --help. Do not replace plain claude or an unmanaged launcher.

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

If an editor cannot open, Claude Code can give you the file path to open manually. Once you have checked observe mode, try `smart-claude --routing auto`, or use `smart-claude --model sonnet` for pinned mode without Jev classification. See [Claude support and verification limits](docs/CLAUDE_CODE.md); live task quality and full cross-platform TUI behavior remain unverified.

## Requirements

- Node.js 24 or newer, installed separately. The installer does not bundle Node, Codex or Claude Code.
- macOS, Linux/WSL, or Windows 11 with PowerShell. Native Windows support is a preview; ModelRudder's full Windows TUI has not been validated. WSL is an alternative if your native setup fails; install and sign in separately inside WSL. See [OpenAI's Windows guidance](https://learn.chatgpt.com/docs/windows/windows-sandbox).
- Your own TypeSafe Jev API key for observe/auto modes. Pinned mode works without classification.

| Launcher | Independently installed native CLI | Native login |
| --- | --- | --- |
| `smart-claude` | Claude Code 2.1.293+ within 2.1.x; 2.1.295 has recorded native fixture/wire evidence | `claude auth login` with a `claude.ai` account |
| `smart-codex` | Codex **0.159.3, 0.160.1 or 0.161.0**; other versions are rejected | `codex login` with ChatGPT |

Protocol and synthetic fixture evidence do not certify full interactive compatibility. See [Claude qualification](docs/CLAUDE_CODE.md) and [release readiness](docs/RELEASE_READINESS.md) for completed checks and remaining gaps.

OpenAI describes continuation of existing local/open-source app-server applications separately from commercial/hosted authentication. This release does not establish permission to operate a paid subscription-auth service. See [OpenAI guidance](https://learn.chatgpt.com/docs/app-server#auth-endpoints). ModelRudder is an independent project, with no claimed provider endorsement.

## Install

Download the installer and `SHA256SUMS` from [Releases](https://github.com/cybrking/modelrudder/releases). Keep them in the same directory and verify the checksum before running the installer filename shown on that release:

```sh
shasum -a 256 -c SHA256SUMS
node -- ./smart-codex-RELEASE_ID-install.mjs
```

Replace `RELEASE_ID` with the actual release ID in the downloaded filename. The `smart-codex-…-install.mjs` filename is a legacy shared name: preview.4 installs **both `smart-claude` and `smart-codex`**. Obtain both files from this project's trusted release page; a checksum alone does not authenticate a publisher. The installer needs no checkout or npm download and includes the ws dependency and license. On macOS/Linux, it installs versioned runtime files under `~/.local/share/smart-codex` and both launchers under `~/.local/bin`; add that bin directory to PATH. Plain `claude`, plain `codex` and unmanaged launchers are preserved.

On Windows, use PowerShell's `Get-FileHash -Algorithm SHA256` and compare the installer hash to its exact filename in `SHA256SUMS`, then run `node -- .\smart-codex-RELEASE_ID-install.mjs`. The default runtime, launcher and configuration are under `%LOCALAPPDATA%\ModelRudder\runtime`, `\bin` and `\config\env`, respectively. Use the paths printed by the installer and add its launcher directory to your **user** PATH. Agent-assisted installation instructions are in [AGENT_INSTALL.md](docs/AGENT_INSTALL.md).

Alternatively, build from a trusted source checkout:

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run install-cli
```

## Configure and start

Run setup with the launcher you plan to use; either opens the same private Jev configuration:

```sh
# Claude Code
smart-claude setup

# Codex
smart-codex setup
```

You only need to run one setup command. Setup preserves an existing file. Add `--no-open` to either command to create the template and print its path without opening an editor. The configuration starts with three editable settings and classification disabled:

```dotenv
TYPESAFE_API_KEY=
ALLOW_JEV_CLASSIFICATION=false
SMART_CODEX_CLASSIFIER=direct
```

`SMART_CODEX_CLASSIFIER`, `SMART_CODEX_ENV_FILE` and the macOS/Linux `~/.config/smart-codex/env` path are shared legacy names used by **both** launchers. Keep these names as written; Claude currently requires `SMART_CODEX_CLASSIFIER=direct`.

If needed, sign up and create your key at the [official TypeSafe dashboard](https://console.typesafe.ai/keys), linked by the [Jev quickstart](https://docs.typesafe.ai/introduction/quickstart). Enter your key privately in the local editor and change `ALLOW_JEV_CLASSIFICATION` from `false` to `true` after reviewing the data flow below. Keep credentials out of agent chat, command arguments and source control. Existing exported environment variables take precedence over the configuration file. Leaving `ALLOW_JEV_CLASSIFICATION=false` keeps Jev disabled; pinned mode remains available.

### Claude Code

Check readiness, then start with recommendations while Claude begins on Sonnet:

```sh
smart-claude doctor
smart-claude --routing observe
```

Inspect your results before trying automatic routing, or choose a pinned model without sending tasks to Jev:

```sh
smart-claude --routing auto
smart-claude --model sonnet
```

Auto maps FAST to Haiku, BALANCED/DEEP to Sonnet, and MAX to Opus. Native effort is preserved. Observe respects subsequent native model choices; auto makes a new decision for each eligible turn. Media, references, resumed history and other opaque context retain the native model. Native model changes and fallback during a tool loop take precedence. See [Claude commands and eligibility](docs/CLAUDE_CODE.md#commands).

### Codex

Check readiness, then start with recommendations while Sol executes:

```sh
smart-codex doctor
smart-codex --routing observe --effort-mode fixed
```

Inspect your results before trying experimental automatic routing:

```sh
smart-codex --routing auto --effort-mode auto
```

Automatic mode chooses among Luna, Sol and Astra at each eligible new user turn and keeps that choice throughout its tool loop. Uncertain or unavailable classification keeps the fallback. Media, native references and unobserved history can prevent downgrading. The next auto/observe turn overrides native model-picker choices. An explicit `--model` selects pinned mode unless `--routing` is also supplied.

To use a pinned model without sending tasks to Jev:

```sh
smart-codex --routing pinned --model gpt-6.1-sol
```

## Data and privacy

In auto/observe mode, direct classification sends the current eligible text task and up to two bounded earlier task excerpts to TypeSafe. Anything pasted into that text, including source code or secrets, is included. The adapters do not automatically send repository files, assistant output or attachments to the classifier. Native Codex and Claude Code send their normal model inputs to their providers under your own account terms. Claude requires the direct classifier; the current hosted gateway has only a Codex rubric.

The child process does not receive the Jev key from ModelRudder's classifier environment. Each native tool manages its own login. Claude's mod contacts a launcher-local authenticated loopback bridge; it does not proxy Claude model requests or obtain Claude credentials. Local reports contain routing/usage metadata rather than task text; configuration and logs remain on your machine. Review provider policies before sending confidential content. The community client has no ModelRudder telemetry or hosted billing requirement.

## Reports

For Claude routing and usage metadata:

```sh
smart-claude report
```

For Codex metadata, user outcome labels and log cleanup:

```sh
smart-codex report
smart-codex outcome --result accepted
smart-codex logs cleanup --older-than-days 30
```

Outcome markers and cleanup are Codex-specific commands. Outcome markers are your own assessment, not independent validation. Cleanup is a preview unless `--apply` is supplied. Claude reports separate native token counts; Codex includes reference-price estimates. Neither report establishes savings on a subscription bill or verified task quality.

## Upgrade and rollback

One ModelRudder upgrade updates both launchers and preserves your existing key/configuration and local state. Stop active sessions first, record your current release ID with `--list`, then install the newer verified release using the same installation paths. Restart in a fresh terminal and run `smart-claude doctor` or `smart-codex doctor` for the tool you use.

For standalone installations, download the newer installer and `SHA256SUMS` from [Releases](https://github.com/cybrking/modelrudder/releases), verify its checksum as above, then run it. Keep the previous release ID for rollback. For a clean source checkout, select an approved release tag and run:

```sh
git fetch --tags origin
git checkout --detach APPROVED_RELEASE_TAG
npm ci --ignore-scripts
npm run install-cli -- --list
npm run install-cli
```

Replace `APPROVED_RELEASE_TAG` with the release you reviewed. Pulling source alone does not update an installed runtime. Repeat any original `--root`, `--bin-dir` and `--env-file` flags on installer/maintenance commands. See the [upgrade guide](docs/UPGRADE.md) for exact platform steps and the unreleased issue #2 patch; reinstalling the existing preview.4 download does not include that patch.

**Automatic updates:** ModelRudder currently has no local self-updater or `upgrade` command. GitHub's [daily upstream checks](docs/UPSTREAM_UPDATES.md) test new native CLI candidates; they do not install updates on your computer. To receive ModelRudder release notifications, use the repository's **Watch → Custom → Releases** option. Install a reviewed release using the steps above. Claude and Codex update separately; an upstream CLI update can exceed ModelRudder's verified compatibility, so run the matching doctor afterward.

On macOS/Linux, the shared installed maintenance command manages both launchers:

```sh
node -- ~/.local/share/smart-codex/current/src/install-cli.ts --list
node -- ~/.local/share/smart-codex/current/src/install-cli.ts --rollback RELEASE_ID
node -- ~/.local/share/smart-codex/current/src/install-cli.ts --uninstall
```

On Windows, retain the verified installer and use `node -- .\smart-codex-RELEASE_ID-install.mjs --list`, `--rollback RELEASE_ID` or `--uninstall` instead. Repeat any custom install-path flags used originally.

Uninstall retains your private configuration and local state. Remove those manually if you intend to discard them.

## Preview status

Automatic routing is experimental: classifier confidence is not a coding success probability. Full native TUI behavior, task quality and a general Codex compatibility range remain unqualified. Start with observe mode, inspect changes and run your own tests. The preview is not a production SLA or a guaranteed savings claim. See [release evidence](docs/RELEASE_EVIDENCE.md).

## Development

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run eval:routing
npm run package:pilot -- dist/delivery
```

Client CI runs offline fixtures, a Codex 0.161.0 no-inference protocol probe, and Claude 2.1.295 Mods fixtures and synthetic provider-wire checks on Windows, Linux and macOS with Node 24 and 26. Check the [workflow](.github/workflows/client.yml) and individual results for the operating systems tested. It makes no paid inference calls. Local native commands are `npm run test:native-protocol` for installed Codex, and `claude plugin test plugins/claude` plus `npm run test:claude-native` for installed Claude. These do not certify authenticated terminal journeys or task quality. The [routing evaluation](.codex/evals/routing.md) defines the synthetic regression criteria.

Read [contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md). Licensed under [MIT](LICENSE); ws retains its [upstream MIT notice](THIRD_PARTY_NOTICES/ws-LICENSE).

## Keeping up with provider releases

[Daily upstream checks](docs/UPSTREAM_UPDATES.md) detect new stable Codex and Claude Code releases once a day and run isolated candidate checks on macOS, Linux and Windows. Review the workflow reports before changing supported versions.

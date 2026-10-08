# ModelRudder

Spend your strongest model on the tasks that need it. ModelRudder adds experimental model routing to the native Codex terminal experience, while Codex retains its tools, approvals and workspace permissions.

**Free local community preview · MIT licensed · macOS**

Use your own Codex/ChatGPT account and your own TypeSafe Jev API key. This preview requires no ModelRudder account or subscription. Provider charges and usage limits still apply. Clef and Claude support are not included.

## Requirements

- macOS and Node.js 24 or newer.
- An independently installed Codex CLI. Exactly versions **0.159.3 and 0.160.1** have recorded protocol evidence and are accepted by this preview. Full interactive TUI compatibility is not certified; other versions are rejected.
- Native ChatGPT login through `codex login`.
- Your own TypeSafe Jev API key for observe/auto modes. Pinned mode works without classification.

OpenAI describes continuation of existing local/open-source app-server applications separately from commercial/hosted authentication. This release does not establish permission to operate a paid subscription-auth service. See [OpenAI guidance](https://learn.chatgpt.com/docs/app-server#auth-endpoints). ModelRudder is an independent project, with no claimed provider endorsement.

## Install

Download the installer and `SHA256SUMS` from [Releases](https://github.com/cybrking/modelrudder/releases). Keep them in the same directory and verify the checksum before running the installer filename shown on that release:

```sh
shasum -a 256 -c SHA256SUMS
node ./smart-codex-RELEASE_ID-install.mjs
```

Replace `RELEASE_ID` with the actual release ID in the downloaded filename. Obtain both files from this project's trusted release page; a checksum alone does not authenticate a publisher. The installer needs no checkout or npm download and includes the ws dependency and license. It installs versioned runtime files under `~/.local/share/smart-codex` and a launcher under `~/.local/bin`; add that bin directory to PATH. It does not replace plain `codex` or an unmanaged launcher.

Alternatively, build from a trusted source checkout:

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run install-cli
```

## Configure and start

Create private configuration:

```sh
mkdir -p ~/.config/smart-codex
chmod 700 ~/.config/smart-codex
cp .env.example ~/.config/smart-codex/env
chmod 600 ~/.config/smart-codex/env
```

The example is included in the source repository. If using only the standalone installer, create the file manually with:

```dotenv
TYPESAFE_API_KEY=
ALLOW_JEV_CLASSIFICATION=false
SMART_CODEX_CLASSIFIER=direct
```

Enter your own key privately, then set `ALLOW_JEV_CLASSIFICATION=true` after reviewing the data flow below. Existing exported environment variables take precedence over the configuration file.

```sh
smart-codex doctor
smart-codex --routing observe --effort-mode fixed
```

Observe mode gets route recommendations while Sol executes the task. Inspect your results before trying experimental automatic routing:

```sh
smart-codex --routing auto --effort-mode auto
```

Automatic mode chooses among Luna, Sol and Astra at each eligible new user turn and keeps that choice throughout its tool loop. Uncertain or unavailable classification keeps the fallback. Media, native references and unobserved history can prevent downgrading. The next auto/observe turn overrides native model-picker choices. An explicit `--model` selects pinned mode unless `--routing` is also supplied.

To use a pinned model without sending tasks to Jev:

```sh
smart-codex --routing pinned --model gpt-6.1-sol
```

## Data and privacy

In auto/observe mode, direct classification sends the current text task and up to two bounded earlier task excerpts to TypeSafe. Anything pasted into that text, including source code or secrets, is included. The relay does not automatically send repository files, assistant output or attachments to the classifier. Native Codex sends its normal model inputs to OpenAI under your own account terms.

The child process does not receive the Jev key from ModelRudder's classifier environment. Native Codex manages its own login. Local reports contain routing/usage metadata rather than task text; configuration and logs remain on your machine. Review provider policies before sending confidential content. The community client has no ModelRudder telemetry or hosted billing requirement.

## Reports and removal

```sh
smart-codex report
smart-codex outcome --result accepted
smart-codex logs cleanup --older-than-days 30
```

Outcome markers are your own assessment, not independent validation. Cleanup is a preview unless `--apply` is supplied. Tokens and reference-price comparisons are estimates; they do not establish savings on a subscription bill or verified task quality.

For source users, upgrade by pulling an approved release, running `npm ci --ignore-scripts`, and rerunning `npm run install-cli`. Standalone users can install the next trusted release installer. Restart active launchers after an upgrade. Use the installed maintenance command:

```sh
node ~/.local/share/smart-codex/current/src/install-cli.ts --list
node ~/.local/share/smart-codex/current/src/install-cli.ts --rollback RELEASE_ID
node ~/.local/share/smart-codex/current/src/install-cli.ts --uninstall
```

Uninstall retains your private configuration and local state. Remove those manually if you intend to discard them.

## Preview status

Automatic routing is experimental: classifier confidence is not a coding success probability. Full native TUI behavior, task quality and a general Codex compatibility range remain unqualified. Start with observe mode, inspect changes and run your own tests. The preview is not a production SLA or a guaranteed savings claim. See [release evidence](docs/RELEASE_EVIDENCE.md).

## Development

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run package:pilot -- dist/delivery
```

Client CI runs offline fixtures on macOS with Node 24 and 26. It makes no paid inference calls. `npm run test:native-protocol` is an optional installed-Codex check; it submits no model turn and does not certify the TUI.

Read [contributing](CONTRIBUTING.md) and [security reporting](SECURITY.md). Licensed under [MIT](LICENSE); ws retains its [upstream MIT notice](THIRD_PARTY_NOTICES/ws-LICENSE).

# Claude Code native routing preview

This is an **experimental preview feature**, bundled starting with `v0.1.0-preview.4`; the older `v0.1.0-preview.3` installer remains Codex-only. It adds `smart-claude` beside `smart-codex` and does not replace either provider's plain CLI.

## What was carried across

ModelRudder's Codex adapter classifies an eligible new user turn, applies a conservative policy, and holds its choice through the native tool loop. The Claude adapter follows that same model with Claude's documented **Mods API**, rather than a settings `UserPromptSubmit` hook or a separate API harness.

| Behavior | Codex adapter | Claude adapter |
| --- | --- | --- |
| Native interactive interface/auth/tools/permissions | App-server relay; native Codex | Native Claude CLI; session-local mod |
| Route each observed eligible user turn | `turn/start` | `prompt.submit` + `turn.start` + `turn.step` |
| Keep route through tool loop | One setting per native turn | Decision keyed by native `turnId`; stream forwarded unchanged |
| Auto / observe / pinned | Supported | Supported |
| Classifier | Direct Jev or existing hosted gateway | Direct Jev with a separate Claude rubric |
| Conservative opaque/media/history handling | Baseline | Native selection retained; no automatic downgrade |
| Subagents and background helpers | Native | Native; `agentId` and unobserved steps untouched |
| Effort routing | Fixed / observe / auto | Native effort preserved; no Claude effort classifier |
| Usage | Codex metadata report | Separate metadata report; no subscription savings calculation |

The family mapping is FAST → Haiku, BALANCED/DEEP → Sonnet, MAX → Opus. Claude's `turn.step` API does not resolve family aliases, so the adapter sends explicit model IDs: `claude-haiku-5-5`, `claude-sonnet-5-5` and `claude-opus-5-5`. These were checked against the official current model guide and a synthetic native-provider probe. To deliberately pin another version within the same family, configure `SMART_CLAUDE_HAIKU_MODEL`, `SMART_CLAUDE_SONNET_MODEL` or `SMART_CLAUDE_OPUS_MODEL` in the shared private environment file. Cross-family overrides and arbitrary endpoints are rejected; account availability still belongs to Claude.

The reported-confidence threshold is 0.8, as an **experimental gate**, not a probability of task success. Invalid, unavailable or uncertain classification keeps the baseline. Families and rubric are not calibrated coding-quality guarantees.

Claude's native fallback or an incoming model change during the tool loop takes precedence. The mod releases its override for the remainder of that turn instead of repeatedly forcing a model Claude moved away from. No model/tool request is retried by ModelRudder. In auto mode a new eligible turn gets a new routing decision, so the native `/model` selection is not a persistent pin; use pinned mode for that.

## Requirements and installation

- Node.js 24+ for ModelRudder
- An independently installed official Claude Code CLI, 2.1.293+ within the 2.1.x line. Mods itself began in 2.1.287; the default Haiku 5.5 route needs 2.1.293+
- A native `claude.ai` login; use `claude auth login` yourself if needed
- Your own direct Jev credentials and explicit `ALLOW_JEV_CLASSIFICATION=true` for observe/auto
- The official `v0.1.0-preview.4` standalone installer, which includes `smart-claude`; older Codex-only installers do not include it

For agent-assisted setup, use [Install with Claude Code](../README.md#install-with-claude-code). For manual setup, follow [Claude Code release installation](AGENT_INSTALL.md#claude-code-release-installation): download the preview.4 installer and `SHA256SUMS`, verify the checksum, run the installer with Node and add the printed launcher directory to your user PATH. Its `smart-codex-...-install.mjs` filename is shared by both adapters; installing Codex is not required to use Claude.

Then prepare your private configuration and check readiness:

```sh
smart-claude --help
smart-claude setup
smart-claude doctor
```

After entering your own key and enabling direct Jev classification, start a fresh terminal and run `smart-claude --routing observe`. Actual tasks consume provider usage; setup does not run them automatically. Source builds remain available through the [development instructions](../README.md#development).

The installer manages both launchers and uses the existing private configuration path and `SMART_CODEX_ENV_FILE` setting for compatibility. In the local editor, enter your own `TYPESAFE_API_KEY` and change `ALLOW_JEV_CLASSIFICATION` to `true` only after reviewing the data flow; `SMART_CODEX_CLASSIFIER=direct` is already set. Do not paste a key into chat or command arguments. `smart-claude setup --no-open` prepares the minimal disabled configuration without opening an editor. Existing configuration is preserved.

The launcher loads the bundled plugin with `claude --plugin-dir` for that session. It does **not** install the plugin into your account, change Claude settings, create OAuth grants, enable disabled hooks or change organization policy. Claude may ask you to trust the plugin. Mods are privileged code; review the source and trust only code you intend to run. If policy prevents loading the mod, use plain Claude and consult your administrator rather than bypassing it. A launcher exit warning identifies a missing plugin readiness handshake.

API keys, OAuth-token environment overrides, alternate providers and custom API base URLs are rejected for this subscription-focused preview. The launcher leaves conflicting settings visible and does not silently alter billing or credentials. Native `auth status` is checked without reading credential files. A successful login check does not establish your plan tier, remaining allowance or model availability.

## Commands

```sh
# Observe recommendations; starts on Sonnet, respects subsequent native choices.
smart-claude --routing observe

# Experimental automatic model selection at each eligible new user turn.
smart-claude --routing auto

# No Jev classification or task transmission.
smart-claude --model opus

# A quoted initial prompt and native permission mode.
smart-claude --permission-mode plan "Investigate the flaky test"

# Resumed history is unobserved and cannot authorize an automatic downgrade.
smart-claude --resume SESSION_ID --routing observe

# Read the latest local metadata report.
smart-claude report
```

Run `smart-claude --help` for the deliberately narrow native-option allowlist. Authentication, plugin management, headless/print and SDK commands belong in plain `claude`. Permission-bypass flags are not added or accepted by this launcher; omitted permission options leave native settings unchanged. The adapter never registers tool execution or permission-approval hooks.

## Eligibility, privacy and failure behavior

Only explicit, observed composer/bridge user text that matches the new turn reaches the classifier. This avoids accidentally classifying helper requests, hidden rewritten prompts or tool results. The text limit in the native adapter is 64,000 characters. Classifier context is only the current task plus up to two earlier 4,000-character user-task excerpts, retained in memory. Anything the user pasted into that text, including code or secrets, is part of the transmission to TypeSafe.

Media, @-references, additional prompt context, ambiguous/dropped/rewritten prompts, foreign-origin messages, compaction and resumed or reloaded history retain the native model instead of authorizing a downgrade. Auto/observe resumes omit the startup model override, preserving Claude's restored choice. A fresh `/clear` allows fresh text routing again. File/instruction attachment metadata can mark history opaque; the attachment content itself is never read or transmitted by the adapter. Independent prompt-rewriting hooks can affect eligibility; interactions with arbitrary third-party mods are not certified.

Routing is not intentionally limited to the first prompt. Each eligible new user turn is classified once, and its decision is held through its tool loop. `unclassified_context_baseline` means the adapter could not establish eligible context, for example after resume, compaction, or an unmatched prompt. Once `turn.start` has matched an observed prompt, a change to the returned `prompt.submit` receipt does not invalidate that input or disable later turns; actual dropped or unmatched prompts still retain the native model.

The Node launcher holds the Jev key. The Claude child receives only an ephemeral capability for an authenticated local bridge. Claude's own credential storage, refresh, requests and usage limits stay native. Other privileged code already running as the same user can reach process environment/local services; this is a local boundary, not a sandbox against malicious same-user software.

Classification has a five-second deadline and no inference retry. The mod waits up to 6.5 seconds for the bridge, and discards late/cancelled results. Cancellation stops local waiting and prevents reuse of cancelled task text; a provider may already have received and charged for a submitted classification. Failures fall back conservatively. Prompt/response chunks, native tool results and approval decisions are passed through. Pinned mode submits metadata-only routing bookkeeping and never invokes Jev.

Logs are private metadata files in the installed state directory's `claude-logs`, or `.smart-claude` for source runs. They exclude tasks, answers, credentials, repository contents and native session IDs. Reports keep Claude's separate uncached input, cache-read, cache-write and output counts, plus available Jev token counts. Completion reporting can be incomplete. They do not infer plan allowance weights, dollar savings or quality from token totals.

## Verification and remaining limits

- Node regression fixtures cover classification, confidence gating, privacy, cancellation, duplicate routing, context bounds, HTTP authentication, argument handling and separate usage records.
- The actual official Claude Code **2.1.295** binary passed static plugin validation and the plugin's no-inference test suite in an isolated, unsigned-in environment.
- An isolated native-provider wire probe verified that full-ID rewrites reach the synthetic local provider, while a Sonnet-only native model allowlist overrides disallowed Haiku/Opus rewrites. This used a fake key and entirely synthetic responses, not real Anthropic inference. Family aliases alone failed this check and are not used on `turn.step`.
- Dual-launcher release/install/rollback/uninstall tests pass, including Windows bootstrap fixtures on Linux. Native Windows/macOS interactive execution has not been tested here.
- The full suite has one environment-blocked pre-existing Codex Unix-socket test (`listen EPERM`). The same failure was reproduced on unmodified base commit `cc1653f`; the existing Codex implementation is unchanged.
- Authenticated live Claude conversations, model availability, actual plan allowance impact, quality outcomes and full TUI behavior remain **unverified**. No user credentials, real provider inference, paid tests, publication or account changes were used for these checks.
- Newer/older supported-line builds may differ; only 2.1.295 has the recorded module/wire checks. Full-ID defaults will need review when models change, and other trusted mods or managed policy can replace a requested route. Observe and validate before using auto on important work. Model-switch-hook interactions are not certified; this adapter rewrites a request and does not run `/model` or change the saved session default.

## Official references

The optional `npm run test:claude-native -- /path/to/claude` check runs the installed official native executable against a synthetic loopback Messages provider with a fake key and disposable home/configuration. It does not use your account or real inference. It checks the low-level Mods wire contract; it does not certify the full interactive experience. Run `claude plugin test plugins/claude` for the source plugin's no-inference native fixtures.

- [Native model selection and model restrictions](https://code.claude.com/docs/en/model-config)
- [Claude CLI options and auth status](https://code.claude.com/docs/en/cli-reference)
- [Native authentication and precedence](https://code.claude.com/docs/en/authentication)
- [Mods overview and trust](https://code.claude.com/docs/en/plugins/mods/overview)
- [Turn events and streaming model rewrite](https://code.claude.com/docs/en/plugins/mods/events#follow-a-turn)
- [Mods API, isolation, cancellation and network facade](https://code.claude.com/docs/en/plugins/mods/api)
- [Event contracts and limits](https://code.claude.com/docs/en/plugins/mods/reference)
- [No-inference plugin testing](https://code.claude.com/docs/en/plugins/mods/test)
- [Public declaration snapshot](https://github.com/anthropics/claude-code/blob/main/mods/types/claude-code.d.ts), which can lag installed types

The Agent SDK has separate authentication terms. This integration runs native Claude Code and uses its documented plugin surface; it does not export subscription credentials for a custom SDK/API service.

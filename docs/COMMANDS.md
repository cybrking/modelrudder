# ModelRudder command reference

Complete the [installation and private configuration steps](AGENT_INSTALL.md) first. Both launchers share the saved routing-provider configuration. See [Jev setup](CLASSIFIER_CHOICES.md) for configuration, consent and migration. Claude uses a session-local Mods adapter; Codex uses a local app-server relay.

## Routing modes and defaults

- **Auto:** ModelRudder selects a model for each eligible new user message and holds that choice through its tool loop. This is the default for both `smart-claude` and `smart-codex`.
- **Observe:** ModelRudder recommends a route without switching the native model. Fresh sessions start on Sonnet for Claude or Sol for Codex.
- **Pinned:** Use an explicit model without Jev classification. An explicit `--model` selects pinned mode unless `--routing` is also supplied.

Observe and auto send eligible task text and bounded earlier excerpts to Jev. Pinned tasks still use the native provider's allowance.

Bare `smart-codex` is equivalent to `smart-codex --routing auto --effort-mode auto`; bare `smart-claude` is equivalent to `smart-claude --routing auto`. These flags make the defaults explicit. Plain `codex` and `claude` do not enable ModelRudder routing.

## Claude Code

Run `smart-claude setup --classifier jev` and enter your key and explicit consent in the local editor if needed. Then check readiness and start with recommendations while Claude begins on Sonnet:

```sh
smart-claude native install
smart-claude doctor
smart-claude --routing observe
```

Inspect your results before trying automatic routing, or choose a pinned model without sending tasks to Jev:

```sh
smart-claude --routing auto
smart-claude --model sonnet
```

Auto maps FAST to Haiku, BALANCED/DEEP to Sonnet, and MAX to Opus. Native effort is preserved. Observe respects subsequent native model choices; auto makes a new decision for each eligible turn. Media, references, resumed history and other opaque context retain the native model. Native model changes and fallback during a tool loop take precedence. See [Claude commands and eligibility](CLAUDE_CODE.md#commands).

## Codex

Run `smart-codex setup --classifier jev` and enter your key and explicit consent in the local editor if needed. Then check readiness and start with recommendations while Sol executes:

```sh
smart-codex native install
smart-codex doctor
smart-codex --routing observe --effort-mode fixed
```

Inspect your results before trying experimental automatic routing:

```sh
smart-codex --routing auto --effort-mode auto
```

Automatic mode chooses among Luna, Sol and Astra at each eligible new user turn and keeps that choice throughout its tool loop. Every valid classification selects its profile without a confidence threshold. Reported confidence remains informational. Invalid or unavailable classification keeps the fallback. Media, native references and unobserved history can prevent downgrading. The next auto/observe turn overrides native model-picker choices. An explicit `--model` selects pinned mode unless `--routing` is also supplied.

To use a pinned model without sending tasks to Jev:

```sh
smart-codex --routing pinned --model gpt-6.1-sol
```

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

## Data and privacy

In auto/observe mode, direct classification sends the current eligible text task and up to two bounded earlier task excerpts to TypeSafe. Anything pasted into that text, including source code or secrets, is included. The adapters do not automatically send repository files, assistant output or attachments to the classifier. Native Codex and Claude Code send their normal model inputs to their providers under your own account terms. Claude supports direct Jev using its own rubric; the hosted gateway has only a Codex rubric.

The child process does not receive the Jev key from ModelRudder's classifier environment. Each native tool manages its own login. Claude's mod contacts a launcher-local authenticated loopback bridge; it does not proxy Claude model requests or obtain Claude credentials. Local reports contain routing/usage metadata rather than task text; configuration and logs remain on your machine. Review provider policies before sending confidential content. The community client has no ModelRudder telemetry or hosted billing requirement.

OpenAI describes continuation of existing local/open-source app-server applications separately from commercial/hosted authentication. This release does not establish permission to operate a paid subscription-auth service. See [OpenAI guidance](https://learn.chatgpt.com/docs/app-server#auth-endpoints). ModelRudder is an independent project, with no claimed provider endorsement.

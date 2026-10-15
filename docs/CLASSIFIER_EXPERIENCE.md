# Jev and Tev selection experience

Status: selection, setup/status commands and local adapter included in preview.12. Interactive synthetic checks, automatic service/model provisioning and full live native qualification remain outside this implementation. This proposal follows the user's decision to offer both routers and let users choose. Current availability is documented in [classifier choices](CLASSIFIER_CHOICES.md).

## User-facing model

Call the choice a **routing provider** in setup: it chooses the coding model and, where supported, its reasoning effort. Jev and Tev are not replacements for the user's native Claude or Codex account. Use “classifier” in developer documentation.

Offer equally visible choices with factual descriptions:

- **Jev — hosted:** no local routing model to run; requires a TypeSafe key and sends eligible task text to TypeSafe.
- **Tev — local:** routes using `tev1:latest` on this machine; no Jev key required; needs a compatible local service and model.
- **Set up later:** keep routing disabled and provide a pinned-model command.

Do not label either option “best,” imply measured savings, or present the pilot results as general reliability scores. Keep benchmark details one link away from setup.

## First setup

1. Detect the selected native tool, existing configuration and native login. Preserve existing configuration; an upgrade must not prompt for a new provider or change it silently.
2. Ask a new user to choose their routing provider. Explain that local routing still uses their native provider for task execution. Do not infer hosted consent from the existence of an API key.
3. For Jev, open private credential entry locally, explain the text sent for routing, and obtain explicit hosted-classification consent. Never put the key in chat or command arguments.
4. For Tev, check loopback service availability, protocol compatibility and the exact model's presence. Distinguish service unavailable, model absent, protocol unsupported and model not yet ready. Show download size/resource requirements only if available from verified metadata. Ask before downloading a model or installing/starting a persistent service. Do not reuse Jev credentials.
5. Offer a small synthetic routing check, with its destination and usage implications stated. A normal doctor check does not submit inference. A successful service health check is not proof of model readiness or route quality.
6. Save the provider and activation choice only after validation. Preserve the previous working selection if setup fails or is cancelled. On a new install, leave routing disabled until setup completes.
7. Finish with the selected provider, native login status, routing mode and one command to start. Offer observe mode to preview recommendations; explain that the current launcher default is auto. Do not silently change existing mode defaults as part of this feature.

Noninteractive setup must accept explicit options and return actionable errors rather than hang for input. Missing selection must not silently opt a new user into hosted transmission. Preserve the existing `setup --no-open` workflow.

## Everyday use and switching

Users choose once, then run `smart-codex` or `smart-claude` normally. Display a compact startup line identifying the routing provider, routing mode and effort mode. Per-turn notices show the selected coding model and requested effort where applicable; do not claim effective effort when it is unobservable.

Implemented command surface:

```text
smart-codex setup --classifier jev
smart-codex setup --classifier tev
smart-codex classifier status
smart-codex --classifier tev
```

Use the same vocabulary for Claude when its Tev integration is qualified. Setup saves a preference; the launch flag overrides it only for that session. Status reports effective selection and its configuration source, readiness, model identifier and observed digest when available; never print credentials or raw private configuration. Existing advanced hosted gateway configuration remains supported for Codex but need not be a third prominent onboarding choice.

The two launchers currently share configuration. Retain that shared default and explicitly tell users that a saved provider switch affects both launchers. A session override lets them try a provider without changing the other tool. If the chosen provider is unsupported for a native tool, return an actionable error before inference; never substitute another provider. Do not advertise shared Tev support until both native paths are verified.

Configuration precedence must be documented and tested: session flag, explicit environment override, saved preference, then legacy-compatible behavior for existing installations. Show an override conflict rather than report a successful saved switch that will not take effect. Freeze selection for the lifetime of a session; changing the saved preference applies to new sessions.

## Failure and recovery

A malformed or unsupported configuration is a startup error. A previously configured provider becoming unavailable during a session is a routing failure: use the existing native-tool fallback policy, retain approvals and permissions, and identify the reason. For example: “Tev is unavailable; using the configured fallback model for this turn. No task was sent to Jev.” Use the actual fallback model in the notice.

Bound classification time, propagate cancellation, discard late answers, and avoid unbounded retries. Do not turn a local cold start into a silent long pause. A repeated outage should not flood the terminal; report state changes and retain per-turn failure reasons in metadata. Never switch local tasks to a hosted provider without explicit user selection and consent. Switching routing providers must not alter the user's native login or permissions.

## Developer contract

Keep a shared routing pipeline with provider adapters, rather than duplicate the launcher or effort policy. Separate provider identity from transport: Jev/direct, existing gateway, and Tev/local are distinct configurations. Use the existing common classification result with validated profile, probabilities and usage; preserve unknown telemetry as unknown. Maintain native-tool-specific rubrics and the existing policy checks.

Add a provider-neutral activation setting with explicit migration rules. Preserve legacy `SMART_CODEX_CLASSIFIER=direct|hosted` and `ALLOW_JEV_CLASSIFICATION` behavior for existing users. Selecting Tev must not interpret old Jev consent as permission for future hosted fallback. Resolve configuration once and pass the same effective result to setup diagnostics, routing and reports. Final internal setting names should be decided alongside compatibility tests, not invented in installation prompts.

Local Tev should default to the verified loopback protocol. Validate local addresses, reject credentials in URLs and redirects, and do not reuse the HTTPS gateway configuration as a workaround. Remote Tev endpoints are outside the initial local-provider scope. Preserve bounded input/output sizes and sanitize provider errors. Do not pass routing credentials to native child processes.

Record provider, requested classifier model, observed model/digest, rubric/router version, latency, outcome and fallback reason. Keep task text out of default reports. Reuse optional Phoenix wrapper spans in evaluation; no Phoenix service is required to run ModelRudder and telemetry failure must not fail execution.

## Definition of done

- Fresh Jev setup, fresh Tev setup, deferred setup, cancelled setup and legacy upgrades have behavioral tests.
- A saved switch, a session-only override and conflicting environment configuration produce the documented effective provider, without losing keys or changing native login.
- Local Tev works without a Jev key; missing service/model, malformed responses, redirects, timeouts and cancellation produce bounded, actionable behavior with no hosted fallback.
- Tests prove the selected adapter and correct native-tool rubric are used; selection is retained through the task's tool loop and existing policy constraints still apply.
- Native Codex and Claude journeys are verified separately before claiming both are supported. A Codex benchmark is not evidence for the Claude path.
- Doctor separates configuration, service reachability, model readiness and optional synthetic inference. Reports distinguish requested effort from observed effective effort.
- Copyable README instructions work against the release that ships the feature. Clearly identify any unsupported combinations.
- Run a bounded five-task execution/grading/trace pilot before expanding evaluation. Keep acceptance criteria, isolated tasks, fixed baselines, held-out validation, repetitions and portable exports. Preserve historical evaluation results.

Implement in order: provider configuration/adapter and compatibility tests; setup/status and failure messages; native integration checks; then release-specific README instructions. Product choice does not depend on proving one router universally superior.

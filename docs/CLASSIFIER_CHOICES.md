# Choosing Jev or local Tev

ModelRudder's product direction is to offer both classifiers and let users choose based on their workflow. The evidence below does not establish a universal winner or justify removing Tev as an option.

## Availability and setup

**Jev is integrated today.** Use the [README Jev prompt](../README.md#natural-language-instructions-choose-jev), then follow [installation and private configuration](AGENT_INSTALL.md). Both native launchers support direct Jev. Codex also supports the existing hosted gateway protocol; that protocol is not a local Tev adapter.

**Local Tev is included in preview.12.** Both launchers support it with separate Codex and Claude rubrics. This does not establish full live Claude TUI or task-quality qualification. Use the [release installation procedure](AGENT_INSTALL.md), then choose your provider.

The local service must expose `/api/tags` and `/v1/systemone` and have `tev1:latest`. The default origin is `http://127.0.0.1:11434`. An arbitrary OpenAI-compatible chat endpoint is not sufficient. Setup checks metadata only; it does not download models, start services, or submit inference.

```sh
# Save a shared choice; applies to new Codex and Claude sessions.
smart-codex setup --classifier tev
# Or select hosted Jev and privately enter its key/consent:
smart-codex setup --classifier jev

smart-codex classifier status
smart-codex doctor
smart-codex --routing observe

# Session-only override; requires the selected provider's activation/consent.
smart-codex --classifier tev --routing observe
```

Use `smart-claude` in place of `smart-codex` for the same setup/status/override commands. Claude effort stays native. Both launchers share the saved provider. Existing sessions retain their original choice; restart to apply a saved switch. Explicit environment exports override the saved file, and the session flag overrides the provider for one launch. Setup reports detectable conflicting environment values; if an exported value equals the old saved value, Node's merged environment cannot distinguish its origin, so unset the export before switching.

Local setup saves `SMART_CODEX_CLASSIFIER=tev` and `ALLOW_CLASSIFICATION=true`. Optional private settings are `SMART_CODEX_TEV_URL` (HTTP numeric loopback origin only, no paths/credentials/redirects) and `SMART_CODEX_TEV_MODEL` (default `tev1:latest`). Hosted Jev accepts `direct` or `jev` and still requires `ALLOW_JEV_CLASSIFICATION=true` plus `TYPESAFE_API_KEY`. Local activation never grants hosted consent. `ALLOW_CLASSIFICATION=false` disables both. Legacy configurations retain their behavior. Codex's existing `hosted` gateway remains supported; Claude does not use its Codex rubric.

A fresh interactive setup offers Jev, Tev or later. `setup --no-open` preserves existing configuration or creates a disabled template without prompting. With no provider selected, classification stays disabled. Pinned use remains available:

```sh
smart-codex --routing pinned --model gpt-6.1-sol
smart-claude --model sonnet
```

If local setup cannot reach the service or find the model, it leaves the previous configuration unchanged. Switching from Tev to Jev also preserves Tev until the private Jev key and hosted consent are ready. If classification later fails or times out, the existing native-tool fallback policy applies; no task is sent to Jev. Status/doctor distinguish metadata availability from untested inference readiness. A local cold start may exceed the bounded routing deadline; warm the model in your local service before routing real tasks.

Native tasks still consume the native provider's allowance. Local Tev classification needs no Jev API key, but does require a local service and machine resources. Hosted Jev receives eligible task text and bounded earlier task excerpts; the local Tev integration keeps classification on the selected local endpoint and never silently switches to hosted classification. Neither choice removes the native executor's provider data flow.

## What the tests actually show

| Evaluation | Jev-selected execution | Tev-selected execution | Scope |
| --- | --- | --- | --- |
| Repository pilot, unchanged scoring | 6/6 accepted attempts | 4/6 accepted attempts | Four unique tasks; only one valid held-out task; installer repeated three times per arm |
| Bounded counterfactual fixtures | 15/15 accepted attempts | 12/15 accepted attempts | Five fixtures, three attempts each; not full repository work |

In the repository pilot, Tev's Luna/low installer choice left the required script edit unapplied in two of three attempts. Jev's Luna/medium choice passed all three. Tev passed each of the other three repository tasks and was faster than Jev on the consumed-prompt and Cloudflare-envelope tasks. This is task-specific evidence, not a general rule that low effort fails.

There is another signal beyond the installer: in the bounded migration fixture, Tev selected Luna/medium, which failed all three attempts on an inherited-property status mapping case; Jev selected Sol/medium, which passed all three. Both choices passed all four other fixtures. This suggests checking migration edge cases carefully, not excluding Tev across all tasks.

Do not combine these into a population success rate: tasks were small and selected, repetitions are not independent tasks, and the fixture and repository execution paths differ. Throttling had grading-contract defects and is excluded from routing-quality totals. Effective effort, served native model and actual subscription dollar cost were not observable. Token totals do not prove savings. The tests do not establish Claude routing quality or production readiness for either classifier.

Detailed acceptance results and reproduction artifacts are retained in the local evaluation workspace; raw benchmark traces are not included in the public release. Phoenix organizes traces, experiments and evaluations; it does not automatically choose the optimal router.

## Verification and limits

Provider selection, local transport, both native-tool rubrics, fallback, cancellation, setup preservation, usage attribution and packaging have automated coverage. Live native qualification remains distinct from synthetic protocol tests. Tev reports show local compute cost as unknown; they do not apply Jev prices. Legacy usage JSON retains the `jev` counts field for compatibility, with `classifierProvider` identifying the actual provider.

Compare both on fresh held-out tasks using objective acceptance checks and bounded budgets before making stronger quality claims. Keep historical benchmark results unchanged. See the [experience specification](CLASSIFIER_EXPERIENCE.md) for the intended flow and remaining qualification work.

### Adapter verification (2026-10-15)

`npm run typecheck` passed. `npm test` completed with **197 passed, zero failed, one Windows-only skip**, including loopback relay/bridge tests, provider switching and installer packaging.

Five synthetic classification requests through the actual local Tev service all passed response/usage validation: three with the Codex rubric (FAST, BALANCED, DEEP) and two with the Claude rubric (FAST, MAX). The service reported `tev1:latest`; `/api/tags` reported digest `4d24c6f6d61a48d9b72902f4805c5f1da53010736b834b0372377fb4bb7e53d3`. Total reported usage was 1,809 input tokens and zero output tokens. The first call took 3.75 seconds; subsequent calls took 0.46–0.61 seconds. These are observed local timings, not latency guarantees.

This smoke check validates transport, both rubrics and telemetry parsing. It did not execute native coding tasks or grade their results, and it does not replace the repository benchmark or full live Claude TUI qualification. No hosted classification calls, installation changes or release publication were performed.

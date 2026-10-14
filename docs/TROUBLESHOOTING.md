# Routing troubleshooting

## What “uncertain classification” means

Claude may show:

```text
ModelRudder Routing this turn to Claude Sonnet 5.5 (Uncertain classification; using fallback).
```

Claude uses **Claude Sonnet 5.5** as its default fallback when classifier confidence is missing or below 0.80. Historical Codex policies through version 4 also applied a confidence cutoff. Starting with preview.10 (policy 5), Codex applies every valid Jev choice regardless of reported confidence, including its profile’s reasoning effort. Invalid or unavailable classifier results still use the configured fallback; unavailable context retains its existing context fallback. Confidence is informational and does not guarantee answer quality. The next eligible turn gets a new decision.

“Native model retained (Unclassified context)” means something different: the adapter cannot safely classify the available context, for example after resuming unobserved history. It leaves the native model unchanged. Observe mode also leaves the native model unchanged, and pinned mode uses your explicit model.

For installation, managed version and readiness problems, follow the [installation guide](AGENT_INSTALL.md) and [native version recovery](NATIVE_VERSIONS.md#state-and-recovery). For Claude eligibility and plugin behavior, see [Claude support](CLAUDE_CODE.md#eligibility-privacy-and-failure-behavior).

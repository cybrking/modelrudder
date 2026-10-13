# Routing troubleshooting

## What “uncertain classification” means

Claude may show:

```text
ModelRudder Routing this turn to Claude Sonnet 5.5 (Uncertain classification; using fallback).
```

The classifier returned a result, but its confidence score was missing or below the routing threshold (0.80 by default). Automatic mode therefore uses the fallback: **Claude Sonnet 5.5** for Claude or **GPT-6.1 Sol** for Codex under the default configuration. Routing has not stopped; the next eligible message is evaluated again. This score is a routing signal, not an 80% guarantee that the answer will be correct. Classifier outages have a separate “classifier unavailable” reason.

“Native model retained (Unclassified context)” means something different: the adapter cannot safely classify the available context, for example after resuming unobserved history. It leaves the native model unchanged. Observe mode also leaves the native model unchanged, and pinned mode uses your explicit model.

For installation, managed version and readiness problems, follow the [installation guide](AGENT_INSTALL.md) and [native version recovery](NATIVE_VERSIONS.md#state-and-recovery). For Claude eligibility and plugin behavior, see [Claude support](CLAUDE_CODE.md#eligibility-privacy-and-failure-behavior).

# Routing troubleshooting

## Why Claude uses Sonnet as a fallback

Claude routes every valid automatic classification regardless of whether reported confidence is low or missing. It uses **Claude Sonnet 5.5** when classification is invalid or unavailable. Confidence remains descriptive metadata, not a measure of answer quality. The next eligible task gets a fresh routing decision.

“Native model retained (Unclassified context)” means something different: the adapter cannot safely classify the available context, for example after resuming unobserved history. It leaves the native model unchanged. Observe mode also leaves the native model unchanged, and pinned mode uses your explicit model.

For installation, managed version and readiness problems, follow the [installation guide](AGENT_INSTALL.md) and [native version recovery](NATIVE_VERSIONS.md#state-and-recovery). For Claude eligibility and plugin behavior, see [Claude support](CLAUDE_CODE.md#eligibility-privacy-and-failure-behavior).

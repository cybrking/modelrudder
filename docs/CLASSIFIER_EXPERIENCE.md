# Jev setup contract

Jev is the sole routing classifier. Both launchers share private configuration and retain native tool login, permissions and approvals. Current setup and migration commands are documented in [Jev setup](CLASSIFIER_CHOICES.md).

## Setup and consent

1. Preserve existing configuration and native credentials. An upgrade must not enable hosted classification silently.
2. Open private credential entry locally. Explain that Jev receives eligible task text and bounded earlier task excerpts. Require the user's own TypeSafe key and explicit `ALLOW_JEV_CLASSIFICATION=true`; the presence of a key alone is not consent.
3. Leave new configuration disabled until the user completes private setup. `setup --no-open` creates a disabled template if absent and retains existing configuration.
4. Show readiness using `classifier status` and `doctor` without submitting inference or displaying private configuration. Explain failures and private setup still needed.
5. Give the user an observe-mode command. Observe submits real Jev requests; both bare launchers default to auto. Pinned mode remains available without classification.

Supported setup commands are `smart-codex setup --classifier jev` and `smart-claude setup --classifier jev`. Direct Jev accepts the `direct` and `jev` configuration names. Codex's existing hosted Jev gateway remains an advanced configuration; Claude uses its own direct rubric.

## Compatibility and failure behavior

Retired Tev configurations fail with explicit migration guidance. Migration must require a Jev key and Jev consent before changing the selection; old local activation never authorizes hosted transmission. Keep the global `ALLOW_CLASSIFICATION=false` kill switch effective. Preserve unrelated private settings and native credentials.

Both launchers use the same saved configuration. Exported environment settings take precedence over the file; the launch flag affects that session only. Restart sessions after changing saved settings. Unsupported or malformed configuration fails before inference. Bounded classification failures and cancellation follow each native tool's existing fallback policy and do not change provider or native login.

## Release checks

Verify fresh setup, disabled setup, migration with and without consent, shared configuration, exported overrides, the kill switch and both native launchers. Keep task text and credentials out of default logs and child classifier environments. Preserve native-specific rubrics, per-turn ownership and fallback behavior.

Validate packaged installation and launcher help against the release being shipped. Keep README examples tied to their actual published release. Report native TUI and representative task-quality gaps explicitly; synthetic tests alone do not prove production readiness. Preserve historical experiments as evidence rather than active setup guidance.

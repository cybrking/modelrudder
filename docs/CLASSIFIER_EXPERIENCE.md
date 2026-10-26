# Jev setup contract

This contract describes the unreleased advisory source. Both launchers share private configuration and preserve native login, permissions and model choice. See [Jev setup](CLASSIFIER_CHOICES.md).

1. Preserve existing configuration, credentials and classification disablement. Upgrades do not grant hosted-transmission consent.
2. Open missing credential entry locally. Explain that Jev receives only the current supplied task. Require the user's own key and explicit `ALLOW_JEV_CLASSIFICATION=true`; a key alone is not consent.
3. Keep new configuration disabled until private setup is completed. `setup --no-open` creates a disabled template if absent or preserves existing settings.
4. Run `classifier status` and `doctor` without inference or displaying private configuration. Native launch readiness and recommendation readiness are distinct; launching needs no classifier key.
5. Explain the explicit `recommend --current-model MODEL -- "TASK"` command. Codex can also show native hook notes with saved configuration and native trust; Claude uses explicit advice. Neither changes the native model.

Retired local-provider migration requires a Jev key and consent before changing selection. Preserve `ALLOW_CLASSIFICATION=false`, including a setup-only disablement when saving the provider choice. Do not clear saved disablement silently.

Recommendation failures produce no note and do not affect native execution. Recommendations do not use fallback-model overrides, transmit previous task excerpts or create routing reports. Validate consent, disabled setup, migration, shared configuration, provider rubrics, child credential isolation and packaged help. Keep historical routing evidence separate from advisory verification.

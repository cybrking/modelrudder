# Advisory troubleshooting

## No recommendation appears

Silence can mean a matching model, disabled classification, ineligible input, provider failure or timeout. It does not prove the current model is optimal. Run `classifier status` and `doctor` without exposing the private key. Check consent and `ALLOW_CLASSIFICATION=false`. Explicit recommendations require a current model and one quoted task.

Codex automatic notes additionally require a saved private configuration and native hook trust. Hooks disabled by native policy stay disabled. Direct command-line hook configuration or feature-toggle options cause the launcher to leave that configuration alone. Use `smart-codex recommend --current-model MODEL -- "TASK"` if automatic notes are unavailable. The same note for the same model is suppressed within a session.

Claude does not automatically inspect prompts. Use `smart-claude recommend --current-model MODEL -- "TASK"`. The quoted task alone may omit important conversation/media context; use your judgment before switching.

## Old commands fail

`--routing` and `--effort-mode` were retired. Remove them and launch normally. Keep native `--model` if wanted. The launcher uses the native executable on PATH, so a managed-native pin is no longer a launch prerequisite. Old reports remain readable but no new routing report is created by advisory sessions.

## Native launch or model selection problems

Check the native CLI on PATH directly. Native authentication, model availability, permissions, resume and provider fallback remain native. ModelRudder does not force Sonnet/Sol on errors. See [installation](AGENT_INSTALL.md) and [runtime rollback](UPGRADE.md#roll-back). Historical managed-native repair instructions apply only when deliberately recovering an older routing release.

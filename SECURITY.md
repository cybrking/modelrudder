# Security

This experimental preview receives fixes on the default branch. There is no production SLA or supported long-term release line.

Report vulnerabilities privately through [GitHub vulnerability reporting](https://github.com/cybrking/modelrudder/security/advisories/new). Include affected versions, a minimal reproduction using synthetic data, impact and suggested remediation. Do not put credentials or sensitive workspace data in public issues. Do not test against other people's accounts or live hosted services.

Treat model instructions and outputs as untrusted. Keep native Codex and Claude Code approvals and workspace permissions enabled, review proposed commands and edits, and run independent tests. Store your Jev key in a private local configuration file. Anything pasted into an eligible classification-enabled task is sent to TypeSafe. Each native CLI separately handles authentication and model inputs under your provider agreement.

The advisory flow does not run a routing bridge, execution relay or model-rewriting mod. Codex can register a session-local native prompt hook that reads the saved private Jev configuration and emits a user-visible note. Review the hook before trusting it and preserve native trust and organization policy. Classifier credentials are withheld from the native child environment, but this is not a security boundary against other software running as the same user. Claude uses an explicit recommendation command. See [advisory boundaries](docs/ADVISORY.md).

Download installers and checksums from this repository's trusted release page. SHA-256 detects corruption but does not authenticate a publisher. Provider compatibility and recommendation quality are experimental and have separate limits described in README.md.

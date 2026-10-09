# Security

This experimental preview receives fixes on the default branch. There is no production SLA or supported long-term release line.

Report vulnerabilities privately through [GitHub vulnerability reporting](https://github.com/cybrking/modelrudder/security/advisories/new). Include affected versions, a minimal reproduction using synthetic data, impact and suggested remediation. Do not put credentials or sensitive workspace data in public issues. Do not test against other people's accounts or live hosted services.

Treat model instructions and outputs as untrusted. Keep native Codex and Claude Code approvals and workspace permissions enabled, review proposed commands and edits, and run independent tests. Store your Jev key in a private local configuration file. Anything pasted into an eligible classification-enabled task is sent to TypeSafe. Each native CLI separately handles authentication and model inputs under your provider agreement.

Claude support uses a privileged native Mods plugin loaded for one session and an authenticated loopback classifier bridge. It never approves tools or extracts Claude credentials. Review the plugin before trusting it, do not bypass organization restrictions, and do not assume other same-user software or installed mods are sandboxed from it. See [Claude's preview boundaries](docs/CLAUDE_CODE.md).

Download installers and checksums from this repository's trusted release page. SHA-256 detects corruption but does not authenticate a publisher. Provider compatibility and automatic-routing quality are experimental and have separate limits described in README.md.

# Community preview evidence — October 7, 2026

The source snapshot includes the allowlisted local client, client tests, packaging/installer and empty direct-classifier configuration. It excludes private Git history, hosted backend/billing infrastructure, customer records, internal business documents, raw evaluation traces and workspace projects. MIT and bundled dependency notices are retained.

The current release is **0.1.0-preview.3**. Its review sequence, explicit acceptance criteria, actual installed/native checks and remaining gaps are recorded in [RELEASE_READINESS.md](RELEASE_READINESS.md). The installer SHA-256 is `19b0e54491d84a310acc0fc934f207193160759acf9e74af2ffecb5d6ad4b610`.

Client CI runs type checking, offline tests, dependency audit, deterministic packaging and a Codex 0.160.1 zero-inference protocol probe on macOS, Linux and Windows with Node 24 and 26. Inspect the actual passing run for the release tag. Synthetic classifier/native-provider tests cover transport forwarding, approvals and permission fields, fallback, timeout/cancellation, context eligibility, effort policy, metadata logs and installation lifecycle. The Windows standalone test also executes the installed `.cmd` launcher through PowerShell.

Real macOS terminal checks exercised pinned execution, interruption, normal exit, thread resume, live Jev observe routing and one live Luna auto-routed task. Full interactive Windows/Linux behavior, confirmation-required approval UI, compaction and representative task-quality qualification remain incomplete. Exactly Codex 0.159.3 and 0.160.1 are accepted; protocol evidence does not imply general TUI certification.

No calibrated routing confidence, independently verified general production task quality, subscription-bill savings or general native TUI compatibility is claimed. Clef, Claude and commercial API execution are not included. Observe mode is recommended initially. The private development tree's backend tests are not this public client's test count.

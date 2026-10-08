# Contributing

Open an issue with a reproducible problem or proposed change before a large refactor. Include Node/Codex versions and routing mode. Redact credentials, task text, source code and account data from reports.

Use Node 24+ and `npm ci --ignore-scripts`. Run `npm test` and `npm run typecheck` before submitting a pull request. Tests use synthetic providers and disposable directories; they must not require private credentials or paid model calls. Preserve native approvals, workspace permissions, cancellation, per-turn model selection and secret boundaries. Add a meaningful regression test for behavior fixes.

Keep contributions scoped. Changes to a classifier rubric or threshold require task-outcome evidence, not a claim based on its reported confidence. Do not add a Codex version to the protocol allowlist without recorded native protocol evidence; full TUI compatibility is a separate qualification.

Contributions are submitted under the repository's MIT license. Do not contribute code or data you lack permission to publish. Report vulnerabilities privately through the process in SECURITY.md.

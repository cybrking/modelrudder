# Contributing

Open an issue with a reproducible problem or proposed change before a large refactor. Include Node/native CLI versions and whether the issue concerns explicit recommendations or Codex hook notes. Redact credentials, task text, source code and account data from reports.

Use Node 24+ and `npm ci --ignore-scripts`. Run `npm test` and `npm run typecheck` before submitting a pull request. Tests use synthetic providers and disposable directories; they must not require private credentials or paid model calls. Preserve native approvals, workspace permissions, cancellation, native model/effort selection and secret boundaries. Advisory code must not override models, replay tasks or inject recommendations into model context. Add a meaningful regression test for behavior fixes.

Keep contributions scoped. Changes to a classifier rubric or threshold require task-outcome evidence, not a claim based on its reported confidence. Retained legacy protocol allowlists still require recorded native evidence. Those relay/Mods checks do not qualify advisory hooks; test native hook discovery, trust and visible note behavior separately.

Contributions are submitted under the repository's MIT license. Do not contribute code or data you lack permission to publish. Report vulnerabilities privately through the process in SECURITY.md.

## Development

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run eval:routing
npm run package:pilot -- dist/delivery
```

Client CI retains legacy routing fixtures and managed installation, status and repeat-install paths on Windows, Linux and macOS with Node 24 and 26; the workflow and compatibility data identify the actual pinned native versions. Installation includes the Codex no-inference protocol probe and Claude Mods fixtures and synthetic provider-wire checks. Check the [workflow](.github/workflows/client.yml) and individual results for the operating systems tested. It makes no paid inference calls. Local native commands are `npm run test:native-protocol` for installed Codex, and `claude plugin test plugins/claude` plus `npm run test:claude-native` for installed Claude. These historical routing checks do not qualify the advisory path, authenticated terminal journeys or task quality. New advisory fixtures cover recommendation mapping, fail-open behavior, native argument forwarding, credential isolation and hook output. The [routing evaluation](.codex/evals/routing.md) defines the synthetic regression criteria.

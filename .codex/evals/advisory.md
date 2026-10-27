# Advisory release evaluation

These criteria qualify advice and preservation of native behavior, not model quality or savings. They are separate from historical automatic-routing evaluations.

## Automated criteria

Run `npm run eval:advisory` for synthetic fixtures. Every assertion must pass; a platform skip is a named coverage limitation, not a pass.

| Behavior | Observable pass condition | Fixture |
| --- | --- | --- |
| Matching model | No note for the same mapped model, including Claude family aliases | `test/advisory.test.ts` |
| Different model | One fixed, validated note; no provider-authored text or execution | `test/advisory.test.ts`, `test/advisory-launcher.test.ts` |
| Duplicate advice | Same current-model/note pair is suppressed per session | `test/advisory-hook.test.ts` |
| Manual model change | Hook compares the next native model; never changes it; old advice does not overwrite the choice | `test/advisory-hook.test.ts`, `test/advisory-journeys.test.ts` |
| Session separation/restart | Advice is scoped by native session ID; a new temporary launcher state can advise again | `test/advisory-journeys.test.ts` |
| Interruption | Aborted classification emits no late note and creates no state; outer deadline aborts provider work | `test/advisory.test.ts`, `test/advisory-hook.test.ts` |
| Disabled consent | No classifier request; native CLI still starts with original arguments | `test/advisory.test.ts`, `test/advisory-launcher.test.ts` |
| Failure | Invalid input/results, provider errors, private-file failures and timeouts cannot block native execution or expose diagnostics | `test/advisory.test.ts`, `test/advisory-hook.test.ts` |
| Native controls | Model, effort, credentials, permissions and resume arguments are forwarded without forced replacements | `test/advisory-launcher.test.ts` |

## Native contract smoke

Run `node scripts/advisory-native-smoke.ts PATH_TO_OFFICIAL_CODEX_ENTRY` against Codex 0.164.0 in each macOS/Linux/Windows CI environment. A JS npm entry is supported. The probe uses a disposable `CODEX_HOME`, strips credentials, configures only an unreachable loopback provider, and does not call Jev or an external inference service.

The probe must discover both an existing user hook and the session hook, observe the session hook as untrusted, trust only that synthetic fixture through the native config API, and receive its exact warning event after a synthetic turn. The native thread must retain the requested model and read-only sandbox. Fixture trust/configuration and process state must be removed afterward. Native failures are reported by stage without dumping native diagnostics.

This smoke submits a native synthetic turn but performs zero model inference. It qualifies the warning-event contract and configuration layering, not visual terminal rendering, authenticated model availability, or an end-to-end classifier call. `test/advisory-native-smoke.test.ts` separately verifies isolation and failure reporting with a fake RPC process.

## Live release gates

For every claimed supported desktop, record OS, native version, exact candidate revision, task and observed result. Use harmless tasks in a disposable workspace. Verify visible advice, no automatic model/effort switch, duplicate suppression, manual switch, cancellation, resume, permission acceptance/denial and ordinary shutdown. Distinguish unit simulation from actual native journeys.

The exact preview.15 payload passed macOS Codex 0.164.0 visible advice, unchanged model/effort, duplicate suppression, manual switch, compaction, interruption, resume, approval acceptance/denial and normal exit. See [live qualification](../../docs/ADVISORY_LIVE_QUALIFICATION.md) for the results and [release scope](../../docs/RELEASE_READINESS.md#macos-advisory-preview15). The maintainer scoped this release to macOS only; Linux/Windows journeys remain future-platform gates. No statistical reliability estimate follows from a single attempt.

# Model choice skill release evidence

Assessment date: October 26, 2026. Status: candidate; not published. Scope: optional skill and its distribution, based on `d0c0527` (published advisory preview.15). No native runtime source, dependencies, hooks, model mappings, classifier rubric, or version metadata changed.

## Behavior and acceptance

The skill obtains prompt-only advice with the existing recommendation command, pauses substantive work for four choices, and continues the original task in the same conversation. The user changes models with native controls. A pending menu never selects a default on silence. Missing advice permits ordinary task work; session suppression skips this skill's subsequent checks. See [skill behavior and installation](MODEL_CHOICE_SKILL.md).

This is a cooperative agent workflow. It cannot stop the inference that loaded the skill or enforce a pause against an agent that ignores instructions. Installing a skill does not guarantee automatic invocation. Menu numbers do not change the native model.

## ECC phases completed

- Planning/architecture: inspected advisory implementation, callers, release packaging, tests, and current official host hook/skill contracts. Changed the design from a hook/wrapper to a skill at the maintainer's request.
- Test-first packaging: added an asset/checksum assertion; observed the expected missing-asset failure; implemented delivery and observed it pass.
- Review: independently simulated eight conversational journeys and reviewed the entire changed surface. The reviewer identified an optional-asset checksum regression; fixed it by retaining the runtime-only manifest and adding a separate skill manifest. Follow-up review closed the finding. Clarified that a question tool must support all four choices.
- Verification: performed the checks below. No private credentials or production tasks were used in these checks.

## Verification results

| Check | Result and limits |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm test` | 264 passed, 0 failed, 3 Windows ACL tests skipped on macOS. Initial sandbox run could not bind local sockets; rerun with local socket access passed. |
| `npm run eval:advisory` | 38 passed, 0 failed |
| `node --test test/release.test.ts` after final checksum change | 20 passed, 0 failed |
| Skill Creator `quick_validate.py` | Passed using isolated PyYAML tooling, no project dependency added |
| Two independent `package:pilot` outputs | Byte-identical; both checksum manifests verified |
| Existing published runtime installer comparison | Byte-identical to the downloaded preview.15 installer |
| `git diff --check` | Passed |

Skill asset SHA-256: `4edb4552c0cf53463ba9b4c9b37c3a68aa7ce2f0559953c6c386ccca7458e3b9`.

Runtime remains `0.1.0-preview.15-b89f18c2ce4c307f`; installer SHA-256 remains `fd7e8cd17886c1a1c9d65ae9d365d1e70890e3d1e03aaee5b3cc40a7d97b07b7`. The optional skill is not installed by that unchanged runtime installer.

## Independent behavioral simulations

These are instruction-following simulations using supplied observations, not live Codex/Claude sessions or a statistical reliability study.

| Scenario | Observed simulated behavior |
| --- | --- |
| Choose recommended model, then confirm with fresh metadata | Waited for native switch; resumed original task afterward |
| Keep current model | Resumed task without reclassification |
| Stop asking this session, then new task | Continued and skipped the later skill check |
| Empty output or missing CLI | Continued ordinary task without retry/install; advice-only request reported limitation |
| Current model unknown | Asked for current model; did not guess or classify |
| Async question returns with no answer | Kept choice pending; no substantive work |
| Cancel or replace task while waiting | Canceled original task or started a distinct decision for replacement |
| Choose another model but metadata remains unchanged | Disclosed unchanged model; waited for retry or explicit keep-current choice |

## Release handoff

The branch and draft PR should carry the final candidate revision and CI links. Before publishing the skill, record a live user journey in the intended host: invoke with a harmless task, see the menu, choose keep-current, and verify completion of the original task; separately choose switch, use the native picker, confirm, and verify continuation. Also check session suppression. These interactions were not performed in this assessment. The old native-runtime qualification does not substitute for skill testing.

Publish only the skill file and `MODEL_CHOICE_SHA256SUMS` under a dedicated immutable skill release tag, or include them in a later full release. Do not replace preview.15 assets or call this a new runtime version. Installation/removal instructions are in the skill guide. Merge, publication, and any claimed live-host qualification remain separate from local tests and simulation.

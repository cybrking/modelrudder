# Community release readiness evaluation

## Preview.14 Jev-only routing

Preview.14 is an unreleased source candidate. As checked October 21, 2026 at 22:57 UTC through the [GitHub releases API](https://api.github.com/repos/cybrking/modelrudder/releases), its release is a draft with no assets and no publication date. The newest published release is [preview.13](https://github.com/cybrking/modelrudder/releases/tag/v0.1.0-preview.13), which still includes Tev. A package version or successful CI run is not evidence that an installer has been published.

Current-source setup and launchers support Jev only. The recorded native defaults are Codex **0.163.0** and Claude Code **2.1.303**. Earlier Tev validation below is historical evidence and does not describe current functionality or qualify this candidate. See [Jev setup](CLASSIFIER_CHOICES.md) for migration and [native version policy](NATIVE_VERSIONS.md) for compatibility limits.

On October 22, an authenticated macOS Codex observe-mode coding task exposed a relay backpressure disconnect in an earlier draft installer. [PR #37](https://github.com/cybrking/modelrudder/pull/37) fixed it; the same task and a separate automatic-routing coding task then completed with the rebuilt installer. An authenticated Claude 2.1.303 observe-mode edit and automatic-routing edit completed in a disposable repository under native manual permissions, with independent tests passing. A denied file creation did not occur. These are bounded smoke tests, not full interactive or cross-platform qualification. Native Claude reported a normal Mods completion event after the denied request despite showing an interrupted turn in its UI; the report now names completion events and abort signals rather than implying task success.

### October 21 correctness integration

- [Classification disablement persistence (#30)](https://github.com/cybrking/modelrudder/pull/30): setup saves a setup-only `ALLOW_CLASSIFICATION=false` and never clears saved disablement. Fresh-process regressions cover both launchers with absent, enabled and disabled saved flags, synthetic credentials and mocked classification.
- [Native activation ordering (#34)](https://github.com/cybrking/modelrudder/pull/34): move a new candidate to its final path before invoking its verifier; publish metadata and select it only after success. Failed verification preserves current/previous selections, removes the unverified candidate with bounded cleanup retries, and reports sanitized recovery instructions if cleanup cannot finish.
- [Bounded optional learning shutdown (#23)](https://github.com/cybrking/modelrudder/pull/23): allow a two-second drain, cancel pending Windows permission checks, reject late writes and report incomplete capture without exposing task text.

Automated checks exercise regression behavior, type checking, routing fixtures, dependency audit, deterministic packaging and managed native installation/status/reinstallation on macOS, Linux and Windows with Node 24/26. They use no-inference Codex handshakes and synthetic Claude provider requests, not authenticated coding sessions. CI evidence is revision-specific: a passing run for an earlier candidate does not verify later source changes. The [historical preview.14 record](https://github.com/cybrking/modelrudder/blob/508870b3a098377979f833440708486edf176742/docs/RELEASE_READINESS.md#preview14-jev-only-routing) preserves earlier candidate CI, package fingerprints, test counts and local verification limits; none of those fingerprints or counts describes the current candidate.

The integrated code revision [`b2d1168`](https://github.com/cybrking/modelrudder/commit/b2d1168f250e2654e83801956edf7071bc4299d5) passed all six jobs in [post-merge main CI 39689712357](https://github.com/cybrking/modelrudder/actions/runs/39689712357). Later edits, including this documentation correction, require their own exact-revision checks.

### Remaining publication gates

1. Verify the immutable final release revision with all six Community client CI jobs, then build and checksum its exact installer. Record that revision's evidence rather than reusing a historical candidate's package ID or hash.
2. Complete and record the applicable native interactive journeys required by [upstream qualification](UPSTREAM_UPDATES.md#review-and-recovery): routing, approval acceptance/denial, cancellation, resume, compaction, accounting and shutdown. Name the OS, native version, modes and actual task outcomes; distinguish classifier choices from executor evidence. Full authenticated Claude journeys and applicable Linux/Windows terminal behavior remain unqualified. Follow the [Claude live qualification checklist](CLAUDE_LIVE_QUALIFICATION.md).
3. Publish only after those gates are cleared, then verify the release has the matching installer and `SHA256SUMS` assets. Until then, [release installation instructions](AGENT_INSTALL.md) must stop when no qualifying published Jev-only assets exist; a source build is a separate explicit choice.

No general task-quality improvement, calibrated routing confidence or measured savings is established by the automated evidence. The installed version on any user's computer is a separate fact and is not inferred from repository or release state.

## Preview.13 Codex Tev rubric (historical)

Codex Tev uses a separate rubric with explicit boundaries between mechanical work, bounded implementation, investigation and broad discovery. Its version is recorded as `tev1:latest:codex-rubric-2026-10-16` with the default model tag. Jev and Claude rubrics, model/effort mappings, confidence handling and native CLI compatibility data are unchanged.

Local verification on macOS / Node 26: 212 tests passed, one Windows-only skip, and type checking passed. New regressions failed before the change and passed afterward: Tev-specific request/version selection with unchanged Jev and Claude requests, and preservation of current/historical report versions with unsupported values redacted. The full suite also exercises transport, timeout/cancellation, fallback, native permissions and standalone installation/rollback. Cross-platform CI results accompany the release.

Four local calls through the implemented classifier selected MAX for the reported audit request and its `continue` follow-up, FAST for an explicit new security-document typo, and BALANCED for `implement it` following a bounded feature request. These checks use available prior task excerpts; they do not establish continuity after the original goal leaves the two-excerpt context window.

Bounded execution comparison used native Codex 0.162.1 with subscription authentication, tools/host discovery disabled, complete synthetic source supplied in the prompt, and structured replacement-file output. Independent executable graders were frozen before execution and verified against broken fixtures and reference fixes. All three arms received the same task/source contract.

| Fixture | Previous Tev rubric | New Tev rubric | Fixed baseline |
| --- | --- | --- | --- |
| Pagination validation and offset fix | Luna/low: passed | Luna/medium: passed | Sol/medium: passed |
| Tenant/owner access control and update restrictions, clarified contract | Luna/medium: passed | Astra/medium: passed | Sol/medium: passed |

Each cell is one attempt. The original security fixture omitted session field names; one model used `session.ownerId` where the grader assumed `session.userId`. All three original security outcomes are excluded. The clarified fixture is a development rerun, not held-out evidence. The six eligible attempts used 129,929 reported native input/output tokens; all nine invocations including excluded trials used 181,179. Four initial classifier calls selected the comparison routes; the clarification replayed those choices with unchanged routing text. Served native model, effective effort and subscription dollar cost are not observable through this execution interface. These small artifact tasks do not establish full repository/tool/PR performance, or that the additional capacity is necessary.

The standalone preview.13 installer was checksum-verified and installed into disposable paths. Both launchers reported preview.13, the installed classifier reported the new Tev rubric, and existing fixture configuration was unchanged. Runtime ID: `0.1.0-preview.13-cfeea05b54cbbbd2`.

The historical classifier comparison above is exploratory. General task-quality improvement, calibrated confidence, savings and Claude quality are not established by it.

## Preview.12 selectable Jev and local Tev (historical)

Both launchers support a saved routing-provider selection, a per-session override and metadata-only status checks. Tev uses a loopback-only adapter with each native tool's own rubric. Hosted Jev consent remains separate; local failures use the existing model fallback without hosted substitution. Existing configuration and native CLI pins survive upgrades. Local Tev compute cost is unpriced rather than charged at Jev rates. Opt-in local learning records remain private and do not upload or train automatically.

Interactive setup now shows the saved provider on existing installations as well as new ones, with Jev, Tev, private configuration editing and Enter to keep settings. Ready providers switch without opening an editor; unavailable replacements preserve the current selection. Both natural-language installation prompts cover Jev and Tev, explicit noninteractive setup, private Jev key/consent entry, local Tev prerequisites and provider-specific readiness checks.

October 16 local verification: 210 tests passed with one Windows-only skip; type checking and diff whitespace checks passed. The installed macOS setup menu correctly reprompted after invalid input and exited unchanged on Enter. Configuration and both native CLI selections matched their pre-install fingerprints. The setup/provider-switch tests use fixtures; no real classifier inference or native coding task was submitted for this change. Final cross-platform CI evidence accompanies the published release.

The release candidate retains the managed CLI compatibility policy and the reviewed compatibility data from current main. On macOS, 204 tests passed with one Windows-only skip and type checking passed after integration. Five actual local Tev classifier calls passed before integration, covering both rubrics; they did not execute coding tasks. Full authenticated Claude qualification is pending: a real terminal launched and preserved manual permissions, but reported expired native login before any coding task was submitted. No successful live coding journey is claimed.


## Preview.11 managed Codex and Claude CLI candidates

Stable CLI candidates are checked through isolated provider-specific protocol probes. Exact passing evidence and known-broken blocks ship as compatibility data; unrecorded stable builds must pass a fresh local probe before launch. Explicit candidate installs keep the current selection unless verification passes. Daily cross-platform checks validate promotion evidence and prepare a normal review PR; they do not merge or publish releases.

Local validation on macOS: the community suite passed 193 tests with one platform skip; type checking and workflow lint passed. Codex 0.162.1 and Claude Code 2.1.299 were installed and passed their isolated probes without real authentication or paid inference. PR #20's Node 24/26 client checks passed on Ubuntu, macOS and Windows. Full authenticated TUI behavior, resume/interrupt behavior and model task quality remain unqualified. Release-recorded defaults remain Codex 0.162.0 and Claude Code 2.1.295 until cross-platform candidate evidence is reviewed and promoted.

## Preview.10 ungated Codex model and effort selection

Codex now applies each valid classifier choice without the reported-confidence cutoff. Automatic effort follows the selected profile: FAST uses Luna/low, BALANCED Luna/medium, DEEP Sol/medium, and MAX Astra/medium. Fixed and observe modes retain their stated execution behavior. Policy clamps, invalid responses, provider failure, timeouts, cancellation, opaque context and per-turn ownership remain enforced. Reported confidence and probabilities remain descriptive metadata. Runtime policy version is 5 and explicitly records `classifier-choice` selection. Claude retains its separate provider-specific policy.

The user approved this experimental release after 443 live synthetic Jev classifier calls. The stock ungated question matched acceptable agent-authored joint model/effort labels on 28/31 development and 30/30 reserved examples (58/61 overall); its existing confidence-gated policy matched 49/61. These are routing-label comparisons, not executed-task success, calibrated adequacy or measured savings. The classifier rubric and exposed model/effort combinations are not expanded in this release. General task-quality qualification remains pending.

Local validation on macOS with Node 26: 186 tests passed and one Windows-only test skipped; all 80 routing checks, type checking and the production dependency audit passed (zero vulnerabilities). The standalone installer installed into disposable paths, and both launchers reported preview.10 and displayed help. The Codex 0.162.0 native protocol smoke passed without inference. Runtime ID: `0.1.0-preview.10-e070f1dd340cf10c`. Cross-platform Community client CI must pass before publication; its final results accompany the release. No private capture data or experiment payloads are packaged.

## Preview.9 managed native CLI versions

Scope: isolate ModelRudder from plain native CLI updates. Managed installation checks an exact recorded version and its shipped native smoke tests before selecting it, retains the previous selection, and provides explicit verified rollback. Missing pins produce installation instructions. Claude's managed child disables native auto-updates. Runtime and native rollback remain separate operations.

Community client CI now exercises managed install, status and repeated install for both providers across Node 24/26 on macOS, Linux and Windows. Candidate discovery remains a separate evidence workflow and does not widen local version acceptance.

Local validation on macOS with Node 26: 185 tests passed, one Windows-only test skipped; type checking passed; production dependency audit found zero vulnerabilities. Actual managed Codex 0.162.0 and Claude 2.1.295 installs passed their native checks. Codex 0.161.0 installation followed by rollback to 0.162.0 passed. The standalone installer was installed into disposable paths; both launchers reported preview.9 and reran their shipped native checks successfully. No real model tasks or classifier requests were submitted.

Windows CI exposed an intermittent `EPERM` while renaming a verified candidate directory. Activation now retries bounded transient Windows lock errors; regression coverage verifies eventual success, bounded failure and no retries for unrelated errors.

Runtime ID: `0.1.0-preview.9-7c019f70c019f9f2`. Cross-platform CI must pass before publication. Full authenticated TUI and task-quality qualification remain unperformed; the native probes do not establish them.

## Preview.8 routing notice update

Successful automatic Claude routes now display `ModelRudder Routing this turn to <model>.` without the experimental-route suffix. Fallback explanations remain visible. Routing decisions, confidence threshold and native CLI compatibility gates are unchanged.

The focused Claude Mods suite passed all 38 tests. Cross-platform checks are provided by the release revision’s Community client CI. No authenticated interactive Claude journey was performed for this text-only change.

Runtime ID: `0.1.0-preview.8-5395ee969164068e`.

Scope: the free local ModelRudder client. Paid hosted service readiness is separate.

Acceptance criteria established before this evaluation:

| Check | Pass condition | Evidence type |
| --- | --- | --- |
| Security review | No unresolved confirmed secret/authorization defects in the changed client paths | Source tracing and synthetic boundary checks |
| Regression fixes | Mixed-case Windows credentials are withheld; unsuccessful editor startup is reported; existing settings are retained | Automated tests |
| Installed workflow | Verified standalone installer creates a working launcher, private commented config, and retains config/state on upgrade, rollback and removal | Disposable local installation and platform CI |
| Native protocol | Installed supported Codex initializes and creates a read-only thread without inference | Native protocol probe on each CI OS |
| Native terminal journey | Launch, approvals, interruption, resume and normal exit work through the installed router | Real interactive terminal checks; results must name OS and modes |
| Routing qualification | Observe/auto behavior and task quality are assessed with actual router execution and explicit graders | Named task evaluations; synthetic transport tests alone do not qualify quality |
| Final verification | Type checking, client tests, production dependency audit and package validation pass for the final source | Local checks and CI |

Full production readiness requires all applicable criteria. An unperformed or unavailable check is not a pass. Windows CI exercises a Windows runner; it does not certify a normal Windows 11 desktop session. Synthetic classifier tests are separated from real Jev calls.

## Preview.7 — October 9, 2026

This release accepts exactly Codex 0.162.0 after its local zero-inference protocol probe passed initialization, fresh read-only thread creation, model selection and permissions. The platform CI probe is pinned to 0.162.0; older qualified builds remain accepted and unknown, modified and prerelease builds remain rejected. Full native TUI certification remains incomplete.

Claude routing and observe notices now show capitalized names and the configured model version. Dated snapshots show their date; custom IDs remain visible verbatim. Low or missing classifier confidence is described as “Uncertain classification; using fallback.” The README includes three copyable task prompts for each native tool with expected routes, fallback explanations and the distinction from unclassified native context. These prompts are manual examples, not live classifier outcome evidence.

The local full suite passed 171 tests with one Windows-only skip; type checking, seven Claude 2.1.295 native plugin fixtures, six synthetic native provider-wire checks and production dependency audit passed. The notice and Codex compatibility regressions failed before their fixes. No paid inference was used.

The checksum-verified actual preview.6 and preview.7 installers were exercised in disposable custom paths. Both launchers reported preview.7 after upgrade and preview.6 after rollback. The upgraded installed adapter passed the routing-notice regressions; configuration and state were preserved byte-for-byte.

Preview.7 runtime ID: `0.1.0-preview.7-c359bcec384ae8f0`. Standalone installer SHA-256: `e53c9c919fada519aceb9a19111d53ec0533e70c2ca557a5de5458c279f01221`. Inspect this release commit's CI for macOS, Ubuntu and Windows results with Node 24/26. The preview retains the limitations and earlier multi-turn fixes documented below.

## Preview.6 — October 9, 2026

This release adds the native-instruction Claude multi-turn fix from [PR #10](https://github.com/cybrking/modelrudder/pull/10). Engine-authored project instruction and nested-memory announcements no longer mark eligible user-task history opaque. Referenced files, queued input, non-native instructions, resumed history and compaction remain conservative. Project instruction contents are not sent to the classifier. Native CLI version gates are unchanged.

The local full suite passed 170 tests with one Windows-only skip; type checking, seven native Claude 2.1.295 plugin fixtures and the production dependency audit passed. Before the patch, the new native-loader fixture classified the first task and sent empty tasks for requests two and three; afterward it classified all three. Integration regressions also verify Haiku → Opus → Haiku across three tasks, task history and attachment privacy.

The checksum-verified preview.5 installer and actual preview.6 standalone artifact were exercised in disposable custom runtime, bin and configuration paths. The installed preview.5 adapter failed both native-instruction regressions; the upgraded preview.6 adapter passed. Both launchers reported preview.6 after upgrade and preview.5 after rollback. Configuration and local state survived byte-for-byte. No real keys, account requests or paid inference were used.

Preview.6 runtime ID: `0.1.0-preview.6-aa6ad8c8ac9b9110`. Standalone installer SHA-256: `1cf985a67cd011421a1c5187c660d74190214b63cb2ecae56fedac8abe93c778`. The README and agent-assisted upgrade prompt use the new release. Inspect this release commit's CI for macOS, Ubuntu and Windows results with Node 24/26.

The reported failure occurred on another computer already running preview.5. Its exact native Claude version and triggering event remain unconfirmed; a fresh authenticated retest on that computer is still required. This is an experimental preview, not full production qualification.

## Preview.5 — October 9, 2026

This release packages the consumed-prompt Claude routing fix, the source npm installer's Node argument boundary, and the both-provider setup/upgrade guides. It remains an experimental preview with unchanged native CLI version gates.

The final local suite passed 166 tests with one Windows-only skip; type checking passed. A new installer regression failed before the argument fix and passed after it. The downloaded, checksum-verified preview.4 installer and the actual preview.5 standalone artifact were exercised in disposable custom paths: installation, upgrade, both launchers reporting preview.5, and rollback to the previous release passed. Configuration and state were preserved byte-for-byte, and the upgraded Claude module contained the routing patch.

Preview.5 runtime ID: `0.1.0-preview.5-9ae7bd6ff2125032`. Standalone installer SHA-256: `a766769c3b43090298c8ba96b5d4a5618f17d37b54287e448dd88a6c86275f71`. The README uses the exact installer filename and checksum-first platform steps. Inspect the release commit's CI for macOS, Ubuntu and Windows results with Node 24/26; those checks include both native provider probes without paid inference.

Authenticated Claude terminal journeys, the issue reporter's exact retest, ordinary Windows/Linux terminal behavior, native approvals and representative task-quality qualification remain incomplete as detailed below. Publishing this preview does not change those limits.

## Codex 0.161.0 update — October 8, 2026

Preview.4 adds exactly Codex 0.161.0 to the supported builds after its local zero-inference protocol probe passed initialization, fresh-thread creation, model setting and read-only permissions. The actual local `smart-codex` launcher reached the native 0.161.0 terminal in an empty disposable workspace and exited normally without a task. Regression tests cover launcher compatibility, doctor readiness, historical builds and rejection of unknown or modified versions. CI now exercises 0.161.0 on each platform.

The latest GitHub source was fetched and fast-forwarded to `54e9409` before changing runtime behavior. Its merged Claude adapter is included in the preview.4 package and retains its documented experimental status. Local updated suite: 161 passed, one Windows-only skip; type checking and production dependency audit passed. See [Claude-specific qualification](CLAUDE_CODE.md); this Codex update does not certify Claude live task quality. Full native terminal certification remains pending.

## Preview.3 results

The following preview.3 review sequence completed on October 7, 2026: `ecc-security-review`, `ecc-tdd`, `ecc-code-review`, `ecc-eval`, `ecc-update-docs`, then `ecc-verify`. The outcome remains an experimental preview, not full production qualification.

| Check | Result |
| --- | --- |
| Security and regression fixes | Fixed Windows case-insensitive secret filtering and immediate editor-command failure reporting. Both regression tests failed before their fixes, then passed. Independent review found no additional actionable defects in the reviewed client paths or fixes. |
| Client verification | 101 tests passed on macOS, one Windows-only test skipped; type checking passed; production dependency audit found zero known vulnerabilities. Windows CI runs the platform-specific test. |
| Platform verification | Six CI jobs passed on macOS, Ubuntu and Windows with Node 24/26, including Codex 0.160.1 zero-inference protocol checks and packaging. CI also invokes the real Windows `.cmd` launcher from PowerShell with `--help`. |
| Standalone installation | The evaluated preview.3 installer produced a working launcher and a private, fully commented configuration. Installation of preview.2, upgrade to preview.3, rollback, reactivation and uninstall all preserved the fixture configuration and state byte-for-byte. |
| Artifact integrity | Evaluated local, Windows CI and macOS CI standalone installers were byte-identical. SHA-256: `19b0e54491d84a310acc0fc934f207193160759acf9e74af2ffecb5d6ad4b610`. |
| Real macOS pinned terminal | Codex 0.160.1 through the installed router read a synthetic file and returned its exact expected text. Escape interrupted an active turn. Normal exit returned zero. A new router session resumed the exact thread, retained history and returned the prior fixture value without tools. |
| Real macOS observe terminal | Live Jev classification occurred; Sol/medium executed and returned exactly `OBSERVE_OK`. A second bounded fixture task also executed on Sol. Two Jev calls were recorded. |
| Real macOS auto terminal | Live Jev recommended FAST at reported confidence 0.99; Luna/medium executed and returned exactly `AUTO_OK`. One Jev call was recorded. Effort mode was explicitly fixed. |
| Native approvals | Incomplete. Bounded write tasks completed in the temporary workspace without an operator confirmation prompt. This does not prove approval UI behavior. Automated forwarding and permission-field preservation tests pass. |
| General routing quality | Incomplete. The exact-output fixtures above verify basic execution, not representative coding quality, calibrated confidence, profitability or savings across task types. |

The source-fix CI run is [37720555743](https://github.com/cybrking/modelrudder/actions/runs/37720555743). Check the passing run associated with the final tag for the added Windows launcher check and documentation.

During evaluation the system Codex command changed to 0.161.0; the compatibility guard correctly rejected it. Remaining tasks used a separately installed 0.160.1 in a disposable directory, without downgrading the user's command or changing native authentication. A resume attempt with permission overrides was rejected by native Codex; resume without those overrides passed. Usage reporting marked some fresh-session tokens as unattributed and coverage as partial; this evaluation does not treat its rate estimates as complete savings evidence.

## Remaining qualification

### October 9 ECC review of the issue #2 patch

The six requested workflows were applied: code review, security review, TDD, evaluation, verification and documentation. Scope was the public client adapters, classifier boundaries, launchers, metadata logging, installer/release lifecycle and relevant tests/CI. The hosted backend was not included.

| Workflow | Evidence and result |
| --- | --- |
| Code review | Traced per-turn decisions, eligibility, stream forwarding, cancellation, fallback, native model changes and install activation. No additional confirmed correctness defect was found in the reviewed paths beyond the consumed-prompt-receipt bug already patched. |
| Security review | Reviewed classifier consent/HTTPS and bounded responses, child credential filtering, authenticated loopback services, argument-array subprocesses, private files and release allowlists/checksums. Boundary regression tests passed; production npm audit reported zero known vulnerabilities. This is a scoped source review, not proof that the client has no vulnerabilities. |
| TDD | Issue #2's consumed-receipt regression failed before the lifecycle fix and passes afterward. Both Node integration and official native-loader fixtures now cover three successive user turns. The reporter's exact interactive trigger still needs a retest; the fixture demonstrates a confirmed lifecycle defect, not reproduction of every possible cause of the report. |
| Evaluation | Criteria were defined in [routing evaluation](../.codex/evals/routing.md) before `npm run eval:routing`: 74 checks passed, no failures/skips/cancellations. Uses synthetic classifier/event fixtures; representative live task quality and latency remain pending. |
| Verification | macOS full tests passed on Node 24 and 26: 165 passed, one Windows-only skip on each. Typecheck passed. Codex 0.161.0 passed four zero-inference protocol checks. Official Claude 2.1.295 passed six Mods fixtures and six synthetic provider-wire cases, without account authentication or paid inference. Full tests include disposable standalone installation, upgrade, rollback, integrity rejection, activation-failure restoration and uninstall/data-preservation checks. |
| Documentation and CI | Clarified current local results and removed the stale sandbox-failure limitation. Added `npm run eval:routing` and pinned Claude checks to normal PR CI's six-platform/runtime jobs. Scheduled upstream CI already included Claude checks. Passing remote platform runs must be recorded separately from local evidence. |

The review supports the experimental patch. It does not qualify a production release. Claude still needs authenticated terminal journeys for successive prompts/tool loops, interruption, explicit permission denial/acceptance, resume, compaction, classifier failure and normal exit. Confirm actual model availability and record the requested/executed model through those journeys. Repeat applicable journeys on ordinary Linux and Windows desktops; CI fixtures do not certify their terminal experience.

Existing remaining Codex and general quality qualification also applies:

- Repeat the real terminal journey on ordinary Windows 11 and Linux/WSL: task/tool execution, confirmation prompts, interruption, resume and exit.
- Exercise an explicit confirmation-required approval policy on macOS, including denial and acceptance. Qualify compaction and the default automatic effort policy separately.
- Run representative task-quality evaluations with trusted graders through the actual router before publishing generalized quality or savings figures.

Raw native transcripts, credentials and fixture usage logs are excluded from the public source. The hosted paid service was outside this client review.

# Community release readiness evaluation

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

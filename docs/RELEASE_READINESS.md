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

## Results

Review sequence completed on October 7, 2026: `ecc-security-review`, `ecc-tdd`, `ecc-code-review`, `ecc-eval`, `ecc-update-docs`, then `ecc-verify`. The outcome remains an experimental preview, not full production qualification.

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

- Repeat the real terminal journey on ordinary Windows 11 and Linux/WSL: task/tool execution, confirmation prompts, interruption, resume and exit.
- Exercise an explicit confirmation-required approval policy on macOS, including denial and acceptance. Qualify compaction and the default automatic effort policy separately.
- Run representative task-quality evaluations with trusted graders through the actual router before publishing generalized quality or savings figures.

Raw native transcripts, credentials and fixture usage logs are excluded from the public source. The hosted paid service was outside this client review.

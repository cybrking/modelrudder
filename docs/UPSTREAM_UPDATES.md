# Managed CLI updates

The daily workflow checks official stable Codex and Claude Code releases at 13:17 UTC. GitHub may delay scheduled runs. Run it manually with `include_recorded` to include already-recorded baselines. Discovery excludes drafts/prereleases and uses fixed official GitHub and npm endpoints. Discovery failures fail the run rather than reporting no updates.

## One runtime policy

`src/cli-compatibility-data.ts` ships with the router. For each provider it records the minimum stable version, latest recorded build, exact evidence history, and known broken versions with reasons. The minimum-to-latest span is a reporting boundary, not proof that every intervening build was tested.

Both launchers retain their isolated managed native pins; updating plain provider CLIs does not change them. `native install` without a version selects the latest recorded build shipped with the router. Explicit `native install VERSION` may evaluate a stable candidate within the supported major: it downloads a separate official package, runs checks and switches selection only after they pass. Existing selection and previous-version rollback are preserved on failure. Launch also rechecks an unrecorded candidate. Both adapters use the same decision rules:

- Recorded stable builds can start after their normal native login and configuration checks.
- Unrecorded stable builds at or above the minimum within the same major must pass a fresh local interface probe before routing starts. This includes gaps between recorded versions. Probe success is local compatibility evidence, not release certification; it is not persisted or used to approve other builds.
- Explicit blocks override recorded evidence. Too-old builds, malformed/modified versions, prereleases and new majors are rejected. New-major support needs an adapter/policy review.

Codex probes verify required remote/stdio CLI capabilities, app-server initialization, fresh ephemeral thread creation, exact model setting and read-only permissions. No inference turn is submitted. Claude probes use temporary configuration, fake credentials and a synthetic loopback provider to verify Mods model rewrites and native model restrictions. They use no real account or paid inference. These startup checks add latency for unrecorded builds. CLI upgrades during a probe are rejected if the observed version changes.

`smart-codex doctor` and `smart-claude doctor` report the installed build, recorded evidence and applicable local checks. Probe failure stops routing and tells the user to run plain `codex` or `claude`, or select a recorded build. The router does not silently launch a different mode, downgrade a CLI, change credentials or retry paid tasks.

## Validate and promote

The candidate matrix runs type checking, the offline client suite and native provider checks on macOS, Ubuntu and Windows. Successful native results are cached by provider/version/OS/source commit; failed results are retried. Each evidence record binds the native result to the exact candidate, OS and source revision. Artifacts last 30 days.

After every candidate job passes, the promotion validator requires exactly one matching record per provider/platform, complete required checks and the expected no-paid-inference flags. Missing, duplicate, stale, blocked or incomplete evidence cannot promote a version. The proposal appends evidence history, updates the recorded endpoint and adds `docs/compatibility/latest.json`; it does not remove blocks or broaden supported majors.

The workflow opens an ordinary review PR with those changes and evidence. It never auto-merges, publishes a release or updates a user's native CLI. Existing automation PRs and edited branches are preserved so daily runs do not overwrite review edits or reopen rejected proposals. If branch publication succeeded but PR creation failed, a later run can retry creation only when the remote tree exactly matches the newly validated proposal. Ordinary PR CI installs the proposed recorded baselines for both CLIs and repeats native checks on all supported OS/Node combinations.

Enable the repository setting allowing GitHub Actions to create pull requests. The default `GITHUB_TOKEN` has write permissions only in the promotion job; GitHub requires a maintainer to approve CI workflows on a PR created with that token. For CI to start automatically, optionally configure `CLI_UPDATE_TOKEN` as a dedicated repository-scoped GitHub App installation token or fine-grained bot token with contents and pull-request write access. Do not use an operator credential with broader access. The workflow does not print credentials. See [GitHub's workflow-trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

The `cli-promotion-proposal` artifact remains available if PR creation fails or repository permissions are not enabled. API/job failures appear in workflow logs; configure GitHub Actions notifications for this workflow.

## Review and recovery

Before release, inspect upstream changes and exercise applicable interactive journeys: routing, approvals, cancellation, resume, compaction, accounting and shutdown. No-inference Codex handshakes and synthetic Claude requests do not establish those journeys, model entitlement, task quality or savings. Record those results separately from contract evidence. Prerelease checks are not promoted by this workflow; a separate explicit candidate run is needed if prerelease support is being evaluated.

If a release regresses, add the exact broken version and reason to the shipped provider block list, fix the adapter and repeat affected checks. Restore a working native pin with `smart-codex native rollback` or `smart-claude native rollback`. Roll back the router using its versioned installer's `--list` and `--rollback RELEASE_ID` commands. Historical Codex-only and previous two-adapter artifacts remain accepted for rollback. A new router release is required to distribute a new block or policy; launchers do not download executable code or approval policy at startup.

Community runtime changes belong in the community checkout. Carry shared Codex fixes back to the private checkout deliberately; it does not currently contain the Claude adapter.

## Local discovery

Run `node scripts/check-upstream-releases.ts` with Node 24+. It makes two public GitHub requests and writes `upstream-releases.json`. `GITHUB_TOKEN` is optional for authenticated lookup. Discovery does not install CLIs, mutate compatibility policy or call models.

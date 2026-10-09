# Daily upstream CLI checks

The **Daily upstream CLI compatibility** workflow checks the official stable Codex and Claude Code releases once a day at **13:17 UTC** (09:17 New York during daylight time, 08:17 during standard time). GitHub may delay scheduled runs. It also supports **Run workflow** for an immediate check.

Open [the workflow](https://github.com/cybrking/modelrudder/actions/workflows/upstream-releases.yml). The discovery summary lists each latest stable version, the recorded evidence baseline, whether the current launcher accepts it, and whether candidate checks are needed. The `upstream-release-report` artifact contains the same metadata as JSON. API failures fail the run instead of claiming there are no updates.

For an initial verification or to include already-recorded releases, select **include_recorded** when using Run workflow (locally: `--include-recorded`). Successful results for the same revision/version/OS are still reused. To repeat native checks after a failure, rerun the failed job; to replace an existing successful result, delete its cache in GitHub Actions first.

Drafts and prereleases are excluded. Release tags must match the official provider's bounded numeric version format before a package version enters the job matrix. Installation uses fixed official npm package names and passes versions through quoted environment variables.

## Candidate checks

A stable version newer than the recorded baseline gets isolated macOS, Ubuntu and Windows jobs with Node 24. Each job runs type checking and the offline client tests, then installs exactly the detected CLI version on its disposable GitHub runner:

- Codex: native stdio initialization, fresh-thread creation, model setting and read-only permissions. No turn is submitted.
- Claude Code: native plugin fixtures and a native model-rewrite/allowlist probe against a synthetic loopback provider with fake credentials and temporary configuration. No real provider inference or user authentication is used.

Successful results are cached by provider, version, OS and source commit. Repeated daily runs reuse those results for the same revision; a new version or source commit triggers fresh checks. Failed checks are not cached and are retried on the next run. Cache eviction can also cause a fresh check. Native result artifacts are retained for 30 days; failure details are in the job logs. GitHub Actions notification preferences determine whether you receive failure notifications.

Passing these probes does not certify complete interactive approvals, interruption, resume or task quality. The workflow reports evidence for review; it does not change version gates, merge PRs, publish releases, or update anyone's local CLI. After reviewing the results and relevant upstream changes, update the recorded support metadata, run the applicable user-flow checks and publish an ordinary reviewed release when needed.

Codex evidence is recorded in `protocolTestedCodexVersions` in `src/compatibility.ts`. Claude evidence is recorded in `offlineTestedClaudeVersions` in `src/claude-command.ts`; its supported Mods range remains a separate rule.

## Run the discovery locally

With Node 24+, run `node scripts/check-upstream-releases.ts` from the checkout. It makes two public GitHub API requests and writes `upstream-releases.json` in the current directory. `GITHUB_TOKEN` is optional for authenticated API access; do not place it in the repository or print it. The report contains public version metadata only. Discovery alone does not install CLIs or call models.

The schedule follows the owner's October 8, 2026 instruction to check once per day. Sources: [official Codex releases](https://github.com/openai/codex/releases), [official Claude Code releases](https://github.com/anthropics/claude-code/releases), [GitHub release API](https://docs.github.com/en/rest/releases/releases#get-the-latest-release), and [scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule).

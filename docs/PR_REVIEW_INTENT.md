# Intent: Evidence-backed PR review

Status: proposed · Owner: Travis Felder · Pilot repo: modelrudder · Last updated: 2026-10-28

## Why

Agents write a growing share of the code here, and they open PRs faster than people can read them carefully. The gap that matters most is evidence: a PR can say "tests pass" when nothing was run, and a review can call a bug confirmed when it was only reasoned about. Today nothing separates what was checked from what was claimed.

## Intent

Fewer defects reach a release, without slowing everyday changes.

- Every PR says why it exists, shows proof that it works, and states its risk.
- Review effort follows risk: low-risk changes move fast, high-risk changes get a person who knows that code.
- Every claim and finding is labelled with how it was checked.
- An agent's approval never counts as a person's.

## Standards

### A good PR

| Section | What it contains | Required |
|---|---|---|
| Why | The problem and why now | Always |
| What changed | The change, and what was deliberately left out | Always |
| Risk | Impact on security, data, compatibility, performance; one proposed tier | Always |
| Evidence | Commands actually run and their results, each labelled | Always |
| Rollback | How to undo it | Always |
| Review focus | The 1–3 files or decisions that need the closest look | Diffs over ~200 lines |

### Evidence labels

- **reproduced**: a test or run demonstrated it.
- **reasoned**: read from the code, not run. Needs a person to confirm before it blocks a merge.
- **unverified**: not checked.

A reasoned claim is never described as confirmed.

### Risk tiers

The change sets the tier, not the author.

| Tier | Touches | Human approvals |
|---|---|---|
| high | Auth, secrets, data migrations, infra/CI, public API or protocol contracts | 2 |
| medium | Runtime behavior, including concurrency and flow control, covered by tests | 1 |
| low | Docs, tests, refactors with no behavior change | 0 once checks pass |

During the pilot every PR needs one human approval, whatever its tier, until we know how accurate automated review is.

### A good review

The reviewer checks the author's claims independently across correctness, security, reliability, tests, evidence, design and operations. The tier decides how deep to go.

Every finding states:

1. **Location**: file and line.
2. **Defect**: what is wrong, in one sentence.
3. **Impact**: a concrete scenario where it breaks.
4. **Evidence**: reproduced, reasoned or unverified.
5. **Severity**: blocking, important, nit or pre-existing.

The review ends in one decision: approve, request changes (blocking findings only, listed), or comment. Re-reviews look at the new diff only and never repeat a finding. After three rounds the author steps back and rethinks the approach.

## Mechanisms

| What | File | Enforces |
|---|---|---|
| PR template | `.github/pull_request_template.md` | The sections above, for every PR |
| `ship-check` skill | `.claude/skills/ship-check/SKILL.md` | GO / NO-GO before a PR: clean tree, typecheck, tests, review, rollback, tier |
| `pr-create` skill | `.claude/skills/pr-create/SKILL.md` | Writes the PR body from ship-check's evidence |
| PR gate hook | `.claude/hooks/pr_gate.sh` | Claude Code sessions can't run `gh pr create` without a GO for HEAD and a valid body |
| PR body check | `.github/workflows/pr-body.yml`, `.github/scripts/check-pr-body.sh` | Every PR, however opened. Becomes a required check on `main` |

The local hook is fast feedback. The required GitHub check is the real gate.

## Non-goals

- **More AI comments.** We count findings that turn out to be real, not findings posted.
- **Replacing human approval.** Agents add evidence; people approve.
- **One reviewer agent per concern.** The template and ship-check cover those dimensions.
- **Rollout to other repos** before the pilot numbers hold up.

## How we'll know

Baseline: the 90 days before the pilot. Compare after 60 days.

| Metric | Target | Measured by |
|---|---|---|
| Escaped defects | Down | Reverts and fix-forward commits in `git log` |
| Verified finding rate | Up | Findings fixed rather than dismissed |
| False-positive rate | Down | Findings dismissed as wrong |
| Review rounds to pass | 1–3 | Review runs per merged PR |
| Incident catch rate | Up | Past bad PRs the reviewer flags when replayed |

## Open questions

- With few reviewers on this repo, what replaces a second human approval on high-risk changes?
- Who sets the tier label when author and reviewer disagree?
- Managed Code Review, `claude-code-action`, or our own workflow for automated review?
- Who owns the incident replay set?

## Decision log

| Date | Decision |
|---|---|
| 2026-10-28 | Pilot on modelrudder. Template, ship-check, pr-create, local gate and PR body check proposed in one PR. |

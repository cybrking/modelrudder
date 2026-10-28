---
name: pr-create
description: Use when opening a pull request, running gh pr create, or asked to "open/raise/submit a PR". Produces a PR that meets the team's good-PR standard before it is created.
---

1. Read the diff against the base branch (`git diff <base>...HEAD`) and the commit messages.
2. Run the ship-check skill. Stop on NO-GO; on GO, reuse its evidence lines below.
3. Propose a risk tier from what the change touches. The change sets the tier, not the author.
   - high: auth, secrets, data migrations, infra/CI, public API or protocol contracts.
   - medium: runtime behavior changes, including concurrency and flow control, covered by tests.
   - low: docs, tests, or refactors with no behavior change.
   If you argue for a different tier, say why in the Risk section.
4. Write the body to `"$(git rev-parse --absolute-git-dir)/PR_BODY.md"` (works in worktrees, where `.git` is a file) using `.github/pull_request_template.md`:
   Why · What changed · Risk · Evidence · Rollback · Review focus.
   Label every evidence line reproduced / reasoned / unverified. Never call a reasoned claim confirmed.
5. If a section can't be filled honestly, stop and ask instead of padding it.
6. `gh pr create --title "<imperative, <70 chars>" --body-file "$(git rev-parse --absolute-git-dir)/PR_BODY.md"`

---
name: ship-check
description: Use before shipping — before opening a PR, running /ship or /pr-create, or when asked "is this ready to ship?". Gives a GO / NO-GO verdict for the current branch and records it so the PR gate lets a GO through.
---

Run every step; don't stop at the first failure. Report all of them.

1. **Clean tree.** `git status --porcelain` must be empty. Uncommitted work is NO-GO: it isn't what will ship.
2. **Base.** Find the base (`main` unless told otherwise), `git fetch origin`, and note how far behind `origin/<base>` the branch is.
3. **Checks.** Run `npm run typecheck` and `npm test`. Record pass/fail counts. A failure that also fails on `origin/<base>` is pre-existing: note it, don't block on it.
4. **Review.** Review `git diff origin/<base>...HEAD` with fresh eyes (a subagent with no prior context, if available). Report each finding as:
   location · defect · impact · evidence (reproduced / reasoned / unverified) · severity (blocking / important / nit / pre-existing).
   Only real defects. No style nits unless they hide a bug.
5. **Rollback.** Can the change be reverted on its own? Flag migrations, config or state written in a new format, and published release artifacts.
6. **Risk tier.** Propose one using the rules in `.claude/skills/pr-create/SKILL.md` step 3.

**Verdict.** NO-GO if the tree is dirty, a new check fails, or any finding is blocking. Otherwise GO.

On GO, record it for the current commit:
```bash
d="$(git rev-parse --absolute-git-dir)/ship-check"; mkdir -p "$d"; echo GO > "$d/$(git rev-parse HEAD)"
```
Any new commit needs a new ship-check.

Report: verdict first, then one line per step, then findings. Carry the evidence lines straight into the PR body's Evidence section.

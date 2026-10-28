#!/bin/bash
# Blocks gh pr create until ship-check has passed for HEAD and the body passes check-pr-body.sh.
# ponytail: local nudge only; the required GitHub check is the real gate.
cmd=$(jq -r '.tool_input.command // ""')
[[ "$cmd" != *"gh pr create"* ]] && exit 0
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
stamp="$(git -C "$root" rev-parse --absolute-git-dir)/ship-check/$(git -C "$root" rev-parse HEAD)"
[[ -f "$stamp" ]] || { echo "No GO from ship-check for this commit. Run the ship-check skill first." >&2; exit 2; }
body=$(grep -oE -- '--body-file[= ]+[^ ]+' <<<"$cmd" | awk '{print $NF}' | sed 's/^--body-file=//')
[[ -n "$body" && -f "$body" ]] || { echo "Use the pr-create skill: write the body to a file and pass --body-file." >&2; exit 2; }
"$root/.github/scripts/check-pr-body.sh" "$body" >&2 || { echo "Fix the PR body, then retry (pr-create skill)." >&2; exit 2; }

#!/bin/bash
# Blocks gh pr create until ship-check has passed for HEAD and the body passes check-pr-body.sh.
# ponytail: local nudge only; the required GitHub check is the real gate.
input=$(cat)
cmd=$(jq -r '.tool_input.command // ""' <<<"$input" 2>/dev/null) || cmd=$(sed -E 's/.*"command": *"//' <<<"$input")  # no jq: strip the JSON prefix
grep -qE '(^|[;&|(]|&&)[[:space:]]*gh[[:space:]]+pr[[:space:]]+create' <<<"$cmd" || exit 0
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
stamp="$(git -C "$root" rev-parse --absolute-git-dir)/ship-check/$(git -C "$root" rev-parse HEAD)"
[[ -f "$stamp" ]] || { echo "No GO from ship-check for this commit. Run the ship-check skill first." >&2; exit 2; }
body=$(grep -oE -- '--body-file[= ]+[^ ]+' <<<"$cmd" | awk '{print $NF}' | sed -E 's/^--body-file=//; s/^["'\'']//; s/["'\'']$//')
[[ -n "$body" && -f "$body" ]] || { echo "Pass --body-file with a literal absolute path (no \$(...)), written by the pr-create skill." >&2; exit 2; }
"$root/.github/scripts/check-pr-body.sh" "$body" >&2 || { echo "Fix the PR body, then retry (pr-create skill)." >&2; exit 2; }

#!/bin/bash
# Blocks gh pr create unless the body file has the required sections.
cmd=$(jq -r '.tool_input.command // ""')
[[ "$cmd" != *"gh pr create"* ]] && exit 0
body=$(grep -oE -- '--body-file[= ]+[^ ]+' <<<"$cmd" | awk '{print $NF}' | sed 's/^--body-file=//')
[[ -z "$body" || ! -f "$body" ]] && { echo "Use the pr-create skill: write the body to a file and pass --body-file." >&2; exit 2; }
for h in "## Why" "## Risk" "## Evidence" "## Rollback"; do
  grep -q "^$h" "$body" || { echo "PR body missing '$h'. Follow the pr-create skill." >&2; exit 2; }
done

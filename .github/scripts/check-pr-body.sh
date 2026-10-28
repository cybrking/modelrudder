#!/bin/bash
# Usage: check-pr-body.sh <body-file>. Fails if required sections are missing, empty, or left as template text.
body=$(tr -d '\r' < "$1")
missing=()
for h in Why Risk Evidence Rollback; do
  content=$(awk -v h="## $h" '$0==h{f=1;next} /^## /{f=0} f' <<<"$body" \
    | grep -vE '^\s*$|^Proposed tier: low / medium / high|^- \[reproduced\|reasoned\|unverified\] claim')
  [[ -n "$content" ]] || missing+=("## $h")
done
tier=$(grep -iE 'tier:' <<<"$body" | head -1)
grep -qiE 'tier:[[:space:]]*[*]*(low|medium|high)' <<<"$tier" && ! grep -qiE '(low|medium|high)[*]*[[:space:]]*/' <<<"$tier" \
  || missing+=("a single risk tier (low, medium or high)")
if ((${#missing[@]})); then
  printf '::error::PR body needs: %s\n' "${missing[@]}"
  exit 1
fi
echo "PR body OK"

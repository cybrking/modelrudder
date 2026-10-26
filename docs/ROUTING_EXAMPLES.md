# Recommendation examples

These explicit commands submit only the quoted task to Jev and can consume classifier usage. They do not execute a native coding task or switch models. Complete [Jev setup](CLASSIFIER_CHOICES.md), substitute your actual current model and run only when you want advice.

## Claude Code

```sh
smart-claude recommend --current-model sonnet -- "Extract the three email addresses: Alice alice@example.com, Bob bob@example.org, Carol carol@example.net."
smart-claude recommend --current-model haiku -- "Write a TypeScript grouping function with tests for empty input, repeated keys and missing keys."
smart-claude recommend --current-model sonnet -- "Review a distributed payment system with retries, out-of-order webhooks, worker crashes and racing refunds. Propose consistency invariants, failure tests and a staged migration."
```

The rubric targets Haiku for simple extraction, Sonnet for bounded coding and Opus for demanding ambiguous work. These are examples of intent, not guaranteed classifier choices.

## Codex

```sh
smart-codex recommend --current-model gpt-6.1-sol -- "Extract the three email addresses: Alice alice@example.com, Bob bob@example.org, Carol carol@example.net."
smart-codex recommend --current-model gpt-6-luna -- "Debug a TypeScript async queue that duplicates work when completions arrive out of order and stops on rejection. Explain a fix and deterministic concurrency tests."
smart-codex recommend --current-model gpt-6.1-sol -- "Review a distributed payment system with retries, out-of-order webhooks, worker crashes and racing refunds. Propose consistency invariants, failure tests and a staged migration."
```

The existing profiles map FAST/BALANCED to Luna, DEEP to Sol and MAX to Astra. Suggestions do not apply profile effort settings.

A match produces no note. Disabled classification, timeout or unavailable/invalid results also produce no note. The command does not claim your current model is sufficient merely because it is silent. If advice is useful, switch manually through native `/model`. Codex automatic hook notes follow the same recommendation logic; see [limits](ADVISORY.md).

# Routing examples

These examples submit real tasks and consume native provider and Jev usage. Run them yourself after completing [setup](AGENT_INSTALL.md).

## Three routing tests for Claude Code

Start a fresh chat with `smart-claude --routing auto` after enabling Jev. Paste each prompt as a separate message and wait for its answer before sending the next. Use plain text without attachments, file references or slash commands.

1. **Claude Haiku 5.5 — small extraction**

   ```text
   Extract the three email addresses from this text and return only the addresses, one per line: Alice: alice@example.com. Bob: bob@example.org. Carol: carol@example.net.
   ```

2. **Claude Sonnet 5.5 — bounded coding**

   ```text
   Write a TypeScript function that groups an array of objects by a supplied key. Preserve item order within each group. Include tests for empty input, repeated keys, and missing keys. Explain your handling of missing keys. Reply with code; do not modify files.
   ```

3. **Claude Opus 5.5 — complex architecture**

   ```text
   Review a distributed payment system where API requests can be retried, webhooks arrive out of order, workers can crash after charging but before saving results, and refunds race with settlement. Design the transaction state machine, idempotency strategy, database constraints, reconciliation process, and failure tests. Explain consistency tradeoffs and propose a staged implementation plan.
   ```

## Three routing tests for Codex

Start a fresh chat with `smart-codex --routing auto --effort-mode auto` after enabling Jev. Send these as separate messages, waiting for each answer. Use the same plain-text conditions as the Claude tests.

1. **GPT-6 Luna — small extraction (FAST)**

   ```text
   Extract the three email addresses from this text and return only the addresses, one per line: Alice: alice@example.com. Bob: bob@example.org. Carol: carol@example.net.
   ```

2. **GPT-6.1 Sol — complex debugging (DEEP)**

   ```text
   Debug this bounded TypeScript async queue. It must run at most two jobs concurrently, process each item once, and continue after a rejected job. Current implementation: const pending: Array<() => Promise<void>> = []; let active = 0; function drain() { while (active < 2 && pending.length) { const job = pending[0]!; active++; job().then(() => { pending.shift(); active--; drain(); }); } } Analyze interleavings for two completions in reverse order and one rejection. Provide a corrected implementation and deterministic tests using deferred promises to verify concurrency, exactly-once processing, rejection recovery, and eventual draining. Explain why each test catches the original failure. Reply with code; do not modify files.
   ```

3. **GPT-6 Astra — complex architecture (MAX)**

   ```text
   Review a distributed payment system where API requests can be retried, webhooks arrive out of order, workers can crash after charging but before saving results, and refunds race with settlement. Design the transaction state machine, idempotency strategy, database constraints, reconciliation process, and failure tests. Explain consistency tradeoffs and propose a staged implementation plan.
   ```

These are target routes, not guaranteed choices. The classifier evaluates each eligible turn with recent task excerpts; Codex uses valid choices without a confidence gate, while Claude retains its separate confidence gate. Invalid or unavailable classification and context eligibility can keep the fallback. Codex FAST and BALANCED both use Luna, so four profiles produce three model families. Inspect Claude's routing notice or [Codex's session monitor](COMMANDS.md#reports) for the chosen model. Configured model overrides can change the versions shown.

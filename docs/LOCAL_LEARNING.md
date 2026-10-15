# Local Codex learning capture

This optional experiment collects review candidates from your own usage. It does not change model selection, upload feedback, or train a model. Claude capture is not implemented; the existing local training rubric is Codex-specific.

Set `SMART_CODEX_LEARNING_DIR` to a private directory before launching this source version of `smart-codex`. Unset it to disable capture. Startup and exit messages report capture status. The feature is off by default.

Each file is named for a routing decision and contains the current user task, up to two bounded previous user tasks, a random local session ID, the requested route and effort, classifier/policy provenance, and the capture timestamp. These files contain task text and may contain anything pasted into that text. They omit assistant output, tool results, native thread IDs, and separate attachment contents. They are private local files, not anonymized records.

The route is a request, not verified executor identity or proof of success. A started turn may fail or be canceled later. Resumed or nontext context is marked opaque; previous-task excerpts are not full conversation context. Rewrite approved examples into self-contained tasks before training. Do not label a task successful from capture alone.

Capture uses a separate directory and never adds task text to ordinary usage reports. It refuses unsafe directories and existing capture filenames. Failure is nonfatal and is reported in the exit summary. At exit, capture has a two-second grace period to finish; remaining permission checks are canceled and queued examples are dropped rather than delaying terminal shutdown. The summary reports incomplete capture as a failure, without exposing task text.

Existing `smart-codex outcome --result accepted|rejected --decision UUID` can record feedback for the latest decision; `--decision` guards against accidentally labeling a newer turn. This remains user-reported evidence. For earlier decisions, retain the ID and review the corresponding captured task explicitly.

Keep related sessions/task families in one dataset split. Review a representative sample of successful tasks as well as failures. Freeze expected routes before a training comparison, and evaluate a candidate against the retained adapter before adopting it.

Local capture does not change the normal provider flow: auto/observe still call the configured Jev classifier and Codex still uses its provider. It means the additional learning records are local; it does not make inference offline.


# Managed native CLI versions

Starting in preview.9, ModelRudder launches its own selected Codex or Claude Code installation. Updating plain `codex` or `claude` on PATH does not replace that installation. Both fresh installs and upgrades from preview.8 or earlier need one setup step for each launcher used:

```sh
smart-codex native install
smart-codex native status
smart-codex doctor

smart-claude native install
smart-claude native status
smart-claude doctor
```

Use only the commands for the provider you need. `native install` needs npm and network access to download the fixed official package (`@openai/codex` or `@anthropic-ai/claude-code`) into private ModelRudder state. It does not replace a global CLI, copy API credentials, change login or submit a real provider task. Claude's managed child has native auto-updates disabled. Native login and account eligibility still belong to the provider; doctor reports missing prerequisites separately from installation success.

## Selection and verification

`native install` without a version selects the latest recorded version shipped in the installed router, even if an older managed version was previously selected. The current source candidate records Codex **0.162.1** and Claude Code **2.1.300**. Check `src/cli-compatibility-data.ts` at the installed release's tag for its defaults, evidence history, minimums and explicit known-broken blocks; source documentation does not change an installed release's policy.

An explicit stable candidate at or above the minimum within the supported major can be evaluated with `native install VERSION`. It is downloaded into separate temporary state, checked with the actual native protocol/plugin probes and selected only after success. Unsupported majors, prereleases/modified versions, too-old builds and known broken builds are rejected before download. Unrecorded selected candidates also need a fresh probe at launch; local success does not record cross-platform release qualification. See [managed upstream updates](UPSTREAM_UPDATES.md). To select a recorded version:

```sh
smart-codex native install 0.162.1
smart-claude native install 2.1.300
```

Before selecting a candidate, ModelRudder checks its reported version and runs the shipped native smoke checks. Codex initializes stdio and creates a fresh read-only thread without submitting a turn. Claude runs plugin fixtures and synthetic provider-wire checks with fake credentials. Selection changes only after these pass; failure leaves the current selection intact. Repeating installation for an installed version reuses its package and checks it again.

These checks verify a limited protocol/adapter contract. They do not establish complete interactive approvals, interruption, resume, authenticated terminal behavior or task quality. Community client CI exercises managed installation, status and repeat installation on Node 24/26 and macOS/Linux/Windows; consult the actual release run for results. The [daily upstream workflow](UPSTREAM_UPDATES.md) produces candidate evidence for a reviewed release and never automatically selects a new native version.

## Upgrade and rollback

Stop active ModelRudder sessions before switching versions and start fresh sessions afterward. A running session retains its existing executable. Upgrading ModelRudder's runtime preserves native state; selecting a different native version is a separate command.

After reviewing and installing a ModelRudder release that records the desired upstream version, run `native install VERSION` explicitly. A successful switch retains the previous selected version. To return to it:

```sh
smart-codex native rollback
smart-codex native status
# Or:
smart-claude native rollback
smart-claude native status
```

Rollback checks the retained version before selecting it. If no previous version exists, it reports that instead of guessing. Native rollback is separate from [ModelRudder runtime rollback](UPGRADE.md#roll-back); retaining a native package does not retain every historical adapter. A runtime downgrade may require a native version accepted by that older release.

## State and recovery

Managed installations and selection metadata live under `SMART_CODEX_STATE_DIR/native/<provider>`, where the provider is `codex` or `claude`. The shared `SMART_CODEX_STATE_DIR` name applies to both launchers. Installed launchers default it to `<runtime-root>/state`: normally `~/.local/share/smart-codex/state` on macOS/Linux or `%LOCALAPPDATA%\ModelRudder\runtime\state` on Windows. Source commands use these same default state paths. Use the same state directory for installation and launch, especially with custom runtime paths or a source checkout. `native status` reports the selected and previous versions without reading provider credentials.

If launch or doctor reports a missing/invalid managed pin, run the matching `native status`, then `native install VERSION` with a recorded version. A blocked or unsupported version needs policy/adapter review; a candidate that fails its native checks cannot replace the working selection. Do not edit selection metadata or broaden compatibility lists locally to bypass these checks. Plain provider CLIs remain available independently.

Native login continues to use the separately installed official `codex login` or `claude auth login` flow. If the plain provider CLI is absent, install it using the provider’s official instructions; its version can update independently of the managed routing installation.

The npm download disables general lifecycle scripts. For Claude, ModelRudder explicitly runs the verified package’s `install.cjs` to prepare its bundled platform binary, then runs the native checks.

If an existing version directory is damaged, `native install` preserves it and reports its exact location. Use `native rollback` when a previous working version exists. Otherwise stop ModelRudder sessions, move that specific damaged directory aside, and rerun `native install VERSION`. Keep the moved directory until the replacement passes checks.

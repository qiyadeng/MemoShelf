# CLI

## What This Is

CLI v1 gives SnipForge a terminal-native path for library-backed commands. It reads command JSON files directly from a SnipForge library folder, supports search/list flows, and can copy a selected command to the system clipboard without launching the Electron app.

**GitHub Issue:** #31

## Scope

- Read manifest + command JSON files from a local SnipForge library folder
- Support terminal `list`, `search`, and `copy` flows
- Keep runtime independent from Electron
- Refuse copy for commands that still require variable substitution

## Non-goals

- Executing commands from the CLI
- Full parity with the desktop variable modal
- Using SQLite as the CLI source of truth
- Cross-library discovery in v1

## Plan

- [x] Add a small Node CLI entrypoint with `list`, `search`, and `copy`
- [x] Default to the current working directory when it contains a SnipForge library, with `--library` override support
- [x] Reuse SnipForge command-file semantics for parsing and filtering
- [x] Add regression coverage for command loading, search ranking, and copy guardrails
- [x] Document usage and current limitations

## Usage Shape

```bash
node bin/snipforge.mjs list
node bin/snipforge.mjs search kubectl
node bin/snipforge.mjs copy kubectl rollout
node bin/snipforge.mjs copy --id 11111111-1111-4111-8111-111111111111
node bin/snipforge.mjs search docker --library ~/commands/the-armory
```

The package also exposes `pnpm cli -- ...` in local development.

## Current Behavior

- `list` prints the current library contents with rank, short id, tags, and description
- `search` uses fuzzy matching over title, tags, description, and body
- `copy` copies the best search match, or an exact command `id` when `--id` is supplied
- `copy` rejects commands containing `{{variables}}` because v1 intentionally avoids desktop-style substitution flows
- The CLI only reads one explicit local library root in v1

## Open Questions

- Whether v2 should support shell completion and interactive selection
- Whether the CLI should eventually search multiple configured libraries instead of a single explicit root

## Dev Log

| Date | What |
|------|------|
| 2026-04-11 | Planned CLI v1 around direct library-file reads, terminal search/list flows, and clipboard copy for non-variable commands |
| 2026-04-11 | Implemented `bin/snipforge.mjs` with `list`, `search`, and `copy`, added `pnpm cli -- ...`, and covered library loading + copy guardrails in tests |

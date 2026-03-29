# Save to SnipForge — CLI Skill

## What This Is

A Claude Code skill that lets AI agents and humans save and search command snippets via the terminal, without leaving their workflow. The skill talks directly to SnipForge's file-based library format — Claude writes JSON files that the Electron app syncs on next load.

**GitHub Issue:** TBD

## Why

The desktop palette workflow (open app → search → copy) doesn't fit AI-agent-driven coding. When Claude uses or suggests a command during a session, the user wants to say "save that to SnipForge" and have it persisted — no context switch, no manual entry.

Secondary: search the library from the terminal. Filter by tag to find project-specific commands. Useful for both Claude (search before going to the web) and humans (browsing via the app, but quick lookups via the skill).

## Architecture Decisions

### Skill, not CLI
A Claude Code skill writes JSON files directly to a local library folder. No HTTP server, no IPC, no binary. The Electron app already syncs local library folders — this is just another writer.

**Why not a CLI binary?**
- The primary use case is "Claude, save that command" — a skill handles this natively
- A CLI requires an HTTP server in Electron, port discovery, arg parsing — heavy for what we need
- Shell autocomplete (the one thing a CLI does better for search) can be added later independently

### Direct Write, not script
Claude writes command JSON files directly via the Write tool. No save-command.sh script.

**Why:**
- Write tool handles content as-is — no shell escaping issues (the content never touches a shell)
- ~100 tokens per save, which is negligible
- Zero dependencies beyond what Claude already has
- Claude already wrote 50+ command files for The Armory this way

### Init script for library setup
A bash script creates the library folder + `.snipforge.json` manifest. This IS a script because it's a fixed, deterministic operation — same manifest structure every time, and it's cleaner than having Claude write boilerplate.

### Dual-write: files + DB awareness
Commands are saved as JSON files in the library folder. The Electron app picks them up via its existing local library sync. No direct SQLite writes from outside the app — the Electron process owns the DB.

Future: if we add a file watcher to Electron's local library system, saves will appear in the app immediately without manual sync.

### Per-project libraries
Default library location is a dedicated folder in/under CWD — like opening a vault in Obsidian. Each project accumulates its own commands. Search scopes to the current project's libraries by default.

## Skill Definition

**Name:** `save-to-snipforge`
**Location:** `~/.claude/skills/save-to-snipforge/`
**Invocation:** `/save-to-snipforge`, or natural language ("save that to snipforge", "add this command to snipforge")

### Capabilities

1. **Save a command** — write a JSON file to the library
2. **Search commands** — Grep/Glob across library JSON files, filter by tag/title
3. **Init a library** — create a dedicated folder with `.snipforge.json` manifest (first-time setup)

### File Structure

```
~/.claude/skills/save-to-snipforge/
├── SKILL.md              # Skill definition + instructions
└── scripts/
    └── init-library.sh   # Creates library folder + manifest
```

## File Formats

### Library manifest (`.snipforge.json`)
```json
{
  "snipforge": "library",
  "name": "Library Name",
  "description": "Description",
  "format_version": "1.0"
}
```

### Command file (`slugified-title.json`)
```json
{
  "snipforge": "command",
  "title": "OpenSSL: Create Random Token",
  "body": "openssl rand -base64 {{bytes}}",
  "description": "Generate a random base64-encoded token",
  "tags": ["openssl", "security", "token"],
  "language": "bash",
  "created_at": "2026-03-29T12:00:00.000Z",
  "updated_at": "2026-03-29T12:00:00.000Z"
}
```

### Filename convention
Slugified from title: lowercase, non-alphanumeric replaced with hyphens, collapsed.
- "OpenSSL: Create Token" → `openssl-create-token.json`
- "Curl: Basic authentication" → `curl-basic-authentication.json`

Same logic as `local-library.ts:slugify()` and the existing Armory files.

## Flows

### First time in a project (setup)

```
User: "save this kubectl command to snipforge"
  ↓
Skill triggers, checks CWD for .snipforge.json (Glob)
  ↓
Not found → ask user for library name and location
  Default: dedicated folder in CWD (e.g., ./snipforge-commands/)
  ↓
Run init-library.sh <path> <name> [description]
  ↓
Save the command to the new library
```

### Subsequent saves

```
User: "save that to snipforge"
  ↓
Skill triggers, finds library via Glob for .snipforge.json
  ↓
If multiple libraries found → ask which one
  ↓
Write command JSON file via Write tool
  ↓
Confirm: "Saved 'OpenSSL: Create Token' to <library>"
```

### Search

```
User: "search snipforge for docker commands"
  ↓
Skill triggers, finds library folders via Glob
  ↓
Grep for search term across JSON files in library
  Filter by tag: grep for "docker" in tags arrays
  ↓
Present top results with title + description
  ↓
User picks one → Claude reads and presents the body
```

## Init Script

`scripts/init-library.sh <path> <name> [description]`

- Creates the directory at `<path>` if it doesn't exist
- Writes `.snipforge.json` manifest with name, description, format_version
- Prints confirmation message
- Exits with error if manifest already exists (don't overwrite)

## Future Considerations

- **File watcher in Electron** — DONE. `fs.watch` per local library, 2s debounce, per-file sync using existing DB functions. Renderer auto-reloads via `commands:changed` IPC event.
- **CLI binary** — if search-with-tab-autocomplete becomes a need, build `snip` as a thin CLI that reads the same JSON files
- **Remote library rework** — the file-first approach this skill uses aligns with the planned remote library simplification (files as source of truth, DB as cache)
- **Cross-project search** — a global config listing all library paths, so search can span projects

## Dev Log

| Date | What |
|------|------|
| 2026-03-29 | Initial design — skill approach chosen over CLI after analysis |
| 2026-03-29 | File watcher implemented — fs.watch + debounce + per-file sync + renderer notification |

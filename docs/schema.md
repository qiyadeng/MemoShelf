# Database Schema

Single source of truth for the SnipForge data model. When a feature adds or modifies columns/tables, update this file in the same commit.

**Engine:** SQLite via better-sqlite3 (synchronous, WAL mode)
**Location:** `{userData}/snipforge.db` (Electron's `app.getPath('userData')`)
**Implementation:** `electron/main/database.ts`
**Types:** `shared/types.ts`

---

## Tables

### commands

The core table. Every snippet — local or remote — is a row here.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER | PK, auto | |
| `title` | TEXT | NOT NULL | Command name shown in the list |
| `body` | TEXT | NOT NULL | The command/snippet content |
| `description` | TEXT | `''` | Optional description, supports markdown |
| `tags` | TEXT | `'[]'` | JSON array of strings |
| `language` | TEXT | `'plaintext'` | Editor type: `plaintext`, `richtext`, `markdown`, or a code language (`javascript`, `python`, `bash`, etc.) |
| `source` | TEXT | `'local'` | `'local'` (user's own) or `'remote'` (from a library) |
| `library_id` | INTEGER | NULL | FK → `libraries.id` (ON DELETE CASCADE). Set for remote commands, NULL for local. |
| `remote_path` | TEXT | NULL | Filename in the repo (e.g., `get-pods.json`). Used by sync to detect updates/deletions. |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |
| `updated_at` | TEXT | NOT NULL | ISO 8601 timestamp |

**Indices:**
- `idx_commands_title` — on `title`
- `idx_commands_updated_at` — on `updated_at DESC`
- `idx_commands_library_id` — on `library_id`
- `idx_commands_source` — on `source`

**Behaviors:**
- Editing a command always sets `source = 'local'`, `library_id = NULL`, `remote_path = NULL` (detach-on-edit — "you touched it, it's yours now").
- Deleting a library cascades: all commands with that `library_id` are removed.

### libraries

Tracks remote library subscriptions.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `id` | INTEGER | PK, auto | |
| `github_repo` | TEXT | NOT NULL, UNIQUE | Repo identifier, e.g., `ArtluxDM/k8s-commands` |
| `name` | TEXT | NOT NULL | Display name from the manifest |
| `description` | TEXT | `''` | From the manifest |
| `manifest_path` | TEXT | NULL | Path to `.snipforge.json` in the repo (NULL = not initialized) |
| `last_synced_at` | TEXT | NULL | ISO 8601 timestamp of last successful sync |
| `last_synced_sha` | TEXT | NULL | Git commit SHA for change detection (skip sync if unchanged) |
| `created_at` | TEXT | NOT NULL | ISO 8601 timestamp |

### auth

Encrypted token storage. Tokens are encrypted via Electron's `safeStorage` API before writing.

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `key` | TEXT | PK | Token identifier (e.g., `github_token`) |
| `value` | TEXT | NOT NULL | Encrypted token value |

---

## Migrations

Migrations are inline in `database.ts:initializeDatabase()`. Each uses a try/catch `ALTER TABLE` pattern — if the column already exists, the error is silently caught. This is safe because SQLite's `ALTER TABLE ADD COLUMN` is idempotent in effect (fails if exists, no partial state).

**Migration history:**
1. `description` column on `commands` (v1 → v2)
2. `language` column on `commands` (v2 → v3)
3. `source`, `library_id`, `remote_path` columns on `commands` + `libraries` table + `auth` table (v3 → v4, Phase 1 Remote Libraries)
4. `manifest_path` column on `libraries` (v4 → v5, Phase 3 Publishing)

When adding new columns, follow the same pattern: `ALTER TABLE ... ADD COLUMN` wrapped in try/catch, placed after the existing migrations in `initializeDatabase()`.

---

## TypeScript Types

All types live in `shared/types.ts` and are shared between Main and Renderer processes.

| Type | Used for |
|------|----------|
| `Command` | Full command row from DB |
| `CommandWithTags` | Command with pre-parsed `tagsArray` and `tagsNormalized` (renderer only) |
| `CommandSource` | `'local' \| 'remote'` |
| `Library` | Library subscription row |
| `RemoteCommand` | Command as parsed from a repo JSON file (before DB insertion) |
| `LibraryManifest` | `.snipforge.json` manifest contents |
| `SyncResult` | Return value from sync operations: `{ added, updated, removed, errors }` |
| `GitHubUser` | GitHub user info from auth |
| `AuthStatus` | Auth state: `{ authenticated, user }` |
| `DeviceFlowResponse` | GitHub Device Flow initial response |

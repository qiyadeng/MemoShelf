# Database Health

Lightweight health checks for the SnipForge SQLite database. The goal is preventive maintenance — catch issues early and keep the DB lean, especially as remote library sync generates churn.

## Motivation

During Remote Libraries development, sync bugs left orphaned rows in the database (commands referencing deleted libraries, stale metadata). A manual VACUUM on a 1-command database reclaimed 89% of space (438KB → 48KB). As users subscribe to multiple large libraries, this churn will compound.

## Scope

<!-- Deepness: TBD — need to decide how much to automate vs. keep manual. Options range from a startup integrity check to a full background maintenance routine. -->

Light and non-intrusive. This is not a database management framework — it's a small set of checks that run at sensible times.

## DB Test Recovery

When `tests/database.test.ts` stops loading after a Node upgrade or ABI drift, rebuild the native module and rerun the DB suite:

```bash
pnpm test:db
```

That command rebuilds `better-sqlite3` against the current environment and then runs `tests/database.test.ts`.

## Checks

### 1. Integrity Check

`PRAGMA integrity_check` on startup. If it fails, surface a warning to the user.

### 2. Orphan Detection

Identify rows that shouldn't exist:

- **Orphaned commands** — `source='remote'` with `library_id` not in `libraries` table
- **Ghost libraries** — libraries with no commands and no valid `github_repo` / folder path
- **Dangling metadata** — `remote_path` set on local commands (should be NULL)

### 3. VACUUM

Reclaim space after bulk operations (unsubscribe, sync with many deletions). SQLite doesn't auto-reclaim — deleted rows leave empty pages.

### 4. Index Health

Verify expected indices exist. If a migration failed silently, queries degrade without obvious errors.

## Open Questions

- When should checks run? Startup only? After sync? On a schedule?
- Should orphans be auto-cleaned or flagged for user action?
- Is VACUUM worth running automatically? It locks the DB and rewrites the file — fine for small DBs, but could cause a pause on large ones.
- Should we expose any of this in the UI (e.g., a "Database" section in Settings)?

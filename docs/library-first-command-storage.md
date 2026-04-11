# Library-First Command Storage

Library-First Command Storage makes libraries the default way commands exist in SnipForge. Instead of storing canonical command data in SQLite and treating files/repos as import-export surfaces, command JSON files inside library folders become the source of truth. SQLite remains in the app, but only as cache/index plus app metadata.

## Active Notes

### Issue #25: harden sync bookkeeping for library-backed storage

Plan:
- treat no-op remote updates and removals as sync failures instead of silent success
- block SHA advancement whenever any add, update, or removal in the batch fails
- add regression coverage for stale-path update/remove cases so cache/index drift stays recoverable

Final notes:
- `electron/main/database.ts` now treats zero-row remote updates and removals as explicit sync failures instead of counting them as success
- library sync SHA advancement still happens only on clean batches, which now includes stale-path and no-op mutation cases
- regression coverage in `tests/database.test.ts` now proves stale update/remove paths return surfaced errors and preserve the previous sync SHA

## Why This Exists

The current architecture splits command truth across SQLite and file-based libraries. That creates friction in two places that matter:

- **Git versioning**. Commands should be versionable as plain files with meaningful diffs and history.
- **GitHub integration**. GitHub is file- and repo-native. Trying to reconcile GitHub state with a command database creates complexity that does not add product value.

The goal is not "remove SQLite." The goal is to make command content Git-native and filesystem-native, while keeping SQLite for the things it is actually good at: search/indexing, settings, auth, and lightweight app metadata.

## User Experience

### First Run

On first launch, if no default writable local library exists, SnipForge prompts the user to choose a folder for their commands.

That flow:

1. User picks a folder
2. SnipForge initializes it as a local library by creating `.snipforge.json`
3. That library becomes the default writable library
4. Optional onboarding commands are written as command JSON files into that folder

The app should not start in a "DB-only commands with optional libraries later" state anymore.

### Everyday Usage

- **New Command** writes a JSON file into the default writable library
- **Edit Command** updates the command file in its owning library
- **Delete Command** removes the command file from disk
- **Search** runs against the SQLite index/cache, which is rebuilt or updated from files
- **Library click** opens a library detail/management surface instead of treating command management as a global DB-only tab

### Remote Libraries

Remote libraries still exist, but they are not the default authoring surface.

- Local writable libraries are file-backed and editable
- Remote libraries are subscribed/read-only unless explicitly copied/forked into a writable local library

This keeps the mental model clean: all commands belong to libraries, but not all libraries are writable.

---

## Developer Reference

### Product Model

| Area | Choice | Why |
|------|--------|-----|
| Canonical command storage | Filesystem | Enables Git history, clean diffs, GitHub-native workflows |
| Command container | Library | Removes split between standalone local commands and libraries |
| Default authoring surface | One default writable local library | Keeps new-user setup and command creation simple |
| Remote libraries | Subscribed, read-only by default | Clean separation of ownership and permissions |
| SQLite role | Cache/index + app metadata | Keeps search fast without owning command truth |
| Conflict rule | Disk wins | External edits are expected; index/cache must be rebuildable |
| Command identity | Opaque UUID stored in JSON, not filename alone | Survives renames and title/file slug changes |
| UI organization | Commands managed per library | Aligns UI with the storage model |

### Scope Of This Feature

This feature changes where command truth lives and how the app thinks about commands.

In scope:

- first-run setup for a default writable local library
- command CRUD backed by files in libraries
- SQLite demotion from source of truth to cache/index
- migration path for existing DB-only local commands
- per-library command management UX
- issue breakdown for the roadmap

Out of scope for MVP:

- removing SQLite entirely
- advanced Git operations inside the app
- multi-writer merge/conflict resolution beyond "disk wins"
- collaborative editing semantics for subscribed remote libraries

### Target Architecture

#### Source Of Truth

Command content lives in files:

- `title`
- `body`
- `description`
- `tags`
- `language`
- timestamps
- stable command `id`

SQLite stores derived and app-level data:

- indexed/searchable command projections
- library registry and metadata
- auth tokens
- settings
- sync timestamps / app bookkeeping
- optional UI state

#### Storage Model

**Local writable library**
- folder on disk chosen by the user
- contains `.snipforge.json`
- contains command JSON files
- all create/edit/delete operations write to this folder

**Remote subscribed library**
- backed by GitHub repo contents
- read-only in the app by default
- commands are indexed locally for search and display
- editing a remote command duplicates it into the default writable local library first

#### Data Flow

```text
Filesystem / GitHub repo files
  -> parse + validate
  -> SQLite index/cache
  -> renderer search / list / detail views

Command CRUD in writable library
  -> write file
  -> refresh or incrementally update index/cache
  -> UI updates
```

#### Rebuildability

The cache/index must be disposable.

If SQLite is deleted, corrupted, or schema-migrated:

1. app scans known library locations
2. command JSON files are parsed again
3. SQLite index/cache is rebuilt
4. app continues without command loss

That property is a major reason to do this feature.

### Command Identity And Filenames

Do not use filename as the only command identifier.

Each command JSON should contain a stable `id`. Filenames can still be slug-derived from title, but identity should survive:

- title changes
- file renames
- slug normalization changes

Recommended MVP rules:

- generate `id` once at create time as a lowercase UUID string using `crypto.randomUUID()`
- never regenerate `id` on edit, rename, import, or sync
- create filename from slugified title
- on collision, suffix `-2`, `-3`, etc.
- on title edit, rename the file only if safe; identity stays the same either way

### External Edits

Users will edit command files outside the app. The architecture should assume this is normal.

Rules:

- file watchers or manual refresh detect changes
- changed files are reparsed and reindexed
- disk wins over cache
- invalid files should surface errors without corrupting the index

### UX Direction

The current global "Manage Commands" tab becomes misaligned once commands are library-scoped.

Target direction:

- library cards become the primary management entry point
- clicking a library opens a library detail modal/view
- that surface owns command listing, library metadata, sync state, and library-specific actions
- global "New Command" still exists, but creates into the default writable library

This preserves fast command creation without hiding the storage model.

### Key Files Likely To Change

| File | Why |
|------|-----|
| `electron/main/local-library.ts` | local library scan/init/watch/write logic becomes central |
| `electron/main/github.ts` | remote library handling must align with library-first model |
| `electron/main/database.ts` | command tables move from source-of-truth behavior to cache/index behavior |
| `electron/main/index.ts` | IPC surface changes for first-run setup, library CRUD, indexing |
| `electron/preload/index.ts` | expose new library-first command operations |
| `shared/types.ts` | command/library types need to reflect canonical file-backed identity |
| `src/App.vue` | command creation flow and library-aware behavior |
| `src/components/CommandModal.vue` | save/edit semantics change from DB CRUD to library file CRUD |
| `src/components/SettingsModal.vue` | first-run library selection, library cards, manage-flow changes |

---

## Roadmap

### Phase 1: Define The Library-First Model

Goal: lock the architecture and issue breakdown before code changes start.

Deliverables:

- this feature doc
- GitHub issue set aligned to the library-first model
- locked MVP decision on remote-command edit behavior
- locked MVP decision on stable command ID format

Verification:

- roadmap and issue list are specific enough that a later session can open them directly
- no issue assumes SQLite remains the command source of truth

### Phase 2: Default Writable Local Library On First Run

Goal: make the app start in a library-first state.

Deliverables:

- detect absence of a default writable local library
- first-run prompt to select a folder
- initialize `.snipforge.json`
- mark chosen library as default writable library
- optional onboarding command-file seeding

Verification:

- new install cannot end up in DB-only command mode
- user can create a first command without manually setting up libraries later

### Phase 3: File-Backed Command CRUD

Goal: command create/edit/delete uses files, not DB rows, as canonical writes.

Deliverables:

- add command writes JSON file into writable library
- edit command updates file content
- delete command removes file
- stable command ID introduced in file format
- filename collision strategy implemented

Verification:

- creating/editing/deleting commands changes files on disk
- app reload or reindex preserves those commands from files
- no command is lost if the cache DB is rebuilt

Issue #26 plan:

- introduce one shared normalization boundary for library-backed command writes
- use that boundary for local file writes, GitHub publish writes, and file/repo reindex payload shaping
- make serialized command JSON deterministic for normalized fields
- add regression tests for title/body trimming, tag normalization, default language fallback, and created-at preservation on updates

Issue #26 final notes:

- implemented a shared library-command formatter/parser used by both local-library and GitHub write paths
- local file creation, local export, GitHub publish, and reindex payload shaping now normalize title/body/description/tags/language through the same code path
- tag serialization is deterministic and lowercased/deduplicated before file or index writes
- regression coverage was added for the shared formatter and for local-library create/update normalization behavior

### Phase 4: SQLite Becomes Cache/Index

Goal: demote SQLite to derived storage.

Deliverables:

- clear separation between canonical file data and indexed DB data
- reindex flow from library files
- file watcher or manual refresh updates cache/index
- settings/auth metadata remains in SQLite

Verification:

- deleting or rebuilding the cache DB does not delete commands
- search results match filesystem state after reindex

### Phase 5: Migrate Existing DB-Only Commands

Goal: existing users do not lose data during the model shift.

Deliverables:

- detect DB-only local commands on upgrade
- prompt for default writable library if missing
- export local commands into command JSON files
- initialize manifest if needed
- mark migration complete

Verification:

- upgrade path preserves command content and metadata as well as practical
- migrated commands appear in the chosen local library as files

### Phase 6: Library-Centric Command Management UI

Goal: align the UI with library-backed storage.

Deliverables:

- manage commands moves off the generic settings tab model
- clicking a library card opens a library detail/management surface
- command actions become library-contextual
- global "New Command" targets the default writable library

Verification:

- user can understand which library owns each command
- common command creation/edit flows remain fast

### Phase 7: Follow-Up Hardening

Goal: fix bugs and cleanup that still matter under the new model.

Deliverables:

- sync bookkeeping treats no-op updates/removals as failures
- command normalization is centralized for all library-backed writes
- DB test workflow is restored for the parts of SQLite that remain

Verification:

- issue-level acceptance criteria pass
- DB is no longer the canonical command store, but cache/index correctness remains testable

---

## Issue Breakdown For Next Session

These are the issue candidates that should be opened from this plan.

### 1. Feature: Make A Local Library The Default Command Store On First Run

Scope:

- first-run setup flow
- choose folder
- initialize `.snipforge.json`
- store default writable library

Why:

- app must stop starting in DB-only command mode

### 2. Refactor: Make Filesystem-Backed Library Files The Source Of Truth For Command CRUD

Scope:

- create/edit/delete command files
- stable command IDs
- file naming/collision rules
- library-owned command operations

Why:

- this is the architectural center of the change

### 3. Feature: Migrate Existing DB-Only Local Commands Into The Default Local Library

Scope:

- upgrade flow
- export existing local commands to files
- manifest/bootstrap if needed

Why:

- avoids breaking existing users

### 4. Refactor: Convert Manage Commands Into A Per-Library Detail Surface

Scope:

- library-card click behavior
- per-library command management
- default-library-aware create flow

Why:

- current global manage-commands UX does not match library-backed ownership

### 5. Fix: Treat No-Op Library Sync Updates And Removals As Failures

Scope:

- sync result accounting
- SHA advancement rules
- stale path regression coverage

Why:

- this bug remains valid even after the architecture shift

### 6. Refactor: Centralize Command Normalization For Library-Backed Writes

Scope:

- title limits
- serialization/normalization rules
- one normalization boundary for file-backed command writes

Why:

- avoids inconsistent behavior across local and remote library flows

### 7. Chore: Make SQLite/Database Tests Runnable After Node ABI Changes

Scope:

- native module rebuild path
- docs/scripts for restoring testability

Why:

- DB still matters as cache/index and metadata storage, so its remaining behavior still needs reliable local test coverage

---

## Implementation Notes

### What This Doc Replaces

This doc changes the direction implied by the current remote-libraries model. Remote libraries remain important, but they are no longer the conceptual center of command storage.

The new center is:

- all commands belong to libraries
- writable local library is the default authoring model
- files are the canonical command representation
- SQLite is supporting infrastructure, not the owner of command content

### Migration Principle

Do not implement this as a dual-source-of-truth system. During rollout, temporary compatibility code may exist, but the architecture should always point toward one canonical command source: library files.

### Status

In progress.

Completed on branch work by April 11, 2026:

- Phase 2 baseline: first-run default writable local library setup, manifest bootstrap, stored default library preference
- Phase 3 baseline: local create/edit/delete now writes command JSON files when a writable local library exists, with DB fallback for legacy DB-only commands
- Phase 4 baseline: initialized local libraries are reindexed from disk on startup so SQLite is refreshed as a derived cache/index
- Phase 5 baseline: legacy DB-only local commands can be migrated into the default writable local library during startup
- Phase 7 DB test recovery: `pnpm test:db` rebuilds `better-sqlite3` and reruns the SQLite test suite

Still open after this session:

- Phase 4 full SQLite demotion from command source of truth to cache/index beyond startup/local-library rebuild behavior
- Phase 5 migration hardening beyond the current startup happy path
- Phase 6 per-library command management UX
- hardening around normalization and sync bookkeeping follow-up issues

### Implementation Notes

Implemented and verified on April 11, 2026:

- new first-run gate in `src/App.vue` blocks command authoring until a default writable local library exists
- `electron/main/local-library.ts` now owns default writable library resolution, manifest bootstrap, local file-backed CRUD, and legacy DB fallback
- command JSON files now include a stable lowercase UUID `id`; edits preserve the existing file `id`
- startup now migrates legacy DB-only commands into the default writable library when one exists, then reindexes initialized local libraries from disk
- `electron/main/index.ts` and `electron/preload/index.ts` expose dedicated library-first CRUD and setup IPC channels
- `src/components/SettingsModal.vue` exposes default writable library selection/change from Settings
- `docs/db-health.md` and `package.json` document and expose the DB recovery path via `pnpm test:db`

Verification run on April 11, 2026:

- `pnpm vue-tsc --noEmit`
- `pnpm vitest run tests/local-library.test.ts`
- `pnpm vitest run tests/database.test.ts`
- `pnpm test:db`

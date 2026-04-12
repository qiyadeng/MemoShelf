# Library Working Copies

Library Working Copies reframes SnipForge around one simple rule: every command lives in a local library folder, and some libraries may also have a Git remote origin. The app should treat commands as files in a working copy, not as separate "local" and "remote" command types.


## Active Notes

### Issue #48: library-level working tree status using system `git`

Plan:
- detect working-tree state at the library level by shelling out to system `git` instead of bundling a runtime
- expose a small backend summary on each library contract so the current library list can consume it later without adding the full Changes workflow yet
- make fallback explicit for both "git is not installed" and "this library is not inside a git work tree" so later UI work can message those states cleanly

Final notes:
- `shared/types.ts` now carries a library-level `working_tree` summary with explicit states for clean, dirty, not-a-repo, no-working-copy, git-unavailable, and unexpected command errors
- `electron/main/local-library.ts` shells out to system `git` for `rev-parse` and `status --porcelain`, scopes results to the library folder, and returns modified/new/deleted counts without bundling Git
- `library:getAll` now returns libraries enriched with working-tree status so the current library list has backend data ready for a later Changes UI without pulling #49 or #50 forward

## Why This Exists

The current mental model still leaks old architecture:

- command rows can show cloud-oriented actions even when the command is already in a local writable library
- editing a subscribed remote command creates identity ambiguity
- the UI mixes command CRUD with library distribution mechanics

That is too clever for what the product actually is. SnipForge should act like a library-focused file editor with search, copy, and optional Git workflows.

## User Model

### Core Rule

Every library is local-first.

- A library is always a folder on disk with `.snipforge.json`
- Commands are always files inside that folder
- Some libraries also have a Git origin
- Git-backed workflows belong to the library, not the command row

### Library Types

There are only two useful states:

1. **Local-only library**
   - Local folder on disk
   - Fully editable
   - No remote origin required

2. **Git-backed library**
   - Local working copy on disk
   - Fully editable
   - May have a remote Git origin
   - Changes can later be committed, pushed, or turned into a PR

The important simplification is that both are still libraries on disk. The difference is origin, not command behavior.

## Usage

### Local Library Flow

1. Init or open a library folder
2. Work with the library
3. Commands are created, edited, and deleted as files in that folder

### Git-Backed Library Flow

1. Fork or clone a library into a local working copy
2. Work with the library like any other library
3. If the library has changes, use the library-level **Changes** flow
4. If the user has owner/admin rights, allow commit and push
5. If the user is a consumer, allow commit and PR-oriented flow later

### Command Row UX

The main command list should only expose normal command actions:

- copy
- edit
- delete

Do not leak distribution mechanics into the command row.

That means:

- no cloud vs non-cloud iconography in the main list
- no publish/unpublish buttons on normal command rows
- no hidden detach-on-edit behavior

If a command is deleted from a Git-backed library, it should be deleted from the local working copy only. What happens with that deletion upstream is a separate library-level action.

## UX Direction

### Main View

The main view is command-focused, not Git-focused.

- Commands should look uniform regardless of origin
- Library identity can still appear as a badge or source label when useful
- That label should not change the action set

### Library Manage View

Library-level operations belong in the library management surface.

That surface should own:

- library metadata
- origin details
- sync/fetch/update actions
- change detection
- commit/push/PR actions

If the library has pending filesystem changes, show a **Changes** button or section. That is where Git-like controls should live.

### Delete Semantics

For now, keep delete simple:

- deleting a command removes it from the local working copy
- the app does not try to interpret that as an immediate remote deletion
- future upstream actions happen through the library-level Git flow

This is intentionally simpler than the previous remote-command model.

## Developer Reference

### Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Command model | Commands are files in a library working copy | Matches what the product actually stores |
| Library model | All libraries are local-first folders | Removes special-case command behavior |
| Origin handling | Origin is library metadata, not command identity | Keeps command UX simple |
| Main command actions | Copy, edit, delete only | Prevents command-row workflow clutter |
| Git workflows | Library-level only | Git concerns belong to the working copy, not the snippet row |
| Delete behavior | Delete locally first | Avoids hidden remote side effects |
| Default storage | Filesystem | Consistent with library-first storage |
| SQLite role | Cache/index + app metadata | Fast search without owning canonical content |
| Git dependency | Prefer system `git` first | Lower complexity than bundling Git |

### What Changes From The Current Model

This design intentionally pushes back on the older "subscribed remote command" mental model.

Replace:

- remote commands as a special read-only command class
- detach-on-edit behavior
- publish/unpublish row actions

With:

- libraries as working copies
- commands as normal files
- origin-aware workflows only at the library level

### Role Handling

GitHub role data is still useful, but only for deciding what library-level actions to offer.

Examples:

- owner/admin: commit + push
- consumer: commit locally, later PR flow

Those permissions should not change the main command row behavior.

### Open Questions

- Whether "subscribe" should become "clone" or "add working copy from GitHub" in the UI
- Whether local-only libraries should optionally initialize Git from the app
- Whether a future PR flow should depend on GitHub auth, `gh`, or a lighter custom flow
- How aggressively the app should surface working tree state in the library list

## Architecture Direction

### Canonical Data Flow

```text
Library folder on disk
  -> command JSON files
  -> SQLite cache/index
  -> renderer search / list / edit views

Optional Git origin
  -> fetch / status / commit / push / PR
  -> library manage surface
```

### Library State

Minimum useful library state:

- local path
- manifest path
- optional origin URL
- optional Git provider metadata
- working tree status summary
- user role for origin-backed actions

### Command State

Command state should stay boring:

- file path
- library id
- content fields
- timestamps
- optional stable command id

Do not add special command-level origin behavior unless absolutely necessary.

## Key Files Likely To Change

| File | Why |
|------|-----|
| `docs/remote-libraries.md` | Existing remote model will need to be rewritten around working copies |
| `docs/library-first-command-storage.md` | Needs alignment with the new library/origin model |
| `electron/main/github.ts` | Remote flows likely shift from subscribe/sync semantics toward clone/fetch/status semantics |
| `electron/main/local-library.ts` | Becomes the core library working-copy layer |
| `electron/main/index.ts` | IPC surfaces need to move Git/distribution actions to the library level |
| `src/App.vue` | Command row action set should simplify to copy/edit/delete |
| `src/components/SettingsModal.vue` | Library management UI needs a changes/status workflow |

## Phases

### Phase 1: Lock The Working-Copy Model

Deliverables:

- this doc
- explicit replacement of detach-on-edit and command-row publish/unpublish concepts
- decision that command rows stay origin-agnostic

Verification:

- product language is clear enough that "what happens when I edit a Git-backed command?" has a short answer

### Phase 2: Simplify Command UX

Deliverables:

- remove cloud/publish/unpublish actions from the main command list
- keep command row actions to copy/edit/delete
- treat deletes as local working-copy deletes

Verification:

- a user can no longer confuse local-library commands with remote distribution controls

### Phase 3: Move Origin Workflows To Library Management

Deliverables:

- library-level `Changes` surface
- library-level status summary for modified/new/deleted command files
- actions for commit/push and later PR flow

Verification:

- command CRUD and Git workflows are clearly separated in the UI

### Phase 4: Git Integration Strategy

Deliverables:

- initial implementation using system `git`
- documented fallback behavior when `git` is unavailable
- decision on whether embedded Git is ever needed

Verification:

- the app can inspect working-copy changes without bundling a custom Git runtime

## Immediate Recommendation

Do not bundle Git yet.

Start with:

- libraries as filesystem working copies
- system `git` when available
- Git-aware controls only in the library manage panel

That keeps the product model simple while leaving room for more advanced collaboration workflows later.

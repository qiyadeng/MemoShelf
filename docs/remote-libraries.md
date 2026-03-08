# Remote Libraries

Remote Libraries let teams share command snippets via GitHub repositories. A curator maintains a repo with command files, and team members subscribe to pull those commands into their local SnipForge.

## How It Works

- **One-way sync**: repo → app. Curators publish, members consume.
- **Local commands stay private**. Remote commands are tagged with their source and never mix with local ones.
- **Multi-repo support**. Subscribe to as many libraries as you need (e.g., `k8s-team`, `support-tools`, `dev-builds`).
- **No merge conflicts**. One JSON file per command means clean git diffs and meaningful history.
- **Roles mirror GitHub**. Repo owner = curator, write access = contributor, read access = consumer.

## Usage

### Subscribing to a Library

1. Open Settings (gear icon) > **Libraries** tab
2. Click **Sign in with GitHub** (first time only)
3. Enter the repo in the input field (e.g., `ArtluxDM/k8s-commands` or a full GitHub URL)
4. Click **Subscribe**
5. Commands appear in your main list with their source library

### Syncing

- Click the sync icon on an individual library to pull updates
- Click **Sync All** to update all subscriptions at once
- Manual sync always does a full diff (re-adds locally deleted commands)
- Auto-sync uses SHA-based detection to skip repos that haven't changed

### Unsubscribing

Click the X button on a library. All remote commands from that library are removed. Your local commands are never affected.

---

## Developer Reference

### Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Backend | GitHub repos | Target audience is engineers, no server to run, roles mirror GitHub permissions |
| Auth | GitHub OAuth Device Flow | No client_secret in the app, no proxy server, secure — same UX as `gh` CLI |
| Sync direction | One-way: repo → app | Curators publish, members consume. No merge conflicts ever |
| Repo structure | One JSON file per command | Clean git diffs, meaningful history, no merge conflicts |
| Local commands | Always separate, always private | Remote commands tagged with source, never mixed with local |
| Multi-repo | Yes, subscribe to many | User can pull from k8s-team, support-tools, dev-builds simultaneously |
| Scanning | Scoped to manifest directory | Monorepo safe — only scans JSON files under the `.snipforge.json` location |
| Force sync | Manual = full diff, auto = SHA skip | Manual click should always reconcile; auto shouldn't waste API calls |
| Dependencies | None | Node.js built-in `fetch` (Node 18+), GitHub API is straightforward REST |

### GitHub OAuth Setup

The app uses [GitHub Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) for authentication — the same flow as `gh auth login`. No client secret is embedded in the app.

**Creating the OAuth App:**

1. Go to [GitHub Developer Settings > OAuth Apps](https://github.com/settings/developers)
2. Click **New OAuth App**
3. Fill in:
   - **Application name**: `SnipForge`
   - **Homepage URL**: your repo URL or any valid URL
   - **Authorization callback URL**: `http://localhost` (not used by Device Flow, but required by GitHub)
4. Click **Register application**
5. Copy the **Client ID**
6. Open `electron/main/github.ts` and set the `CLIENT_ID` constant to your Client ID

The `client_id` is public and safe to embed — no secret is needed for Device Flow.

**Auth flow:**

1. User clicks "Sign in with GitHub"
2. App calls `POST https://github.com/login/device/code` with client_id + scope `repo`
3. GitHub returns a `user_code` and `verification_uri`
4. App shows: "Go to github.com/login/device and enter code: ABCD-1234"
5. Opens browser to the URL automatically
6. App polls `POST https://github.com/login/oauth/access_token` until user authorizes
7. Token received → encrypted with `safeStorage` → stored in auth table

**Scopes:** The app requests `repo` (read/write access to repositories). Needed for private repos. For public-only libraries, `public_repo` would suffice, but `repo` covers both.

**Token storage:** GitHub tokens are encrypted using Electron's `safeStorage` API before being stored in the local SQLite database (`auth` table). On systems where OS-level encryption isn't available, it falls back to base64 encoding.

### Repo Structure (SnipForge Library)

Any GitHub repo can be a SnipForge library. It needs a `.snipforge.json` manifest. Command JSON files live in the same directory as the manifest — the manifest location defines the library root.

**Dedicated library repo:**
```
my-team-commands/
├── .snipforge.json              # Library manifest (required)
├── get-pods.json                # Command files next to the manifest
├── restart-deployment.json
└── check-node-status.json
```

**Subfolder in a monorepo:**
```
my-monorepo/
├── src/
├── snipforge_library/
│   ├── .snipforge.json          # Scan is scoped to this directory
│   ├── get-pods.json
│   └── restart-deployment.json
└── package.json                 # Ignored — outside manifest scope
```

**Manifest** (`.snipforge.json`):
```json
{
  "name": "Cloud Platform K8s Commands",
  "description": "Kubernetes maintenance commands for the cloud platform team",
  "format_version": "1.0"
}
```

**Command file** (`get-pods.json`):
```json
{
  "title": "Get all pods in namespace",
  "body": "kubectl get pods -n {{namespace}}",
  "description": "Lists all running pods. Use `-o wide` for node info.",
  "tags": ["kubernetes", "pods"],
  "language": "bash",
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-02-20T14:30:00Z"
}
```

**Validation:** A JSON file is recognized as a command if it has `title` (string) and `body` (string) at the top level. All other fields are optional.

### Architecture

#### Database Schema

Two new tables and three new columns on `commands`:

```sql
-- New table: tracks library subscriptions
CREATE TABLE libraries (
    id INTEGER PRIMARY KEY,
    github_repo TEXT NOT NULL UNIQUE,   -- "org/repo-name"
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    manifest_path TEXT,                 -- path to .snipforge.json in repo (NULL = not initialized)
    last_synced_at TEXT,
    last_synced_sha TEXT,               -- commit SHA for change detection
    created_at TEXT NOT NULL
);

-- New table: encrypted token storage
CREATE TABLE auth (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- New columns on commands
ALTER TABLE commands ADD COLUMN source TEXT NOT NULL DEFAULT 'local';
ALTER TABLE commands ADD COLUMN library_id INTEGER REFERENCES libraries(id) ON DELETE CASCADE;
ALTER TABLE commands ADD COLUMN remote_path TEXT;
```

- `source`: `'local'` (user's own) or `'remote'` (from a library)
- `library_id`: which library a remote command belongs to
- `remote_path`: filename in the repo (e.g., `get-pods.json`), used to detect updates/deletions

#### Sync Algorithm

```
1. Fetch repo tree via GitHub API
2. Find .snipforge.json manifest (validate it's a SnipForge library)
3. Scope scan to the manifest's directory (monorepo safe)
4. If stored manifest_path differs from actual location → update it (self-correcting)
5. Get latest commit SHA
6. If SHA matches last sync → skip (unless force sync from manual click)
7. Fetch all JSON files under the manifest directory, validate each (must have title + body)
8. Diff against local remote commands for this library:
   a. File exists remotely but not locally → ADD
   b. File exists both, remote updated_at > local → UPDATE
   c. File exists locally but not remotely → REMOVE
   d. Unchanged → SKIP
9. Execute all changes in a single SQLite transaction
10. Update library.last_synced_at and library.last_synced_sha
11. Return SyncResult { added, updated, removed, errors }
```

**Force sync**: When a user manually clicks "Sync", the SHA check is bypassed (`force: true`). This ensures locally deleted commands are re-downloaded. Auto-sync (Sync All) still uses SHA optimization.

#### IPC Channels

**Auth:**
| Channel | Purpose |
|---------|---------|
| `auth:login` | Start Device Flow, returns `{ user_code, verification_uri, device_code }` |
| `auth:pollLogin` | Poll for token completion |
| `auth:logout` | Clear stored token |
| `auth:getStatus` | Check if authenticated, return user info |

**Libraries:**
| Channel | Purpose |
|---------|---------|
| `library:subscribe` | Add subscription + initial pull |
| `library:unsubscribe` | Remove library and its remote commands |
| `library:sync` | Pull latest for one library (force sync) |
| `library:syncAll` | Pull latest for all libraries (SHA optimized) |
| `library:getAll` | List all subscriptions |
| `library:browse` | Preview library contents without subscribing |

**Publishing (Phase 3):**
| Channel | Purpose |
|---------|---------|
| `library:init` | Initialize repo as SnipForge library |
| `library:publish` | Push a command to the repo as a JSON file |
| `library:unpublish` | Remove a command from the repo |

#### Key Files

| File | Purpose |
|------|---------|
| `electron/main/github.ts` | GitHub API client: auth, repo operations, sync |
| `electron/main/database.ts` | DB schema, migrations, library/auth CRUD |
| `electron/main/index.ts` | IPC handlers for auth + libraries |
| `electron/preload/index.ts` | Exposes auth + library channels to renderer |
| `shared/types.ts` | Shared types: Library, RemoteCommand, SyncResult, etc. |
| `src/components/SettingsModal.vue` | Libraries tab UI |

### Development Workflow

Every issue follows this cycle:

1. **Doc first** — update the feature doc (`docs/remote-libraries.md`) with the plan before writing code
2. **Implement** — write the code, referencing the issue number in commits (`ref #N` or `fixes #N`)
3. **Update docs** — mark deliverables complete, add implementation notes, record any deviations
4. **Commit** — commit message references the issue; the feature doc is always up to date

The feature doc is the source of truth — for the plan, the roadmap, and the development log. GitHub Issues track work items and discussion. Together they should make it easy for anyone to pick up an issue, understand what's needed, do the work, and leave everything documented.

### Phases

#### Phase 1: Foundation — COMPLETE

Auth + subscribe + pull + sync + unsubscribe. The core flow works end to end.

**Files created/modified:**
- `electron/main/github.ts` — NEW: GitHub API client (Device Flow auth, repo operations, sync)
- `electron/main/database.ts` — Added: libraries table, auth table, command source columns, migrations
- `electron/main/index.ts` — Added: auth + library IPC handlers
- `electron/preload/index.ts` — Added: auth + library bridge methods
- `shared/types.ts` — Added: Library, RemoteCommand, SyncResult, AuthStatus types
- `src/components/SettingsModal.vue` — Replaced "Coming Soon" with Libraries tab (auth + subscriptions)
- `src/App.vue` — Added: `@libraries-changed` handler
- `src/utils/fuzzySearch.ts` — Fixed: imports CommandWithTags from shared types (was duplicate interface)

**Verification:**
1. Click "Sign in with GitHub" → Device Flow completes → user info shown
2. Enter a repo URL → subscribe → commands appear in the list
3. Add a command to the repo manually on GitHub → sync → new command appears
4. Delete a synced command locally → manual sync → command re-appears
5. Unsubscribe → remote commands disappear, local commands untouched
6. Sign out → token cleared, libraries remain (re-auth to sync)

#### Phase 2: Library Management UI — COMPLETE

**Deliverables:**
- [x] Visual distinction between local and remote commands in the main list
- [x] Source indicators on command cards (library name/badge)
- [x] Editing a remote command detaches it — becomes local ("you touched it, it's yours now")
- [x] Sync body-deduplication — skip remote commands that match an existing local command body (see [#1](https://github.com/ArtluxDM/SnipForge/issues/1))
- ~~Filter commands by source/library~~ — existing search + tag filters already cover this
- ~~Exclude remote commands from local export~~ — not needed, exports are from whatever you're working with
- ~~Protect remote commands from edit/delete~~ — replaced by detach-on-edit philosophy

**Implementation notes:**
- Detach-on-edit: `database.ts:updateCommand()` now sets `source = 'local'`, `library_id = NULL`, `remote_path = NULL` on every update. Next sync re-adds the remote original as a separate entry.
- Body dedup: `database.ts:getLocalCommandBodies()` returns a Set of trimmed bodies from local commands. Both `subscribeToLibrary()` and `syncLibrary()` check this Set before adding — if a remote command's trimmed body matches any local command, it's skipped.

**Verification:**
1. Subscribe to 2+ libraries → commands from each show source label
2. Edit a remote command → it becomes local, next sync re-adds the remote original
3. Subscribe to a library when you already have matching commands locally → no duplicates created

#### Phase 3: Publishing (Curator Tools)

**Deliverables:**
- [x] Initialize a GitHub repo as a SnipForge library from the app
- [x] Push individual commands to a library repo
- [x] Remove commands from a library repo
- Bulk publish selected commands

**Init Library (issue [#2](https://github.com/ArtluxDM/SnipForge/issues/2)):**

Flow: subscribe to any repo → if no `.snipforge.json` found, library card shows "Init" button → click Init → modal asks for name + description + optional subdirectory → pushes manifest via GitHub Contents API → auto-syncs.

Key changes:
- `Library` type gains `manifest_path` (nullable). Null = not initialized.
- `subscribeToLibrary()` no longer throws on missing manifest — creates the library record anyway.
- `parseRepoUrl()` now extracts optional subpath from `owner/repo/path/to/dir` format.
- New `initLibrary()` function: checks if manifest exists, pushes `.snipforge.json`, updates library record, auto-syncs.
- UI: library card conditionally shows Init vs Sync based on `manifest_path`.
- Init modal: small dialog with name (pre-filled from repo name), description, subdirectory (pre-filled from subscribe input if provided).

**Verification:**
1. Subscribe to uninitialised repo → library card shows Init button
2. Click Init → modal → create → `.snipforge.json` appears in repo
3. Library card updates to show sync controls
4. Another user subscribes → sees the published command (after commands are added via #3)
5. Re-init an already-initialized repo → warns/skips

**Publish Command (issue [#3](https://github.com/ArtluxDM/SnipForge/issues/3)):**

Flow: click Upload button on a command card → if multiple initialized libraries, pick target from a modal → app creates/updates JSON file in the repo via GitHub Contents API → brief success notification.

Key details:
- Filename derived from command title via slugify (e.g., "Get All Pods" → `get-all-pods.json`)
- File placed under the manifest's parent directory (e.g., `snipforge_library/get-all-pods.json`)
- If file already exists at that path, gets its SHA and updates (no duplicate files)
- File content follows the standard SnipForge command JSON format (title, body, description, tags, language, timestamps)
- Keyboard shortcut: `p` when a command is selected

Key changes:
- `github.ts`: new `publishCommand()` — slugifies title, checks for existing file (SHA for update), PUT via Contents API. New `slugify()` helper.
- `index.ts`: `library:publish` IPC handler — fetches command from DB, parses tags, calls publishCommand
- `preload/index.ts`: expose `library:publish` channel + Window type declaration
- `vite-env.d.ts`: added full `auth`, `library`, `shell`, `window` type declarations (were missing, caused `(window.electronAPI as any)` casts)
- `App.vue`: Upload button on command cards (visible when initialized libraries exist), inline publish modal for library picker when multiple initialized libs, `p` keyboard shortcut. Single-library shortcut: if only one initialized lib, publishes directly without modal.

**Verification:**
1. Click Upload on a command → publishes to the library → file appears in repo
2. Publish same command again → updates the file (no duplicate)
3. Subscribe from another account → sync pulls the published command
4. Press `p` with a command selected → same publish flow

**Unpublish Command (issue [#4](https://github.com/ArtluxDM/SnipForge/issues/4)):**

Flow: click "Remove from library" button on a remote command card → confirmation prompt → app deletes the JSON file from the repo via GitHub Contents API (DELETE requires the file's blob SHA) → local remote command is removed from DB → subscribers lose the command on next sync (existing REMOVE logic in sync diff handles this).

Key details:
- Only shown on remote commands where the user has an initialized library (i.e., they're the curator)
- Uses GitHub Contents API `DELETE /repos/{owner}/{repo}/contents/{path}` with the file's SHA
- After successful delete, removes the local DB entry for that command
- Subscribers will lose the command on their next sync because the file no longer exists remotely (sync step 8c: "File exists locally but not remotely → REMOVE")

Key changes:
- `github.ts`: new `unpublishCommand(libraryId, remotePath)` — fetches file SHA via Contents API, then DELETEs it
- `index.ts`: `library:unpublish` IPC handler — validates params, calls `unpublishCommand`, then deletes local remote command from DB
- `preload/index.ts`: expose `library:unpublish` channel + Window type
- `App.vue`: "Remove from library" button (Trash2 with different styling or X icon) on remote command cards that belong to an initialized library. Confirmation via inline prompt before deleting. Keyboard shortcut: `u` when a remote command is selected.

**Verification:**
1. Click "Remove from library" on a remote command → file deleted from repo
2. Local command disappears from the list
3. Subscribe from another account → sync → command is gone
4. Try to unpublish a local command → button not shown (correct)

#### Phase 4: Unified Library & Export Model

Generalizes the library concept beyond GitHub. Any folder is a library. Export and import align with the library format.

**Local libraries (folder-as-vault):**
- Open a local folder as a library (like Obsidian "Open Vault")
- Same format as remote libraries: `.snipforge.json` manifest + individual command JSON files
- Unifies local folder import with the remote library model

**Export modes (two, not three):**
- **Library export** — full folder (manifest + individual JSON files), zipped. Works for 1 command or 100.
- **Bundle export** — single JSON file with selected commands. Quick-share format. A bundle of 1 = single command export (no separate mode needed).

**Unified file format:**
- `"snipforge": "library"` — manifest file (`.snipforge.json`)
- `"snipforge": "bundle"` — array of commands in one file
- `"snipforge": "command"` — individual command file

**Key principle:** Library is the canonical format for organization and sharing. Bundle is the convenience format for quick handoff.

#### Phase 5: Polish

- Auto-check for updates (badge/notification, not auto-pull)
- "Browse library" preview before subscribing
- Library search/discovery
- PR flow for contributors

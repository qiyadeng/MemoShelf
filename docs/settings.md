# Settings

Persistent user preferences with a proper settings infrastructure. Currently everything is hardcoded or ephemeral — this feature adds a settings backend, IPC bridge, reactive store, and UI.

The SettingsModal is the settings page. Each tab is a settings section.

## Architecture

### Storage

`settings` table in SQLite — key-value, same pattern as `auth`:

```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
)
```

Values are JSON-encoded for complex types (e.g., `{"width":800,"height":600}`). Simple values stored as plain strings.

### Backend

`electron/main/settings.ts` — CRUD with typed defaults:

```typescript
// Defaults are the source of truth for available settings + their types
const DEFAULTS: Record<string, unknown> = {
  'general.hotkey': 'CommandOrControl+Shift+Space',
  'general.windowState': null,
  'library.autoSync': false,
  'library.autoSyncInterval': 30,  // minutes
}

function get<T>(key: string): T
function set(key: string, value: unknown): void
function getAll(): Record<string, unknown>
```

### IPC

| Channel | Purpose |
|---------|---------|
| `settings:get` | Get a single setting by key |
| `settings:set` | Set a single setting |
| `settings:getAll` | Get all settings (merged with defaults) |

### Renderer

Reactive composable (`src/composables/useSettings.ts`) — loads all settings on mount, provides reactive refs that auto-persist on change:

```typescript
const { settings, updateSetting } = useSettings()
// settings.value['general.hotkey'] → reactive, auto-persists
```

SettingsModal consumes this composable. Other components can too (e.g., App.vue for hotkey display).

---

## Tab Structure

The SettingsModal tabs:

1. **General** — hotkey remapping, shortcuts, display prefs (themes, tag pills, preview on copy), window state
2. **Connectors** — OAuth integrations (GitHub now, extensible for GitLab/Bitbucket/etc.)
3. **Libraries** — subscriptions, sync controls, auto-sync toggle + interval
4. **Manage Commands** — existing bulk operations, unchanged

---

## Phases

### Phase 1: Infrastructure + General Settings (issue [#10](https://github.com/ArtluxDM/SnipForge/issues/10)) ✅ COMPLETE

The foundation. Adding new settings is now just a key in `DEFAULTS` + one UI element.

**Settings infrastructure:**
- [x] `settings` table in `database.ts` (migration)
- [x] `electron/main/settings.ts` — get/set/getAll with typed defaults, JSON encoding, overlay pattern
- [x] IPC handlers in `index.ts` — `settings:get`, `settings:set`, `settings:getAll`
- [x] Preload bridge + type declarations
- [x] `src/composables/useSettings.ts` — reactive singleton store, shared across components

**General tab (new, first tab):**
- [x] Global hotkey remapping — picker captures key combo, validates modifiers, re-registers `globalShortcut` live, falls back on failure
- [x] Window state persistence — bounds + maximized saved on close, restored on launch, off-screen detection

**Connectors tab (new):**
- [x] GitHub OAuth moved from Libraries tab
- [x] Extensible list pattern (icon, provider, status/avatar, action button)
- [x] Connected state shows user's GitHub avatar (circular), disconnected shows GitHub icon

**Tab restructure:**
- [x] General (first) → Connectors → Libraries → Manage Commands
- [x] Libraries tab cleaned of OAuth, keeps subscriptions + sync controls

**Key files:**
- `electron/main/settings.ts` — NEW: settings CRUD
- `electron/main/database.ts` — migration for `settings` table
- `electron/main/index.ts` — settings IPC handlers, hotkey re-registration
- `electron/preload/index.ts` — settings bridge
- `src/composables/useSettings.ts` — NEW: reactive store
- `src/components/SettingsModal.vue` — new General + Connectors tabs, restructured layout, OAuth moved
- `src/vite-env.d.ts` — settings type declarations

### Phase 2: Library & Sync Settings

- [ ] Auto-sync toggle + interval picker in Libraries tab
- [ ] Background sync timer in main process (chained `setTimeout`, respects interval changes)
- [ ] Sync status line in Libraries tab — "Last synced: 5 min ago"

### Phase 3: Display & Shortcuts

Unblocks parked ideas (tag pills, preview on copy). All in the General tab.

- [ ] Display settings: tag pills toggle, preview on copy toggle
- [ ] Keyboard shortcut remapping — table of current bindings, click-to-rebind
- [ ] Shortcuts map (defaults + user overrides) stored in settings, consumed by App.vue keydown handler

---

## Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Storage | SQLite key-value table | Consistent with existing stack, no new dependencies, atomic writes |
| Key format | Dot-notation (`general.hotkey`) | Groups settings by section, readable, greppable |
| Defaults | In code, not DB | DB only stores overrides. Defaults change with app updates without migration. |
| Connectors | Own tab | Auth integrations are a distinct concern. Extensible pattern for future providers. |
| Auto-sync | Libraries tab | It's a library setting — toggle and interval live next to the libraries they affect. |
| Hotkey capture | Custom input that listens for keydown | Standard UX for hotkey pickers. Show current combo, click to change, press new combo. |
| Window state | Save on `close` event, restore on `ready` | Standard Electron pattern. Store as JSON in settings. |
| Shortcuts | General tab, not own tab | Not enough content to justify a dedicated tab. Section within General is sufficient. |

## Connector Pattern

Connectors are authenticated integrations with external services. Phase 1 has one (GitHub), but the UI and data model support adding more.

**UI pattern per connector:**
```
[GitHub Icon]  GitHub          @username    [Disconnect]
[GitLab Icon]  GitLab          Not connected [Connect]
```

**Data model:** Each connector uses the existing `auth` table for encrypted token storage. The `settings` table is not involved — auth is auth, settings are preferences.

**Future connectors (not planned, just showing the pattern works):**
- GitLab — same OAuth Device Flow, different API
- Bitbucket — OAuth 2.0, different endpoints
- Self-hosted — URL + personal access token

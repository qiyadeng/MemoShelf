# Settings

Persistent user preferences with a proper settings infrastructure. Currently everything is hardcoded or ephemeral — this feature adds a settings backend, IPC bridge, reactive store, and UI.

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

## Phases

### Phase 1: Infrastructure + General Settings

The foundation. Once this ships, adding new settings is just a key + UI element.

**Settings infrastructure:**
- [ ] `settings` table in `database.ts` (migration)
- [ ] `electron/main/settings.ts` — get/set/getAll with typed defaults
- [ ] IPC handlers in `index.ts`
- [ ] Preload bridge + type declarations
- [ ] `src/composables/useSettings.ts` — reactive store

**General tab (new, becomes first tab):**
- [ ] Global hotkey remapping — input field that captures key combo, re-registers `globalShortcut` on save
- [ ] Connectors section — move GitHub OAuth from Libraries tab here. Designed as a list of connected accounts (GitHub now, others later). Each connector shows: icon, provider name, connected user, disconnect button.
- [ ] Window state persistence — save size/position on close, restore on launch

**Tab restructure:**
The SettingsModal tabs become:
1. **General** — hotkey, connectors, window behavior
2. **Libraries** — subscriptions, sync controls (moved from current "settings" tab, minus the OAuth section)
3. **Manage Commands** — existing bulk operations, unchanged

**Key files:**
- `electron/main/settings.ts` — NEW: settings CRUD
- `electron/main/database.ts` — migration for `settings` table
- `electron/main/index.ts` — settings IPC handlers, hotkey re-registration
- `electron/preload/index.ts` — settings bridge
- `src/composables/useSettings.ts` — NEW: reactive store
- `src/components/SettingsModal.vue` — new General tab, restructured tabs, OAuth moved
- `src/vite-env.d.ts` — settings type declarations

### Phase 2: Library & Sync Settings

Auto-sync lives in the Libraries tab since it's contextual to library behavior.

- [ ] Auto-sync toggle + interval picker (in Libraries tab, above the library list)
- [ ] Background sync timer in main process (chained `setTimeout`, respects interval changes)
- [ ] Sync status indicator (last sync time, next sync countdown)

### Phase 3: Display & Shortcuts

Unblocks the parked ideas (tag pills, preview on copy). Keyboard remapping is the complex one.

- [ ] Display settings section in General tab: tag pills toggle, preview on copy toggle
- [ ] Keyboard shortcut remapping UI — table of current bindings, click-to-rebind
- [ ] Shortcuts map (defaults + user overrides) stored in settings, consumed by App.vue keydown handler

---

## Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| Storage | SQLite key-value table | Consistent with existing stack, no new dependencies, atomic writes |
| Key format | Dot-notation (`general.hotkey`) | Groups settings by section, readable, greppable |
| Defaults | In code, not DB | DB only stores overrides. Defaults change with app updates without migration. |
| Connectors | Section in General, not own tab | One connector today (GitHub). Own tab is premature. Revisit when there are 3+. |
| Auto-sync location | Libraries tab | It's library behavior, not a general preference. Keep it contextual. |
| Hotkey capture | Custom input that listens for keydown | Standard UX for hotkey pickers. Show current combo, click to change, press new combo. |
| Window state | Save on `close` event, restore on `ready` | Standard Electron pattern. Store as JSON in settings. |

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

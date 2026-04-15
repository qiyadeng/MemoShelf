import * as db from './database'

// ── Defaults ─────────────────────────────────────────────────────
// Source of truth for available settings and their types.
// DB only stores overrides — defaults change with app updates without migration.

export interface WindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

// Default keyboard shortcuts — action name → keybinding string
// Format: "key" or "Shift+key" or "CmdOrCtrl+key"
export const DEFAULT_SHORTCUTS: Record<string, string> = {
  'navigate.up': 'ArrowUp',
  'navigate.down': 'ArrowDown',
  'action.copy': 'c',
  'action.copyTemplate': 'Shift+c',
  'action.new': 'n',
  'action.edit': 'e',
  'action.delete': 'Backspace',
}

const DEFAULTS: Record<string, unknown> = {
  'general.hotkey': 'CommandOrControl+Shift+Space',
  'general.windowState': null as WindowState | null,
  'library.autoSync': false, // master toggle for auto-sync
  'library.defaultWritableLocalLibraryId': null as number | null,
  'library.legacyDbMigrationCompleted': false,
  'display.tagPills': true,
  'display.previewOnCopy': true,
  'shortcuts': { ...DEFAULT_SHORTCUTS },
  'update.autoCheck': true,
  'update.dismissedVersion': null as string | null,
  'update.remindAfter': null as string | null,
}

// ── CRUD ─────────────────────────────────────────────────────────

export function get<T>(key: string): T {
  const raw = db.getSettingValue(key)
  if (raw === null) {
    return DEFAULTS[key] as T
  }
  try {
    return JSON.parse(raw) as T
  } catch {
    return raw as T
  }
}

export function set(key: string, value: unknown): void {
  db.setSettingValue(key, JSON.stringify(value))
}

export function getAll(): Record<string, unknown> {
  // Start with defaults, overlay DB overrides
  const result = { ...DEFAULTS }
  const stored = db.getAllSettings()
  for (const [key, raw] of Object.entries(stored)) {
    try {
      result[key] = JSON.parse(raw)
    } catch {
      result[key] = raw
    }
  }
  return result
}

export function remove(key: string): void {
  db.deleteSetting(key)
}

export function getDefaults(): Record<string, unknown> {
  return { ...DEFAULTS }
}

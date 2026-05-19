import { app, BrowserWindow } from 'electron'
import * as settings from './settings'
import type { UpdateStatus } from '../../shared/types'

// ── Configuration ────────────────────────────────────────────────
const GITHUB_OWNER = 'qiyadeng'
const GITHUB_REPO = 'MemoShelf'
const RELEASE_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
const DOWNLOAD_URL = 'https://github.com/qiyadeng/MemoShelf/releases/latest'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours

// ── State ────────────────────────────────────────────────────────
let checkTimeout: ReturnType<typeof setTimeout> | null = null
let cachedStatus: UpdateStatus = {
  currentVersion: '',
  latestVersion: null,
  updateAvailable: false,
  releaseUrl: DOWNLOAD_URL,
  lastChecked: null,
}

// Reference to main window for pushing status changes
let mainWindow: BrowserWindow | null = null

export function setWindow(win: BrowserWindow | null): void {
  mainWindow = win
}

// ── Semver comparison ────────────────────────────────────────────
// Returns true if remote > local (ignores pre-release tags)
function isNewerVersion(remote: string, local: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number)
  const [rMajor, rMinor = 0, rPatch = 0] = parse(remote)
  const [lMajor, lMinor = 0, lPatch = 0] = parse(local)

  if (rMajor !== lMajor) return rMajor > lMajor
  if (rMinor !== lMinor) return rMinor > lMinor
  return rPatch > lPatch
}

// ── Check for updates ────────────────────────────────────────────
export async function checkForUpdate(): Promise<UpdateStatus> {
  const currentVersion = app.getVersion()
  cachedStatus.currentVersion = currentVersion

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const response = await fetch(RELEASE_API, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': `MemoShelf/${currentVersion}`,
      },
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!response.ok) {
      console.warn(`[update] GitHub API returned ${response.status}`)
      cachedStatus.lastChecked = new Date().toISOString()
      return cachedStatus
    }

    const release = await response.json() as { tag_name: string; draft: boolean; prerelease: boolean }

    // Skip drafts and pre-releases
    if (release.draft || release.prerelease) {
      cachedStatus.lastChecked = new Date().toISOString()
      cachedStatus.updateAvailable = false
      cachedStatus.latestVersion = null
      return cachedStatus
    }

    const latestVersion = release.tag_name.replace(/^v/, '')
    const updateAvailable = isNewerVersion(latestVersion, currentVersion)

    cachedStatus = {
      currentVersion,
      latestVersion,
      updateAvailable,
      releaseUrl: DOWNLOAD_URL,
      lastChecked: new Date().toISOString(),
    }

    console.log(`[update] Current: ${currentVersion}, Latest: ${latestVersion}, Update: ${updateAvailable}`)
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      console.warn('[update] Check timed out')
    } else {
      console.warn('[update] Check failed:', (error as Error).message)
    }
    cachedStatus.lastChecked = new Date().toISOString()
  }

  return cachedStatus
}

// ── Banner visibility logic ──────────────────────────────────────
export function shouldShowBanner(): boolean {
  if (!cachedStatus.updateAvailable || !cachedStatus.latestVersion) return false

  const dismissedVersion = settings.get<string | null>('update.dismissedVersion')
  if (dismissedVersion === cachedStatus.latestVersion) return false

  const remindAfter = settings.get<string | null>('update.remindAfter')
  if (remindAfter && new Date() < new Date(remindAfter)) return false

  return true
}

// ── Dismiss actions ──────────────────────────────────────────────
export function dismissVersion(): void {
  if (cachedStatus.latestVersion) {
    settings.set('update.dismissedVersion', cachedStatus.latestVersion)
    pushStatusToRenderer()
  }
}

export function remindLater(): void {
  const remindAt = new Date(Date.now() + CHECK_INTERVAL_MS).toISOString()
  settings.set('update.remindAfter', remindAt)
  pushStatusToRenderer()
}

// ── Push status to renderer ──────────────────────────────────────
function pushStatusToRenderer(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update:statusChanged', {
      ...cachedStatus,
      showBanner: shouldShowBanner(),
    })
  }
}

// ── Background checker (chained setTimeout) ──────────────────────
export function startUpdateChecker(): void {
  stopUpdateChecker()

  const autoCheck = settings.get<boolean>('update.autoCheck')
  if (autoCheck === false) return // default is true (undefined = on)

  // Initial check on launch (delay 5s to not slow down startup)
  checkTimeout = setTimeout(async () => {
    await checkForUpdate()
    pushStatusToRenderer()
    scheduleNext()
  }, 5_000)

  console.log('[update] Checker started: launch + every 24h')
}

function scheduleNext(): void {
  checkTimeout = setTimeout(async () => {
    const autoCheck = settings.get<boolean>('update.autoCheck')
    if (autoCheck === false) {
      checkTimeout = null
      return
    }

    await checkForUpdate()
    pushStatusToRenderer()
    scheduleNext()
  }, CHECK_INTERVAL_MS)
}

export function stopUpdateChecker(): void {
  if (checkTimeout) {
    clearTimeout(checkTimeout)
    checkTimeout = null
    console.log('[update] Checker stopped')
  }
}

// ── Getters ──────────────────────────────────────────────────────
export function getStatus(): UpdateStatus & { showBanner: boolean } {
  // Ensure currentVersion is populated
  if (!cachedStatus.currentVersion) {
    cachedStatus.currentVersion = app.getVersion()
  }
  return { ...cachedStatus, showBanner: shouldShowBanner() }
}

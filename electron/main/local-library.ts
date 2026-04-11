import { promises as fs, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import AdmZip from 'adm-zip'
import * as db from './database'
import * as settings from './settings'
import type { Library, LibraryManifest, RemoteCommand, SyncResult } from '../../shared/types'

// ── Local Folder Scanning ────────────────────────────────────────

interface ScanResult {
    manifest: LibraryManifest
    manifestPath: string
    commands: Array<{ path: string; command: RemoteCommand }>
}

function deriveLibraryName(folderPath: string): string {
    const folderName = path.basename(folderPath)
        .replace(/[-_]/g, ' ')
        .trim()

    const humanized = folderName.replace(/\b\w/g, c => c.toUpperCase())
    return humanized || 'Local Library'
}

function isInitializedLocalLibrary(library: Library | undefined): library is Library {
    return !!library && library.type === 'local' && !!library.manifest_path
}

export function getDefaultWritableLocalLibrary(): Library | null {
    const preferredId = settings.get<number | null>('library.defaultWritableLocalLibraryId')
    if (typeof preferredId === 'number') {
        const preferred = db.getAllLibraries().find(l => l.id === preferredId)
        if (isInitializedLocalLibrary(preferred)) {
            return preferred
        }
    }

    const fallback = db.getAllLibraries().find(isInitializedLocalLibrary)
    if (fallback) {
        settings.set('library.defaultWritableLocalLibraryId', fallback.id)
        return fallback
    }

    return null
}

export function setDefaultWritableLocalLibrary(libraryId: number): void {
    settings.set('library.defaultWritableLocalLibraryId', libraryId)
}

async function readFolderManifest(folderPath: string): Promise<ScanResult | null> {
    try {
        return await scanLocalFolder(folderPath)
    } catch (e) {
        const msg = (e as Error).message
        if (!msg.includes('missing .snipforge.json')) throw e
        return null
    }
}

async function createManifestIfMissing(folderPath: string): Promise<ScanResult> {
    const existing = await readFolderManifest(folderPath)
    if (existing) return existing

    const manifest: LibraryManifest = {
        snipforge: 'library',
        name: deriveLibraryName(folderPath),
        description: '',
        format_version: '1.0',
    }

    await fs.writeFile(
        path.join(folderPath, '.snipforge.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf8'
    )

    return await scanLocalFolder(folderPath)
}

function buildLocalSyncPayload(commands: ScanResult['commands'], existingBodies: Set<string>) {
    return commands
        .filter(({ command }) => !existingBodies.has(command.body.trim()))
        .map(({ path: filePath, command }) => ({
            remotePath: filePath,
            command: {
                title: command.title,
                body: command.body,
                description: command.description || '',
                tags: JSON.stringify(command.tags || []),
                language: command.language || 'plaintext',
                created_at: command.created_at || new Date().toISOString(),
                updated_at: command.updated_at || new Date().toISOString(),
            }
        }))
}

async function indexLocalLibrary(folderPath: string, options: { ensureManifest: boolean; allowExisting: boolean }): Promise<{ library: Library; syncResult: SyncResult }> {
    const stat = await fs.stat(folderPath)
    if (!stat.isDirectory()) throw new Error('Not a directory')

    const existing = db.getLibraryByRepo(folderPath)
    if (existing && !options.allowExisting) {
        throw new Error(`Already added: ${path.basename(folderPath)}`)
    }

    const scanResult = options.ensureManifest
        ? await createManifestIfMissing(folderPath)
        : await readFolderManifest(folderPath)

    if (!scanResult) {
        const folderName = deriveLibraryName(folderPath)
        const libraryId = existing
            ? existing.id
            : db.addLibrary(folderPath, folderName, '', undefined, 'local', 'owner')
        if (existing && !existing.manifest_path) {
            db.updateLibraryManifest(libraryId, folderName, '', '.snipforge.json')
        }
        const library = db.getLibraryByRepo(folderPath)!
        return { library, syncResult: { added: 0, updated: 0, removed: 0, errors: [] } }
    }

    const { manifest, manifestPath, commands } = scanResult
    const libraryId = existing
        ? existing.id
        : db.addLibrary(folderPath, manifest.name, manifest.description || '', manifestPath, 'local', 'owner')

    if (
        existing &&
        (
            !existing.manifest_path ||
            existing.name !== manifest.name ||
            existing.description !== (manifest.description || '') ||
            existing.manifest_path !== manifestPath
        )
    ) {
        db.updateLibraryManifest(libraryId, manifest.name, manifest.description || '', manifestPath)
    }

    const localBodies = db.getLocalCommandBodies()
    const toAdd = buildLocalSyncPayload(commands, localBodies)
    const syncResult = db.syncRemoteCommands(
        libraryId,
        computeContentHash(commands),
        toAdd,
        [],
        []
    )
    const library = db.getLibraryByRepo(folderPath)!
    return { library, syncResult }
}

export async function scanLocalFolder(folderPath: string): Promise<ScanResult> {
    // Find .snipforge.json in the folder (non-recursive — must be at root)
    const manifestPath = path.join(folderPath, '.snipforge.json')

    let manifestContent: string
    try {
        manifestContent = await fs.readFile(manifestPath, 'utf8')
    } catch {
        throw new Error('Not a SnipForge library — missing .snipforge.json manifest')
    }

    let manifest: LibraryManifest
    try {
        manifest = JSON.parse(manifestContent)
    } catch {
        throw new Error('Invalid .snipforge.json — not valid JSON')
    }

    if (!manifest.name || typeof manifest.name !== 'string') {
        throw new Error('Invalid .snipforge.json — missing "name" field')
    }

    // Scan for JSON files in the same directory (non-recursive, matching GitHub behavior)
    const entries = await fs.readdir(folderPath, { withFileTypes: true })
    const jsonFiles = entries.filter(e =>
        e.isFile() &&
        e.name.endsWith('.json') &&
        e.name !== '.snipforge.json'
    )

    const commands: Array<{ path: string; command: RemoteCommand }> = []

    for (const file of jsonFiles) {
        const filePath = path.join(folderPath, file.name)
        try {
            const content = await fs.readFile(filePath, 'utf8')
            const parsed = JSON.parse(content)

            // Validate: must have title (string) and body (string)
            if (
                typeof parsed.title === 'string' && parsed.title.trim() &&
                typeof parsed.body === 'string' && parsed.body.trim()
            ) {
                const command: RemoteCommand = {
                    title: parsed.title,
                    body: parsed.body,
                    description: parsed.description || '',
                    tags: Array.isArray(parsed.tags) ? parsed.tags : [],
                    language: parsed.language || 'plaintext',
                    created_at: parsed.created_at || new Date().toISOString(),
                    updated_at: parsed.updated_at || new Date().toISOString(),
                }
                // Use just the filename as the "remote_path" (relative to library root)
                commands.push({ path: file.name, command })
            }
        } catch {
            // Not valid JSON or not a command — skip
        }
    }

    return { manifest, manifestPath: '.snipforge.json', commands }
}

// ── Sync ─────────────────────────────────────────────────────────

function computeContentHash(commands: Array<{ path: string; command: RemoteCommand }>): string {
    const data = commands
        .map(c => `${c.path}:${c.command.updated_at}`)
        .sort()
        .join('|')
    return crypto.createHash('sha256').update(data).digest('hex').slice(0, 12)
}

export async function syncLocalLibrary(libraryId: number, force = false): Promise<SyncResult> {
    const libraries = db.getAllLibraries()
    const library = libraries.find(l => l.id === libraryId)
    if (!library) throw new Error(`Library not found: ${libraryId}`)
    if (library.type !== 'local') throw new Error('Not a local library')

    // Skip uninitialized libraries
    if (!library.manifest_path) {
        return { added: 0, updated: 0, removed: 0, errors: [] }
    }

    const folderPath = library.github_repo

    // Check folder still exists
    try {
        await fs.access(folderPath)
    } catch {
        return { added: 0, updated: 0, removed: 0, errors: ['Folder not found: ' + folderPath] }
    }

    // Scan the folder
    let scanResult: ScanResult
    try {
        scanResult = await scanLocalFolder(folderPath)
    } catch (e) {
        const msg = (e as Error).message
        if (msg.includes('missing .snipforge.json')) {
            db.clearLibraryManifest(libraryId)
            return { added: 0, updated: 0, removed: 0, errors: ['Manifest was removed from the folder. Click Init to re-create it.'] }
        }
        throw e
    }

    const { commands: remoteCommands } = scanResult
    const sha = computeContentHash(remoteCommands)

    // Get current DB commands for this library
    const localRemote = db.getRemoteCommands(libraryId)
    const localByPath = new Map(localRemote.map(c => [c.remote_path, c]))
    const remotePaths = new Set(remoteCommands.map(c => c.path))

    const toAdd: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; created_at: string; updated_at: string } }> = []
    const toUpdate: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; updated_at: string } }> = []
    const toRemove: string[] = []

    // Body dedup
    const localBodies = db.getLocalCommandBodies()

    for (const { path: filePath, command } of remoteCommands) {
        const local = localByPath.get(filePath)
        if (!local) {
            if (localBodies.has(command.body.trim())) continue
            toAdd.push({
                remotePath: filePath,
                command: {
                    title: command.title,
                    body: command.body,
                    description: command.description || '',
                    tags: JSON.stringify(command.tags || []),
                    language: command.language || 'plaintext',
                    created_at: command.created_at || new Date().toISOString(),
                    updated_at: command.updated_at || new Date().toISOString(),
                }
            })
        } else {
            const remoteUpdated = command.updated_at || ''
            const localUpdated = local.updated_at || ''
            if (remoteUpdated > localUpdated) {
                toUpdate.push({
                    remotePath: filePath,
                    command: {
                        title: command.title,
                        body: command.body,
                        description: command.description || '',
                        tags: JSON.stringify(command.tags || []),
                        language: command.language || 'plaintext',
                        updated_at: command.updated_at || new Date().toISOString(),
                    }
                })
            }
        }
    }

    // Commands in DB but no longer on disk → remove
    for (const local of localRemote) {
        if (local.remote_path && !remotePaths.has(local.remote_path)) {
            toRemove.push(local.remote_path)
        }
    }

    return db.syncRemoteCommands(libraryId, sha, toAdd, toUpdate, toRemove)
}

// ── Open Local Folder ────────────────────────────────────────────

export async function openLocalFolder(folderPath: string): Promise<{ library: Library; syncResult: SyncResult }> {
    // Check folder exists
    try {
        const stat = await fs.stat(folderPath)
        if (!stat.isDirectory()) throw new Error('Not a directory')
    } catch (e) {
        if ((e as Error).message === 'Not a directory') throw e
        throw new Error(`Folder not found: ${folderPath}`)
    }

    return indexLocalLibrary(folderPath, { ensureManifest: false, allowExisting: false })
}

export async function setupDefaultWritableLocalLibrary(folderPath: string): Promise<{ library: Library; syncResult: SyncResult }> {
    const result = await indexLocalLibrary(folderPath, { ensureManifest: true, allowExisting: true })
    setDefaultWritableLocalLibrary(result.library.id)
    return result
}

// ── Init Local Library ───────────────────────────────────────────

export async function initLocalLibrary(libraryId: number, name: string, description: string): Promise<{ library: Library; syncResult: SyncResult }> {
    const libraries = db.getAllLibraries()
    const library = libraries.find(l => l.id === libraryId)
    if (!library) throw new Error(`Library not found: ${libraryId}`)
    if (library.type !== 'local') throw new Error('Not a local library')
    if (library.manifest_path) throw new Error('This library is already initialized')

    const folderPath = library.github_repo
    const manifestPath = path.join(folderPath, '.snipforge.json')

    // Check manifest doesn't already exist
    try {
        await fs.access(manifestPath)
        throw new Error('.snipforge.json already exists in this folder')
    } catch (e) {
        if ((e as Error).message.includes('already exists')) throw e
        // File doesn't exist — good
    }

    const manifest: LibraryManifest = {
        snipforge: 'library',
        name,
        description: description || '',
        format_version: '1.0',
    }

    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

    db.updateLibraryManifest(libraryId, name, description, '.snipforge.json')

    const syncResult = await syncLocalLibrary(libraryId, true)
    const updated = db.getLibraryByRepo(library.github_repo)!
    return { library: updated, syncResult }
}

// ── Export as Library (Zip) ─────────────────────────────────────

export function slugify(title: string): string {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9\s_-]/g, '')
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
    if (!slug) return 'untitled'
    // Filesystem limit: 255 bytes minus .json extension
    return slug.slice(0, 200)
}

export interface ExportLibraryInput {
    name: string
    description: string
    commands: Array<{
        title: string
        body: string
        description: string
        tags: string[]
        language: string
        created_at: string
        updated_at: string
    }>
}

/**
 * Creates a zip file containing a SnipForge library (manifest + command JSONs).
 * Returns the path to the temporary zip file. Caller is responsible for cleanup.
 */
export async function exportAsLibrary(input: ExportLibraryInput): Promise<string> {
    const { name, description, commands } = input
    const folderName = slugify(name) || 'snipforge-library'

    // Create temp directory
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snipforge-export-'))
    const libraryDir = path.join(tmpDir, folderName)
    await fs.mkdir(libraryDir, { recursive: true })

    // Write manifest
    const manifest: LibraryManifest = {
        snipforge: 'library',
        name,
        description: description || '',
        format_version: '1.0',
    }
    await fs.writeFile(
        path.join(libraryDir, '.snipforge.json'),
        JSON.stringify(manifest, null, 2) + '\n',
        'utf8'
    )

    // Write command files — deduplicate slugified filenames
    const usedNames = new Set<string>()
    for (const cmd of commands) {
        let baseName = slugify(cmd.title)
        let fileName = baseName
        let counter = 1
        while (usedNames.has(fileName)) {
            fileName = `${baseName}-${++counter}`
        }
        usedNames.add(fileName)

        const commandData = {
            snipforge: 'command' as const,
            title: cmd.title,
            body: cmd.body,
            description: cmd.description || '',
            tags: cmd.tags,
            language: cmd.language || 'plaintext',
            created_at: cmd.created_at,
            updated_at: cmd.updated_at,
        }
        await fs.writeFile(
            path.join(libraryDir, `${fileName}.json`),
            JSON.stringify(commandData, null, 2) + '\n',
            'utf8'
        )
    }

    // Zip the folder
    const zipPath = path.join(tmpDir, `${folderName}.zip`)
    const zip = new AdmZip()
    zip.addLocalFolder(libraryDir, folderName)
    zip.writeZip(zipPath)

    // Clean up the unzipped folder (keep only the zip)
    await fs.rm(libraryDir, { recursive: true, force: true })

    return zipPath
}

// ── File Watcher ────────────────────────────────────────────────

const watchers = new Map<number, FSWatcher>()
const pendingChanges = new Map<number, Set<string>>()
const debounceTimers = new Map<number, ReturnType<typeof setTimeout>>()

const DEBOUNCE_MS = 2000

let onChangeCallback: ((libraryId: number, result: SyncResult) => void) | null = null

/** Register a callback that fires after a file-watcher sync completes */
export function onFileWatcherSync(cb: (libraryId: number, result: SyncResult) => void): void {
    onChangeCallback = cb
}

/** Read and validate a single command JSON file. Returns null if invalid. */
async function readCommandFile(filePath: string): Promise<RemoteCommand | null> {
    try {
        const content = await fs.readFile(filePath, 'utf8')
        const parsed = JSON.parse(content)
        if (
            typeof parsed.title === 'string' && parsed.title.trim() &&
            typeof parsed.body === 'string' && parsed.body.trim()
        ) {
            return {
                title: parsed.title,
                body: parsed.body,
                description: parsed.description || '',
                tags: Array.isArray(parsed.tags) ? parsed.tags : [],
                language: parsed.language || 'plaintext',
                created_at: parsed.created_at || new Date().toISOString(),
                updated_at: parsed.updated_at || new Date().toISOString(),
            }
        }
    } catch {
        // Invalid JSON or unreadable — skip
    }
    return null
}

/** Process batched file changes for a single library */
async function processBatch(libraryId: number): Promise<void> {
    const filenames = pendingChanges.get(libraryId)
    if (!filenames || filenames.size === 0) return
    pendingChanges.delete(libraryId)

    const library = db.getAllLibraries().find(l => l.id === libraryId)
    if (!library || library.type !== 'local' || !library.manifest_path) return

    const folderPath = library.github_repo
    const existingCommands = db.getRemoteCommands(libraryId)
    const existingByPath = new Map(existingCommands.map(c => [c.remote_path, c]))
    const localBodies = db.getLocalCommandBodies()

    const toAdd: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; created_at: string; updated_at: string } }> = []
    const toUpdate: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; updated_at: string } }> = []
    const toRemove: string[] = []

    for (const filename of filenames) {
        if (filename === '.snipforge.json') continue

        const filePath = path.join(folderPath, filename)
        const existing = existingByPath.get(filename)

        // Check if file still exists
        let fileExists = false
        try {
            await fs.access(filePath)
            fileExists = true
        } catch {
            // File was deleted
        }

        if (!fileExists) {
            // Deletion: remove if we had it in DB
            if (existing) {
                toRemove.push(filename)
            }
            continue
        }

        // File exists — read and validate
        const command = await readCommandFile(filePath)
        if (!command) continue

        const dbCommand = {
            title: command.title,
            body: command.body,
            description: command.description,
            tags: JSON.stringify(command.tags),
            language: command.language,
            created_at: command.created_at,
            updated_at: command.updated_at,
        }

        if (!existing) {
            // New file — add (skip if body already exists locally)
            if (localBodies.has(command.body.trim())) continue
            toAdd.push({ remotePath: filename, command: dbCommand })
        } else {
            // Existing file changed — update if newer
            if (command.updated_at > (existing.updated_at || '')) {
                toUpdate.push({
                    remotePath: filename,
                    command: {
                        title: dbCommand.title,
                        body: dbCommand.body,
                        description: dbCommand.description,
                        tags: dbCommand.tags,
                        language: dbCommand.language,
                        updated_at: dbCommand.updated_at,
                    }
                })
            }
        }
    }

    if (toAdd.length === 0 && toUpdate.length === 0 && toRemove.length === 0) return

    // Compute new SHA from full scan for consistency
    const scanResult = await scanLocalFolder(folderPath)
    const sha = computeContentHash(scanResult.commands)

    const result = db.syncRemoteCommands(libraryId, sha, toAdd, toUpdate, toRemove)
    console.log(`File watcher: synced library ${library.name} — +${result.added} ~${result.updated} -${result.removed}`)

    if (onChangeCallback) {
        onChangeCallback(libraryId, result)
    }
}

/** Start watching a single local library folder */
function watchLibrary(library: Library): void {
    if (watchers.has(library.id)) return
    if (library.type !== 'local' || !library.manifest_path) return

    const folderPath = library.github_repo

    try {
        const watcher = watch(folderPath, (eventType, filename) => {
            if (!filename || !filename.endsWith('.json')) return

            // Accumulate changed filenames
            if (!pendingChanges.has(library.id)) {
                pendingChanges.set(library.id, new Set())
            }
            pendingChanges.get(library.id)!.add(filename)

            // Reset debounce timer
            const existing = debounceTimers.get(library.id)
            if (existing) clearTimeout(existing)
            debounceTimers.set(library.id, setTimeout(() => {
                debounceTimers.delete(library.id)
                processBatch(library.id).catch(e => {
                    console.error(`File watcher error for library ${library.name}:`, e)
                })
            }, DEBOUNCE_MS))
        })

        watchers.set(library.id, watcher)
        console.log(`File watcher: watching ${library.name} at ${folderPath}`)
    } catch (e) {
        console.error(`File watcher: failed to watch ${library.name}:`, e)
    }
}

/** Start file watchers for all initialized local libraries */
export function startFileWatchers(): void {
    stopFileWatchers()
    const libraries = db.getAllLibraries()
    for (const library of libraries) {
        watchLibrary(library)
    }
}

/** Stop all file watchers and clear pending state */
export function stopFileWatchers(): void {
    for (const [id, watcher] of watchers) {
        watcher.close()
    }
    watchers.clear()
    for (const timer of debounceTimers.values()) {
        clearTimeout(timer)
    }
    debounceTimers.clear()
    pendingChanges.clear()
}

/** Refresh watchers — call after adding/removing a local library */
export function refreshFileWatchers(): void {
    const libraries = db.getAllLibraries()
    const localLibraryIds = new Set(
        libraries.filter(l => l.type === 'local' && l.manifest_path).map(l => l.id)
    )

    // Stop watchers for removed libraries
    for (const id of watchers.keys()) {
        if (!localLibraryIds.has(id)) {
            watchers.get(id)?.close()
            watchers.delete(id)
        }
    }

    // Start watchers for new libraries
    for (const library of libraries) {
        if (!watchers.has(library.id)) {
            watchLibrary(library)
        }
    }
}

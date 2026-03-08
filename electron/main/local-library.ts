import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import AdmZip from 'adm-zip'
import * as db from './database'
import type { Library, LibraryManifest, RemoteCommand, SyncResult } from '../../shared/types'

// ── Local Folder Scanning ────────────────────────────────────────

interface ScanResult {
    manifest: LibraryManifest
    manifestPath: string
    commands: Array<{ path: string; command: RemoteCommand }>
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
    // Check if already added
    const existing = db.getLibraryByRepo(folderPath)
    if (existing) {
        throw new Error(`Already added: ${path.basename(folderPath)}`)
    }

    // Check folder exists
    try {
        const stat = await fs.stat(folderPath)
        if (!stat.isDirectory()) throw new Error('Not a directory')
    } catch (e) {
        if ((e as Error).message === 'Not a directory') throw e
        throw new Error(`Folder not found: ${folderPath}`)
    }

    // Try to scan — if no manifest, add as uninitialized
    let scanResult: ScanResult | null = null
    try {
        scanResult = await scanLocalFolder(folderPath)
    } catch (e) {
        const msg = (e as Error).message
        if (!msg.includes('missing .snipforge.json')) throw e
    }

    if (scanResult) {
        const { manifest, manifestPath, commands } = scanResult
        const sha = computeContentHash(commands)
        const libraryId = db.addLibrary(folderPath, manifest.name, manifest.description || '', manifestPath, 'local')

        const localBodies = db.getLocalCommandBodies()
        const toAdd = commands
            .filter(({ command }) => !localBodies.has(command.body.trim()))
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

        const syncResult = db.syncRemoteCommands(libraryId, sha, toAdd, [], [])
        const library = db.getLibraryByRepo(folderPath)!
        return { library, syncResult }
    } else {
        // No manifest — create as uninitialized
        const folderName = path.basename(folderPath)
            .replace(/[-_]/g, ' ')
            .replace(/\b\w/g, c => c.toUpperCase())
        db.addLibrary(folderPath, folderName, '', undefined, 'local')
        const library = db.getLibraryByRepo(folderPath)!
        return { library, syncResult: { added: 0, updated: 0, removed: 0, errors: [] } }
    }
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

function slugify(title: string): string {
    return title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/[\s_]+/g, '-')
        .replace(/-+/g, '-')
        || 'untitled'
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

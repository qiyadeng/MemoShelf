import { app } from 'electron'
import { promises as fs, watch, type FSWatcher } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import crypto from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath, pathToFileURL } from 'node:url'
import AdmZip from 'adm-zip'
import * as db from './database'
import * as settings from './settings'
import type { BatchCommandMutationResult, CommandMutationResult, DiscoveredLibrary, Library, LibraryManifest, LibraryWorkingTreeStatus, RemoteCommand, SyncResult } from '../../shared/types'
import {
    buildLibraryCommandFileData,
    normalizeCommandId,
    parseLibraryCommandFile,
    serializeLibraryCommandFile,
    slugify,
    toIndexedLibraryCommandData,
} from '../../shared/library-command'
export { slugify } from '../../shared/library-command'

// ── Local Folder Scanning ────────────────────────────────────────

interface ScanResult {
    manifest: LibraryManifest
    manifestPath: string
    commands: Array<{ path: string; command: RemoteCommand }>
}

interface CommandFormData {
    title: string
    body: string
    description: string
    tags: string
    language: string
}

const LIBRARY_ATTACHMENTS_DIR = 'attachments'
const IMAGE_DATA_URI_RE = /^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=]+)$/i
const IMAGE_TAG_RE = /<img\b[^>]*>/gi
const IMAGE_SRC_ATTR_RE = /\bsrc=(['"])(.*?)\1/i
const execFileAsync = promisify(execFile)
type GitCommandRunner = (args: string[], cwd: string) => Promise<{ stdout: string }>

function commandAttachmentsFolderPath(libraryRoot: string, commandId: string): string {
    return path.join(libraryRoot, LIBRARY_ATTACHMENTS_DIR, commandId)
}

function createWorkingTreeStatus(
    overrides: Partial<LibraryWorkingTreeStatus> & Pick<LibraryWorkingTreeStatus, 'state'>
): LibraryWorkingTreeStatus {
    return {
        state: overrides.state,
        has_changes: overrides.has_changes ?? false,
        modified: overrides.modified ?? 0,
        added: overrides.added ?? 0,
        deleted: overrides.deleted ?? 0,
        checked_at: overrides.checked_at ?? new Date().toISOString(),
        error: overrides.error ?? null,
    }
}

async function runSystemGit(args: string[], cwd: string): Promise<{ stdout: string }> {
    const { stdout } = await execFileAsync('git', ['-C', cwd, ...args])
    return { stdout: String(stdout) }
}

function parseWorkingTreeCounts(stdout: string): Pick<LibraryWorkingTreeStatus, 'has_changes' | 'modified' | 'added' | 'deleted'> {
    let modified = 0
    let added = 0
    let deleted = 0

    for (const line of stdout.split('\n')) {
        if (!line.trim()) {
            continue
        }

        const code = line.slice(0, 2)
        const [indexStatus, workTreeStatus] = code

        if (code === '??' || indexStatus === 'A') {
            added += 1
            continue
        }

        if (indexStatus === 'D' || workTreeStatus === 'D') {
            deleted += 1
            continue
        }

        modified += 1
    }

    return {
        has_changes: modified > 0 || added > 0 || deleted > 0,
        modified,
        added,
        deleted,
    }
}

function isGitMissingError(error: unknown): boolean {
    const execError = error as NodeJS.ErrnoException | undefined
    if (!execError) {
        return false
    }

    return execError.code === 'ENOENT' || /not found/i.test(execError.message || '')
}

function isNotRepoError(error: unknown): boolean {
    const execError = error as NodeJS.ErrnoException | undefined
    const stderr = typeof (execError as { stderr?: unknown })?.stderr === 'string'
        ? String((execError as { stderr?: unknown }).stderr)
        : ''
    const message = `${execError?.message || ''}\n${stderr}`.toLowerCase()

    return message.includes('not a git repository')
}

export async function getLibraryWorkingTreeStatus(
    library: Library,
    runGit: GitCommandRunner = runSystemGit
): Promise<LibraryWorkingTreeStatus> {
    if (!library.local_path) {
        return createWorkingTreeStatus({ state: 'no_working_copy' })
    }

    try {
        await runGit(['rev-parse', '--is-inside-work-tree'], library.local_path)
    } catch (error) {
        if (isGitMissingError(error)) {
            return createWorkingTreeStatus({
                state: 'git_unavailable',
                error: 'System git is unavailable on this machine.',
            })
        }

        if (isNotRepoError(error)) {
            return createWorkingTreeStatus({ state: 'not_repo' })
        }

        return createWorkingTreeStatus({
            state: 'error',
            error: (error as Error).message,
        })
    }

    try {
        const { stdout } = await runGit([
            'status',
            '--porcelain=1',
            '--untracked-files=all',
            '--',
            '.',
        ], library.local_path)
        const counts = parseWorkingTreeCounts(stdout)
        return createWorkingTreeStatus({
            state: counts.has_changes ? 'dirty' : 'clean',
            ...counts,
        })
    } catch (error) {
        if (isGitMissingError(error)) {
            return createWorkingTreeStatus({
                state: 'git_unavailable',
                error: 'System git is unavailable on this machine.',
            })
        }

        return createWorkingTreeStatus({
            state: 'error',
            error: (error as Error).message,
        })
    }
}

export async function getAllLibrariesWithWorkingTreeStatus(): Promise<Library[]> {
    const libraries = db.getAllLibraries()
    return Promise.all(
        libraries.map(async (library) => ({
            ...library,
            working_tree: await getLibraryWorkingTreeStatus(library),
        }))
    )
}

function toPosixPath(value: string): string {
    return value.split(path.sep).join(path.posix.sep)
}

function normalizeRelativeAttachmentPath(src: string): string | null {
    if (!src || /^[a-z][a-z0-9+.-]*:/i.test(src) || src.startsWith('//')) {
        return null
    }

    const stripped = src.trim().replace(/^\.?\//, '')
    if (!stripped) {
        return null
    }

    const normalized = path.posix.normalize(stripped)
    if (
        normalized === LIBRARY_ATTACHMENTS_DIR ||
        normalized.startsWith(`${LIBRARY_ATTACHMENTS_DIR}/`)
    ) {
        return normalized
    }

    return null
}

function relativeAttachmentPathFromFileUrl(src: string, libraryRoot: string): string | null {
    if (!src.startsWith('file://')) {
        return null
    }

    try {
        const filePath = fileURLToPath(src)
        const relative = path.relative(libraryRoot, filePath)
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
            return null
        }

        return normalizeRelativeAttachmentPath(toPosixPath(relative))
    } catch {
        return null
    }
}

function parseImageDataUri(src: string): { mimeType: string; buffer: Buffer } | null {
    const match = src.match(IMAGE_DATA_URI_RE)
    if (!match) {
        return null
    }

    const [, mimeType, payload] = match
    return {
        mimeType: mimeType.toLowerCase(),
        buffer: Buffer.from(payload, 'base64'),
    }
}

function getAttachmentExtension(mimeType: string): string {
    switch (mimeType) {
        case 'image/jpeg':
            return 'jpg'
        case 'image/gif':
            return 'gif'
        case 'image/webp':
            return 'webp'
        case 'image/svg+xml':
            return 'svg'
        default:
            return 'png'
    }
}

async function rewriteImageSources(
    body: string,
    transform: (src: string) => Promise<string> | string
): Promise<string> {
    let rewritten = ''
    let lastIndex = 0

    for (const match of body.matchAll(IMAGE_TAG_RE)) {
        const tag = match[0]
        const index = match.index ?? 0
        const srcMatch = tag.match(IMAGE_SRC_ATTR_RE)

        rewritten += body.slice(lastIndex, index)

        if (!srcMatch) {
            rewritten += tag
            lastIndex = index + tag.length
            continue
        }

        const [, quote, src] = srcMatch
        const nextSrc = await transform(src)
        rewritten += tag.replace(`${quote}${src}${quote}`, `${quote}${nextSrc}${quote}`)
        lastIndex = index + tag.length
    }

    rewritten += body.slice(lastIndex)
    return rewritten
}

async function cleanupCommandAttachments(
    libraryRoot: string,
    commandId: string,
    referencedPaths: Set<string>
): Promise<void> {
    const attachmentsDir = commandAttachmentsFolderPath(libraryRoot, commandId)

    try {
        const entries = await fs.readdir(attachmentsDir, { withFileTypes: true })
        for (const entry of entries) {
            if (!entry.isFile()) {
                continue
            }

            const relativePath = path.posix.join(LIBRARY_ATTACHMENTS_DIR, commandId, entry.name)
            if (!referencedPaths.has(relativePath)) {
                await fs.rm(path.join(attachmentsDir, entry.name), { force: true })
            }
        }

        const remaining = await fs.readdir(attachmentsDir)
        if (remaining.length === 0) {
            await fs.rm(attachmentsDir, { recursive: true, force: true })
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error
        }
    }
}

async function normalizeRichTextBodyForLibraryWrite(
    body: string,
    libraryRoot: string,
    commandId: string
): Promise<string> {
    const referencedPaths = new Set<string>()
    const attachmentsDir = commandAttachmentsFolderPath(libraryRoot, commandId)

    const rewritten = await rewriteImageSources(body, async (src) => {
        const relativeExisting = normalizeRelativeAttachmentPath(src) || relativeAttachmentPathFromFileUrl(src, libraryRoot)
        if (relativeExisting) {
            referencedPaths.add(relativeExisting)
            return relativeExisting
        }

        const imageData = parseImageDataUri(src)
        if (!imageData) {
            return src
        }

        await fs.mkdir(attachmentsDir, { recursive: true })
        const hash = crypto.createHash('sha256').update(imageData.buffer).digest('hex').slice(0, 16)
        const fileName = `image-${hash}.${getAttachmentExtension(imageData.mimeType)}`
        const relativePath = path.posix.join(LIBRARY_ATTACHMENTS_DIR, commandId, fileName)
        await fs.writeFile(path.join(libraryRoot, relativePath), imageData.buffer)
        referencedPaths.add(relativePath)
        return relativePath
    })

    await cleanupCommandAttachments(libraryRoot, commandId, referencedPaths)
    return rewritten
}

function resolveRichTextAttachmentUrls(body: string, libraryRoot: string): string {
    return body.replace(IMAGE_TAG_RE, (tag) => {
        const srcMatch = tag.match(IMAGE_SRC_ATTR_RE)
        if (!srcMatch) {
            return tag
        }

        const [, quote, src] = srcMatch
        const relativePath = normalizeRelativeAttachmentPath(src)
        if (!relativePath) {
            return tag
        }

        const fileUrl = pathToFileURL(path.join(libraryRoot, relativePath)).href
        return tag.replace(`${quote}${src}${quote}`, `${quote}${fileUrl}${quote}`)
    })
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

function createCommandId(): string {
    return crypto.randomUUID().toLowerCase()
}

async function writeCommandFile(
    folderPath: string,
    fileName: string,
    command: CommandFormData,
    createdAt: string,
    id: string,
    updatedAt?: string
): Promise<void> {
    const normalizedBody = command.language === 'richtext'
        ? await normalizeRichTextBodyForLibraryWrite(command.body, folderPath, id)
        : command.body
    if (command.language !== 'richtext') {
        await cleanupCommandAttachments(folderPath, id, new Set())
    }
    const fileData = buildLibraryCommandFileData({
        title: command.title,
        body: normalizedBody,
        description: command.description,
        tags: command.tags,
        language: command.language,
        created_at: createdAt,
        updated_at: updatedAt,
    }, id)
    await fs.writeFile(
        path.join(folderPath, fileName),
        serializeLibraryCommandFile(fileData),
        'utf8'
    )
}

async function findUniqueCommandFileName(
    folderPath: string,
    title: string,
    options: { excludeFileName?: string } = {}
): Promise<string> {
    const baseName = slugify(title)
    let counter = 0

    while (true) {
        const fileName = counter === 0 ? `${baseName}.json` : `${baseName}-${counter + 1}.json`
        if (fileName === options.excludeFileName) {
            return fileName
        }

        try {
            await fs.access(path.join(folderPath, fileName))
            counter += 1
        } catch {
            return fileName
        }
    }
}

async function resolveUpdatedCommandFileName(
    folderPath: string,
    currentFileName: string,
    nextTitle: string
): Promise<string> {
    return findUniqueCommandFileName(folderPath, nextTitle, { excludeFileName: currentFileName })
}

async function readLibraryCommandFileMetadata(filePath: string): Promise<{ id: string | null; created_at?: string; updated_at?: string } | null> {
    try {
        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8')) as {
            id?: string
            created_at?: string
            updated_at?: string
        }

        return {
            id: normalizeCommandId(parsed.id),
            created_at: parsed.created_at,
            updated_at: parsed.updated_at,
        }
    } catch {
        return null
    }
}

function getWorkingCopyRootPath(baseDir: string, libraryRepo: string): string {
    return path.join(baseDir, 'working-copies', 'github', ...libraryRepo.split('/').filter(Boolean))
}

function getManifestDirectory(manifestPath: string | null): string {
    if (!manifestPath || !manifestPath.includes('/')) {
        return ''
    }

    return manifestPath.slice(0, manifestPath.lastIndexOf('/'))
}

function toWorkingCopyCommandPath(remotePath: string, manifestPath: string | null): string {
    const manifestDir = getManifestDirectory(manifestPath)
    if (!manifestDir) {
        return remotePath
    }

    const prefix = `${manifestDir}/`
    return remotePath.startsWith(prefix) ? remotePath.slice(prefix.length) : remotePath
}

function resolveFileBackedLocalCommand(commandId: number): { command: db.Command; library: Library } | null {
    const command = db.getAllCommands().find(c => c.id === commandId)
    if (!command || command.source !== 'remote' || !command.library_id || !command.remote_path) {
        return null
    }

    const library = db.getAllLibraries().find(l => l.id === command.library_id)
    if (!isInitializedLocalLibrary(library)) {
        return null
    }

    return { command, library }
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

async function findManifests(rootPath: string, maxDepth: number, depth = 0): Promise<string[]> {
    const manifests: string[] = []
    const entries = await fs.readdir(rootPath, { withFileTypes: true })

    for (const entry of entries) {
        const entryPath = path.join(rootPath, entry.name)

        if (entry.isFile() && entry.name === '.snipforge.json') {
            manifests.push(entryPath)
            continue
        }

        if (!entry.isDirectory()) {
            continue
        }

        if (depth >= maxDepth) {
            continue
        }

        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
            continue
        }

        manifests.push(...await findManifests(entryPath, maxDepth, depth + 1))
    }

    return manifests
}

async function buildDiscoveredLocalLibrary(manifestFilePath: string): Promise<DiscoveredLibrary> {
    const libraryRoot = path.dirname(manifestFilePath)
    const scanResult = await scanLocalFolder(libraryRoot)

    return {
        name: scanResult.manifest.name || path.basename(libraryRoot),
        description: scanResult.manifest.description || '',
        path: libraryRoot,
        manifestPath: manifestFilePath,
        commandCount: scanResult.commands.length,
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

function toIndexedLocalLibraryCommandData(command: CommandFormData | RemoteCommand, libraryRoot: string) {
    if (command.language !== 'richtext') {
        return toIndexedLibraryCommandData(command)
    }

    return toIndexedLibraryCommandData({
        ...command,
        body: resolveRichTextAttachmentUrls(command.body, libraryRoot),
    })
}

function buildLocalSyncPayload(
    commands: ScanResult['commands'],
    existingBodies: Set<string>,
    libraryRoot: string
) {
    return commands
        .filter(({ command }) => !existingBodies.has(command.body.trim()))
        .map(({ path: filePath, command }) => ({
            remotePath: filePath,
            command: toIndexedLocalLibraryCommandData(command, libraryRoot),
        }))
}

function addLibraryFromScan(
    folderPath: string,
    scanResult: ScanResult | null,
    options: { allowExisting: boolean }
): { library: Library; syncResult: SyncResult } {
    const existing = db.getLibraryByRepo(folderPath)
    if (existing && !options.allowExisting) {
        throw new Error(`Already added: ${path.basename(folderPath)}`)
    }

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
    const toAdd = buildLocalSyncPayload(commands, localBodies, folderPath)
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

async function indexLocalLibrary(folderPath: string, options: { ensureManifest: boolean; allowExisting: boolean }): Promise<{ library: Library; syncResult: SyncResult }> {
    const stat = await fs.stat(folderPath)
    if (!stat.isDirectory()) throw new Error('Not a directory')

    const scanResult = options.ensureManifest
        ? await createManifestIfMissing(folderPath)
        : await readFolderManifest(folderPath)

    return addLibraryFromScan(folderPath, scanResult, { allowExisting: options.allowExisting })
}

export async function createLocalLibraryCommand(command: CommandFormData): Promise<CommandMutationResult> {
    const library = getDefaultWritableLocalLibrary()
    if (!library) {
        const id = db.addCommand({
            title: command.title,
            body: command.body,
            description: command.description,
            tags: command.tags,
            language: command.language,
            source: 'local',
            library_id: null,
            remote_path: null,
        })
        return { success: id > 0, mode: 'database' }
    }

    const fileName = await findUniqueCommandFileName(library.github_repo, command.title)
    const createdAt = new Date().toISOString()
    await writeCommandFile(library.github_repo, fileName, command, createdAt, createCommandId())

    const syncResult = await syncLocalLibrary(library.id, true)
    const updatedLibrary = db.getAllLibraries().find(l => l.id === library.id) || library
    return { success: true, mode: 'library', library: updatedLibrary, syncResult }
}

export async function createLocalLibraryCommands(commands: CommandFormData[]): Promise<BatchCommandMutationResult> {
    if (commands.length === 0) {
        return { success: true, mode: 'database', processed: 0, succeeded: 0, failed: 0, errors: [] }
    }

    const library = getDefaultWritableLocalLibrary()
    if (!library) {
        db.addCommands(commands.map(command => ({
            title: command.title,
            body: command.body,
            description: command.description,
            tags: command.tags,
            language: command.language,
            source: 'local',
            library_id: null,
            remote_path: null,
        })))

        return {
            success: true,
            mode: 'database',
            processed: commands.length,
            succeeded: commands.length,
            failed: 0,
            errors: [],
        }
    }

    const errors: string[] = []
    let succeeded = 0

    for (const command of commands) {
        try {
            const fileName = await findUniqueCommandFileName(library.github_repo, command.title)
            const createdAt = new Date().toISOString()
            await writeCommandFile(library.github_repo, fileName, command, createdAt, createCommandId())
            succeeded += 1
        } catch (error) {
            errors.push(`Failed to create "${command.title}": ${(error as Error).message}`)
        }
    }

    const updatedLibrary = db.getAllLibraries().find(l => l.id === library.id) || library
    if (succeeded === 0) {
        return {
            success: false,
            mode: 'library',
            processed: commands.length,
            succeeded: 0,
            failed: commands.length,
            errors,
            libraries: [updatedLibrary],
        }
    }

    const syncResult = await syncLocalLibrary(library.id, true)
    errors.push(...syncResult.errors)

    return {
        success: errors.length === 0,
        mode: 'library',
        processed: commands.length,
        succeeded,
        failed: commands.length - succeeded,
        errors,
        libraries: [db.getAllLibraries().find(l => l.id === library.id) || updatedLibrary],
    }
}

export async function updateLocalLibraryCommand(commandId: number, updates: CommandFormData): Promise<CommandMutationResult> {
    const target = resolveFileBackedLocalCommand(commandId)
    if (!target) {
        const success = db.updateCommand(commandId, {
            title: updates.title,
            body: updates.body,
            description: updates.description,
            tags: updates.tags,
            language: updates.language,
        })
        return { success, mode: 'database' }
    }

    const currentFileName = target.command.remote_path
    const nextFileName = await resolveUpdatedCommandFileName(target.library.github_repo, currentFileName, updates.title)
    const filePath = path.join(target.library.github_repo, currentFileName)
    const existing = await readLibraryCommandFileMetadata(filePath)

    if (!existing) {
        throw new Error('Command file not found')
    }

    if (nextFileName !== currentFileName) {
        await fs.rename(filePath, path.join(target.library.github_repo, nextFileName))
    }

    await writeCommandFile(
        target.library.github_repo,
        nextFileName,
        updates,
        existing.created_at || target.command.created_at,
        existing.id || createCommandId()
    )

    const updatedFile = await fs.readFile(path.join(target.library.github_repo, nextFileName), 'utf8')
        .then(content => JSON.parse(content) as RemoteCommand)
    const indexed = toIndexedLocalLibraryCommandData(updatedFile, target.library.github_repo)
    const updated = db.updateRemoteCommandById(commandId, {
        remote_path: nextFileName,
        title: indexed.title,
        body: indexed.body,
        description: indexed.description,
        tags: indexed.tags,
        language: indexed.language,
        created_at: existing.created_at || target.command.created_at,
        updated_at: indexed.updated_at,
    })

    if (!updated) {
        throw new Error('Failed to update indexed command after file write')
    }

    const syncResult = await syncLocalLibrary(target.library.id, true)
    const updatedLibrary = db.getAllLibraries().find(l => l.id === target.library.id) || target.library
    return { success: true, mode: 'library', library: updatedLibrary, syncResult }
}

export async function deleteLocalLibraryCommand(commandId: number): Promise<CommandMutationResult> {
    const target = resolveFileBackedLocalCommand(commandId)
    if (!target) {
        const success = db.deleteCommand(commandId)
        return { success, mode: 'database' }
    }

    const filePath = path.join(target.library.github_repo, target.command.remote_path)
    const existing = await readLibraryCommandFileMetadata(filePath)
    await fs.rm(filePath, { force: true })
    if (existing?.id) {
        await cleanupCommandAttachments(target.library.github_repo, existing.id, new Set())
    }
    const syncResult = await syncLocalLibrary(target.library.id, true)
    const updatedLibrary = db.getAllLibraries().find(l => l.id === target.library.id) || target.library
    return { success: true, mode: 'library', library: updatedLibrary, syncResult }
}

export async function deleteLocalLibraryCommands(commandIds: number[]): Promise<BatchCommandMutationResult> {
    if (commandIds.length === 0) {
        return { success: true, mode: 'database', processed: 0, succeeded: 0, failed: 0, errors: [] }
    }

    const errors: string[] = []
    const libraryIds = new Set<number>()
    const fileDeletesByLibrary = new Map<number, string[]>()
    const databaseIds: number[] = []

    for (const commandId of commandIds) {
        const target = resolveFileBackedLocalCommand(commandId)
        if (!target) {
            databaseIds.push(commandId)
            continue
        }

        libraryIds.add(target.library.id)
        const deletions = fileDeletesByLibrary.get(target.library.id) || []
        deletions.push(path.join(target.library.github_repo, target.command.remote_path as string))
        fileDeletesByLibrary.set(target.library.id, deletions)
    }

    let succeeded = 0

    if (databaseIds.length > 0) {
        const deleted = db.deleteCommandsByIds(databaseIds)
        succeeded += deleted
        if (deleted !== databaseIds.length) {
            errors.push(`Failed to delete ${databaseIds.length - deleted} database-backed command(s)`)
        }
    }

    for (const [libraryId, filePaths] of fileDeletesByLibrary.entries()) {
        for (const filePath of filePaths) {
            try {
                const existing = await readLibraryCommandFileMetadata(filePath)
                await fs.rm(filePath, { force: true })
                if (existing?.id) {
                    await cleanupCommandAttachments(path.dirname(filePath), existing.id, new Set())
                }
                succeeded += 1
            } catch (error) {
                errors.push(`Failed to delete "${path.basename(filePath)}": ${(error as Error).message}`)
            }
        }

        try {
            const syncResult = await syncLocalLibrary(libraryId, true)
            errors.push(...syncResult.errors)
        } catch (error) {
            errors.push(`Failed to sync local library ${libraryId}: ${(error as Error).message}`)
        }
    }

    const libraries = [...libraryIds]
        .map(libraryId => db.getAllLibraries().find(library => library.id === libraryId))
        .filter((library): library is Library => !!library)

    const mode = databaseIds.length > 0 && fileDeletesByLibrary.size > 0
        ? 'mixed'
        : fileDeletesByLibrary.size > 0
            ? 'library'
            : 'database'

    return {
        success: succeeded > 0 && errors.length === 0,
        mode,
        processed: commandIds.length,
        succeeded,
        failed: commandIds.length - succeeded,
        errors,
        libraries,
    }
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
            const command = parseLibraryCommandFile(parsed)
            if (!command) continue
            // Use just the filename as the "remote_path" (relative to library root)
            commands.push({ path: file.name, command })
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
            toAdd.push({ remotePath: filePath, command: toIndexedLocalLibraryCommandData(command, folderPath) })
        } else {
            const remoteUpdated = command.updated_at || ''
            const localUpdated = local.updated_at || ''
            if (remoteUpdated > localUpdated) {
                const indexed = toIndexedLocalLibraryCommandData(command, folderPath)
                toUpdate.push({
                    remotePath: filePath,
                    command: {
                        title: indexed.title,
                        body: indexed.body,
                        description: indexed.description,
                        tags: indexed.tags,
                        language: indexed.language,
                        updated_at: indexed.updated_at,
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

export async function reindexInitializedLocalLibraries(): Promise<Array<{ libraryId: number; result: SyncResult; error?: string }>> {
    const libraries = db.getAllLibraries()
        .filter(library => library.type === 'local' && !!library.manifest_path)

    const results: Array<{ libraryId: number; result: SyncResult; error?: string }> = []

    for (const library of libraries) {
        try {
            const result = await syncLocalLibrary(library.id, true)
            results.push({ libraryId: library.id, result })
        } catch (error) {
            results.push({
                libraryId: library.id,
                result: { added: 0, updated: 0, removed: 0, errors: [(error as Error).message] },
                error: (error as Error).message,
            })
        }
    }

    return results
}

export async function migrateRemoteLibrariesToLocalWorkingCopies(baseDir = app.getPath('userData')): Promise<{
    migrated: number
    skipped: number
    errors: string[]
}> {
    const libraries = db.getAllLibraries()
    const remoteLibraries = libraries.filter(library => library.type === 'github')
    const errors: string[] = []
    let migrated = 0
    let skipped = 0

    for (const library of remoteLibraries) {
        try {
            const targetRoot = getWorkingCopyRootPath(baseDir, library.github_repo)
            await fs.mkdir(targetRoot, { recursive: true })

            const manifestPath = path.join(targetRoot, '.snipforge.json')
            const manifest = {
                snipforge: 'library',
                name: library.name,
                description: library.description || '',
                format_version: '1.0',
            }
            await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8')

            const remoteCommands = db.getRemoteCommands(library.id)
            for (const command of remoteCommands) {
                const localPath = toWorkingCopyCommandPath(command.remote_path || '', library.manifest_path)
                if (!localPath) {
                    skipped += 1
                    continue
                }

                const filePath = path.join(targetRoot, localPath)
                await fs.mkdir(path.dirname(filePath), { recursive: true })
                const existing = await readLibraryCommandFileMetadata(filePath)
                const fileData = buildLibraryCommandFileData({
                    title: command.title,
                    body: command.body,
                    description: command.description,
                    tags: command.tags,
                    language: command.language,
                    created_at: existing?.created_at || command.created_at,
                    updated_at: existing?.updated_at || command.updated_at,
                }, existing?.id || createCommandId(), existing?.updated_at || command.updated_at)

                await fs.writeFile(filePath, serializeLibraryCommandFile(fileData), 'utf8')

                const pathChanged = localPath !== command.remote_path
                if (pathChanged || command.source !== 'remote') {
                    const updated = db.updateRemoteCommandById(command.id, {
                        remote_path: localPath,
                        title: command.title,
                        body: command.body,
                        description: command.description,
                        tags: command.tags,
                        language: command.language,
                        created_at: command.created_at,
                        updated_at: command.updated_at,
                    })

                    if (!updated) {
                        throw new Error(`Failed to update command path for ${command.title}`)
                    }
                }
            }

            db.updateLibraryToLocalWorkingCopy(
                library.id,
                targetRoot,
                library.github_repo,
                library.last_synced_sha
            )

            migrated += 1
        } catch (error) {
            errors.push(`Failed to migrate "${library.name}": ${(error as Error).message}`)
        }
    }

    return { migrated, skipped, errors }
}

export async function migrateLegacyDbOnlyCommandsToDefaultLibrary(): Promise<{
    migrated: number
    skipped: number
    library: Library | null
    completed: boolean
}> {
    const legacyCommands = db.getLegacyDbOnlyCommands()
    if (legacyCommands.length === 0) {
        settings.set('library.legacyDbMigrationCompleted', true)
        return { migrated: 0, skipped: 0, library: getDefaultWritableLocalLibrary(), completed: true }
    }

    const library = getDefaultWritableLocalLibrary()
    if (!library) {
        settings.set('library.legacyDbMigrationCompleted', false)
        return { migrated: 0, skipped: 0, library: null, completed: false }
    }

    const scanResult = await scanLocalFolder(library.github_repo)
    const existingBodies = new Set(scanResult.commands.map(({ command }) => command.body.trim()))

    let migrated = 0
    let skipped = 0

    for (const legacy of legacyCommands) {
        if (existingBodies.has(legacy.body.trim())) {
            skipped += 1
            continue
        }

        const fileName = await findUniqueCommandFileName(library.github_repo, legacy.title)
        await writeCommandFile(
            library.github_repo,
            fileName,
            {
                title: legacy.title,
                body: legacy.body,
                description: legacy.description,
                tags: legacy.tags,
                language: legacy.language,
            },
            legacy.created_at,
            createCommandId(),
            legacy.updated_at
        )
        existingBodies.add(legacy.body.trim())
        migrated += 1
    }

    const deleted = db.deleteCommandsByIds(legacyCommands.map(command => command.id))
    if (deleted !== legacyCommands.length) {
        settings.set('library.legacyDbMigrationCompleted', false)
        throw new Error(`Legacy migration deleted ${deleted} of ${legacyCommands.length} DB-only commands`)
    }

    await syncLocalLibrary(library.id, true)
    settings.set('library.legacyDbMigrationCompleted', true)
    return { migrated, skipped, library, completed: true }
}
// ── Open Local Folder ────────────────────────────────────────────

export async function openLocalFolder(folderPath: string): Promise<{ library: Library; syncResult: SyncResult } | { needsPick: true; libraries: DiscoveredLibrary[] }> {
    // Check folder exists
    try {
        const stat = await fs.stat(folderPath)
        if (!stat.isDirectory()) throw new Error('Not a directory')
    } catch (e) {
        if ((e as Error).message === 'Not a directory') throw e
        throw new Error(`Folder not found: ${folderPath}`)
    }

    const rootScan = await readFolderManifest(folderPath)
    if (rootScan) {
        return addLibraryFromScan(folderPath, rootScan, { allowExisting: false })
    }

    const manifestPaths = (await findManifests(folderPath, 5)).sort()
    if (manifestPaths.length === 0) {
        return addLibraryFromScan(folderPath, null, { allowExisting: false })
    }

    if (manifestPaths.length === 1) {
        const libraryRoot = path.dirname(manifestPaths[0])
        const scanResult = await scanLocalFolder(libraryRoot)
        return addLibraryFromScan(libraryRoot, scanResult, { allowExisting: false })
    }

    const libraries = await Promise.all(manifestPaths.map(buildDiscoveredLocalLibrary))
    libraries.sort((a, b) => a.path.localeCompare(b.path))
    return { needsPick: true, libraries }
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

        const commandData = buildLibraryCommandFileData({
            title: cmd.title,
            body: cmd.body,
            description: cmd.description,
            tags: cmd.tags,
            language: cmd.language,
            created_at: cmd.created_at,
            updated_at: cmd.updated_at,
        }, createCommandId())
        await fs.writeFile(
            path.join(libraryDir, `${fileName}.json`),
            serializeLibraryCommandFile(commandData),
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
        return parseLibraryCommandFile(JSON.parse(content))
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

        const dbCommand = toIndexedLibraryCommandData(command)

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

import { safeStorage } from 'electron'
import * as db from './database'
import type { GitHubUser, LibraryManifest, LibraryPermission, RemoteCommand, SyncResult, Library, BulkPublishResult, DiscoveredLibrary } from '../../shared/types'
import {
    buildLibraryCommandFileData,
    parseLibraryCommandFile,
    serializeLibraryCommandFile,
    slugify,
    toIndexedLibraryCommandData,
} from '../../shared/library-command'

// ── Configuration ─────────────────────────────────────────────────
// GitHub OAuth App client_id (public — safe to embed, no secret needed)
// TODO: Replace with your actual GitHub OAuth App client_id
const CLIENT_ID = 'Ov23liUzEMqcz42aCKBn'
const GITHUB_API = 'https://api.github.com'
const GITHUB_GRAPHQL = 'https://api.github.com/graphql'
const DEVICE_CODE_URL = 'https://github.com/login/device/code'
const ACCESS_TOKEN_URL = 'https://github.com/login/oauth/access_token'

// ── Token Management ──────────────────────────────────────────────

function encryptToken(token: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
        // Fallback: base64 (better than plaintext, but not truly secure)
        return Buffer.from(token).toString('base64')
    }
    return safeStorage.encryptString(token).toString('base64')
}

function decryptToken(encrypted: string): string {
    if (!safeStorage.isEncryptionAvailable()) {
        return Buffer.from(encrypted, 'base64').toString('utf8')
    }
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}

function getStoredToken(): string | null {
    const encrypted = db.getAuthValue('github_token')
    if (!encrypted) return null
    try {
        return decryptToken(encrypted)
    } catch {
        // Token corrupted, clear it
        db.deleteAuthValue('github_token')
        return null
    }
}

function storeToken(token: string): void {
    const encrypted = encryptToken(token)
    db.setAuthValue('github_token', encrypted)
}

function clearToken(): void {
    db.deleteAuthValue('github_token')
}

// ── GitHub API Helpers ────────────────────────────────────────────

async function githubFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = getStoredToken()
    const headers: Record<string, string> = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers as Record<string, string>,
    }
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    const url = path.startsWith('https://') ? path : `${GITHUB_API}${path}`
    return fetch(url, { ...options, headers })
}

/** Parse a GitHub API error response into a user-facing message */
async function parseGitHubError(res: Response): Promise<string> {
    try {
        const body = await res.json()
        const msg = (body as any).message || ''

        if (res.status === 403) {
            if (/rate limit/i.test(msg)) {
                const reset = res.headers.get('x-ratelimit-reset')
                const retryAfter = reset
                    ? ` Try again after ${new Date(Number(reset) * 1000).toLocaleTimeString()}.`
                    : ''
                return `GitHub API rate limit exceeded.${retryAfter}`
            }
            if (/bad credentials/i.test(msg)) {
                return 'GitHub token is invalid or expired. Re-authenticate in Settings → Connectors.'
            }
        }

        return msg || `GitHub API error: ${res.status}`
    } catch {
        return `GitHub API error: ${res.status}`
    }
}

async function graphqlFetch<T = any>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const token = getStoredToken()
    if (!token) throw new Error('GitHub authentication required')

    const res = await fetch(GITHUB_GRAPHQL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    })

    if (!res.ok) {
        throw new Error(await parseGitHubError(res))
    }

    const json = await res.json() as { data?: T; errors?: Array<{ message: string; type?: string }> }

    if (json.errors?.length) {
        const msg = json.errors[0].message
        if (/rate limit/i.test(msg)) {
            throw new Error('GitHub API rate limit exceeded.')
        }
        throw new Error(msg)
    }

    if (!json.data) {
        throw new Error('Empty response from GitHub API')
    }

    return json.data
}

// ── Repo Context (GraphQL) ──────────────────────────────────────

interface RepoContext {
    owner: string
    repo: string
    branch: string
    latestSha: string
    permission: LibraryPermission
}

function derivePermission(viewerLogin: string, ownerLogin: string, viewerPermission: string | null): LibraryPermission {
    if (viewerLogin.toLowerCase() === ownerLogin.toLowerCase()) return 'owner'
    if (viewerPermission === 'ADMIN') return 'curator'
    return 'consumer'
}

/** Single GraphQL call → branch, latest SHA, permission. Used as context for all read operations. */
async function getRepoContext(owner: string, repo: string): Promise<RepoContext> {
    const data = await graphqlFetch<{
        repository: {
            defaultBranchRef: { name: string; target: { oid: string } } | null
            owner: { login: string }
            viewerPermission: string | null
        } | null
        viewer: { login: string }
    }>(
        `query ($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
                defaultBranchRef {
                    name
                    target { ... on Commit { oid } }
                }
                owner { login }
                viewerPermission
            }
            viewer { login }
        }`,
        { owner, name: repo }
    )

    if (!data.repository) {
        throw new Error(`Repository not found: ${owner}/${repo}`)
    }

    const repoData = data.repository
    const branch = repoData.defaultBranchRef?.name || 'main'
    const latestSha = repoData.defaultBranchRef?.target?.oid || ''

    return {
        owner,
        repo,
        branch,
        latestSha,
        permission: derivePermission(data.viewer.login, repoData.owner.login, repoData.viewerPermission),
    }
}

interface TreeEntry {
    name: string
    type: string
    object: { text: string } | null
}

/** Fetch a single directory's contents via GraphQL. Returns flat entries (files + subdirs). */
async function fetchDirectoryContents(owner: string, repo: string, expression: string): Promise<TreeEntry[]> {
    const data = await graphqlFetch<{
        repository: {
            object: { entries: TreeEntry[] } | null
        } | null
    }>(
        `query ($owner: String!, $name: String!, $expression: String!) {
            repository(owner: $owner, name: $name) {
                object(expression: $expression) {
                    ... on Tree {
                        entries {
                            name
                            type
                            object { ... on Blob { text } }
                        }
                    }
                }
            }
        }`,
        { owner, name: repo, expression }
    )

    if (!data.repository) {
        throw new Error(`Repository not found: ${owner}/${repo}`)
    }

    return data.repository.object?.entries || []
}

/** Combined: repo context + directory contents in a single GraphQL call. */
async function getRepoContextWithTree(owner: string, repo: string, dirPath: string): Promise<{ context: RepoContext; entries: TreeEntry[] }> {
    const data = await graphqlFetch<{
        repository: {
            defaultBranchRef: { name: string; target: { oid: string } } | null
            owner: { login: string }
            viewerPermission: string | null
            object: { entries: TreeEntry[] } | null
        } | null
        viewer: { login: string }
    }>(
        `query ($owner: String!, $name: String!, $expression: String!) {
            repository(owner: $owner, name: $name) {
                defaultBranchRef {
                    name
                    target { ... on Commit { oid } }
                }
                owner { login }
                viewerPermission
                object(expression: $expression) {
                    ... on Tree {
                        entries {
                            name
                            type
                            object { ... on Blob { text } }
                        }
                    }
                }
            }
            viewer { login }
        }`,
        { owner, name: repo, expression: `HEAD:${dirPath}` }
    )

    if (!data.repository) {
        throw new Error(`Repository not found: ${owner}/${repo}`)
    }

    const repoData = data.repository
    const branch = repoData.defaultBranchRef?.name || 'main'
    const latestSha = repoData.defaultBranchRef?.target?.oid || ''

    return {
        context: {
            owner,
            repo,
            branch,
            latestSha,
            permission: derivePermission(data.viewer.login, repoData.owner.login, repoData.viewerPermission),
        },
        entries: repoData.object?.entries || [],
    }
}

/** Parse GraphQL tree entries into commands. dirPath is the manifest's parent directory (for building remote_path). */
function parseCommandEntries(entries: TreeEntry[], dirPath: string): Array<{ path: string; command: RemoteCommand }> {
    const commands: Array<{ path: string; command: RemoteCommand }> = []

    for (const entry of entries) {
        if (entry.type !== 'blob' || !entry.name.endsWith('.json') || entry.name === '.snipforge.json') continue
        if (!entry.object?.text) continue

        try {
            const command = parseLibraryCommandFile(JSON.parse(entry.object.text))
            if (!command) continue
            commands.push({
                path: dirPath ? `${dirPath}/${entry.name}` : entry.name,
                command,
            })
        } catch {
            // Not valid JSON or not a command — skip
        }
    }

    return commands
}

/**
 * Discover all SnipForge libraries in a repo.
 * Uses REST recursive tree (1 call) + GraphQL aliased blob reads (1 call) = 2 calls total.
 */
async function discoverLibraries(owner: string, repo: string, context: RepoContext): Promise<DiscoveredLibrary[]> {
    const tree = await getRepoTree(owner, repo, context.branch)
    const manifests = tree.filter(f => f.path.endsWith('.snipforge.json') && f.type === 'blob')

    if (manifests.length === 0) return []

    // Count command JSONs per library directory from tree data (no API call)
    const commandCounts = new Map<string, number>()
    for (const manifest of manifests) {
        const dir = manifest.path.includes('/')
            ? manifest.path.substring(0, manifest.path.lastIndexOf('/'))
            : ''
        const count = tree.filter(f =>
            f.type === 'blob' &&
            f.path.endsWith('.json') &&
            f.path !== manifest.path &&
            (dir === ''
                ? !f.path.includes('/')
                : f.path.startsWith(dir + '/') && !f.path.substring(dir.length + 1).includes('/'))
        ).length
        commandCounts.set(manifest.path, count)
    }

    // Read all manifests with a single GraphQL query using aliases
    const aliases = manifests.map((m, i) => {
        const escaped = m.path.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
        return `m${i}: object(expression: "HEAD:${escaped}") { ... on Blob { text } }`
    }).join('\n')

    const data = await graphqlFetch<{ repository: Record<string, { text: string } | null> }>(
        `query ($owner: String!, $name: String!) {
            repository(owner: $owner, name: $name) {
                ${aliases}
            }
        }`,
        { owner, name: repo }
    )

    const libraries: DiscoveredLibrary[] = []
    for (let i = 0; i < manifests.length; i++) {
        const manifestData = data.repository[`m${i}`]
        if (!manifestData?.text) continue

        try {
            const manifest = JSON.parse(manifestData.text) as LibraryManifest
            const dir = manifests[i].path.includes('/')
                ? manifests[i].path.substring(0, manifests[i].path.lastIndexOf('/'))
                : ''

            libraries.push({
                name: manifest.name || dir || repo,
                description: manifest.description || '',
                path: dir,
                manifestPath: manifests[i].path,
                commandCount: commandCounts.get(manifests[i].path) || 0,
            })
        } catch { /* invalid manifest JSON, skip */ }
    }

    return libraries
}

// ── Auth: Device Flow ─────────────────────────────────────────────

export interface DeviceFlowInit {
    user_code: string
    verification_uri: string
    device_code: string
    expires_in: number
    interval: number
}

export async function startDeviceFlow(): Promise<DeviceFlowInit> {
    const res = await fetch(DEVICE_CODE_URL, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: CLIENT_ID,
            scope: 'repo',
        }),
    })

    if (!res.ok) {
        throw new Error(`Device Flow init failed: ${res.status} ${res.statusText}`)
    }

    const data = await res.json()
    return data
}

export async function pollDeviceFlow(deviceCode: string): Promise<{ success: boolean; user?: GitHubUser; error?: string }> {
    const res = await fetch(ACCESS_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            client_id: CLIENT_ID,
            device_code: deviceCode,
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        }),
    })

    const data = await res.json()

    if (data.error === 'authorization_pending') {
        return { success: false, error: 'authorization_pending' }
    }

    if (data.error === 'slow_down') {
        return { success: false, error: 'slow_down' }
    }

    if (data.error === 'expired_token') {
        return { success: false, error: 'expired_token' }
    }

    if (data.error) {
        return { success: false, error: data.error_description || data.error }
    }

    if (data.access_token) {
        // Store the token securely
        storeToken(data.access_token)

        // Fetch user info
        const user = await getAuthenticatedUser()
        return { success: true, user: user ?? undefined }
    }

    return { success: false, error: 'Unknown error' }
}

export async function getAuthenticatedUser(): Promise<GitHubUser | null> {
    const token = getStoredToken()
    if (!token) return null

    try {
        const res = await githubFetch('/user')
        if (!res.ok) {
            // Distinguish bad token from transient errors (rate limit, network)
            if (res.status === 401) return null // genuinely invalid token
            // 403 or other — don't treat as invalid token, throw so callers can handle
            throw new Error(await parseGitHubError(res))
        }
        const data = await res.json()
        return {
            login: data.login,
            avatar_url: data.avatar_url,
            name: data.name,
        }
    } catch (e) {
        // Re-throw API errors (rate limit, etc.) — only swallow network failures
        if (e instanceof Error && !e.message.includes('fetch')) throw e
        return null
    }
}

export async function getAuthStatus(): Promise<{ authenticated: boolean; user: GitHubUser | null }> {
    const token = getStoredToken()
    if (!token) return { authenticated: false, user: null }

    try {
        const user = await getAuthenticatedUser()
        if (!user) {
            // Token is genuinely invalid (401), clear it
            clearToken()
            return { authenticated: false, user: null }
        }
        return { authenticated: true, user }
    } catch {
        // Transient error (rate limit, network) — token might still be valid, don't clear
        return { authenticated: true, user: null }
    }
}

export function logout(): void {
    clearToken()
}

// ── Repo Operations ───────────────────────────────────────────────

function parseRepoUrl(input: string): { owner: string; repo: string; subpath?: string } {
    // Accept formats: "owner/repo", "owner/repo/sub/path",
    // "https://github.com/owner/repo", "https://github.com/owner/repo/tree/branch/sub/path"
    let cleaned = input.trim()

    // Strip trailing .git
    if (cleaned.endsWith('.git')) {
        cleaned = cleaned.slice(0, -4)
    }

    // Strip trailing slashes
    cleaned = cleaned.replace(/\/+$/, '')

    // Full URL with tree/branch/path
    const urlTreeMatch = cleaned.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/[^/]+\/(.+)/)
    if (urlTreeMatch) {
        return { owner: urlTreeMatch[1], repo: urlTreeMatch[2], subpath: urlTreeMatch[3] }
    }

    // Full URL (plain)
    const urlMatch = cleaned.match(/github\.com\/([^/]+)\/([^/]+?)(?:\/|$)/)
    if (urlMatch) {
        return { owner: urlMatch[1], repo: urlMatch[2] }
    }

    // owner/repo or owner/repo/sub/path format
    const parts = cleaned.split('/')
    if (parts.length >= 2 && parts[0] && parts[1]) {
        const owner = parts[0]
        const repo = parts[1]
        const subpath = parts.length > 2 ? parts.slice(2).join('/') : undefined
        return { owner, repo, subpath }
    }

    throw new Error(`Invalid repo format: "${input}". Use "owner/repo" or a GitHub URL.`)
}

async function getRepoDefaultBranch(owner: string, repo: string): Promise<string> {
    const res = await githubFetch(`/repos/${owner}/${repo}`)
    if (!res.ok) {
        if (res.status === 404) throw new Error(`Repository not found: ${owner}/${repo}`)
        throw new Error(await parseGitHubError(res))
    }
    const data = await res.json()
    return data.default_branch || 'main'
}

// getRepoTree: kept for manifest discovery (no-subpath browse) and getRepoFolders
async function getRepoTree(owner: string, repo: string, branch: string): Promise<Array<{ path: string; type: string; sha: string }>> {
    const res = await githubFetch(`/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`)
    if (!res.ok) throw new Error(await parseGitHubError(res))
    const data = await res.json()
    return data.tree || []
}

// ── Library Operations ────────────────────────────────────────────

/**
 * Browse a library via GraphQL.
 * - If subpath provided in URL → single GraphQL call (tree at that dir)
 * - If no subpath → REST recursive tree to find manifest, then GraphQL for contents
 * Returns manifest, its path, and all parsed commands.
 */
export async function browseLibrary(repoUrl: string, ctx?: RepoContext): Promise<{ manifest: LibraryManifest; manifestPath: string; commands: Array<{ path: string; command: RemoteCommand }>; context: RepoContext }> {
    const { owner, repo, subpath } = parseRepoUrl(repoUrl)

    if (subpath) {
        // Subpath known — single combined GraphQL call
        const { context, entries } = ctx
            ? { context: ctx, entries: await fetchDirectoryContents(owner, repo, `HEAD:${subpath}`).catch(() => []) }
            : await getRepoContextWithTree(owner, repo, subpath)

        // Find manifest in the directory entries
        const manifestEntry = entries.find(e => e.name === '.snipforge.json' && e.type === 'blob')
        if (!manifestEntry?.object?.text) {
            throw new Error('Not a SnipForge library — missing .snipforge.json manifest')
        }

        const manifest = JSON.parse(manifestEntry.object.text) as LibraryManifest
        const manifestPath = `${subpath}/.snipforge.json`
        const commands = parseCommandEntries(entries, subpath)

        return { manifest, manifestPath, commands, context }
    }

    // No subpath — need to discover manifest location
    const context = ctx || await getRepoContext(owner, repo)

    // REST recursive tree to find .snipforge.json (1 call, lightweight — no file contents)
    const tree = await getRepoTree(owner, repo, context.branch)
    const manifestFile = tree.find(f => f.path.endsWith('.snipforge.json') && f.type === 'blob')
    if (!manifestFile) {
        throw new Error('Not a SnipForge library — missing .snipforge.json manifest')
    }

    // Determine manifest's parent directory
    const manifestDir = manifestFile.path.includes('/')
        ? manifestFile.path.substring(0, manifestFile.path.lastIndexOf('/'))
        : '' // root

    // GraphQL to fetch directory contents with inline text (1 call for all files)
    const expression = manifestDir ? `HEAD:${manifestDir}` : `HEAD:`
    const entries = await fetchDirectoryContents(owner, repo, expression)

    // Parse manifest from entries
    const manifestEntry = entries.find(e => e.name === '.snipforge.json' && e.type === 'blob')
    if (!manifestEntry?.object?.text) {
        throw new Error('Not a SnipForge library — missing .snipforge.json manifest')
    }
    const manifest = JSON.parse(manifestEntry.object.text) as LibraryManifest
    const commands = parseCommandEntries(entries, manifestDir)

    return { manifest, manifestPath: manifestFile.path, commands, context }
}

export async function subscribeToLibrary(
    repoUrl: string,
    subpath?: string
): Promise<{ library: Library; syncResult: SyncResult } | { needsPick: true; libraries: DiscoveredLibrary[] }> {
    const parsed = parseRepoUrl(repoUrl)
    const { owner, repo } = parsed
    const effectiveSubpath = subpath || parsed.subpath

    // Build the stored identifier — includes subpath for multi-library repos
    const githubRepo = effectiveSubpath ? `${owner}/${repo}/${effectiveSubpath}` : `${owner}/${repo}`

    // Check if already subscribed (exact match on full identifier)
    const existing = db.getLibraryByRepo(githubRepo)
    if (existing) {
        throw new Error(`Already subscribed to ${githubRepo}`)
    }

    // If no subpath, check for multiple libraries before subscribing
    if (!effectiveSubpath) {
        const context = await getRepoContext(owner, repo)
        const discovered = await discoverLibraries(owner, repo, context)

        if (discovered.length > 1) {
            return { needsPick: true, libraries: discovered }
        }

        // 0 or 1 manifests — proceed with normal flow
        if (discovered.length === 1) {
            // Single library — use scoped browse (efficient: 1 GraphQL call)
            const scopedUrl = discovered[0].path ? `${owner}/${repo}/${discovered[0].path}` : `${owner}/${repo}`
            const browseResult = await browseLibrary(scopedUrl, context)
            return doSubscribe(githubRepo, browseResult)
        }

        // No manifests — subscribe without syncing
        const repoName = repo.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
        db.addLibrary(githubRepo, repoName, '', undefined, 'github', context.permission)
        const library = db.getLibraryByRepo(githubRepo)!
        return { library, syncResult: { added: 0, updated: 0, removed: 0, errors: [] } }
    }

    // Subpath known — direct scoped subscribe
    const browseResult = await browseLibrary(githubRepo)
    return doSubscribe(githubRepo, browseResult)
}

function doSubscribe(githubRepo: string, browseResult: Awaited<ReturnType<typeof browseLibrary>>): { library: Library; syncResult: SyncResult } {
    const { manifest, manifestPath, commands, context } = browseResult

    const libraryId = db.addLibrary(githubRepo, manifest.name, manifest.description, manifestPath, 'github', context.permission)

    const localBodies = db.getLocalCommandBodies()
    const toAdd = commands
        .filter(({ command }) => !localBodies.has(command.body.trim()))
        .map(({ path, command }) => ({
            remotePath: path,
            command: toIndexedLibraryCommandData(command),
        }))

    const syncResult = db.syncRemoteCommands(libraryId, context.latestSha, toAdd, [], [])
    const library = db.getLibraryByRepo(githubRepo)!
    return { library, syncResult }
}

export async function syncLibrary(libraryId: number, force = false): Promise<SyncResult> {
    const libraries = db.getAllLibraries()
    const library = libraries.find(l => l.id === libraryId)
    if (!library) throw new Error(`Library not found: ${libraryId}`)

    // Skip uninitialized libraries (no manifest)
    if (!library.manifest_path) {
        return { added: 0, updated: 0, removed: 0, errors: [] }
    }

    const { owner, repo } = parseRepoUrl(library.github_repo)

    // Lightweight context check first (1 GraphQL call) — gives us SHA + permission
    const context = await getRepoContext(owner, repo)

    // Refresh permissions on every sync
    if (context.permission !== library.permission) {
        db.updateLibraryPermission(libraryId, context.permission)
    }

    // Skip if nothing changed (unless force-syncing, e.g. user clicked Sync)
    if (!force && library.last_synced_sha === context.latestSha) {
        return { added: 0, updated: 0, removed: 0, errors: [] }
    }

    // Scope browse to the library's manifest directory (critical for multi-library repos)
    const manifestDir = library.manifest_path!.includes('/')
        ? library.manifest_path!.substring(0, library.manifest_path!.lastIndexOf('/'))
        : ''
    const scopedUrl = manifestDir ? `${owner}/${repo}/${manifestDir}` : `${owner}/${repo}`

    // Fetch remote commands — pass context through to avoid redundant calls
    let browseResult: Awaited<ReturnType<typeof browseLibrary>>
    try {
        browseResult = await browseLibrary(scopedUrl, context)
    } catch (e) {
        const msg = (e as Error).message
        if (msg.includes('missing .snipforge.json')) {
            db.clearLibraryManifest(libraryId)
            return { added: 0, updated: 0, removed: 0, errors: ['Manifest was removed from the repo. Click Init to re-create it.'] }
        }
        throw e
    }
    const { manifestPath, commands: remoteCommands } = browseResult

    // Correct manifest_path if it drifted (e.g., old record pointed to root)
    if (manifestPath && manifestPath !== library.manifest_path) {
        db.updateLibraryManifest(libraryId, library.name, library.description, manifestPath)
    }

    // Get current local remote commands for this library
    const localRemote = db.getRemoteCommands(libraryId)
    const localByPath = new Map(localRemote.map(c => [c.remote_path, c]))
    const remotePaths = new Set(remoteCommands.map(c => c.path))

    // Diff: add, update, remove
    const toAdd: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; created_at: string; updated_at: string } }> = []
    const toUpdate: Array<{ remotePath: string; command: { title: string; body: string; description: string; tags: string; language: string; updated_at: string } }> = []
    const toRemove: string[] = []

    // Body dedup: skip remote commands whose body already exists locally
    const localBodies = db.getLocalCommandBodies()

    for (const { path, command } of remoteCommands) {
        const local = localByPath.get(path)
        if (!local) {
            // Skip if a local command already has the same body
            if (localBodies.has(command.body.trim())) continue

            // New command
            toAdd.push({ remotePath: path, command: toIndexedLibraryCommandData(command) })
        } else {
            // Check if updated (compare updated_at timestamps)
            const remoteUpdated = command.updated_at || ''
            const localUpdated = local.updated_at || ''
            if (remoteUpdated > localUpdated) {
                const indexed = toIndexedLibraryCommandData(command)
                toUpdate.push({
                    remotePath: path,
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

    // Commands that exist locally but not remotely → removed
    for (const local of localRemote) {
        if (local.remote_path && !remotePaths.has(local.remote_path)) {
            toRemove.push(local.remote_path)
        }
    }

    return db.syncRemoteCommands(libraryId, context.latestSha, toAdd, toUpdate, toRemove)
}

export async function syncAllLibraries(): Promise<{ results: Array<{ library: Library; result: SyncResult }> }> {
    const libraries = db.getAllLibraries()
    const results: Array<{ library: Library; result: SyncResult }> = []

    for (const library of libraries) {
        try {
            const result = await syncLibrary(library.id)
            // Re-fetch library to get updated sync timestamp
            const updated = db.getLibraryByRepo(library.github_repo)
            results.push({ library: updated || library, result })
        } catch (e) {
            results.push({
                library,
                result: { added: 0, updated: 0, removed: 0, errors: [(e as Error).message] }
            })
        }
    }

    return { results }
}

export function unsubscribeFromLibrary(libraryId: number): void {
    db.deleteLibrary(libraryId)
}

export async function initLibrary(libraryId: number, name: string, description: string, subpath?: string): Promise<{ library: Library; syncResult: SyncResult }> {
    const libraries = db.getAllLibraries()
    const library = libraries.find(l => l.id === libraryId)
    if (!library) throw new Error(`Library not found: ${libraryId}`)

    if (library.manifest_path) {
        throw new Error('This library is already initialized')
    }

    const { owner, repo } = parseRepoUrl(library.github_repo)
    const branch = await getRepoDefaultBranch(owner, repo)

    // Build the manifest path (strip leading/trailing slashes)
    const manifestDir = subpath ? subpath.replace(/^\/+/, '').replace(/\/+$/, '') : ''
    const manifestPath = manifestDir ? `${manifestDir}/.snipforge.json` : '.snipforge.json'

    // Check if manifest already exists at that path
    const checkRes = await githubFetch(`/repos/${owner}/${repo}/contents/${manifestPath}?ref=${branch}`)
    if (checkRes.ok) {
        throw new Error(`A .snipforge.json already exists at ${manifestPath}`)
    }
    if (checkRes.status !== 404) {
        throw new Error(`Failed to check manifest path: ${checkRes.status}`)
    }

    // Create the manifest content
    const manifest: LibraryManifest = {
        snipforge: 'library',
        name,
        description: description || '',
        format_version: '1.0',
    }
    const content = Buffer.from(JSON.stringify(manifest, null, 2) + '\n').toString('base64')

    // Push via GitHub Contents API
    const putRes = await githubFetch(`/repos/${owner}/${repo}/contents/${manifestPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: `Initialize SnipForge library`,
            content,
            branch,
        }),
    })

    if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}))
        throw new Error(`Failed to create manifest: ${(err as any).message || putRes.status}`)
    }

    // Update library record with manifest info
    db.updateLibraryManifest(libraryId, name, description, manifestPath)

    // Auto-sync (will find the manifest now)
    const syncResult = await syncLibrary(libraryId, true)

    const updated = db.getLibraryByRepo(library.github_repo)!
    return { library: updated, syncResult }
}

export async function getRepoFolders(repoUrl: string): Promise<string[]> {
    const { owner, repo } = parseRepoUrl(repoUrl)
    const branch = await getRepoDefaultBranch(owner, repo)
    const tree = await getRepoTree(owner, repo, branch)

    const folders = tree
        .filter(f => f.type === 'tree' && !f.path.includes('node_modules') && !f.path.startsWith('.'))
        .map(f => f.path)
        .sort()

    return folders
}

// ── Publishing ────────────────────────────────────────────────────

function createCommandId(): string {
    return globalThis.crypto.randomUUID().toLowerCase()
}

export async function publishCommand(
    libraryId: number,
    command: { title: string; body: string; description: string; tags: string[]; language: string }
): Promise<{ path: string; created: boolean }> {
    const libraries = db.getAllLibraries()
    const library = libraries.find(l => l.id === libraryId)
    if (!library) throw new Error(`Library not found: ${libraryId}`)
    if (!library.manifest_path) throw new Error('Library is not initialized — run Init first')

    const { owner, repo } = parseRepoUrl(library.github_repo)
    const branch = await getRepoDefaultBranch(owner, repo)

    // Derive file path under the manifest's parent directory
    const manifestDir = library.manifest_path.includes('/')
        ? library.manifest_path.substring(0, library.manifest_path.lastIndexOf('/') + 1)
        : ''
    const filename = `${slugify(command.title)}.json`
    const filePath = `${manifestDir}${filename}`

    const now = new Date().toISOString()
    let commandJson = buildLibraryCommandFileData({
        title: command.title,
        body: command.body,
        description: command.description,
        tags: command.tags,
        language: command.language,
        created_at: now,
        updated_at: now,
    }, createCommandId(), now)

    // Check if file already exists (need SHA for update)
    let existingSha: string | undefined
    const checkRes = await githubFetch(`/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`)
    if (checkRes.ok) {
        const existing = await checkRes.json()
        existingSha = existing.sha

        // Preserve original created_at from existing file
        try {
            const existingContent = Buffer.from(existing.content, 'base64').toString('utf8')
            const existingCommand = parseLibraryCommandFile(JSON.parse(existingContent), now)
            if (existingCommand) {
                commandJson = buildLibraryCommandFileData({
                    title: command.title,
                    body: command.body,
                    description: command.description,
                    tags: command.tags,
                    language: command.language,
                    created_at: existingCommand.created_at,
                    updated_at: now,
                }, existingCommand.id || commandJson.id, now)
            }
        } catch { /* keep the new created_at */ }
    } else if (checkRes.status !== 404) {
        throw new Error(`Failed to check file path: ${checkRes.status}`)
    }

    const content = Buffer.from(serializeLibraryCommandFile(commandJson)).toString('base64')
    const commitMessage = existingSha
        ? `Update ${command.title}`
        : `Add ${command.title}`

    const putBody: Record<string, string> = {
        message: commitMessage,
        content,
        branch,
    }
    if (existingSha) {
        putBody.sha = existingSha
    }

    const putRes = await githubFetch(`/repos/${owner}/${repo}/contents/${filePath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(putBody),
    })

    if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}))
        throw new Error(`Failed to publish: ${(err as any).message || putRes.status}`)
    }

    return { path: filePath, created: !existingSha }
}

export async function unpublishCommand(
    libraryId: number,
    remotePath: string
): Promise<void> {
    const libraries = db.getAllLibraries()
    const library = libraries.find(l => l.id === libraryId)
    if (!library) throw new Error(`Library not found: ${libraryId}`)
    if (!library.manifest_path) throw new Error('Library is not initialized')

    const { owner, repo } = parseRepoUrl(library.github_repo)
    const branch = await getRepoDefaultBranch(owner, repo)

    // Get the file's current SHA (required for DELETE)
    const checkRes = await githubFetch(`/repos/${owner}/${repo}/contents/${remotePath}?ref=${branch}`)
    if (!checkRes.ok) {
        if (checkRes.status === 404) throw new Error('File not found in repo — it may have already been removed')
        throw new Error(`Failed to check file: ${checkRes.status}`)
    }
    const fileData = await checkRes.json()

    // Delete via GitHub Contents API
    const deleteRes = await githubFetch(`/repos/${owner}/${repo}/contents/${remotePath}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: `Remove ${remotePath.split('/').pop()?.replace('.json', '') || remotePath}`,
            sha: fileData.sha,
            branch,
        }),
    })

    if (!deleteRes.ok) {
        const err = await deleteRes.json().catch(() => ({}))
        throw new Error(`Failed to delete: ${(err as any).message || deleteRes.status}`)
    }
}

export async function bulkPublishCommands(
    libraryId: number,
    commands: Array<{ id: number; title: string; body: string; description: string; tags: string[]; language: string }>,
    onProgress?: (result: BulkPublishResult, index: number, total: number) => void
): Promise<BulkPublishResult[]> {
    const results: BulkPublishResult[] = []

    for (let i = 0; i < commands.length; i++) {
        const cmd = commands[i]
        try {
            const { path, created } = await publishCommand(libraryId, {
                title: cmd.title,
                body: cmd.body,
                description: cmd.description,
                tags: cmd.tags,
                language: cmd.language,
            })
            const result: BulkPublishResult = {
                commandId: cmd.id,
                title: cmd.title,
                success: true,
                path,
                created,
            }
            results.push(result)
            onProgress?.(result, i, commands.length)
        } catch (error) {
            const result: BulkPublishResult = {
                commandId: cmd.id,
                title: cmd.title,
                success: false,
                error: (error as Error).message,
            }
            results.push(result)
            onProgress?.(result, i, commands.length)
        }
    }

    return results
}

export function getAllLibraries(): Library[] {
    return db.getAllLibraries()
}

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import * as db from '../electron/main/database'
import * as settings from '../electron/main/settings'
import {
    createLocalLibraryCommands,
    createLocalLibraryCommand,
    deleteLocalLibraryCommands,
    deleteLocalLibraryCommand,
    migrateLegacyDbOnlyCommandsToDefaultLibrary,
    openLocalFolder,
    reindexInitializedLocalLibraries,
    scanLocalFolder,
    setupDefaultWritableLocalLibrary,
    slugify,
    updateLocalLibraryCommand,
} from '../electron/main/local-library'

let tmpDir: string

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snipforge-test-lib-'))
    db.initializeDatabase(path.join(tmpDir, 'test.db'))
})

afterEach(async () => {
    db.closeDatabase()
    await fs.rm(tmpDir, { recursive: true, force: true })
})

// ── slugify ─────────────────────────────────────────────────────

describe('slugify', () => {
    it('converts title to lowercase hyphenated slug', () => {
        expect(slugify('OpenSSL: Create Token')).toBe('openssl-create-token')
    })

    it('handles multiple spaces', () => {
        expect(slugify('My  Cool   Command')).toBe('my-cool-command')
    })

    it('converts underscores to hyphens', () => {
        expect(slugify('snake_case_title')).toBe('snake-case-title')
    })

    it('truncates to 200 characters', () => {
        const long = 'a'.repeat(300)
        expect(slugify(long)).toHaveLength(200)
    })

    it('strips non-alphanumeric characters', () => {
        expect(slugify('Curl: Basic Auth (GET)')).toBe('curl-basic-auth-get')
        expect(slugify('K8s — Get Pod Logs!')).toBe('k8s-get-pod-logs')
    })

    it('collapses consecutive hyphens', () => {
        expect(slugify('test---multiple---hyphens')).toBe('test-multiple-hyphens')
    })

    it('returns "untitled" for empty/whitespace input', () => {
        expect(slugify('')).toBe('untitled')
        expect(slugify('   ')).toBe('untitled')
    })

    it('handles strings with only special characters', () => {
        expect(slugify('!!!@@@')).toBe('untitled')
    })
})

// ── scanLocalFolder ─────────────────────────────────────────────

describe('scanLocalFolder', () => {
    it('reads manifest and command files', async () => {
        // Create manifest
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            snipforge: 'library',
            name: 'Test Lib',
            description: 'A test library',
            format_version: '1.0',
        }))

        // Create a command file
        await fs.writeFile(path.join(tmpDir, 'test-cmd.json'), JSON.stringify({
            snipforge: 'command',
            title: 'Test Command',
            body: 'echo test',
            description: 'A test command',
            tags: ['test'],
            language: 'bash',
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
        }))

        const result = await scanLocalFolder(tmpDir)

        expect(result.manifest.name).toBe('Test Lib')
        expect(result.manifestPath).toBe('.snipforge.json')
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0].path).toBe('test-cmd.json')
        expect(result.commands[0].command.title).toBe('Test Command')
        expect(result.commands[0].command.tags).toEqual(['test'])
    })

    it('throws when manifest is missing', async () => {
        await expect(scanLocalFolder(tmpDir)).rejects.toThrow('missing .snipforge.json')
    })

    it('throws when manifest is invalid JSON', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), 'not json{{{')
        await expect(scanLocalFolder(tmpDir)).rejects.toThrow('not valid JSON')
    })

    it('throws when manifest has no name field', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            description: 'no name',
        }))
        await expect(scanLocalFolder(tmpDir)).rejects.toThrow('missing "name" field')
    })

    it('skips files without title or body', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            name: 'Test', description: '', format_version: '1.0',
        }))

        // Valid command
        await fs.writeFile(path.join(tmpDir, 'valid.json'), JSON.stringify({
            title: 'Valid', body: 'echo valid',
        }))

        // Missing body
        await fs.writeFile(path.join(tmpDir, 'no-body.json'), JSON.stringify({
            title: 'No Body',
        }))

        // Missing title
        await fs.writeFile(path.join(tmpDir, 'no-title.json'), JSON.stringify({
            body: 'echo no title',
        }))

        // Empty title
        await fs.writeFile(path.join(tmpDir, 'empty-title.json'), JSON.stringify({
            title: '   ', body: 'echo empty',
        }))

        const result = await scanLocalFolder(tmpDir)
        expect(result.commands).toHaveLength(1)
        expect(result.commands[0].command.title).toBe('Valid')
    })

    it('skips invalid JSON files gracefully', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            name: 'Test', description: '', format_version: '1.0',
        }))

        await fs.writeFile(path.join(tmpDir, 'valid.json'), JSON.stringify({
            title: 'Valid', body: 'echo valid',
        }))

        await fs.writeFile(path.join(tmpDir, 'broken.json'), 'not json at all')

        const result = await scanLocalFolder(tmpDir)
        expect(result.commands).toHaveLength(1)
    })

    it('applies defaults for missing optional fields', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            name: 'Test', description: '', format_version: '1.0',
        }))

        await fs.writeFile(path.join(tmpDir, 'minimal.json'), JSON.stringify({
            title: 'Minimal',
            body: 'echo minimal',
        }))

        const result = await scanLocalFolder(tmpDir)
        const cmd = result.commands[0].command

        expect(cmd.description).toBe('')
        expect(cmd.tags).toEqual([])
        expect(cmd.language).toBe('plaintext')
        expect(cmd.created_at).toBeTruthy()
        expect(cmd.updated_at).toBeTruthy()
    })

    it('does not scan subdirectories', async () => {
        await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
            name: 'Test', description: '', format_version: '1.0',
        }))

        const subDir = path.join(tmpDir, 'subdir')
        await fs.mkdir(subDir)
        await fs.writeFile(path.join(subDir, 'nested.json'), JSON.stringify({
            title: 'Nested', body: 'echo nested',
        }))

        const result = await scanLocalFolder(tmpDir)
        expect(result.commands).toHaveLength(0)
    })
})

describe('local library CRUD', () => {
    it('opens a nested library when the chosen folder only contains a manifest in a subdirectory', async () => {
        const nestedRoot = path.join(tmpDir, 'repo-root')
        const libraryRoot = path.join(nestedRoot, 'The Armory')
        await fs.mkdir(libraryRoot, { recursive: true })
        await fs.writeFile(path.join(libraryRoot, '.snipforge.json'), JSON.stringify({
            name: 'The Armory',
            description: 'Nested library',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(libraryRoot, 'ping.json'), JSON.stringify({
            title: 'Ping',
            body: 'ping 1.1.1.1',
            tags: ['network'],
        }))

        const result = await openLocalFolder(nestedRoot)

        expect('needsPick' in result).toBe(false)
        if ('needsPick' in result) {
            throw new Error('Expected nested library to open directly')
        }

        expect(result.library.github_repo).toBe(libraryRoot)
        expect(result.library.manifest_path).toBe('.snipforge.json')
        expect(result.syncResult.added).toBe(1)

        const libraries = db.getAllLibraries()
        expect(libraries).toHaveLength(1)
        expect(libraries[0].github_repo).toBe(libraryRoot)
    })

    it('returns a picker payload when a folder contains multiple nested libraries', async () => {
        const nestedRoot = path.join(tmpDir, 'repo-root')
        const alphaRoot = path.join(nestedRoot, 'alpha')
        const betaRoot = path.join(nestedRoot, 'beta')
        await fs.mkdir(alphaRoot, { recursive: true })
        await fs.mkdir(betaRoot, { recursive: true })

        await fs.writeFile(path.join(alphaRoot, '.snipforge.json'), JSON.stringify({
            name: 'Alpha',
            description: 'First',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(betaRoot, '.snipforge.json'), JSON.stringify({
            name: 'Beta',
            description: 'Second',
            format_version: '1.0',
        }))
        await fs.writeFile(path.join(alphaRoot, 'one.json'), JSON.stringify({
            title: 'One',
            body: 'echo one',
        }))
        await fs.writeFile(path.join(betaRoot, 'two.json'), JSON.stringify({
            title: 'Two',
            body: 'echo two',
        }))

        const result = await openLocalFolder(nestedRoot)

        expect('needsPick' in result).toBe(true)
        if (!('needsPick' in result)) {
            throw new Error('Expected multiple nested libraries to require picking')
        }

        expect(result.libraries).toHaveLength(2)
        expect(result.libraries.map(lib => lib.name)).toEqual(['Alpha', 'Beta'])
        expect(result.libraries.map(lib => lib.path)).toEqual([alphaRoot, betaRoot])
        expect(result.libraries.map(lib => lib.commandCount)).toEqual([1, 1])
        expect(db.getAllLibraries()).toHaveLength(0)
    })

    it('writes created commands to disk with a stable id, safely renames on title change, then deletes the file', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)
        const createResult = await createLocalLibraryCommand({
            title: '  Git Commit  ',
            body: '  git commit -m "msg"  ',
            description: '  Initial command  ',
            tags: '["Git", "commit", " git "]',
            language: '  BASH  ',
        })

        expect(createResult.success).toBe(true)
        expect(createResult.mode).toBe('library')

        const createdCommands = db.getRemoteCommands(setup.library.id)
        expect(createdCommands).toHaveLength(1)

        const commandId = createdCommands[0].id
        const commandPath = createdCommands[0].remote_path as string
        const createdFile = JSON.parse(await fs.readFile(path.join(tmpDir, commandPath), 'utf8'))
        expect(createdFile.snipforge).toBe('command')
        expect(createdFile.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(createdFile.title).toBe('Git Commit')
        expect(createdFile.body).toBe('git commit -m "msg"')
        expect(createdFile.description).toBe('Initial command')
        expect(createdFile.tags).toEqual(['git', 'commit'])
        expect(createdFile.language).toBe('bash')

        const updateResult = await updateLocalLibraryCommand(commandId, {
            title: 'Git Commit Updated',
            body: 'git commit --amend',
            description: 'Updated command',
            tags: '["git", "amend"]',
            language: 'bash',
        })

        expect(updateResult.success).toBe(true)
        expect(updateResult.mode).toBe('library')

        const updatedCommands = db.getRemoteCommands(setup.library.id)
        expect(updatedCommands).toHaveLength(1)
        const renamedPath = updatedCommands[0].remote_path as string
        expect(renamedPath).toBe('git-commit-updated.json')
        await expect(fs.access(path.join(tmpDir, commandPath))).rejects.toThrow()

        const updatedFile = JSON.parse(await fs.readFile(path.join(tmpDir, renamedPath), 'utf8'))
        expect(updatedFile.id).toBe(createdFile.id)
        expect(updatedFile.title).toBe('Git Commit Updated')
        expect(updatedFile.body).toBe('git commit --amend')

        const deleteResult = await deleteLocalLibraryCommand(commandId)
        expect(deleteResult.success).toBe(true)
        expect(deleteResult.mode).toBe('library')
        await expect(fs.access(path.join(tmpDir, renamedPath))).rejects.toThrow()
        expect(db.getRemoteCommands(setup.library.id)).toHaveLength(0)
    })

    it('uses a suffixed filename when a title-change rename would collide', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)

        await createLocalLibraryCommand({
            title: 'Git Commit Updated',
            body: 'git commit --amend',
            description: 'existing',
            tags: '["git"]',
            language: 'bash',
        })

        await createLocalLibraryCommand({
            title: 'Git Commit',
            body: 'git commit -m "msg"',
            description: 'rename me',
            tags: '["git"]',
            language: 'bash',
        })

        const existingCommands = db.getRemoteCommands(setup.library.id)
        const commandToRename = existingCommands.find(command => command.title === 'Git Commit')
        expect(commandToRename).toBeTruthy()

        const updateResult = await updateLocalLibraryCommand(commandToRename!.id, {
            title: 'Git Commit Updated',
            body: 'git commit --fixup HEAD',
            description: 'renamed with collision',
            tags: '["git", "fixup"]',
            language: 'bash',
        })

        expect(updateResult.success).toBe(true)

        const commands = db.getRemoteCommands(setup.library.id)
        const renamed = commands.find(command => command.body === 'git commit --fixup HEAD')
        expect(renamed?.remote_path).toBe('git-commit-updated-2.json')

        const renamedFile = JSON.parse(await fs.readFile(path.join(tmpDir, renamed!.remote_path as string), 'utf8'))
        expect(renamedFile.title).toBe('Git Commit Updated')
        expect(renamedFile.body).toBe('git commit --fixup HEAD')
    })

    it('batches command creation into a single local-library sync', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)

        const result = await createLocalLibraryCommands([
            {
                title: 'Git Status',
                body: 'git status',
                description: 'Check repo state',
                tags: '["git"]',
                language: 'bash',
            },
            {
                title: 'Git Pull',
                body: 'git pull',
                description: 'Update local branch',
                tags: '["git"]',
                language: 'bash',
            }
        ])

        expect(result.success).toBe(true)
        expect(result.mode).toBe('library')
        expect(result.processed).toBe(2)
        expect(result.succeeded).toBe(2)
        expect(result.failed).toBe(0)

        const commands = db.getRemoteCommands(setup.library.id)
        expect(commands).toHaveLength(2)
        expect(commands.map(command => command.title).sort()).toEqual(['Git Pull', 'Git Status'])
    })

    it('falls back to database CRUD for legacy DB-only commands', async () => {
        const commandId = db.addCommand({
            title: 'Legacy Command',
            body: 'echo legacy',
            description: '',
            tags: '[]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const updateResult = await updateLocalLibraryCommand(commandId, {
            title: 'Legacy Command Updated',
            body: 'echo legacy updated',
            description: 'still local',
            tags: '["legacy"]',
            language: 'bash',
        })

        expect(updateResult.success).toBe(true)
        expect(updateResult.mode).toBe('database')
        expect(db.getAllCommands()[0].title).toBe('Legacy Command Updated')

        const deleteResult = await deleteLocalLibraryCommand(commandId)
        expect(deleteResult.success).toBe(true)
        expect(deleteResult.mode).toBe('database')
        expect(db.getAllCommands()).toHaveLength(0)
    })

    it('batches deletion for legacy DB-only commands', async () => {
        const firstId = db.addCommand({
            title: 'Legacy One',
            body: 'echo one',
            description: '',
            tags: '[]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })
        const secondId = db.addCommand({
            title: 'Legacy Two',
            body: 'echo two',
            description: '',
            tags: '[]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const result = await deleteLocalLibraryCommands([firstId, secondId])

        expect(result.success).toBe(true)
        expect(result.mode).toBe('database')
        expect(result.succeeded).toBe(2)
        expect(result.failed).toBe(0)
        expect(db.getAllCommands()).toHaveLength(0)
    })

    it('reindexes initialized local libraries on startup-style rebuild', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)
        await createLocalLibraryCommand({
            title: 'Reindex Me',
            body: 'echo from disk',
            description: 'cache me again',
            tags: '["cache"]',
            language: 'bash',
        })

        const existing = db.getRemoteCommands(setup.library.id)
        expect(existing).toHaveLength(1)
        expect(existing[0].remote_path).toBeTruthy()

        db.deleteRemoteCommand(setup.library.id, existing[0].remote_path as string)
        expect(db.getRemoteCommands(setup.library.id)).toHaveLength(0)

        const results = await reindexInitializedLocalLibraries()

        expect(results).toHaveLength(1)
        expect(results[0].result.added).toBe(1)
        expect(results[0].result.errors).toEqual([])

        const rebuilt = db.getRemoteCommands(setup.library.id)
        expect(rebuilt).toHaveLength(1)
        expect(rebuilt[0].title).toBe('Reindex Me')
        expect(rebuilt[0].body).toBe('echo from disk')
    })

    it('refreshes stale indexed data from disk during reindex', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)
        await createLocalLibraryCommand({
            title: 'Original Title',
            body: 'echo original',
            description: 'original desc',
            tags: '["original"]',
            language: 'bash',
        })

        const existing = db.getRemoteCommands(setup.library.id)
        const remotePath = existing[0].remote_path as string
        const filePath = path.join(tmpDir, remotePath)
        const fileJson = JSON.parse(await fs.readFile(filePath, 'utf8'))
        fileJson.title = 'Disk Wins'
        fileJson.body = 'echo updated from disk'
        fileJson.updated_at = '2099-01-01T00:00:00.000Z'
        await fs.writeFile(filePath, JSON.stringify(fileJson, null, 2) + '\n', 'utf8')

        const results = await reindexInitializedLocalLibraries()

        expect(results[0].result.updated).toBe(1)

        const rebuilt = db.getRemoteCommands(setup.library.id)
        expect(rebuilt[0].title).toBe('Disk Wins')
        expect(rebuilt[0].body).toBe('echo updated from disk')
    })

    it('migrates legacy DB-only commands into the default local library', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)
        db.addCommand({
            title: 'Legacy Migrated Command',
            body: 'echo migrate me',
            description: 'from sqlite only',
            tags: '["legacy", "migrate"]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const result = await migrateLegacyDbOnlyCommandsToDefaultLibrary()

        expect(result.completed).toBe(true)
        expect(result.library?.id).toBe(setup.library.id)
        expect(result.migrated).toBe(1)
        expect(result.skipped).toBe(0)
        expect(settings.get<boolean>('library.legacyDbMigrationCompleted')).toBe(true)
        expect(db.getAllCommands().some(command => command.source === 'local' && command.body === 'echo migrate me')).toBe(false)

        const remoteCommands = db.getRemoteCommands(setup.library.id)
        expect(remoteCommands).toHaveLength(1)
        const filePath = path.join(tmpDir, remoteCommands[0].remote_path as string)
        const migratedFile = JSON.parse(await fs.readFile(filePath, 'utf8'))
        expect(migratedFile.snipforge).toBe('command')
        expect(migratedFile.id).toMatch(/^[0-9a-f-]{36}$/)
        expect(migratedFile.title).toBe('Legacy Migrated Command')
        expect(migratedFile.body).toBe('echo migrate me')
    })
})

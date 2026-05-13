import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import { promises as fs } from 'node:fs'
import * as db from '../electron/main/database'

let tmpDir: string

beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snipforge-test-'))
    const dbPath = path.join(tmpDir, 'test.db')
    db.initializeDatabase(dbPath)
})

afterEach(() => {
    db.closeDatabase()
})

// ── addCommand ──────────────────────────────────────────────────

describe('addCommand', () => {
    it('inserts a command and returns its id', () => {
        const id = db.addCommand({
            title: 'Test Command',
            body: 'echo hello',
            description: 'A test',
            tags: '["test"]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })
        expect(id).toBeGreaterThan(0)

        const all = db.getAllCommands()
        expect(all).toHaveLength(1)
        expect(all[0].title).toBe('Test Command')
        expect(all[0].body).toBe('echo hello')
    })

    it('normalizes blank title and tags from body before inserting', () => {
        db.addCommand({
            title: '',
            body: '  kubectl get pods -A  ',
            description: '  list all pods  ',
            tags: '',
            language: '  BASH  ',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const [command] = db.getAllCommands()
        expect(command.title).toBe('kubectl get pods -A')
        expect(command.body).toBe('kubectl get pods -A')
        expect(command.description).toBe('list all pods')
        expect(command.tags).toBe('["bash","kubectl","kubernetes"]')
        expect(command.language).toBe('bash')
    })

    it('inserts multiple commands in one transaction', () => {
        const inserted = db.addCommands([
            {
                title: 'One',
                body: 'echo one',
                description: '',
                tags: '["test"]',
                language: 'bash',
                source: 'local',
                library_id: null,
                remote_path: null,
            },
            {
                title: 'Two',
                body: 'echo two',
                description: 'second',
                tags: '[]',
                language: 'bash',
                source: 'local',
                library_id: null,
                remote_path: null,
            }
        ])

        expect(inserted).toBe(2)
        expect(db.getAllCommands()).toHaveLength(2)
    })

    it('normalizes blank title and tags for batch inserts', () => {
        const inserted = db.addCommands([
            {
                title: '',
                body: '  kubectl get pods -A  ',
                description: '',
                tags: '',
                language: '  BASH  ',
                source: 'local',
                library_id: null,
                remote_path: null,
            },
        ])

        expect(inserted).toBe(1)
        const [command] = db.getAllCommands()
        expect(command.title).toBe('kubectl get pods -A')
        expect(command.body).toBe('kubectl get pods -A')
        expect(command.tags).toBe('["bash","kubectl","kubernetes"]')
        expect(command.language).toBe('bash')
    })

    it('rejects commands without a body', () => {
        expect(() => db.addCommand({
            title: '',
            body: '   ',
            description: '',
            tags: '',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })).toThrow('Command body is required')
    })
})

describe('updateCommand', () => {
    it('normalizes blank title and tags from body before updating', () => {
        const id = db.addCommand({
            title: 'Old Title',
            body: 'echo old',
            description: '',
            tags: '[]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const updated = db.updateCommand(id, {
            title: '',
            body: '  docker compose logs web  ',
            description: '  service logs  ',
            tags: '',
            language: '  BASH  ',
        })

        expect(updated).toBe(true)
        const [command] = db.getAllCommands()
        expect(command.title).toBe('docker compose logs web')
        expect(command.body).toBe('docker compose logs web')
        expect(command.description).toBe('service logs')
        expect(command.tags).toBe('["bash","docker","logs"]')
        expect(command.language).toBe('bash')
    })
})

describe('deleteCommandsByIds', () => {
    it('deletes multiple commands in one transaction', () => {
        const firstId = db.addCommand({
            title: 'First',
            body: 'echo first',
            description: '',
            tags: '[]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })
        const secondId = db.addCommand({
            title: 'Second',
            body: 'echo second',
            description: '',
            tags: '[]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const deleted = db.deleteCommandsByIds([firstId, secondId])

        expect(deleted).toBe(2)
        expect(db.getAllCommands()).toHaveLength(0)
    })
})

describe('library contract mapping', () => {
    it('hydrates local-first working copy metadata for local libraries', () => {
        db.addLibrary('/tmp/test-lib', 'Test Library', 'desc', '.snipforge.json', 'local', 'owner')

        const library = db.getAllLibraries()[0]

        expect(library.local_path).toBe('/tmp/test-lib')
        expect(library.origin).toBeNull()
        expect(library.working_copy).toEqual({
            local_path: '/tmp/test-lib',
            manifest_path: '.snipforge.json',
            materialized: true,
        })
    })

    it('hydrates origin metadata for migrated GitHub libraries', () => {
        const libraryId = db.addLibrary('github.com/owner/repo', 'Remote Library', 'desc', 'nested/.snipforge.json', 'github', 'consumer')
        db.updateLibraryToLocalWorkingCopy(libraryId, '/tmp/working-copy', 'github.com/owner/repo', 'abc123')

        const library = db.getAllLibraries()[0]

        expect(library.local_path).toBe('/tmp/working-copy')
        expect(library.origin).toEqual({
            provider: 'github',
            url: 'github.com/owner/repo',
            ref: 'abc123',
        })
        expect(library.working_copy).toEqual({
            local_path: '/tmp/working-copy',
            manifest_path: '.snipforge.json',
            materialized: true,
        })
    })

    it('keeps migrated GitHub libraries uninitialized when no manifest was found', () => {
        const libraryId = db.addLibrary('github.com/owner/repo', 'Remote Library', 'desc', null, 'github', 'consumer')
        db.updateLibraryToLocalWorkingCopy(libraryId, '/tmp/working-copy', 'github.com/owner/repo', 'abc123', null)

        const library = db.getAllLibraries()[0]

        expect(library.local_path).toBe('/tmp/working-copy')
        expect(library.origin?.url).toBe('github.com/owner/repo')
        expect(library.working_copy).toEqual({
            local_path: '/tmp/working-copy',
            manifest_path: null,
            materialized: false,
        })
    })
})

// ── syncRemoteCommands ──────────────────────────────────────────

describe('syncRemoteCommands', () => {
    let libraryId: number

    beforeEach(() => {
        libraryId = db.addLibrary('/tmp/test-lib', 'Test Library', 'desc', '.snipforge.json', 'local', 'owner')
    })

    it('normalizes blank title and tags for remote add and update paths while preserving remote metadata', () => {
        const createdAt = '2026-01-01T00:00:00.000Z'
        const updatedAt = '2026-01-02T00:00:00.000Z'
        const id = db.addRemoteCommand(libraryId, 'kubectl.json', {
            title: '',
            body: '  kubectl get pods -A  ',
            description: '  cluster pods  ',
            tags: '',
            language: '  BASH  ',
            created_at: createdAt,
            updated_at: updatedAt,
        })

        let [command] = db.getRemoteCommands(libraryId)
        expect(command.id).toBe(id)
        expect(command.title).toBe('kubectl get pods -A')
        expect(command.body).toBe('kubectl get pods -A')
        expect(command.description).toBe('cluster pods')
        expect(command.tags).toBe('["bash","kubectl","kubernetes"]')
        expect(command.language).toBe('bash')
        expect(command.created_at).toBe(createdAt)
        expect(command.updated_at).toBe(updatedAt)
        expect(command.remote_path).toBe('kubectl.json')
        expect(command.library_id).toBe(libraryId)

        expect(db.updateRemoteCommand(libraryId, 'kubectl.json', {
            title: '',
            body: '  docker compose logs web  ',
            description: '  service logs  ',
            tags: '',
            language: '  BASH  ',
            updated_at: '2026-01-03T00:00:00.000Z',
        })).toBe(true)

        ;[command] = db.getRemoteCommands(libraryId)
        expect(command.title).toBe('docker compose logs web')
        expect(command.body).toBe('docker compose logs web')
        expect(command.tags).toBe('["bash","docker","logs"]')
        expect(command.created_at).toBe(createdAt)
        expect(command.updated_at).toBe('2026-01-03T00:00:00.000Z')
        expect(command.remote_path).toBe('kubectl.json')
        expect(command.library_id).toBe(libraryId)

        expect(db.updateRemoteCommandById(id, {
            remote_path: 'docker.json',
            title: '',
            body: '  kubectl get pods -A  ',
            description: '  cluster pods again  ',
            tags: '',
            language: '  BASH  ',
            created_at: createdAt,
            updated_at: '2026-01-04T00:00:00.000Z',
        })).toBe(true)

        ;[command] = db.getRemoteCommands(libraryId)
        expect(command.title).toBe('kubectl get pods -A')
        expect(command.body).toBe('kubectl get pods -A')
        expect(command.tags).toBe('["bash","kubectl","kubernetes"]')
        expect(command.created_at).toBe(createdAt)
        expect(command.updated_at).toBe('2026-01-04T00:00:00.000Z')
        expect(command.remote_path).toBe('docker.json')
        expect(command.library_id).toBe(libraryId)
    })

    it('adds commands and updates SHA on success', () => {
        const result = db.syncRemoteCommands(libraryId, 'abc123', [
            {
                remotePath: 'cmd1.json',
                command: {
                    title: 'Command 1',
                    body: 'echo one',
                    description: '',
                    tags: '[]',
                    language: 'bash',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }
            }
        ], [], [])

        expect(result.added).toBe(1)
        expect(result.errors).toHaveLength(0)

        // SHA should be updated
        const libs = db.getAllLibraries()
        const lib = libs.find(l => l.id === libraryId)
        expect(lib?.last_synced_sha).toBe('abc123')
    })

    it('does NOT update SHA when there are errors (fixes #18)', () => {
        // Set initial state with a known SHA
        db.syncRemoteCommands(libraryId, 'initial-sha', [
            {
                remotePath: 'cmd1.json',
                command: {
                    title: 'Command 1',
                    body: 'echo one',
                    description: '',
                    tags: '[]',
                    language: 'bash',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }
            }
        ], [], [])

        // Force an error by passing a missing body.
        const result = db.syncRemoteCommands(libraryId, 'new-sha', [
            {
                remotePath: 'bad-cmd.json',
                command: {
                    title: 'Bad Command',
                    body: null as unknown as string,
                    description: '',
                    tags: '[]',
                    language: 'bash',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }
            }
        ], [], [])

        expect(result.errors.length).toBeGreaterThan(0)

        // SHA should NOT have been updated — should still be 'initial-sha'
        const libs = db.getAllLibraries()
        const lib = libs.find(l => l.id === libraryId)
        expect(lib?.last_synced_sha).toBe('initial-sha')
    })

    it('returns accurate counts excluding failures', () => {
        // Force one success and one failure in the same batch
        const result = db.syncRemoteCommands(libraryId, 'sha1', [
            {
                remotePath: 'good.json',
                command: {
                    title: 'Good Command',
                    body: 'echo good',
                    description: '',
                    tags: '[]',
                    language: 'bash',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }
            },
            {
                remotePath: 'bad.json',
                command: {
                    title: 'Bad Command',
                    body: null as unknown as string,
                    description: '',
                    tags: '[]',
                    language: 'bash',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }
            },
        ], [], [])

        // One succeeded, one failed
        expect(result.added).toBe(1)
        expect(result.errors).toHaveLength(1)
    })

    it('updates existing commands', () => {
        db.syncRemoteCommands(libraryId, 'sha1', [
            {
                remotePath: 'cmd.json',
                command: {
                    title: 'Original',
                    body: 'echo original',
                    description: '',
                    tags: '[]',
                    language: 'bash',
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-01-01T00:00:00Z',
                }
            }
        ], [], [])

        const result = db.syncRemoteCommands(libraryId, 'sha2', [], [
            {
                remotePath: 'cmd.json',
                command: {
                    title: 'Updated',
                    body: 'echo updated',
                    description: 'now with desc',
                    tags: '["updated"]',
                    language: 'bash',
                    updated_at: '2026-06-01T00:00:00Z',
                }
            }
        ], [])

        expect(result.updated).toBe(1)

        const cmds = db.getRemoteCommands(libraryId)
        expect(cmds[0].title).toBe('Updated')
        expect(cmds[0].body).toBe('echo updated')
    })

    it('removes commands by remote_path', () => {
        db.syncRemoteCommands(libraryId, 'sha1', [
            {
                remotePath: 'to-remove.json',
                command: {
                    title: 'Will Be Removed',
                    body: 'echo bye',
                    description: '',
                    tags: '[]',
                    language: 'bash',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }
            }
        ], [], [])

        expect(db.getRemoteCommands(libraryId)).toHaveLength(1)

        const result = db.syncRemoteCommands(libraryId, 'sha2', [], [], ['to-remove.json'])

        expect(result.removed).toBe(1)
        expect(db.getRemoteCommands(libraryId)).toHaveLength(0)
    })

    it('does NOT update SHA when an update targets a stale path', () => {
        db.syncRemoteCommands(libraryId, 'initial-sha', [
            {
                remotePath: 'cmd.json',
                command: {
                    title: 'Original',
                    body: 'echo original',
                    description: '',
                    tags: '[]',
                    language: 'bash',
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-01-01T00:00:00Z',
                }
            }
        ], [], [])

        const result = db.syncRemoteCommands(libraryId, 'new-sha', [], [
            {
                remotePath: 'missing.json',
                command: {
                    title: 'Updated',
                    body: 'echo updated',
                    description: '',
                    tags: '[]',
                    language: 'bash',
                    updated_at: '2026-02-01T00:00:00Z',
                }
            }
        ], [])

        expect(result.updated).toBe(0)
        expect(result.errors).toContain('Failed to update missing.json: command not found')

        const lib = db.getAllLibraries().find(l => l.id === libraryId)
        expect(lib?.last_synced_sha).toBe('initial-sha')
    })

    it('does NOT update SHA when a removal targets a stale path', () => {
        db.syncRemoteCommands(libraryId, 'initial-sha', [
            {
                remotePath: 'cmd.json',
                command: {
                    title: 'Original',
                    body: 'echo original',
                    description: '',
                    tags: '[]',
                    language: 'bash',
                    created_at: '2026-01-01T00:00:00Z',
                    updated_at: '2026-01-01T00:00:00Z',
                }
            }
        ], [], [])

        const result = db.syncRemoteCommands(libraryId, 'new-sha', [], [], ['missing.json'])

        expect(result.removed).toBe(0)
        expect(result.errors).toContain('Failed to remove missing.json: command not found')

        const lib = db.getAllLibraries().find(l => l.id === libraryId)
        expect(lib?.last_synced_sha).toBe('initial-sha')
        expect(db.getRemoteCommands(libraryId)).toHaveLength(1)
    })
})

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
})

// ── syncRemoteCommands ──────────────────────────────────────────

describe('syncRemoteCommands', () => {
    let libraryId: number

    beforeEach(() => {
        libraryId = db.addLibrary('/tmp/test-lib', 'Test Library', 'desc', '.snipforge.json', 'local', 'owner')
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

        // Force an error by passing null title (NOT NULL constraint violation)
        const result = db.syncRemoteCommands(libraryId, 'new-sha', [
            {
                remotePath: 'bad-cmd.json',
                command: {
                    title: null as unknown as string,
                    body: 'echo bad',
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
                    title: null as unknown as string,
                    body: 'echo bad',
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

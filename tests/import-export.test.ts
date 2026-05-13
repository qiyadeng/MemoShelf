import { describe, expect, it } from 'vitest'
import { exportCommands, generateExportFilename, importCommands, prepareExportBundle, validateExportData } from '../src/utils/importExport'
import type { Command } from '../shared/types'

function makeCommand(overrides: Partial<Command> = {}): Command {
    return {
        id: 1,
        title: 'Docker Logs',
        body: 'docker logs -f api',
        description: 'Tail API logs',
        tags: '["docker", "Logs"]',
        language: 'bash',
        source: 'local',
        library_id: null,
        remote_path: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
        ...overrides,
    }
}

describe('exportCommands', () => {
    it('builds bundle exports with the shared metadata shape', () => {
        const exportData = exportCommands([
            makeCommand(),
            makeCommand({
                id: 2,
                title: 'Kubectl Pods',
                body: 'kubectl get pods',
                description: '',
                tags: '["k8s"]',
                language: 'plaintext',
            }),
        ])

        expect(exportData.snipforge).toBe('bundle')
        expect(exportData.version).toBe('2.0')
        expect(exportData.total_commands).toBe(2)
        expect(exportData.exported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
        expect(exportData.commands).toEqual([
            {
                title: 'Docker Logs',
                body: 'docker logs -f api',
                description: 'Tail API logs',
                tags: ['docker', 'logs'],
                language: 'bash',
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-02T00:00:00.000Z',
            },
            {
                title: 'Kubectl Pods',
                body: 'kubectl get pods',
                description: '',
                tags: ['k8s'],
                language: 'plaintext',
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-02T00:00:00.000Z',
            },
        ])
    })

    it('records normalized filter tags when a filtered export is requested', () => {
        const exportData = exportCommands([makeCommand()], ['Docker', ' logs '])

        expect(exportData.filter_tags).toEqual(['docker', 'logs'])
    })

    it('uses OR semantics for multi-tag export filters to match browse and management', () => {
        const exportData = exportCommands([
            makeCommand(),
            makeCommand({
                id: 2,
                title: 'K8s Pods',
                body: 'kubectl get pods',
                tags: '["k8s"]',
            }),
            makeCommand({
                id: 3,
                title: 'Docker Compose Logs',
                body: 'docker compose logs web',
                tags: '["docker", "compose"]',
            }),
        ], ['docker', 'k8s'])

        expect(exportData.commands.map(command => command.title)).toEqual([
            'Docker Logs',
            'K8s Pods',
            'Docker Compose Logs',
        ])
    })
})

describe('generateExportFilename', () => {
    it('uses the shared filename format for filtered exports', () => {
        expect(generateExportFilename(['docker', 'logs'])).toMatch(/^snipforge-commands_docker-logs_\d{4}-\d{2}-\d{2}\.json$/)
    })
})

describe('prepareExportBundle', () => {
    it('returns the shared filename and serialized content for bulk export flows', () => {
        const bundle = prepareExportBundle([
            makeCommand(),
            makeCommand({
                id: 2,
                title: 'Kubectl Pods',
                body: 'kubectl get pods',
                tags: '["k8s"]',
            }),
        ])

        expect(bundle.filename).toMatch(/^snipforge-commands_\d{4}-\d{2}-\d{2}\.json$/)
        expect(bundle.content).toBe(JSON.stringify(bundle.exportData, null, 2))
        expect(bundle.exportData.total_commands).toBe(2)
        expect(bundle.exportData.snipforge).toBe('bundle')
    })
})

describe('importCommands', () => {
    it('rejects bare single command files with whitespace-only bodies during validation', () => {
        const data: any = {
            body: '   ',
            language: 'bash',
        }

        expect(() => validateExportData(data)).toThrow(/missing body/i)
    })

    it('rejects bundle commands with whitespace-only bodies during validation', () => {
        const data = {
            snipforge: 'bundle',
            version: '2.0',
            exported_at: '2026-05-13T00:00:00.000Z',
            total_commands: 1,
            commands: [
                {
                    body: '   ',
                    description: '',
                    tags: [],
                    language: 'bash',
                    created_at: '2026-05-13T00:00:00.000Z',
                    updated_at: '2026-05-13T00:00:00.000Z',
                },
            ],
        }

        expect(() => validateExportData(data)).toThrow(/missing or invalid body/i)
    })

    it('defensively rejects whitespace-only bodies during direct import mapping', () => {
        const data: any = {
            commands: [
                {
                    body: '   ',
                    description: '',
                    tags: [],
                    language: 'bash',
                },
            ],
        }

        expect(() => importCommands(data)).toThrow(/missing body/i)
    })

    it('generates title and tags for titleless command imports', () => {
        const data = {
            snipforge: 'bundle',
            version: '2.0',
            exported_at: '2026-05-13T00:00:00.000Z',
            total_commands: 1,
            commands: [
                {
                    body: 'kubectl get pods -A',
                    description: '',
                    tags: [],
                    language: 'bash',
                    created_at: '2026-05-13T00:00:00.000Z',
                    updated_at: '2026-05-13T00:00:00.000Z',
                },
            ],
        }

        validateExportData(data)
        expect(importCommands(data)).toEqual([
            {
                title: 'kubectl get pods -A',
                body: 'kubectl get pods -A',
                description: '',
                tags: '["bash","kubectl","kubernetes"]',
                language: 'bash',
            },
        ])
    })

    it('accepts a bare single command file with only body and language', () => {
        const data: any = {
            body: 'git status --short',
            language: 'bash',
        }

        expect(validateExportData(data)).toBe(true)
        expect(importCommands(data)[0]).toMatchObject({
            title: 'git status --short',
            body: 'git status --short',
            tags: '["bash","git"]',
            language: 'bash',
        })
    })
})

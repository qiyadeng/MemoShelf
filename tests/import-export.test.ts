import { describe, expect, it } from 'vitest'
import { exportCommands, generateExportFilename } from '../src/utils/importExport'
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
})

describe('generateExportFilename', () => {
    it('uses the shared filename format for filtered exports', () => {
        expect(generateExportFilename(['docker', 'logs'])).toMatch(/^snipforge-commands_docker-logs_\d{4}-\d{2}-\d{2}\.json$/)
    })
})

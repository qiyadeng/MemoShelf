import { describe, expect, it } from 'vitest'
import {
  buildLibraryCommandFileData,
  parseLibraryCommandFile,
  toIndexedLibraryCommandData,
} from '../shared/library-command'

describe('library command normalization', () => {
  it('builds deterministic command file data for library-backed writes', () => {
    const result = buildLibraryCommandFileData({
      title: '  Deploy App  ',
      body: '  kubectl apply -f app.yaml  ',
      description: '  Apply manifests  ',
      tags: ['K8S', ' deploy ', 'k8s'],
      language: '  BASH  ',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    }, '550e8400-e29b-41d4-a716-446655440000')

    expect(result).toEqual({
      snipforge: 'command',
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Deploy App',
      body: 'kubectl apply -f app.yaml',
      description: 'Apply manifests',
      tags: ['k8s', 'deploy'],
      language: 'bash',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    })
  })

  it('parses command files through the same normalization boundary', () => {
    const result = parseLibraryCommandFile({
      id: '550E8400-E29B-41D4-A716-446655440000',
      title: '  Fetch Logs ',
      body: '  kubectl logs deploy/api  ',
      description: '  Tail current logs ',
      tags: ['K8S', ' logs ', 'k8s'],
      language: '  SHELL  ',
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-02T00:00:00.000Z',
    })

    expect(result).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'Fetch Logs',
      body: 'kubectl logs deploy/api',
      description: 'Tail current logs',
      tags: ['k8s', 'logs'],
      language: 'shell',
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-02T00:00:00.000Z',
    })
  })

  it('normalizes indexed payloads consistently', () => {
    const result = toIndexedLibraryCommandData({
      title: '  Grep Errors  ',
      body: '  rg ERROR .  ',
      description: '  Find errors  ',
      tags: '["Logs", " search ", "logs"]',
      language: '  ',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-02T00:00:00.000Z',
    })

    expect(result).toEqual({
      title: 'Grep Errors',
      body: 'rg ERROR .',
      description: 'Find errors',
      tags: '["logs","search"]',
      language: 'plaintext',
      created_at: '2026-03-01T00:00:00.000Z',
      updated_at: '2026-03-02T00:00:00.000Z',
    })
  })

  it('parses command files without titles by generating metadata from the body', () => {
    const result = parseLibraryCommandFile({
      id: '550E8400-E29B-41D4-A716-446655440000',
      body: '  kubectl get pods -A  ',
      description: '',
      tags: [],
      language: 'bash',
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-02T00:00:00.000Z',
    })

    expect(result).toEqual({
      id: '550e8400-e29b-41d4-a716-446655440000',
      title: 'kubectl get pods -A',
      body: 'kubectl get pods -A',
      description: '',
      tags: ['bash', 'kubectl', 'kubernetes'],
      language: 'bash',
      created_at: '2026-02-01T00:00:00.000Z',
      updated_at: '2026-02-02T00:00:00.000Z',
    })
  })

  it('builds command files with generated title and tags when user fields are blank', () => {
    const result = buildLibraryCommandFileData({
      title: '',
      body: 'docker compose logs web',
      description: '',
      tags: '',
      language: 'bash',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-02T00:00:00.000Z',
    }, '550e8400-e29b-41d4-a716-446655440000')

    expect(result.title).toBe('docker compose logs web')
    expect(result.tags).toEqual(['bash', 'docker', 'logs'])
  })
})

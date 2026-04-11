import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import { promises as fs } from 'node:fs'
import {
  commandHasVariables,
  copyCommandText,
  loadLibrary,
  runCli,
  searchCommands,
} from '../bin/snipforge-lib.mjs'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'snipforge-cli-'))

  await fs.writeFile(path.join(tmpDir, '.snipforge.json'), JSON.stringify({
    snipforge: 'library',
    name: 'CLI Test Library',
    description: 'Fixture library',
    format_version: '1.0',
  }))

  await fs.writeFile(path.join(tmpDir, 'docker-ps.json'), JSON.stringify({
    snipforge: 'command',
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Docker: List Containers',
    body: 'docker ps',
    description: 'Show running containers',
    tags: ['docker', 'containers'],
    language: 'bash',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }))

  await fs.writeFile(path.join(tmpDir, 'kubectl-rollout.json'), JSON.stringify({
    snipforge: 'command',
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Kubernetes: Rollout Restart',
    body: 'kubectl rollout restart deploy/api',
    description: 'Restart the API deployment',
    tags: ['kubernetes', 'deploy'],
    language: 'bash',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }))

  await fs.writeFile(path.join(tmpDir, 'templated.json'), JSON.stringify({
    snipforge: 'command',
    id: '33333333-3333-4333-8333-333333333333',
    title: 'OpenSSL: Random Token',
    body: 'openssl rand -base64 {{bytes}}',
    description: 'Generate a token',
    tags: ['openssl'],
    language: 'bash',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }))

  await fs.writeFile(path.join(tmpDir, 'broken.json'), '{ not json')
})

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe('snipforge CLI library loading', () => {
  it('loads manifest and valid command files from a library folder', async () => {
    const library = await loadLibrary(tmpDir)

    expect(library.manifest.name).toBe('CLI Test Library')
    expect(library.commands).toHaveLength(3)
    expect(library.commands.map(command => command.title)).toEqual([
      'Docker: List Containers',
      'Kubernetes: Rollout Restart',
      'OpenSSL: Random Token',
    ])
  })

  it('ranks search matches using command metadata', async () => {
    const library = await loadLibrary(tmpDir)
    const matches = searchCommands(library.commands, 'rollout')

    expect(matches[0]?.item.title).toBe('Kubernetes: Rollout Restart')
  })
})

describe('snipforge CLI copy behavior', () => {
  it('detects template variables in command bodies', () => {
    expect(commandHasVariables({ body: 'echo {{name}}' })).toBe(true)
    expect(commandHasVariables({ body: 'echo hello' })).toBe(false)
  })

  it('refuses clipboard copy for templated commands', async () => {
    await expect(copyCommandText({
      title: 'Templated',
      body: 'echo {{name}}',
    }, {
      writeClipboard: vi.fn(),
    })).rejects.toThrow('contains template variables')
  })

  it('copies the best search match through the injected clipboard writer', async () => {
    const stdout = { write: vi.fn() }
    const stderr = { write: vi.fn() }
    const writeClipboard = vi.fn()

    const exitCode = await runCli(
      ['copy', 'docker', '--library', tmpDir],
      { stdout, stderr, cwd: '/tmp/unused' },
      { writeClipboard },
    )

    expect(exitCode).toBe(0)
    expect(writeClipboard).toHaveBeenCalledWith('docker ps')
    expect(stdout.write).toHaveBeenCalledWith('Copied "Docker: List Containers" from CLI Test Library.\n')
    expect(stderr.write).not.toHaveBeenCalled()
  })

  it('fails cleanly when a copy target requires variable substitution', async () => {
    const stdout = { write: vi.fn() }
    const stderr = { write: vi.fn() }

    const exitCode = await runCli(
      ['copy', '--id', '33333333-3333-4333-8333-333333333333', '--library', tmpDir],
      { stdout, stderr, cwd: '/tmp/unused' },
      { writeClipboard: vi.fn() },
    )

    expect(exitCode).toBe(1)
    expect(stderr.write).toHaveBeenCalledWith(expect.stringContaining('contains template variables'))
  })
})

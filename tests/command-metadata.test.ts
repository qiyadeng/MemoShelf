import { describe, expect, it } from 'vitest'
import {
  generateCommandTags,
  generateCommandTitle,
  MAX_COMMAND_TAGS,
  normalizeCommandLanguage,
  normalizeCommandTags,
  normalizeCommandTitle,
  serializeCommandTags,
} from '../shared/command-metadata'

describe('command metadata generation', () => {
  it('generates a command title from the first meaningful body line', () => {
    expect(generateCommandTitle('  git reset --soft HEAD~1\n\nmore detail')).toBe('git reset --soft HEAD~1')
  })

  it('generates a title from markdown headings', () => {
    expect(generateCommandTitle('\n# Deploy checklist\n\n- build\n- test')).toBe('Deploy checklist')
  })

  it('skips markdown code fences when generating a title', () => {
    expect(generateCommandTitle('```bash\nkubectl get pods -A\n```')).toBe('kubectl get pods -A')
  })

  it('skips markdown tilde fences when generating a title', () => {
    expect(generateCommandTitle('~~~bash\nkubectl get pods\n~~~')).toBe('kubectl get pods')
  })

  it('falls back only when body has no meaningful text', () => {
    expect(generateCommandTitle('```')).toBe('Untitled snippet')
  })

  it('keeps manual titles and generates only for blank titles', () => {
    expect(normalizeCommandTitle('  Manual title  ', 'git status')).toBe('Manual title')
    expect(normalizeCommandTitle('', 'git status')).toBe('git status')
  })

  it('normalizes languages for storage', () => {
    expect(normalizeCommandLanguage('  BASH  ')).toBe('bash')
    expect(normalizeCommandLanguage('')).toBe('plaintext')
    expect(normalizeCommandLanguage(null)).toBe('plaintext')
  })

  it('generates tags from language and body keywords', () => {
    expect(generateCommandTags('kubectl get pods -A', 'bash')).toEqual(['bash', 'kubectl', 'kubernetes'])
  })

  it('caps manual tags to the maximum stored count', () => {
    const manualTags = JSON.stringify(
      Array.from({ length: MAX_COMMAND_TAGS + 1 }, (_, index) => `Tag ${index + 1}`),
    )

    expect(normalizeCommandTags(manualTags, 'git status', 'bash')).toEqual(
      Array.from({ length: MAX_COMMAND_TAGS }, (_, index) => `tag ${index + 1}`),
    )
  })

  it('caps generated tags to the maximum stored count', () => {
    const body = [
      'git docker kubectl k8s',
      'ssh curl https api',
      'npm pnpm yarn node',
      'python pip pytest',
      'SELECT * FROM logs WHERE level = ERROR',
      'postgres psql nginx terraform aws s3 ec2 lambda deploy release publish tail grep ping dig nslookup',
    ].join('\n')

    const tags = generateCommandTags(body, 'bash')

    expect(tags).toHaveLength(MAX_COMMAND_TAGS)
    expect(tags).toEqual([
      'bash',
      'git',
      'docker',
      'kubectl',
      'kubernetes',
      'ssh',
      'curl',
      'api',
      'npm',
      'pnpm',
      'node',
      'python',
    ])
  })

  it('generates database and log tags from SQL-like body text', () => {
    expect(generateCommandTags('SELECT * FROM logs WHERE level = ERROR', 'sql')).toEqual(['sql', 'database', 'logs'])
  })

  it('excludes plaintext and richtext from generated language tags', () => {
    expect(generateCommandTags('echo hello', 'plaintext')).toEqual([])
    expect(generateCommandTags('echo hello', 'richtext')).toEqual([])
  })

  it('normalizes manual tags instead of generating over them', () => {
    expect(normalizeCommandTags('["Docker", " logs ", "docker"]', 'kubectl get pods', 'bash')).toEqual(['docker', 'logs'])
  })

  it('generates tags when manual tag input is empty', () => {
    expect(normalizeCommandTags('', 'docker compose logs web', 'bash')).toEqual(['bash', 'docker', 'logs'])
  })

  it('serializes normalized generated tags as JSON', () => {
    expect(serializeCommandTags('', 'git status', 'bash')).toBe('["bash","git"]')
  })
})

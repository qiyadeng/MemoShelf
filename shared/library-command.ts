import type { LibraryCommand } from './types'

type TagsInput = string[] | string | null | undefined

export interface LibraryCommandInput {
  id?: string | null
  title: string
  body: string
  description?: string | null
  tags?: TagsInput
  language?: string | null
  created_at?: string | null
  updated_at?: string | null
}

export interface LibraryCommandFileData extends LibraryCommand {
  snipforge: 'command'
  id: string
}

export interface IndexedLibraryCommandData {
  title: string
  body: string
  description: string
  tags: string
  language: string
  created_at: string
  updated_at: string
}

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')

  if (!slug) return 'untitled'
  return slug.slice(0, 200)
}

export function normalizeCommandId(value: unknown): string | null {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
    ? value.toLowerCase()
    : null
}

export function normalizeLibraryTags(tags: TagsInput): string[] {
  const values = Array.isArray(tags)
    ? tags
    : typeof tags === 'string'
      ? parseTagJson(tags)
      : []

  const normalized = values
    .filter((tag): tag is string => typeof tag === 'string')
    .map(tag => tag.trim().toLowerCase())
    .filter(Boolean)

  return [...new Set(normalized)]
}

export function normalizeLibraryCommand(input: LibraryCommandInput, now = new Date().toISOString()): LibraryCommand & { id?: string } {
  return {
    id: normalizeCommandId(input.id) || undefined,
    title: input.title.trim(),
    body: input.body.trim(),
    description: (input.description || '').trim(),
    tags: normalizeLibraryTags(input.tags),
    language: normalizeLanguage(input.language),
    created_at: normalizeTimestamp(input.created_at, now),
    updated_at: normalizeTimestamp(input.updated_at, now),
  }
}

export function buildLibraryCommandFileData(
  input: LibraryCommandInput,
  commandId: string,
  now = new Date().toISOString()
): LibraryCommandFileData {
  const normalized = normalizeLibraryCommand(input, now)

  return {
    snipforge: 'command',
    id: normalizeCommandId(commandId) || commandId.toLowerCase(),
    title: normalized.title,
    body: normalized.body,
    description: normalized.description,
    tags: normalized.tags,
    language: normalized.language,
    created_at: normalized.created_at,
    updated_at: normalized.updated_at,
  }
}

export function serializeLibraryCommandFile(data: LibraryCommandFileData): string {
  return JSON.stringify(data, null, 2) + '\n'
}

export function toIndexedLibraryCommandData(command: LibraryCommandInput, now = new Date().toISOString()): IndexedLibraryCommandData {
  const normalized = normalizeLibraryCommand(command, now)

  return {
    title: normalized.title,
    body: normalized.body,
    description: normalized.description,
    tags: JSON.stringify(normalized.tags),
    language: normalized.language,
    created_at: normalized.created_at,
    updated_at: normalized.updated_at,
  }
}

export function parseLibraryCommandFile(input: unknown, now = new Date().toISOString()): (LibraryCommand & { id?: string }) | null {
  if (!input || typeof input !== 'object') {
    return null
  }

  const candidate = input as Record<string, unknown>
  if (typeof candidate.title !== 'string' || typeof candidate.body !== 'string') {
    return null
  }

  const normalized = normalizeLibraryCommand({
    id: normalizeCommandId(candidate.id),
    title: candidate.title,
    body: candidate.body,
    description: typeof candidate.description === 'string' ? candidate.description : '',
    tags: candidate.tags as TagsInput,
    language: typeof candidate.language === 'string' ? candidate.language : null,
    created_at: typeof candidate.created_at === 'string' ? candidate.created_at : null,
    updated_at: typeof candidate.updated_at === 'string' ? candidate.updated_at : null,
  }, now)

  if (!normalized.title || !normalized.body) {
    return null
  }

  return normalized
}

function parseTagJson(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function normalizeLanguage(language: string | null | undefined): string {
  const normalized = typeof language === 'string' ? language.trim().toLowerCase() : ''
  return normalized || 'plaintext'
}

function normalizeTimestamp(value: string | null | undefined, fallback: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || fallback
}

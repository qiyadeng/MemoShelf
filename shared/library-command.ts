import {
  normalizeCommandLanguage,
  normalizeCommandTags,
  normalizeCommandTitle,
} from './command-metadata'
import type { LibraryCommand } from './types'

type TagsInput = string[] | string | null | undefined

export interface LibraryCommandInput {
  id?: string | null
  title?: string | null
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

export function normalizeLibraryTags(tags: TagsInput, body = '', language: string | null | undefined = null): string[] {
  return normalizeCommandTags(tags, body, language)
}

export function normalizeLibraryCommand(input: LibraryCommandInput, now = new Date().toISOString()): LibraryCommand & { id?: string } {
  const body = input.body.trim()
  const language = normalizeCommandLanguage(input.language)

  return {
    id: normalizeCommandId(input.id) || undefined,
    title: normalizeCommandTitle(input.title, body),
    body,
    description: (input.description || '').trim(),
    tags: normalizeLibraryTags(input.tags, body, language),
    language,
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
  if (typeof candidate.body !== 'string') {
    return null
  }

  const normalized = normalizeLibraryCommand({
    id: normalizeCommandId(candidate.id),
    title: typeof candidate.title === 'string' ? candidate.title : '',
    body: candidate.body,
    description: typeof candidate.description === 'string' ? candidate.description : '',
    tags: candidate.tags as TagsInput,
    language: typeof candidate.language === 'string' ? candidate.language : null,
    created_at: typeof candidate.created_at === 'string' ? candidate.created_at : null,
    updated_at: typeof candidate.updated_at === 'string' ? candidate.updated_at : null,
  }, now)

  if (!normalized.body) {
    return null
  }

  return normalized
}

function normalizeTimestamp(value: string | null | undefined, fallback: string): string {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized || fallback
}

type TagsInput = string[] | string | null | undefined

export const FALLBACK_COMMAND_TITLE = 'Untitled snippet'
export const MAX_GENERATED_TITLE_LENGTH = 80
export const MAX_STORED_TITLE_LENGTH = 500
export const MAX_COMMAND_TAGS = 12

const NON_TAG_LANGUAGES = new Set(['plaintext', 'richtext'])

const SQL_EVIDENCE_PATTERN = /\bsql\b|\bpsql\b|\bpostgres(?:ql)?\b|\bmysql\b|\bsqlite\b|\bselect\b[\s\S]*\bfrom\b|\binsert\s+into\b|\bupdate\b[\s\S]*\bset\b|\bdelete\s+from\b/i

const KEYWORD_TAG_RULES: Array<{ tag: string; pattern: RegExp }> = [
  { tag: 'git', pattern: /\bgit\b/i },
  { tag: 'docker', pattern: /\bdocker\b|\bdocker-compose\b/i },
  { tag: 'kubectl', pattern: /\bkubectl\b/i },
  { tag: 'kubernetes', pattern: /\bkubectl\b|\bk8s\b|\bkubernetes\b/i },
  { tag: 'ssh', pattern: /\bssh\b|\bscp\b|\brsync\b/i },
  { tag: 'curl', pattern: /\bcurl\b/i },
  { tag: 'api', pattern: /\bcurl\b|\bhttp\b|\bhttps\b|\bapi\b/i },
  { tag: 'npm', pattern: /\bnpm\b/i },
  { tag: 'pnpm', pattern: /\bpnpm\b/i },
  { tag: 'node', pattern: /\bnode\b|\bnpm\b|\bpnpm\b|\byarn\b/i },
  { tag: 'python', pattern: /\bpython\b|\bpip\b|\bpytest\b/i },
  { tag: 'sql', pattern: SQL_EVIDENCE_PATTERN },
  { tag: 'database', pattern: SQL_EVIDENCE_PATTERN },
  { tag: 'postgres', pattern: /\bpostgres\b|\bpsql\b|\bpostgresql\b/i },
  { tag: 'nginx', pattern: /\bnginx\b/i },
  { tag: 'terraform', pattern: /\bterraform\b|\btf\b/i },
  { tag: 'aws', pattern: /\baws\b|\bs3\b|\bec2\b|\blambda\b/i },
  { tag: 'deploy', pattern: /\bdeploy\b|\brelease\b|\bpublish\b|\bkubectl apply\b/i },
  { tag: 'logs', pattern: /\blogs?\b|\btail\b|\bgrep\b|\brg\b|\berror\b/i },
  { tag: 'test', pattern: /\btest\b|\bvitest\b|\bpytest\b|\bjest\b/i },
  { tag: 'network', pattern: /\bping\b|\btraceroute\b|\bdig\b|\bnslookup\b|\bnetstat\b|\bss\b/i },
]

export function generateCommandTitle(body: string): string {
  const lines = String(body || '')
    .split(/\r?\n/)
    .map(line => cleanTitleLine(line))
    .filter(Boolean)

  const candidate = lines[0] || FALLBACK_COMMAND_TITLE
  return truncateTitle(candidate)
}

export function normalizeCommandTitle(title: unknown, body: string): string {
  const manual = typeof title === 'string' ? title.trim() : ''
  const titleToStore = manual || generateCommandTitle(body)
  return truncateTitle(titleToStore, MAX_STORED_TITLE_LENGTH)
}

export function normalizeCommandLanguage(language: unknown): string {
  const normalized = typeof language === 'string' ? language.trim().toLowerCase() : ''
  return normalized || 'plaintext'
}

export function generateCommandTags(body: string, language?: string | null): string[] {
  const tags: string[] = []
  const normalizedLanguage = normalizeCommandLanguage(language)

  if (!NON_TAG_LANGUAGES.has(normalizedLanguage)) {
    tags.push(normalizedLanguage)
  }

  const text = String(body || '')
  for (const rule of KEYWORD_TAG_RULES) {
    if (rule.pattern.test(text)) {
      tags.push(rule.tag)
    }
  }

  return normalizeTagArray(tags).slice(0, MAX_COMMAND_TAGS)
}

export function normalizeCommandTags(tags: TagsInput, body: string, language?: string | null): string[] {
  const manualTags = parseTagInput(tags)
  if (manualTags.length > 0) {
    return normalizeTagArray(manualTags).slice(0, MAX_COMMAND_TAGS)
  }

  return generateCommandTags(body, language)
}

export function serializeCommandTags(tags: TagsInput, body: string, language?: string | null): string {
  return JSON.stringify(normalizeCommandTags(tags, body, language))
}

function cleanTitleLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed || trimmed.startsWith('```') || trimmed.startsWith('~~~')) return ''

  return trimmed
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function truncateTitle(title: string, maxLength = MAX_GENERATED_TITLE_LENGTH): string {
  const normalized = title.replace(/\s+/g, ' ').trim()
  if (!normalized) return FALLBACK_COMMAND_TITLE
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function parseTagInput(tags: TagsInput): string[] {
  if (Array.isArray(tags)) return tags
  if (typeof tags !== 'string') return []

  const trimmed = tags.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed)
    if (Array.isArray(parsed)) return parsed
  } catch {
    return trimmed.split(',')
  }

  return []
}

function normalizeTagArray(tags: string[]): string[] {
  return [...new Set(
    tags
      .filter((tag): tag is string => typeof tag === 'string')
      .map(tag => tag.trim().toLowerCase())
      .filter(Boolean)
  )]
}

# Body-First Command Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make command creation body-first by auto-filling editable title and tags while keeping the existing non-null title storage model.

**Architecture:** Add a shared deterministic metadata utility and reuse it at every command boundary: renderer form defaults, import/export normalization, library command file parsing, and SQLite writes. The UI will treat `body` as the required field, preserve hidden descriptions, and only auto-update title/tags until the user manually edits them.

**Tech Stack:** Vue 3, TypeScript, Electron IPC, SQLite via better-sqlite3, Vitest.

---

## File Structure

- Create `shared/command-metadata.ts`: deterministic title/tag/language normalization shared by renderer, main process, import/export, and library file parsing.
- Create `tests/command-metadata.test.ts`: unit tests for title and tag generation.
- Modify `shared/library-command.ts`: make library command normalization generate titles/tags for titleless or tagless file data.
- Modify `tests/library-command.test.ts`: cover titleless command file parsing and indexed payload generation.
- Modify `src/utils/importExport.ts`: allow titleless imports and normalize titles/tags before producing `ImportCommand` payloads.
- Modify `tests/import-export.test.ts`: cover titleless single-command and bundle imports.
- Modify `electron/main/database.ts`: normalize title and tags before SQLite writes so `title TEXT NOT NULL` stays compatible.
- Modify `tests/database.test.ts`: cover blank-title add/update/sync behavior and revise error-path tests to fail on invalid body instead of invalid title.
- Modify `electron/main/index.ts`: allow blank `title` through IPC validation while continuing to reject blank `body`.
- Modify `electron/main/local-library.ts`: normalize form data before filename generation and file writes, including create, batch create, edit, and read-only-copy edit paths.
- Modify `tests/local-library.test.ts`: cover blank-title local-library command creation and edit fallback.
- Modify `src/components/CommandModal.vue`: reorder fields to body first, hide description, auto-fill editable title and tags, and track manual overrides.
- Modify `src/vite-env.d.ts` and `electron/preload/index.ts` only if payload types need to allow optional title/tags. Prefer keeping the payload shape as strings and sending generated strings from the modal.
- Modify `docs/schema.md`: add a behavior note that `title` remains persisted and indexed but user entry no longer requires manual title input.

---

### Task 1: Shared Metadata Utility

**Files:**
- Create: `shared/command-metadata.ts`
- Create: `tests/command-metadata.test.ts`

- [ ] **Step 1: Write failing tests for deterministic metadata**

Create `tests/command-metadata.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  generateCommandTags,
  generateCommandTitle,
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

  it('generates database and log tags from SQL-like body text', () => {
    expect(generateCommandTags('SELECT * FROM logs WHERE level = ERROR', 'sql')).toEqual(['sql', 'database', 'logs'])
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
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
pnpm exec vitest run tests/command-metadata.test.ts
```

Expected: fails because `shared/command-metadata.ts` does not exist.

- [ ] **Step 3: Implement the shared utility**

Create `shared/command-metadata.ts`:

```ts
type TagsInput = string[] | string | null | undefined

export const FALLBACK_COMMAND_TITLE = 'Untitled snippet'
export const MAX_GENERATED_TITLE_LENGTH = 80
export const MAX_STORED_TITLE_LENGTH = 500
export const MAX_COMMAND_TAGS = 12

const NON_TAG_LANGUAGES = new Set(['plaintext', 'richtext'])

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
  { tag: 'sql', pattern: /\bsql\b|\bselect\b|\binsert\b|\bupdate\b|\bdelete\b|\bfrom\b|\bwhere\b/i },
  { tag: 'database', pattern: /\bsql\b|\bpostgres\b|\bpsql\b|\bmysql\b|\bsqlite\b|\bselect\b|\bfrom\b/i },
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
  if (!trimmed || /^```/.test(trimmed)) return ''

  return trimmed
    .replace(/^#{1,6}\s*/, '')
    .replace(/^>\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+[.)]\s+/, '')
    .replace(/[`*_~]/g, '')
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
```

- [ ] **Step 4: Run the focused utility test**

Run:

```powershell
pnpm exec vitest run tests/command-metadata.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 1**

Run:

```powershell
git add shared/command-metadata.ts tests/command-metadata.test.ts
git commit -m "feat: add command metadata generation"
```

---

### Task 2: Library File and Import Normalization

**Files:**
- Modify: `shared/library-command.ts`
- Modify: `tests/library-command.test.ts`
- Modify: `src/utils/importExport.ts`
- Modify: `tests/import-export.test.ts`

- [ ] **Step 1: Write failing library-command tests**

Append to `tests/library-command.test.ts`:

```ts
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
```

- [ ] **Step 2: Write failing import/export tests**

Update the import at the top of `tests/import-export.test.ts`:

```ts
import { exportCommands, generateExportFilename, importCommands, prepareExportBundle, validateExportData } from '../src/utils/importExport'
```

Append:

```ts
describe('importCommands', () => {
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
```

- [ ] **Step 3: Run the focused tests and verify they fail**

Run:

```powershell
pnpm exec vitest run tests/library-command.test.ts tests/import-export.test.ts
```

Expected: fails because title is still required in library parsing and import validation.

- [ ] **Step 4: Update `shared/library-command.ts`**

Change imports and types near the top:

```ts
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
```

Replace `normalizeLibraryTags()` and `normalizeLibraryCommand()` with:

```ts
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
```

Update `parseLibraryCommandFile()` validation:

```ts
  if (typeof candidate.body !== 'string') {
    return null
  }
```

Update the parse call:

```ts
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
```

Keep the body guard:

```ts
  if (!normalized.body) {
    return null
  }
```

Remove the old private `parseTagJson()` and `normalizeLanguage()` functions if they are no longer used.

- [ ] **Step 5: Update `src/utils/importExport.ts`**

Add import:

```ts
import {
  normalizeCommandLanguage,
  normalizeCommandTitle,
  serializeCommandTags,
} from '../../shared/command-metadata'
```

Make imported command titles optional:

```ts
export interface ExportCommand {
  title?: string
  body: string
  description: string
  tags: string[]
  language: string
  created_at: string
  updated_at: string
}
```

Update `importCommands()` mapping:

```ts
  return exportData.commands.map(command => {
    if (!command.body || typeof command.body !== 'string') {
      throw new Error(`Invalid command: missing body`)
    }

    const body = command.body.trim()
    const language = normalizeCommandLanguage(command.language)

    return {
      title: normalizeCommandTitle(command.title, body),
      body,
      description: (command.description || '').trim(),
      tags: serializeCommandTags(command.tags || [], body, language),
      language,
    }
  })
```

Update single command validation:

```ts
  if (data.snipforge === 'command') {
    if (typeof data.body === 'string') {
      data.commands = [data]
      data.version = '1.0'
      return true
    }
    throw new Error('Invalid command file: missing body')
  }

  if (!data.snipforge && typeof data.body === 'string' && !data.commands) {
    data.commands = [data]
    data.version = '1.0'
    return true
  }
```

Update per-command validation:

```ts
    if (command.title && typeof command.title !== 'string') {
      throw new Error(`Invalid command at index ${index}: title must be a string`)
    }

    if (!command.body || typeof command.body !== 'string') {
      throw new Error(`Invalid command at index ${index}: missing or invalid body`)
    }
```

Keep the existing title length check behind a type guard:

```ts
    if (typeof command.title === 'string' && command.title.length > MAX_TITLE_LENGTH) {
      throw new Error(`Command at index ${index}: title too long (${command.title.length} > ${MAX_TITLE_LENGTH})`)
    }
```

- [ ] **Step 6: Run focused normalization tests**

Run:

```powershell
pnpm exec vitest run tests/command-metadata.test.ts tests/library-command.test.ts tests/import-export.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit Task 2**

Run:

```powershell
git add shared/library-command.ts src/utils/importExport.ts tests/library-command.test.ts tests/import-export.test.ts
git commit -m "feat: normalize titleless command imports"
```

---

### Task 3: Main Process and SQLite Boundaries

**Files:**
- Modify: `electron/main/database.ts`
- Modify: `electron/main/index.ts`
- Modify: `electron/main/local-library.ts`
- Modify: `tests/database.test.ts`
- Modify: `tests/local-library.test.ts`

- [ ] **Step 1: Write failing database tests**

In `tests/database.test.ts`, append to `describe('addCommand', ...)`:

```ts
    it('generates title and tags when adding a command with blank metadata', () => {
        const id = db.addCommand({
            title: '',
            body: 'kubectl get pods -A',
            description: '',
            tags: '',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        const [command] = db.getAllCommands()
        expect(id).toBeGreaterThan(0)
        expect(command.title).toBe('kubectl get pods -A')
        expect(command.tags).toBe('["bash","kubectl","kubernetes"]')
    })
```

Add a new update test:

```ts
describe('updateCommand', () => {
    it('generates a title when updating a legacy command with a blank title', () => {
        const id = db.addCommand({
            title: 'Original',
            body: 'echo original',
            description: '',
            tags: '[]',
            language: 'bash',
            source: 'local',
            library_id: null,
            remote_path: null,
        })

        expect(db.updateCommand(id, {
            title: '',
            body: 'docker compose logs web',
            description: '',
            tags: '',
            language: 'bash',
        })).toBe(true)

        const [command] = db.getAllCommands()
        expect(command.title).toBe('docker compose logs web')
        expect(command.tags).toBe('["bash","docker","logs"]')
    })
})
```

Update the existing sync error tests so they still exercise error handling through invalid body, not invalid title:

```ts
title: 'Bad Command',
body: null as unknown as string,
```

- [ ] **Step 2: Write failing local-library tests**

Append to the local-library command tests near existing create/update coverage:

```ts
    it('creates a local library command with generated title and tags when metadata is blank', async () => {
        const setup = await setupDefaultWritableLocalLibrary(tmpDir)

        const result = await createLocalLibraryCommand({
            title: '',
            body: 'kubectl get pods -A',
            description: '',
            tags: '',
            language: 'bash',
        })

        expect(result.success).toBe(true)
        const commands = db.getRemoteCommands(setup.library.id)
        expect(commands).toHaveLength(1)
        expect(commands[0].title).toBe('kubectl get pods -A')
        expect(commands[0].tags).toBe('["bash","kubectl","kubernetes"]')
        expect(commands[0].remote_path).toBe('kubectl-get-pods-a.json')

        const filePath = path.join(tmpDir, commands[0].remote_path as string)
        const fileJson = JSON.parse(await fs.readFile(filePath, 'utf8'))
        expect(fileJson.title).toBe('kubectl get pods -A')
        expect(fileJson.tags).toEqual(['bash', 'kubectl', 'kubernetes'])
    })
```

- [ ] **Step 3: Run focused tests and verify they fail**

Run:

```powershell
pnpm exec vitest run tests/database.test.ts tests/local-library.test.ts
```

Expected: database tests fail because blank title still reaches `title TEXT NOT NULL` or stores blank metadata; local-library tests fail because filename generation still uses blank title.

- [ ] **Step 4: Update `electron/main/database.ts`**

Add import:

```ts
import {
    normalizeCommandLanguage,
    normalizeCommandTitle,
    serializeCommandTags,
} from "../../shared/command-metadata";
```

Add helper near `MAX_TITLE_LENGTH`:

```ts
function normalizeDbCommand(command: { title?: string | null; body?: string | null; description?: string | null; tags?: string | null; language?: string | null }) {
    const body = (command.body || '').trim()
    const language = normalizeCommandLanguage(command.language)

    return {
        title: normalizeCommandTitle(command.title, body).slice(0, MAX_TITLE_LENGTH),
        body,
        description: (command.description || '').trim(),
        tags: serializeCommandTags(command.tags || '', body, language),
        language,
    }
}
```

Use it in `addCommand()`:

```ts
    const normalized = normalizeDbCommand(command)
    const now = new Date().toISOString();
    const stmt = db.prepare(`
        INSERT INTO commands (title, body, description, tags, language, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
        normalized.title,
        normalized.body,
        normalized.description,
        normalized.tags,
        normalized.language,
        now,
        now
    );
```

Use it in `addCommands()` inside the transaction:

```ts
            const normalized = normalizeDbCommand(command)
            stmt.run(
                normalized.title,
                normalized.body,
                normalized.description,
                normalized.tags,
                normalized.language,
                now,
                now
            )
```

Use it in `updateCommand()`:

```ts
    const normalized = normalizeDbCommand(updates)
    const stmt = db.prepare(`
        UPDATE commands
        SET title = ?, body = ?, description = ?, tags = ?, language = ?, updated_at = ?,
            source = 'local', library_id = NULL, remote_path = NULL
        WHERE id = ?
    `);
    const result = stmt.run(
        normalized.title,
        normalized.body,
        normalized.description,
        normalized.tags,
        normalized.language,
        now,
        id
    );
```

Normalize remote writes in `addRemoteCommand()`, `updateRemoteCommand()`, and `updateRemoteCommandById()` by calling `normalizeDbCommand(command)` and using normalized title/body/description/tags/language in the SQL parameters. Keep incoming `created_at`, `updated_at`, `remote_path`, and `library_id` values unchanged.

- [ ] **Step 5: Update `electron/main/index.ts` validation**

Change `isValidCommandBatch()` to stop requiring title text:

```ts
function isValidCommandBatch(value: unknown): value is Array<{ title: string; body: string; description: string; tags: string; language: string }> {
  return Array.isArray(value) && value.every(command =>
    isValidCommandUpdate(command) &&
    typeof command.title === 'string' &&
    typeof command.body === 'string' &&
    command.body.trim().length > 0
  )
}
```

Change `library:createCommand` validation:

```ts
  if (
    !isValidCommandUpdate(command) ||
    typeof command.title !== 'string' ||
    typeof command.body !== 'string' ||
    !command.body.trim()
  ) {
    return { success: false, error: 'Invalid command data' }
  }
```

Change `library:updateCommand` validation:

```ts
  if (
    typeof id !== 'number' ||
    !isValidCommandUpdate(updates) ||
    typeof updates.title !== 'string' ||
    typeof updates.body !== 'string' ||
    !updates.body.trim()
  ) {
    return { success: false, error: 'Invalid parameters' }
  }
```

- [ ] **Step 6: Update `electron/main/local-library.ts`**

Add import:

```ts
import {
    normalizeCommandLanguage,
    normalizeCommandTitle,
    serializeCommandTags,
} from '../../shared/command-metadata'
```

Add helper below `interface CommandFormData`:

```ts
function normalizeCommandFormData(command: CommandFormData): CommandFormData {
    const body = command.body.trim()
    const language = normalizeCommandLanguage(command.language)

    return {
        title: normalizeCommandTitle(command.title, body),
        body,
        description: (command.description || '').trim(),
        tags: serializeCommandTags(command.tags || '', body, language),
        language,
    }
}
```

In `createLocalLibraryCommand()`, normalize before filename and write:

```ts
    const normalizedCommand = normalizeCommandFormData(command)
    const fileName = await findUniqueCommandFileName(library.github_repo, normalizedCommand.title)
    const createdAt = new Date().toISOString()
    await writeCommandFile(library.github_repo, fileName, normalizedCommand, createdAt, createCommandId())
```

In `createLocalLibraryCommands()`, normalize each command before filename and write:

```ts
            const normalizedCommand = normalizeCommandFormData(command)
            const fileName = await findUniqueCommandFileName(library.github_repo, normalizedCommand.title)
            const createdAt = new Date().toISOString()
            await writeCommandFile(library.github_repo, fileName, normalizedCommand, createdAt, createCommandId())
```

Use `normalizedCommand.title` in the batch error message:

```ts
            errors.push(`Failed to create "${normalizeCommandTitle(command.title, command.body)}": ${(error as Error).message}`)
```

In `updateLocalLibraryCommand()`, normalize `updates` once at function start after resolving target permission:

```ts
    const normalizedUpdates = normalizeCommandFormData(updates)
```

Use `normalizedUpdates` in all downstream write/update calls:

```ts
const fileName = await findUniqueCommandFileName(library.github_repo, normalizedUpdates.title)
await writeCommandFile(library.github_repo, fileName, normalizedUpdates, createdAt, createCommandId())
```

```ts
const nextFileName = await resolveUpdatedCommandFileName(target.library.github_repo, currentFileName, normalizedUpdates.title)
await writeCommandFile(
    target.library.github_repo,
    nextFileName,
    normalizedUpdates,
    existing.created_at || target.command.created_at,
    existing.id || createCommandId()
)
```

- [ ] **Step 7: Run focused main process tests**

Run:

```powershell
pnpm exec vitest run tests/command-metadata.test.ts tests/library-command.test.ts tests/database.test.ts tests/local-library.test.ts
```

Expected: pass.

- [ ] **Step 8: Commit Task 3**

Run:

```powershell
git add electron/main/database.ts electron/main/index.ts electron/main/local-library.ts tests/database.test.ts tests/local-library.test.ts
git commit -m "feat: accept body-first command writes"
```

---

### Task 4: Body-First Command Modal

**Files:**
- Modify: `src/components/CommandModal.vue`
- Modify: `src/App.vue` only if emitted payload types need cleanup after modal changes

- [ ] **Step 1: Change the modal template to body-first**

In `src/components/CommandModal.vue`, reorder the top of the modal body so body is first, title second, tags third. Remove the visible description form group from the template. Keep `formData.description` in script state.

Use this template shape:

```vue
<div class="modal-body">
    <div class="form-group">
        <div class="field-header">
            <label for="body">Command:</label>
            <div class="language-dropdown" ref="languageDropdownRef">
                <button
                    type="button"
                    class="language-trigger"
                    @click="languageOpen = !languageOpen"
                >
                    {{ languageLabels[formData.language] || formData.language }}
                    <span class="chevron" :class="{ open: languageOpen }">&#9662;</span>
                </button>
                <ul v-if="languageOpen" class="language-options">
                    <li
                        v-for="opt in languageOptions"
                        :key="opt.value"
                        :class="{ selected: formData.language === opt.value }"
                        @click="selectLanguage(opt.value)"
                    >
                        {{ opt.label }}
                    </li>
                </ul>
            </div>
        </div>
        <CodeEditor
            v-if="isCodeLanguage(formData.language)"
            v-model="formData.body"
            :language="formData.language"
            placeholder="Paste or write the snippet..."
        />
        <MarkdownEditor
            v-else-if="formData.language === 'markdown'"
            v-model="formData.body"
            placeholder="Paste or write the snippet..."
        />
        <RichTextEditor
            v-else-if="formData.language === 'richtext'"
            v-model="formData.body"
            placeholder="Paste or write the snippet..."
        />
        <textarea
            v-else
            id="body"
            ref="bodyInput"
            v-model="formData.body"
            placeholder="Paste or write the snippet..."
            rows="10"
            class="plain-textarea"
        ></textarea>
    </div>

    <div class="form-group">
        <label for="title">Title:</label>
        <input
            id="title"
            v-model="formData.title"
            type="text"
            placeholder="Auto-generated from the snippet"
            maxlength="500"
            @input="titleManuallyEdited = true"
        />
    </div>

    <div class="form-group">
        <label for="tags">Tags:</label>
        <div class="autocomplete-container">
            <input
                id="tags"
                ref="tagsInputRef"
                v-model="tagsInput"
                type="text"
                placeholder="Auto-generated, comma separated"
                @input="handleTagInput"
                @keydown="handleTagKeydown"
                @click="updateInlineSuggestion"
                @keyup="updateInlineSuggestion"
            />
            <div
                v-if="inlineSuggestion"
                class="inline-suggestion"
                :style="getSuggestionPosition()"
            >
                {{ inlineSuggestion }}
            </div>
        </div>
    </div>
</div>
```

- [ ] **Step 2: Update modal script imports and refs**

Add import:

```ts
import {
  generateCommandTags,
  normalizeCommandTitle,
  serializeCommandTags,
} from '../../shared/command-metadata'
```

Replace the title ref with body ref:

```ts
const bodyInput = ref<HTMLTextAreaElement>()
const titleManuallyEdited = ref(false)
const tagsManuallyEdited = ref(false)
```

- [ ] **Step 3: Add metadata helper functions in the component**

Add after `availableTags`:

```ts
const generatedTagsInput = (): string => {
  return generateCommandTags(formData.value.body, formData.value.language).join(', ')
}

const applyGeneratedMetadata = () => {
  if (!formData.value.body.trim()) {
    if (!titleManuallyEdited.value) formData.value.title = ''
    if (!tagsManuallyEdited.value) tagsInput.value = ''
    return
  }

  if (!titleManuallyEdited.value) {
    formData.value.title = normalizeCommandTitle('', formData.value.body)
  }

  if (!tagsManuallyEdited.value) {
    tagsInput.value = generatedTagsInput()
  }
}
```

Update `handleTagInput()`:

```ts
  const handleTagInput = () => {
    tagsManuallyEdited.value = true
    updateInlineSuggestion()
  }
```

Update `selectLanguage()`:

```ts
  const selectLanguage = (value: string) => {
    formData.value.language = value
    languageOpen.value = false
    applyGeneratedMetadata()
  }
```

- [ ] **Step 4: Update modal watchers**

Update the command watcher:

```ts
  watch(() => props.command, (newCommand) => {
    titleManuallyEdited.value = false
    tagsManuallyEdited.value = false

    if (newCommand) {
      formData.value = {
        title: newCommand.title,
        body: newCommand.body,
        description: newCommand.description || '',
        language: newCommand.language || 'plaintext'
      }
      try {
        const tags = JSON.parse(newCommand.tags)
        tagsInput.value = Array.isArray(tags) ? tags.join(', ') : ''
      } catch {
        tagsInput.value = ''
      }

      if (formData.value.title.trim()) titleManuallyEdited.value = true
      if (tagsInput.value.trim()) tagsManuallyEdited.value = true
      applyGeneratedMetadata()
    } else {
      formData.value = { title: '', body: '', description: '', language: 'plaintext' }
      tagsInput.value = ''
    }
  }, { immediate: true })
```

Update the `props.show` watcher:

```ts
  watch(() => props.show, (isShown) => {
    if (isShown) {
      nextTick(() => {
        bodyInput.value?.focus()
      })
    } else {
      languageOpen.value = false
      if (props.mode === 'add') {
        formData.value = { title: '', body: '', description: '', language: 'plaintext' }
        tagsInput.value = ''
        titleManuallyEdited.value = false
        tagsManuallyEdited.value = false
      }
    }
  })
```

Add body and language metadata watcher:

```ts
  watch(
    () => [formData.value.body, formData.value.language] as const,
    () => applyGeneratedMetadata()
  )
```

- [ ] **Step 5: Update save validation**

Replace `handleSave()` with:

```ts
  const handleSave = () => {
    if (!formData.value.body.trim()) {
      alert('Command is required!')
      return
    }

    const title = normalizeCommandTitle(formData.value.title, formData.value.body)
    const tags = serializeCommandTags(tagsInput.value, formData.value.body, formData.value.language)

    emit('save', {
      title,
      body: formData.value.body.trim(),
      description: formData.value.description.trim(),
      tags,
      language: formData.value.language
    })
  }
```

- [ ] **Step 6: Run type check**

Run:

```powershell
pnpm exec vue-tsc --noEmit
```

Expected: pass. If it fails because CodeEditor/RichTextEditor focus cannot be handled through `bodyInput`, keep focus best-effort for plaintext and leave code editor focus unchanged.

- [ ] **Step 7: Commit Task 4**

Run:

```powershell
git add src/components/CommandModal.vue src/App.vue
git commit -m "feat: make command entry body first"
```

---

### Task 5: Docs and Full Verification

**Files:**
- Modify: `docs/schema.md`

- [ ] **Step 1: Update schema behavior notes**

In `docs/schema.md`, under the `commands` table behavior notes, add:

```md
- `title` remains a non-null persisted/indexed field, but the entry UI no longer requires users to type it manually; blank user titles are normalized from `body` before persistence
- blank tag input may be normalized into deterministic generated tags from body keywords and language before persistence
```

- [ ] **Step 2: Run all tests**

Run:

```powershell
pnpm test
```

Expected: all Vitest suites pass.

- [ ] **Step 3: Run TypeScript and production renderer/main build**

Run:

```powershell
pnpm exec vue-tsc --noEmit
pnpm exec vite build
```

Expected: both commands pass.

- [ ] **Step 4: Run Electron packaging for local Windows verification**

Run:

```powershell
$env:ELECTRON_MIRROR='https://npmmirror.com/mirrors/electron/'
$env:npm_config_electron_mirror='https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR='https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
pnpm exec -- electron-builder --win --x64 --publish never --config.win.signAndEditExecutable=false
```

Expected: `release/2.13.1/win-unpacked/SnipForge.exe` and `release/2.13.1/SnipForge-Windows-2.13.1-Setup.exe` are generated. This command avoids the known local Windows symlink privilege issue in `winCodeSign` extraction.

- [ ] **Step 5: Manual app verification**

Run:

```powershell
Start-Process -FilePath '.\release\2.13.1\win-unpacked\SnipForge.exe'
```

Verify:

- New command modal focuses the body field first for plaintext.
- Pasting `kubectl get pods -A` fills title with `kubectl get pods -A`.
- Tags fill with `bash, kubectl, kubernetes` after selecting `bash`.
- Editing title prevents later body edits from overwriting that title.
- Editing tags prevents later body or language edits from overwriting those tags.
- Save works with only body entered.
- Saved command appears in the list and search.
- Editing a command preserves existing hidden description text.

- [ ] **Step 6: Commit Task 5**

Run:

```powershell
git add docs/schema.md
git commit -m "docs: document generated command metadata"
```

- [ ] **Step 7: Final status check**

Run:

```powershell
git status --short --branch
git log --oneline -5
```

Expected: working tree is clean and recent commits show the metadata utility, import normalization, body-first writes, body-first modal, and docs update.


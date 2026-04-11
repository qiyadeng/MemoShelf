import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import Fuse from 'fuse.js'

const execFile = promisify(execFileCallback)

const VARIABLE_PATTERN = /{{\s*[^}]+\s*}}/
const DEFAULT_SEARCH_LIMIT = 10

export async function loadLibrary(libraryPath) {
  const root = path.resolve(libraryPath)
  const manifestPath = path.join(root, '.snipforge.json')

  let manifestRaw
  try {
    manifestRaw = await fs.readFile(manifestPath, 'utf8')
  } catch {
    throw new Error(`Not a SnipForge library: missing ${manifestPath}`)
  }

  let manifest
  try {
    manifest = JSON.parse(manifestRaw)
  } catch {
    throw new Error(`Invalid library manifest JSON: ${manifestPath}`)
  }

  if (!manifest || typeof manifest.name !== 'string' || !manifest.name.trim()) {
    throw new Error(`Invalid library manifest: missing "name" in ${manifestPath}`)
  }

  const entries = await fs.readdir(root, { withFileTypes: true })
  const commands = []

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name === '.snipforge.json') {
      continue
    }

    const filePath = path.join(root, entry.name)

    let raw
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch {
      continue
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      continue
    }

    const command = normalizeCommand(parsed)
    if (!command) {
      continue
    }

    commands.push({
      ...command,
      filePath,
      relativePath: entry.name,
    })
  }

  commands.sort((a, b) => a.title.localeCompare(b.title))

  return {
    root,
    manifest: {
      name: manifest.name.trim(),
      description: typeof manifest.description === 'string' ? manifest.description.trim() : '',
      format_version: typeof manifest.format_version === 'string' ? manifest.format_version.trim() : '1.0',
    },
    commands,
  }
}

export function searchCommands(commands, query, limit = DEFAULT_SEARCH_LIMIT) {
  const trimmed = query.trim()
  if (!trimmed) {
    return commands.slice(0, limit).map((item, index) => ({
      item,
      score: 0,
      rank: index + 1,
    }))
  }

  const fuse = new Fuse(commands, {
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35,
    keys: [
      { name: 'title', weight: 0.5 },
      { name: 'tags', weight: 0.25 },
      { name: 'description', weight: 0.15 },
      { name: 'body', weight: 0.1 },
    ],
  })

  return fuse.search(trimmed, { limit }).map((result, index) => ({
    item: result.item,
    score: result.score ?? 0,
    rank: index + 1,
  }))
}

export function commandHasVariables(command) {
  return VARIABLE_PATTERN.test(command.body)
}

export async function copyCommandText(command, options = {}) {
  if (commandHasVariables(command)) {
    throw new Error(`Cannot copy "${command.title}" because it contains template variables. Use the desktop app for substitution.`)
  }

  const writer = options.writeClipboard ?? writeClipboard
  await writer(command.body)
}

export async function writeClipboard(text) {
  if (process.platform === 'darwin') {
    await execFile('pbcopy', [], { input: text })
    return
  }

  if (process.platform === 'win32') {
    await execFile('cmd', ['/c', 'clip'], { input: text })
    return
  }

  const linuxCommands = [
    ['wl-copy', []],
    ['xclip', ['-selection', 'clipboard']],
    ['xsel', ['--clipboard', '--input']],
  ]

  let lastError = null
  for (const [command, args] of linuxCommands) {
    try {
      await execFile(command, args, { input: text })
      return
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(`Clipboard copy is unavailable on this system${lastError ? ': install wl-copy, xclip, or xsel' : ''}`)
}

export async function runCli(argv, io = {}, deps = {}) {
  const stdout = io.stdout ?? process.stdout
  const stderr = io.stderr ?? process.stderr
  const cwd = io.cwd ?? process.cwd()

  try {
    const args = parseArgs(argv)
    const libraryPath = args.libraryPath ?? cwd
    const library = await loadLibrary(libraryPath)

    if (args.command === 'list') {
      const lines = [
        `Library: ${library.manifest.name}`,
        ...formatMatches(library.commands.map((item, index) => ({ item, rank: index + 1 }))),
      ]
      stdout.write(lines.join('\n') + '\n')
      return 0
    }

    if (args.command === 'search') {
      const matches = searchCommands(library.commands, args.query)
      if (matches.length === 0) {
        stdout.write(`No commands matched "${args.query}" in ${library.manifest.name}.\n`)
        return 1
      }

      const lines = [
        `Library: ${library.manifest.name}`,
        `Query: ${args.query}`,
        ...formatMatches(matches),
      ]
      stdout.write(lines.join('\n') + '\n')
      return 0
    }

    if (args.command === 'copy') {
      const command = args.id
        ? library.commands.find(item => item.id === args.id)
        : searchCommands(library.commands, args.query, 1)[0]?.item

      if (!command) {
        const selector = args.id ? `id "${args.id}"` : `query "${args.query}"`
        stderr.write(`No command found for ${selector}.\n`)
        return 1
      }

      const writeClipboardFn = deps.writeClipboard ?? writeClipboard
      await copyCommandText(command, { writeClipboard: writeClipboardFn })
      stdout.write(`Copied "${command.title}" from ${library.manifest.name}.\n`)
      return 0
    }

    stderr.write(usage())
    return 1
  } catch (error) {
    stderr.write(`${error.message}\n`)
    return 1
  }
}

export function usage() {
  return [
    'Usage:',
    '  snipforge list [--library <path>]',
    '  snipforge search <query> [--library <path>]',
    '  snipforge copy <query> [--library <path>]',
    '  snipforge copy --id <uuid> [--library <path>]',
  ].join('\n') + '\n'
}

function parseArgs(argv) {
  const args = [...argv]
  const libraryFlagIndex = args.indexOf('--library')
  let libraryPath = null
  if (libraryFlagIndex >= 0) {
    libraryPath = args[libraryFlagIndex + 1]
    if (!libraryPath) {
      throw new Error('Missing value for --library')
    }
    args.splice(libraryFlagIndex, 2)
  }

  const [command, ...rest] = args
  if (!command || command === '--help' || command === '-h') {
    throw new Error(usage().trimEnd())
  }

  if (command === 'list') {
    return { command, libraryPath }
  }

  if (command === 'search') {
    const query = rest.join(' ').trim()
    if (!query) {
      throw new Error('Search requires a query')
    }
    return { command, query, libraryPath }
  }

  if (command === 'copy') {
    const idFlagIndex = rest.indexOf('--id')
    if (idFlagIndex >= 0) {
      const id = rest[idFlagIndex + 1]
      if (!id) {
        throw new Error('Missing value for --id')
      }
      return { command, id, libraryPath }
    }

    const query = rest.join(' ').trim()
    if (!query) {
      throw new Error('Copy requires a query or --id')
    }
    return { command, query, libraryPath }
  }

  throw new Error(usage().trimEnd())
}

function normalizeCommand(input) {
  if (!input || typeof input !== 'object') {
    return null
  }

  if (typeof input.title !== 'string' || typeof input.body !== 'string') {
    return null
  }

  const title = input.title.trim()
  const body = input.body.trim()
  if (!title || !body) {
    return null
  }

  return {
    id: normalizeCommandId(input.id),
    title,
    body,
    description: typeof input.description === 'string' ? input.description.trim() : '',
    tags: normalizeTags(input.tags),
    language: typeof input.language === 'string' && input.language.trim() ? input.language.trim().toLowerCase() : 'plaintext',
    created_at: typeof input.created_at === 'string' && input.created_at.trim() ? input.created_at.trim() : new Date().toISOString(),
    updated_at: typeof input.updated_at === 'string' && input.updated_at.trim() ? input.updated_at.trim() : new Date().toISOString(),
  }
}

function normalizeCommandId(value) {
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
    ? value.toLowerCase()
    : null
}

function normalizeTags(tags) {
  const values = Array.isArray(tags)
    ? tags
    : typeof tags === 'string'
      ? tryParseJsonArray(tags)
      : []

  return [...new Set(values
    .filter(value => typeof value === 'string')
    .map(value => value.trim().toLowerCase())
    .filter(Boolean))]
}

function tryParseJsonArray(value) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function formatMatches(matches) {
  return matches.map(({ item, rank }) => {
    const tags = item.tags.length > 0 ? ` [${item.tags.join(', ')}]` : ''
    const description = item.description ? ` - ${item.description}` : ''
    const id = item.id ? ` (${item.id.slice(0, 8)})` : ''
    return `${rank}. ${item.title}${id}${tags}${description}`
  })
}

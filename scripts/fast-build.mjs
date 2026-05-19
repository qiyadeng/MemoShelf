#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs'

const require = createRequire(import.meta.url)

export function parseFastBuildArgs(argv) {
  const options = { packageApp: false }

  for (const arg of argv) {
    if (arg === '--package') {
      options.packageApp = true
      continue
    }

    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

export function createFastBuildPlan({ packageApp, nativeModulesReady }) {
  const steps = []

  if (!nativeModulesReady) {
    steps.push({
      label: 'Rebuild better-sqlite3 for Electron',
      command: 'pnpm',
      args: ['exec', 'electron-rebuild', '-f', '-w', 'better-sqlite3'],
      env: createCachedBuildEnv(),
    })
  }

  steps.push({
    label: 'Compile renderer and Electron entrypoints',
    command: 'pnpm',
    args: ['exec', 'vite', 'build'],
  })

  if (packageApp) {
    steps.push({
      label: 'Package desktop app',
      command: 'pnpm',
      args: [
        'exec',
        'electron-builder',
        '--publish',
        'never',
        '--config.win.signAndEditExecutable=false',
        '--config.npmRebuild=false',
      ],
      env: createPackagerEnv(),
    })
  }

  return steps
}

export function formatStep(step) {
  return [step.command, ...step.args].join(' ')
}

function createCachedBuildEnv() {
  const projectRoot = process.cwd()
  const cacheRoot = path.join(projectRoot, '.cache')
  const homeDir = path.join(cacheRoot, 'home')
  const npmCacheDir = path.join(cacheRoot, 'npm')
  const electronGypDir = path.join(cacheRoot, 'electron-gyp')

  mkdirSync(homeDir, { recursive: true })
  mkdirSync(npmCacheDir, { recursive: true })
  mkdirSync(electronGypDir, { recursive: true })

  return {
    HOME: homeDir,
    npm_config_cache: npmCacheDir,
    npm_config_devdir: electronGypDir,
  }
}

function createPackagerEnv() {
  return {
    ...createCachedBuildEnv(),
    ELECTRON_MIRROR: process.env.ELECTRON_MIRROR || 'https://npmmirror.com/mirrors/electron/',
    npm_config_electron_mirror: process.env.npm_config_electron_mirror || 'https://npmmirror.com/mirrors/electron/',
    ELECTRON_BUILDER_BINARIES_MIRROR: process.env.ELECTRON_BUILDER_BINARIES_MIRROR || 'https://npmmirror.com/mirrors/electron-builder-binaries/',
    CSC_IDENTITY_AUTO_DISCOVERY: process.env.CSC_IDENTITY_AUTO_DISCOVERY || 'false',
  }
}

function electronCanLoadBetterSqlite3() {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'snipforge-electron-smoke-'))

  try {
    writeFileSync(
      path.join(tempDir, 'package.json'),
      JSON.stringify({ name: 'snipforge-electron-smoke', main: 'main.cjs' }),
    )
    writeFileSync(
      path.join(tempDir, 'main.cjs'),
      [
        "const { app } = require('electron')",
        'try {',
        '  const Database = require(process.env.SNIPFORGE_BETTER_SQLITE3_ENTRY)',
        "  const db = new Database(':memory:')",
        "  db.prepare('select 1 as ok').get()",
        '  db.close()',
        '  app.exit(0)',
        '} catch (error) {',
        '  console.error(error && error.stack ? error.stack : error)',
        '  app.exit(1)',
        '}',
        '',
      ].join('\n'),
    )

    const result = spawnSync('pnpm', ['exec', 'electron', tempDir], {
      shell: process.platform === 'win32',
      stdio: 'pipe',
      encoding: 'utf8',
      env: {
        ...process.env,
        SNIPFORGE_BETTER_SQLITE3_ENTRY: require.resolve('better-sqlite3'),
      },
    })

    if (result.status === 0) {
      return true
    }

    const output = `${result.stdout || ''}${result.stderr || ''}`.trim()
    if (output) {
      console.log(output)
    }
    return false
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function runStep(step) {
  console.log(`\n> ${step.label}`)
  console.log(`$ ${formatStep(step)}`)

  const result = spawnSync(step.command, step.args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: {
      ...process.env,
      ...(step.env || {}),
    },
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

function printHelp() {
  console.log([
    'Usage: pnpm build:fast [--package]',
    '',
    'Build modes:',
    '  pnpm build:fast   Rebuild native modules only when needed, then run vite build.',
    '  pnpm build:app    Do the fast build, then run electron-builder without publishing.',
    '',
  ].join('\n'))
}

async function main() {
  const options = parseFastBuildArgs(process.argv.slice(2))

  if (options.help) {
    printHelp()
    return
  }

  console.log('Checking Electron native module compatibility...')
  const nativeModulesReady = electronCanLoadBetterSqlite3()
  const plan = createFastBuildPlan({
    packageApp: options.packageApp,
    nativeModulesReady,
  })

  for (const step of plan) {
    runStep(step)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error && error.stack ? error.stack : error)
    process.exit(1)
  })
}

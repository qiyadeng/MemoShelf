#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const vitestArgs = process.argv.slice(2).filter((arg) => arg !== '--')

run('pnpm', ['rebuild', 'better-sqlite3'])
run('pnpm', ['exec', 'vitest', 'run', 'tests/database.test.ts', ...vitestArgs])

import { describe, expect, it } from 'vitest'
import {
  createFastBuildPlan,
  formatStep,
  parseFastBuildArgs,
} from '../scripts/fast-build.mjs'

describe('fast build script planning', () => {
  it('builds quickly when native modules already match Electron', () => {
    const plan = createFastBuildPlan({
      packageApp: false,
      nativeModulesReady: true,
    })

    expect(plan.map(formatStep)).toEqual([
      'pnpm exec vite build',
    ])
  })

  it('rebuilds better-sqlite3 before compiling when Electron cannot load it', () => {
    const plan = createFastBuildPlan({
      packageApp: false,
      nativeModulesReady: false,
    })

    expect(plan.map(formatStep)).toEqual([
      'pnpm exec electron-rebuild -f -w better-sqlite3',
      'pnpm exec vite build',
    ])
  })

  it('adds packaging only when requested', () => {
    const plan = createFastBuildPlan({
      packageApp: true,
      nativeModulesReady: true,
    })

    expect(plan.map(formatStep)).toEqual([
      'pnpm exec vite build',
      'pnpm exec electron-builder --publish never --config.win.signAndEditExecutable=false --config.npmRebuild=false',
    ])
  })
})

describe('fast build argument parsing', () => {
  it('accepts --package for the full app build path', () => {
    expect(parseFastBuildArgs(['--package'])).toEqual({ packageApp: true })
  })

  it('rejects unknown flags so typos do not run a surprising build', () => {
    expect(() => parseFastBuildArgs(['--packge'])).toThrow('Unknown argument: --packge')
  })
})

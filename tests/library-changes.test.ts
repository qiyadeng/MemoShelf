import { describe, expect, it } from 'vitest'
import type { Library } from '../shared/types'
import { describeLibraryChanges } from '../src/utils/library-changes'

function buildLibrary(overrides: Partial<Library> = {}): Library {
  return {
    id: 1,
    github_repo: '/tmp/my-library',
    type: 'local',
    name: 'My Library',
    description: '',
    manifest_path: '/tmp/my-library/.snipforge.json',
    last_synced_at: null,
    last_synced_sha: null,
    auto_sync: 0,
    permission: 'owner',
    created_at: new Date().toISOString(),
    local_path: '/tmp/my-library',
    origin: null,
    working_copy: {
      local_path: '/tmp/my-library',
      manifest_path: '/tmp/my-library/.snipforge.json',
      materialized: true,
    },
    working_tree: {
      state: 'clean',
      has_changes: false,
      modified: 0,
      added: 0,
      deleted: 0,
      checked_at: new Date().toISOString(),
      error: null,
    },
    ...overrides,
  }
}

describe('describeLibraryChanges', () => {
  it('describes a dirty working copy with change counts', () => {
    const summary = describeLibraryChanges(buildLibrary({
      origin: { provider: 'github', url: 'https://github.com/org/repo', ref: 'main' },
      working_tree: {
        state: 'dirty',
        has_changes: true,
        modified: 2,
        added: 1,
        deleted: 3,
        checked_at: new Date().toISOString(),
        error: null,
      },
    }))

    expect(summary.headline).toBe('Working tree has local changes')
    expect(summary.detail).toBe('2 modified, 1 new, 3 deleted')
    expect(summary.canSync).toBe(true)
    expect(summary.tone).toBe('warning')
  })

  it('keeps local-only libraries free of origin sync controls', () => {
    const summary = describeLibraryChanges(buildLibrary({
      working_tree: {
        state: 'not_repo',
        has_changes: false,
        modified: 0,
        added: 0,
        deleted: 0,
        checked_at: new Date().toISOString(),
        error: null,
      },
    }))

    expect(summary.headline).toBe('Local-only library')
    expect(summary.canSync).toBe(false)
    expect(summary.syncTitle).toContain('remote origin')
    expect(summary.tone).toBe('neutral')
  })

  it('surfaces explicit git fallback states without hiding origin-backed sync', () => {
    const summary = describeLibraryChanges(buildLibrary({
      type: 'github',
      github_repo: 'org/repo',
      origin: { provider: 'github', url: 'https://github.com/org/repo', ref: 'main' },
      working_tree: {
        state: 'git_unavailable',
        has_changes: false,
        modified: 0,
        added: 0,
        deleted: 0,
        checked_at: new Date().toISOString(),
        error: 'System git is unavailable on this machine.',
      },
    }))

    expect(summary.headline).toBe('System git unavailable')
    expect(summary.detail).toContain('System git is unavailable')
    expect(summary.canSync).toBe(true)
    expect(summary.tone).toBe('warning')
  })
})

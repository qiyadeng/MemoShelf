import type { Library } from '../../shared/types'

export interface LibraryChangesSummary {
  headline: string
  detail: string
  tone: 'neutral' | 'success' | 'warning' | 'danger'
  canSync: boolean
  syncTitle: string
}

function formatCountSummary(library: Library): string {
  const parts: string[] = []

  if (library.working_tree.modified > 0) {
    parts.push(`${library.working_tree.modified} modified`)
  }

  if (library.working_tree.added > 0) {
    parts.push(`${library.working_tree.added} new`)
  }

  if (library.working_tree.deleted > 0) {
    parts.push(`${library.working_tree.deleted} deleted`)
  }

  return parts.join(', ')
}

export function describeLibraryChanges(library: Library): LibraryChangesSummary {
  const hasOrigin = !!library.origin
  const hasWorkingCopy = !!library.local_path
  const canSync = hasOrigin && hasWorkingCopy

  switch (library.working_tree.state) {
    case 'dirty':
      return {
        headline: 'Working tree has local changes',
        detail: formatCountSummary(library),
        tone: 'warning',
        canSync,
        syncTitle: canSync
          ? 'Sync library'
          : 'Sync is unavailable until this library has a local working copy.',
      }
    case 'clean':
      return {
        headline: hasOrigin ? 'Working tree clean' : 'Local library is clean',
        detail: hasOrigin
          ? 'No local file changes detected in this working copy.'
          : 'No local file changes detected. No remote origin is configured.',
        tone: 'success',
        canSync,
        syncTitle: canSync
          ? 'Sync library'
          : 'Sync is only available for libraries with a remote origin.',
      }
    case 'not_repo':
      return {
        headline: hasOrigin ? 'Git working copy unavailable' : 'Local-only library',
        detail: hasOrigin
          ? 'This library has an origin, but the stored folder is not inside a git work tree. Relink it to the real repo-backed folder.'
          : 'No git working copy detected. Origin controls stay hidden until a remote-backed workflow exists.',
        tone: hasOrigin ? 'warning' : 'neutral',
        canSync,
        syncTitle: canSync
          ? 'Sync library'
          : 'Sync is only available for libraries with a remote origin.',
      }
    case 'git_unavailable':
      return {
        headline: 'System git unavailable',
        detail: library.working_tree.error || 'Install git to inspect local change status for this library.',
        tone: 'warning',
        canSync,
        syncTitle: canSync
          ? 'Sync library'
          : 'Sync is only available for libraries with a remote origin.',
      }
    case 'no_working_copy':
      return {
        headline: 'No working copy available',
        detail: 'This library is missing a local working copy, so change inspection and origin actions are blocked.',
        tone: 'danger',
        canSync: false,
        syncTitle: 'Sync is unavailable until this library has a local working copy.',
      }
    case 'error':
      return {
        headline: 'Unable to inspect working tree',
        detail: library.working_tree.error || 'MemoShelf hit an unexpected error while checking this library.',
        tone: 'danger',
        canSync,
        syncTitle: canSync
          ? 'Sync library'
          : 'Sync is only available for libraries with a remote origin.',
      }
  }
}

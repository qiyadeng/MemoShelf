export interface Command {
  id: number
  title: string
  body: string
  description: string
  tags: string
  language: string
  source: CommandSource
  library_id: number | null
  remote_path: string | null
  created_at: string
  updated_at: string
}

export interface CommandWithTags extends Command {
  tagsArray: string[]
  tagsNormalized: string[]
}

// Library contract types

export interface LibraryOrigin {
  provider: 'github'
  url: string
  ref: string | null
}

export interface LibraryWorkingCopyState {
  local_path: string | null
  manifest_path: string | null
  materialized: boolean
}

export type LibraryWorkingTreeState =
  | 'clean'
  | 'dirty'
  | 'not_repo'
  | 'git_unavailable'
  | 'no_working_copy'
  | 'error'

export interface LibraryWorkingTreeStatus {
  state: LibraryWorkingTreeState
  has_changes: boolean
  modified: number
  added: number
  deleted: number
  checked_at: string | null
  error: string | null
}

export interface LibraryWorkflowActionState {
  available: boolean
  reason: string | null
}

export interface LibraryGitWorkflowSummary {
  supported: boolean
  headline: string
  detail: string
  tone: 'neutral' | 'success' | 'warning' | 'danger'
  remote_name: string | null
  current_branch: string | null
  default_branch: string | null
  has_upstream: boolean
  actions: {
    fetch: LibraryWorkflowActionState
    update: LibraryWorkflowActionState
    commit: LibraryWorkflowActionState
    push: LibraryWorkflowActionState
    pull_request: LibraryWorkflowActionState
  }
}

export type CommandSource = 'local' | 'remote'

export type LibraryType = 'github' | 'local'

export type LibraryPermission = 'owner' | 'curator' | 'consumer'

export interface Library {
  id: number
  github_repo: string       // "org/repo-name" for GitHub, absolute path for local
  type: LibraryType
  name: string
  description: string
  manifest_path: string | null  // null = not initialized (no .snipforge.json)
  last_synced_at: string | null
  last_synced_sha: string | null
  auto_sync: number             // 0 = off, 1 = on (SQLite integer boolean)
  permission: LibraryPermission // 'owner' | 'curator' | 'consumer'
  created_at: string
  local_path: string | null
  origin: LibraryOrigin | null
  working_copy: LibraryWorkingCopyState
  working_tree: LibraryWorkingTreeStatus
}

export interface LibraryCommand {
  id?: string
  title: string
  body: string
  description: string
  tags: string[]
  language: string
  created_at: string
  updated_at: string
}

// Legacy alias kept for compatibility with the shipped remote-library model.
export type RemoteCommand = LibraryCommand

export interface LibraryManifest {
  snipforge?: string
  name: string
  description: string
  format_version: string
}

export interface SyncResult {
  added: number
  updated: number
  removed: number
  errors: string[]
}

export interface LibraryWorkflowResult {
  success: boolean
  blocked?: boolean
  message?: string
  detail?: string
  error?: string
  url?: string
  syncResult?: SyncResult
}

export interface GitHubUser {
  login: string
  avatar_url: string
  name: string | null
}

export interface DeviceFlowResponse {
  user_code: string
  verification_uri: string
}

export interface AuthStatus {
  authenticated: boolean
  user: GitHubUser | null
}

export interface BulkPublishResult {
  commandId: number
  title: string
  success: boolean
  path?: string
  created?: boolean
  error?: string
}

// Multi-library discovery
export interface DiscoveredLibrary {
  name: string
  description: string
  path: string          // directory path (subpath to use for scoped working copy lookup)
  manifestPath: string  // full path to .snipforge.json
  commandCount: number  // number of command JSON files in the directory
}

// Auto-update types
export interface UpdateStatus {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string          // snipforge.dev download page
  lastChecked: string | null  // ISO timestamp
}

export interface DefaultWritableLibraryResult {
  success: boolean
  library: Library | null
  error?: string
}

export interface DefaultWritableLibrarySetupResult {
  success: boolean
  library?: Library
  syncResult?: SyncResult
  cancelled?: boolean
  error?: string
}

export interface CommandMutationResult {
  success: boolean
  mode?: 'library' | 'database'
  library?: Library
  syncResult?: SyncResult
  error?: string
}

export interface BatchCommandMutationResult {
  success: boolean
  mode?: 'library' | 'database' | 'mixed'
  processed: number
  succeeded: number
  failed: number
  errors: string[]
  libraries?: Library[]
}

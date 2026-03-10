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

// Remote Library types

export type CommandSource = 'local' | 'remote'

export type LibraryType = 'github' | 'local'

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
  created_at: string
}

export interface RemoteCommand {
  title: string
  body: string
  description: string
  tags: string[]
  language: string
  created_at: string
  updated_at: string
}

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

// Auto-update types
export interface UpdateStatus {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string          // snipforge.dev download page
  lastChecked: string | null  // ISO timestamp
}

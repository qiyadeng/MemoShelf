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

export interface Library {
  id: number
  github_repo: string       // "org/repo-name"
  name: string
  description: string
  manifest_path: string | null  // null = not initialized (no .snipforge.json)
  last_synced_at: string | null
  last_synced_sha: string | null
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

export interface Command {
  id: number
  title: string
  body: string
  description: string
  tags: string
  language: string
  created_at: string
  updated_at: string
}

export interface CommandWithTags extends Command {
  tagsArray: string[]
  tagsNormalized: string[]
}

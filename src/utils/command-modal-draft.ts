export interface CommandModalDraft {
  title: string
  body: string
  description: string
  tagsInput: string
  language: string
}

const normalizeDraftValue = (value: string): string => value.trim()

export function commandModalDraftHasChanges(current: CommandModalDraft, baseline: CommandModalDraft): boolean {
  return (
    normalizeDraftValue(current.title) !== normalizeDraftValue(baseline.title) ||
    normalizeDraftValue(current.body) !== normalizeDraftValue(baseline.body) ||
    normalizeDraftValue(current.description) !== normalizeDraftValue(baseline.description) ||
    normalizeDraftValue(current.tagsInput) !== normalizeDraftValue(baseline.tagsInput) ||
    current.language !== baseline.language
  )
}

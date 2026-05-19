import { describe, expect, it } from 'vitest'
import {
  commandModalDraftHasChanges,
  type CommandModalDraft
} from '../src/utils/command-modal-draft'

const emptyDraft: CommandModalDraft = {
  title: '',
  body: '',
  description: '',
  tagsInput: '',
  language: 'plaintext'
}

describe('command modal draft state', () => {
  it('does not mark a fresh add form as changed', () => {
    expect(commandModalDraftHasChanges(emptyDraft, emptyDraft)).toBe(false)
  })

  it('marks body text as an unsaved change', () => {
    expect(commandModalDraftHasChanges({
      ...emptyDraft,
      body: 'temporary text I need to copy first'
    }, emptyDraft)).toBe(true)
  })

  it('marks generated metadata as an unsaved change', () => {
    expect(commandModalDraftHasChanges({
      ...emptyDraft,
      title: 'temporary text I need to copy first',
      tagsInput: 'temporary, text'
    }, emptyDraft)).toBe(true)
  })

  it('does not mark an unchanged edit form as changed', () => {
    const existingDraft: CommandModalDraft = {
      title: 'kubectl logs',
      body: 'kubectl logs deploy/api -n prod',
      description: '',
      tagsInput: 'kubectl, logs',
      language: 'bash'
    }

    expect(commandModalDraftHasChanges(existingDraft, existingDraft)).toBe(false)
  })

  it('normalizes surrounding whitespace before comparing fields', () => {
    expect(commandModalDraftHasChanges({
      title: '  kubectl logs  ',
      body: '\nkubectl logs deploy/api -n prod\n',
      description: '',
      tagsInput: ' kubectl, logs ',
      language: 'bash'
    }, {
      title: 'kubectl logs',
      body: 'kubectl logs deploy/api -n prod',
      description: '',
      tagsInput: 'kubectl, logs',
      language: 'bash'
    })).toBe(false)
  })
})

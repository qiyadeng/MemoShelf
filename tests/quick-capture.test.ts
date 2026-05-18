import { describe, expect, it } from 'vitest'
import { getQuickCaptureClipboardText } from '../src/utils/quickCapture'

describe('quick capture clipboard text', () => {
  it('trims captured text before copying it', () => {
    expect(getQuickCaptureClipboardText('  hello from dictation\n')).toBe('hello from dictation')
  })

  it('does not copy whitespace-only capture text', () => {
    expect(getQuickCaptureClipboardText(' \n\t ')).toBeNull()
  })
})

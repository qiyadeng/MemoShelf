export function getQuickCaptureClipboardText(input: string): string | null {
  const text = input.trim()
  return text.length > 0 ? text : null
}

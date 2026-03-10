/**
 * Utility functions for handling command variables with {{variable name}} syntax.
 *
 * SnipForge variables are plain names: letters, numbers, spaces, hyphens, underscores.
 * Anything else inside {{ }} is treated as literal template syntax (Go templates,
 * Handlebars, Mustache, etc.) and left untouched.
 */

// Matches {{plain name}} but NOT {{.Names}}, {{#if}}, {{> partial}}, {{name | upper}}, etc.
const VAR_PATTERN = /\{\{(\s*[a-zA-Z0-9][a-zA-Z0-9 _-]*\s*)\}\}/g

function varRegex(): RegExp {
  return new RegExp(VAR_PATTERN.source, VAR_PATTERN.flags)
}

export function extractVariables(text: string): string[] {
  const regex = varRegex()
  const variables: string[] = []
  let match

  while ((match = regex.exec(text)) !== null) {
    const variableName = match[1].trim()
    if (variableName && !variables.includes(variableName)) {
      variables.push(variableName)
    }
  }

  return variables
}

export function substituteVariables(text: string, values: Record<string, string>): string {
  return text.replace(varRegex(), (match, variable) => {
    const variableName = variable.trim()
    return values[variableName] || match
  })
}

export function hasVariables(text: string): boolean {
  return varRegex().test(text)
}

/**
 * Returns HTML with {{variable}} placeholders wrapped in highlight spans.
 * Input text must be HTML-escaped before calling this function.
 */
export function highlightVariables(escapedHtml: string): string {
  return escapedHtml.replace(
    varRegex(),
    '<span class="variable-highlight">{{$1}}</span>'
  )
}

/**
 * Type definition for variable values
 */
export interface VariableValues {
  [variableName: string]: string
}
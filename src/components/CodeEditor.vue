<template>
  <div ref="editorRef" class="code-editor"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState, Compartment } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting, StreamLanguage } from '@codemirror/language'
import { MatchDecorator, ViewPlugin, Decoration } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { javascript } from '@codemirror/lang-javascript'
import { python } from '@codemirror/lang-python'
import { html } from '@codemirror/lang-html'
import { css } from '@codemirror/lang-css'
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { markdown } from '@codemirror/lang-markdown'
import { shell } from '@codemirror/legacy-modes/mode/shell'
import { go as goMode } from '@codemirror/legacy-modes/mode/go'
import { sql as sqlLang } from '@codemirror/lang-sql'
import { rust as rustLang } from '@codemirror/lang-rust'
import { java as javaLang } from '@codemirror/lang-java'
import { theme } from '../utils/theme'

// One Dark-inspired highlight style for dark backgrounds
const highlightStyle = HighlightStyle.define([
  { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.definitionKeyword, tags.moduleKeyword], color: '#c678dd' },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: '#98c379' },
  { tag: tags.comment, color: '#5c6370', fontStyle: 'italic' },
  { tag: [tags.number, tags.integer, tags.float], color: '#d19a66' },
  { tag: [tags.bool, tags.null, tags.self], color: '#d19a66' },
  { tag: [tags.typeName, tags.className, tags.namespace, tags.definition(tags.typeName)], color: '#e5c07b' },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: '#61afef' },
  { tag: [tags.definition(tags.variableName), tags.definition(tags.propertyName)], color: '#e06c75' },
  { tag: [tags.operator, tags.arithmeticOperator, tags.logicOperator, tags.bitwiseOperator, tags.compareOperator], color: '#56b6c2' },
  { tag: tags.tagName, color: '#e06c75' },
  { tag: tags.attributeName, color: '#d19a66' },
  { tag: tags.attributeValue, color: '#98c379' },
  { tag: tags.propertyName, color: '#e06c75' },
  { tag: [tags.punctuation, tags.separator], color: '#abb2bf' },
  { tag: tags.url, color: '#98c379', textDecoration: 'underline' },
  { tag: [tags.meta, tags.documentMeta], color: '#abb2bf' },
])

// SnipForge {{variable}} decorator — matches same pattern as variables.ts
const varDecorator = new MatchDecorator({
  regexp: /\{\{\s*[a-zA-Z0-9][a-zA-Z0-9 _-]*\s*\}\}/g,
  decoration: Decoration.mark({ class: 'cm-snipforge-variable' })
})

const snipforgeVariables = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = varDecorator.createDeco(view)
    }
    update(update: ViewUpdate) {
      this.decorations = varDecorator.updateDeco(update, this.decorations)
    }
  },
  { decorations: v => v.decorations }
)

interface Props {
  modelValue: string
  language: string
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Enter code...'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRef = ref<HTMLElement>()
let editorView: EditorView | null = null

// Compartment for dynamic language reconfiguration (avoid editor destruction)
const languageCompartment = new Compartment()

// Get language extension based on language prop
const getLanguageExtension = (lang: string) => {
  const langMap: Record<string, any> = {
    javascript: javascript(),
    typescript: javascript({ typescript: true }),
    python: python(),
    html: html(),
    css: css(),
    json: json(),
    yaml: yaml(),
    bash: StreamLanguage.define(shell),
    sql: sqlLang(),
    go: StreamLanguage.define(goMode),
    rust: rustLang(),
    java: javaLang(),
    markdown: markdown()
  }
  return langMap[lang] || null
}

onMounted(() => {
  if (!editorRef.value) return

  const languageExtension = getLanguageExtension(props.language)
  const extensions = [
    snipforgeVariables,
    syntaxHighlighting(highlightStyle),
    basicSetup,
    EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        emit('update:modelValue', update.state.doc.toString())
      }
    }),
    EditorView.theme({
      '&': {
        fontSize: '14px',
        backgroundColor: theme.bgInput,
        color: theme.textPrimary
      },
      '.cm-content': {
        caretColor: theme.accent,
        fontFamily: 'Monaco, Menlo, "Ubuntu Mono", Consolas, monospace'
      },
      '.cm-cursor': {
        borderLeftColor: theme.accent
      },
      '.cm-selectionBackground': {
        backgroundColor: 'rgba(236, 80, 2, 0.25) !important'
      },
      '&.cm-focused .cm-selectionBackground': {
        backgroundColor: 'rgba(236, 80, 2, 0.45) !important'
      },
      '.cm-gutters': {
        backgroundColor: theme.bgInput,
        color: theme.textMuted,
        border: 'none'
      },
      '.cm-activeLineGutter': {
        backgroundColor: 'rgba(255, 255, 255, 0.04)'
      },
      '.cm-activeLine': {
        backgroundColor: 'rgba(255, 255, 255, 0.04)'
      },
      '.cm-snipforge-variable': {
        color: '#e8a948 !important',
        fontWeight: '500'
      }
    }),
    // Use compartment for dynamic language switching
    languageCompartment.of(languageExtension || [])
  ]

  const state = EditorState.create({
    doc: props.modelValue,
    extensions
  })

  editorView = new EditorView({
    state,
    parent: editorRef.value
  })
})

// Watch for external changes to modelValue
watch(() => props.modelValue, (newValue) => {
  if (editorView && newValue !== editorView.state.doc.toString()) {
    editorView.dispatch({
      changes: {
        from: 0,
        to: editorView.state.doc.length,
        insert: newValue
      }
    })
  }
})

// Watch for language changes - use reconfiguration instead of destroy/recreate
watch(() => props.language, (newLang) => {
  if (editorView) {
    const newExtension = getLanguageExtension(newLang)
    // Reconfigure the language compartment instead of destroying the editor
    editorView.dispatch({
      effects: languageCompartment.reconfigure(newExtension || [])
    })
  }
})

onUnmounted(() => {
  editorView?.destroy()
})
</script>

<style scoped>
.code-editor {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  min-height: 200px;
}

.code-editor :deep(.cm-editor) {
  height: 100%;
}

.code-editor :deep(.cm-scroller) {
  overflow: auto;
  min-height: 200px;
  max-height: 400px;
}
</style>

<style>
/* Global autocomplete styles - using higher specificity */
.cm-tooltip.cm-tooltip-autocomplete {
  background-color: var(--bg-surface) !important;
  border: 1px solid var(--border) !important;
  border-radius: 4px !important;
}

.cm-tooltip-autocomplete ul {
  font-family: Monaco, Menlo, "Ubuntu Mono", Consolas, monospace !important;
  font-size: 13px !important;
}

.cm-tooltip-autocomplete ul li {
  color: var(--text-secondary) !important;
  padding: 4px 8px !important;
  background-color: transparent !important;
}

.cm-tooltip-autocomplete ul li[aria-selected] {
  background-color: var(--bg-hover) !important;
  color: var(--text-primary) !important;
}

.cm-completionIcon {
  display: none !important;
}

.cm-completionLabel {
  color: var(--text-secondary) !important;
}

.cm-completionDetail {
  color: var(--text-tertiary) !important;
  font-style: italic !important;
}

.cm-completionMatchedText {
  color: var(--accent) !important;
  font-weight: bold !important;
  text-decoration: none !important;
}
</style>

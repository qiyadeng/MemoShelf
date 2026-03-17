<template>
  <div class="markdown-editor">
    <!-- Toolbar -->
    <div class="toolbar">
      <button
        @click="insertBold"
        type="button"
        title="Bold"
        class="toolbar-btn"
      >
        <Bold :size="16" />
      </button>
      <button
        @click="insertItalic"
        type="button"
        title="Italic"
        class="toolbar-btn"
      >
        <Italic :size="16" />
      </button>
      <button
        @click="insertLink"
        type="button"
        title="Link"
        class="toolbar-btn"
      >
        <Link :size="16" />
      </button>
      <button
        @click="insertImage"
        type="button"
        title="Image"
        class="toolbar-btn"
      >
        <Image :size="16" />
      </button>
      <div class="divider"></div>
      <button
        @click="insertList"
        type="button"
        title="Bullet List"
        class="toolbar-btn"
      >
        <List :size="16" />
      </button>
      <button
        @click="insertNumberedList"
        type="button"
        title="Numbered List"
        class="toolbar-btn"
      >
        <ListOrdered :size="16" />
      </button>
    </div>

    <!-- Editor with syntax highlighting -->
    <div ref="editorRef" class="editor-container"></div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onUnmounted } from 'vue'
import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { MatchDecorator, ViewPlugin, Decoration } from '@codemirror/view'
import type { DecorationSet, ViewUpdate } from '@codemirror/view'
import { tags } from '@lezer/highlight'
import { markdown } from '@codemirror/lang-markdown'
import { Bold, Italic, Link, Image, List, ListOrdered } from 'lucide-vue-next'
import { theme } from '../utils/theme'

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
  { tag: tags.heading, color: '#e06c75', fontWeight: 'bold' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: 'bold' },
  { tag: tags.link, color: '#61afef', textDecoration: 'underline' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
])

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
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Write markdown...'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const editorRef = ref<HTMLElement>()
let editorView: EditorView | null = null

// Helper to insert text at cursor
const insertAtCursor = (before: string, after: string = '', placeholder: string = '') => {
  if (!editorView) return

  const { from, to } = editorView.state.selection.main
  const selectedText = editorView.state.doc.sliceString(from, to)
  const insertText = before + (selectedText || placeholder) + after

  editorView.dispatch({
    changes: { from, to, insert: insertText },
    selection: { anchor: from + before.length + (selectedText || placeholder).length }
  })

  editorView.focus()
}

const insertBold = () => insertAtCursor('**', '**', 'bold text')
const insertItalic = () => insertAtCursor('*', '*', 'italic text')
const insertLink = () => insertAtCursor('[', '](url)', 'link text')
const insertImage = () => insertAtCursor('![', '](url)', 'alt text')
const insertList = () => {
  if (!editorView) return
  const { from } = editorView.state.selection.main
  const line = editorView.state.doc.lineAt(from)
  const lineStart = line.from

  editorView.dispatch({
    changes: { from: lineStart, insert: '- ' },
    selection: { anchor: from + 2 }
  })
  editorView.focus()
}
const insertNumberedList = () => {
  if (!editorView) return
  const { from } = editorView.state.selection.main
  const line = editorView.state.doc.lineAt(from)
  const lineStart = line.from

  editorView.dispatch({
    changes: { from: lineStart, insert: '1. ' },
    selection: { anchor: from + 3 }
  })
  editorView.focus()
}

onMounted(() => {
  if (!editorRef.value) return

  const state = EditorState.create({
    doc: props.modelValue,
    extensions: [
      snipforgeVariables,
      syntaxHighlighting(highlightStyle),
      basicSetup,
      markdown(),
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
      })
    ]
  })

  editorView = new EditorView({
    state,
    parent: editorRef.value
  })
})

// Watch for external changes
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

onUnmounted(() => {
  editorView?.destroy()
})
</script>

<style scoped>
.markdown-editor {
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--bg-input);
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  background-color: var(--bg-surface);
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.toolbar-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 10px;
  color: var(--text-placeholder);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.toolbar-btn:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--accent);
}

.toolbar-btn:focus-visible {
  outline: none;
  border-color: var(--accent);
}

.toolbar-btn.is-active {
  background-color: var(--accent);
  color: var(--text-primary);
  border-color: var(--accent);
}

.divider {
  width: 1px;
  height: 24px;
  background-color: var(--border);
  margin: 0 4px;
}

.editor-container {
  min-height: 200px;
}

.editor-container :deep(.cm-editor) {
  height: 100%;
}

.editor-container :deep(.cm-scroller) {
  overflow: auto;
  min-height: 200px;
  max-height: 400px;
}
</style>

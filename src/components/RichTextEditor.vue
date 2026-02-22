<template>
  <div class="rich-text-editor">
    <!-- Toolbar -->
    <div v-if="editor" class="toolbar">
      <button
        @click="editor.chain().focus().toggleBold().run()"
        :class="{ 'is-active': editor.isActive('bold') }"
        type="button"
        title="Bold (Cmd+B)"
      >
        <Bold :size="16" />
      </button>
      <button
        @click="editor.chain().focus().toggleItalic().run()"
        :class="{ 'is-active': editor.isActive('italic') }"
        type="button"
        title="Italic (Cmd+I)"
      >
        <Italic :size="16" />
      </button>
      <button
        @click="editor.chain().focus().toggleStrike().run()"
        :class="{ 'is-active': editor.isActive('strike') }"
        type="button"
        title="Strikethrough"
      >
        <Strikethrough :size="16" />
      </button>
      <div class="divider"></div>
      <button
        @click="editor.chain().focus().toggleBulletList().run()"
        :class="{ 'is-active': editor.isActive('bulletList') }"
        type="button"
        title="Bullet List"
      >
        <List :size="16" />
      </button>
      <button
        @click="editor.chain().focus().toggleOrderedList().run()"
        :class="{ 'is-active': editor.isActive('orderedList') }"
        type="button"
        title="Numbered List"
      >
        <ListOrdered :size="16" />
      </button>
      <button
        @click="editor.chain().focus().toggleTaskList().run()"
        :class="{ 'is-active': editor.isActive('taskList') }"
        type="button"
        title="Task List"
      >
        <ListTodo :size="16" />
      </button>
      <div class="divider"></div>
      <button
        @click="openLinkDialog"
        :class="{ 'is-active': editor.isActive('link') }"
        type="button"
        title="Link"
      >
        <LinkIcon :size="16" />
      </button>
    </div>

    <!-- Editor -->
    <EditorContent :editor="editor" class="editor-content" />

    <!-- Link Dialog Modal -->
    <div v-if="showLinkDialog" class="link-dialog-overlay" @click.self="closeLinkDialog">
      <div class="link-dialog">
        <h3>Link</h3>
        <div class="link-input-wrapper">
          <input
            ref="linkInput"
            v-model="linkUrl"
            type="text"
            placeholder="https://example.com"
            @keyup.enter="saveLink"
            @keyup.esc="closeLinkDialog"
          />
          <button
            v-if="linkUrl"
            @click="linkUrl = ''"
            class="clear-btn"
            type="button"
            title="Clear"
          >
            <X :size="16" />
          </button>
        </div>
        <div class="link-dialog-buttons">
          <button @click="closeLinkDialog" class="cancel-btn">Cancel</button>
          <button @click="saveLink" class="save-btn">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, Strikethrough, List, ListOrdered, ListTodo, Link as LinkIcon, X } from 'lucide-vue-next'

interface Props {
  modelValue: string
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: 'Start typing...'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Link dialog state
const showLinkDialog = ref(false)
const linkUrl = ref('')
const linkInput = ref<HTMLInputElement>()

const editor = useEditor({
  extensions: [
    StarterKit, // Includes Link extension by default
    Image.configure({
      HTMLAttributes: {
        class: 'editor-image'
      }
    }),
    TaskList,
    TaskItem.configure({
      nested: true
    }),
    Placeholder.configure({
      placeholder: props.placeholder
    })
  ],
  content: props.modelValue,
  editorProps: {
    attributes: {
      class: 'prose prose-invert'
    }
  },
  onUpdate: ({ editor }) => {
    emit('update:modelValue', editor.getHTML())
  }
})

// Watch for external changes
watch(() => props.modelValue, (newValue) => {
  if (editor.value && newValue !== editor.value.getHTML()) {
    editor.value.commands.setContent(newValue, { emitUpdate: false })
  }
})

// Link dialog functions
const openLinkDialog = () => {
  if (!editor.value) return

  // Get current link if editing
  const previousUrl = editor.value.getAttributes('link').href
  linkUrl.value = previousUrl || ''
  showLinkDialog.value = true

  // Focus input after modal opens
  nextTick(() => {
    linkInput.value?.focus()
    linkInput.value?.select()
  })
}

const closeLinkDialog = () => {
  showLinkDialog.value = false
  linkUrl.value = ''
}

// Validate URL to prevent javascript:/data:/vbscript: injection
const isUrlSafe = (url: string): boolean => {
  const dangerous = /^\s*(javascript|data|vbscript)\s*:/i
  if (dangerous.test(url)) return false
  try {
    const parsed = new URL(url)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol)
  } catch {
    // Partial URLs (e.g. "example.com") throw — allow if not dangerous
    return true
  }
}

const saveLink = () => {
  if (!editor.value) return

  const url = linkUrl.value.trim()

  if (url === '') {
    // Empty URL = remove link
    editor.value.chain().focus().extendMarkRange('link').unsetLink().run()
  } else if (isUrlSafe(url)) {
    // Set link
    editor.value.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }
  // Blocked URLs silently close the dialog

  closeLinkDialog()
}

onUnmounted(() => {
  editor.value?.destroy()
})
</script>

<style scoped>
.rich-text-editor {
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

.toolbar button {
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

.toolbar button:hover {
  background-color: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--accent);
}

.toolbar button:focus-visible {
  outline: none;
  border-color: var(--accent);
}

.toolbar button.is-active {
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

.editor-content {
  padding: 12px;
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
}

.editor-content :deep(.ProseMirror) {
  outline: none;
  color: var(--text-secondary);
  font-size: 15px;
  line-height: 1.7;
  min-height: 180px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
}

.editor-content :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  color: var(--text-muted);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

.editor-content :deep(.ProseMirror h1),
.editor-content :deep(.ProseMirror h2),
.editor-content :deep(.ProseMirror h3) {
  color: var(--text-primary);
  font-weight: 600;
  margin-top: 24px;
  margin-bottom: 12px;
  line-height: 1.3;
}

.editor-content :deep(.ProseMirror h1) {
  font-size: 2em;
  margin-top: 0;
}

.editor-content :deep(.ProseMirror h2) {
  font-size: 1.5em;
}

.editor-content :deep(.ProseMirror h3) {
  font-size: 1.25em;
}

.editor-content :deep(.ProseMirror p) {
  margin: 12px 0;
}

.editor-content :deep(.ProseMirror a) {
  color: var(--accent);
  text-decoration: underline;
  cursor: pointer;
}

.editor-content :deep(.ProseMirror a:hover) {
  color: var(--accent-light);
}

.editor-content :deep(.ProseMirror strong) {
  font-weight: 600;
}

.editor-content :deep(.ProseMirror em) {
  font-style: italic;
}

.editor-content :deep(.ProseMirror s) {
  text-decoration: line-through;
}

.editor-content :deep(.ProseMirror ul),
.editor-content :deep(.ProseMirror ol) {
  padding-left: 24px;
  margin: 8px 0;
}

.editor-content :deep(.ProseMirror li) {
  margin: 4px 0;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"]) {
  list-style: none;
  padding: 0;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] p) {
  margin: 0;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li) {
  display: flex;
  align-items: flex-start;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > label) {
  flex: 0 0 auto;
  margin-right: 8px;
  margin-top: 6px;
  user-select: none;
  display: flex;
  align-items: center;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > label > input[type="checkbox"]) {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  margin: 0;
  padding: 0;
  border: 2px solid var(--text-muted);
  border-radius: 3px;
  cursor: pointer;
  position: relative;
  background-color: transparent;
  transition: all 0.2s;
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > label > input[type="checkbox"]:hover) {
  border-color: var(--text-placeholder);
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > label > input[type="checkbox"]:checked) {
  background-color: var(--accent);
  border-color: var(--accent);
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > label > input[type="checkbox"]:checked::after) {
  content: '';
  position: absolute;
  left: 3px;
  top: 0px;
  width: 4px;
  height: 8px;
  border: solid var(--text-primary);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.editor-content :deep(.ProseMirror ul[data-type="taskList"] li > div) {
  flex: 1 1 auto;
}


.editor-content :deep(.ProseMirror img) {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 8px 0;
}

.editor-content :deep(.ProseMirror code) {
  background-color: rgba(255, 255, 255, 0.1);
  padding: 3px 6px;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Consolas', monospace;
  font-size: 0.9em;
  color: #ff9966;
}

.editor-content :deep(.ProseMirror pre) {
  background-color: var(--bg-deep);
  padding: 16px;
  border-radius: 6px;
  overflow-x: auto;
  border: 1px solid var(--bg-surface);
}

.editor-content :deep(.ProseMirror pre code) {
  background: none;
  padding: 0;
  color: #d4d4d4;
}

.editor-content :deep(.ProseMirror blockquote) {
  border-left: 4px solid var(--border-hover);
  padding-left: 16px;
  margin: 16px 0;
  color: var(--text-tertiary);
  font-style: italic;
}

/* Link Dialog Modal */
.link-dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: var(--overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.link-dialog {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  box-shadow: 0 4px 12px var(--shadow);
}

.link-dialog h3 {
  margin: 0 0 16px 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
}

.link-input-wrapper {
  position: relative;
  margin-bottom: 16px;
}

.link-input-wrapper input {
  width: 100%;
  padding: 10px 12px;
  padding-right: 40px; /* Space for X button */
  background-color: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 14px;
}

.link-input-wrapper input:focus {
  outline: none;
  border-color: var(--accent);
}

.clear-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.clear-btn:hover {
  background-color: var(--border);
  color: var(--text-primary);
}

.link-dialog-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.link-dialog-buttons button {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s;
}

.cancel-btn {
  background-color: var(--border);
  color: var(--text-primary);
}

.cancel-btn:hover {
  background-color: var(--border);
}

.cancel-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}

.save-btn {
  background-color: var(--accent);
  color: var(--text-primary);
}

.save-btn:hover {
  background-color: var(--accent-hover);
}

.save-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}
</style>

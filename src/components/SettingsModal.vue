<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal-content" @click="closeAllDropdowns">
      <!-- Tab Navigation with close button -->
      <div class="tab-navigation">
        <div class="tabs">
          <button
            class="tab-button"
            :class="{ active: activeTab === 'settings' }"
            @click="activeTab = 'settings'"
          >
            Settings
          </button>
          <button
            class="tab-button"
            :class="{ active: activeTab === 'management' }"
            @click="activeTab = 'management'"
          >
            Manage Commands
          </button>
        </div>
        <button class="close-button" @click="$emit('cancel')">×</button>
      </div>

      <div class="modal-body">

        <!-- Tab 1: Settings -->
        <div v-if="activeTab === 'settings'" class="coming-soon-container">
          <div class="coming-soon-content">
            <div class="coming-soon-icon">⚙️</div>
            <h2 class="coming-soon-title">Settings</h2>
            <p class="coming-soon-text">Coming Soon</p>
          </div>
        </div>

        <!-- Tab 2: Command Management -->
        <div v-if="activeTab === 'management'" class="management-tab">
          <!-- Controls Section -->
          <div class="management-controls">
            <div class="controls-row">
              <!-- Bulk Selection with Filter Button -->
              <div class="bulk-selection">
                <button @click.stop="toggleManagementFilterDropdown" :class="['management-filter-button', { active: selectedManagementTags.length > 0 }]" title="Filter by tags">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
                  </svg>
                </button>

                <!-- Filter dropdown -->
                <div v-if="showManagementFilterDropdown" class="filter-dropdown" @click.stop>
                  <TagSelector
                    :available-tags="availableTags"
                    :selected-tags="selectedManagementTags"
                    title="Filter by Tags"
                    @toggle="toggleManagementTag"
                    @clear-all="clearManagementTags"
                  />
                </div>

                <button @click="selectAllCommands" class="control-button">Select All</button>
                <button @click="deselectAllCommands" class="control-button">Deselect All</button>
                <span v-if="selectedCommandIds.length > 0" class="selection-counter">
                  {{ selectedCommandIds.length }} selected
                </span>
              </div>

              <div class="spacer"></div>

              <!-- Action Buttons -->
              <div class="action-buttons">
                <button
                  @click="handleImport"
                  class="action-button import-button"
                >
                  Import
                </button>
                <button
                  @click="handleBulkDelete"
                  :disabled="selectedCommandIds.length === 0"
                  class="action-button delete-button"
                >
                  Delete
                </button>
                <button
                  @click="handleBulkExport"
                  :disabled="selectedCommandIds.length === 0"
                  class="action-button export-button"
                >
                  Export
                </button>
              </div>
            </div>
          </div>

          <!-- Command List -->
          <div class="command-list-container">
            <CommandList
              :commands="filteredManagementCommands"
              :selected-ids="selectedCommandIds"
              @toggle="toggleCommandSelection"
              :empty-message="managementEmptyMessage"
            />
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { Download, Upload } from 'lucide-vue-next'
import { getAllTags } from '../utils/tags'
import { getInlineSuggestion } from '../utils/autocomplete'
import CommandList from './CommandList.vue'
import TagSelector from './TagSelector.vue'

// Props
interface Props {
  show: boolean
  commands: Array<{
    id: number
    title: string
    body: string
    description?: string
    tags: string
    tagsArray: string[]
    tagsNormalized: string[]
    language?: string
    created_at: string
    updated_at: string
  }>
}

const props = defineProps<Props>()

// Emits
const emit = defineEmits<{
  cancel: []
  export: [tags: string[]]
  import: []
  'bulk-delete': [ids: number[]]
  'bulk-export': [ids: number[]]
}>()

// Tab state
type Tab = 'settings' | 'management'
const activeTab = ref<Tab>('settings')

// Form data
const exportTags = ref('')
const exportTagsInputRef = ref<HTMLInputElement>()

// Inline suggestion state for export tags
const inlineSuggestion = ref<string | null>(null)
const cursorPosition = ref(0)

// Export filter dropdown state
const showExportFilterDropdown = ref(false)
const selectedExportTags = ref<string[]>([])

// Command Management state
const selectedCommandIds = ref<number[]>([])
const selectedManagementTags = ref<string[]>([])
const showManagementFilterDropdown = ref(false)

// Get available tags for autocomplete and dropdown
const availableTags = computed(() => {
  return getAllTags(props.commands)
})

const availableExportTags = computed(() => {
  return getAllTags(props.commands).sort()
})

// Count of commands that would be exported based on current filter
const exportCommandCount = computed(() => {
  if (!exportTags.value.trim()) {
    return props.commands.length // All commands if no filter
  }

  // Parse tags from input (same logic as export)
  const filterTags = exportTags.value
    .split(',')
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0)

  if (filterTags.length === 0) {
    return props.commands.length
  }

  // Count commands that match ALL filter tags (AND logic)
  return props.commands.filter(command => {
    try {
      const commandTags = JSON.parse(command.tags) as string[]
      const normalizedCommandTags = commandTags.map(tag => tag.toLowerCase())

      return filterTags.every(filterTag =>
        normalizedCommandTags.some(commandTag =>
          commandTag.includes(filterTag)
        )
      )
    } catch {
      return false
    }
  }).length
})

// Computed statistics
const totalCommands = computed(() => props.commands.length)

const uniqueTags = computed(() => {
  const allTags = new Set<string>()
  props.commands.forEach(command => {
    try {
      const tags = JSON.parse(command.tags)
      if (Array.isArray(tags)) {
        tags.forEach(tag => {
          if (tag.trim()) {
            allTags.add(tag.trim().toLowerCase())
          }
        })
      }
    } catch {
      // Invalid JSON, skip
    }
  })
  return allTags.size
})

// Handle export
const handleExport = () => {
  const tags = exportTags.value
    .split(',')
    .map(tag => tag.trim().toLowerCase())
    .filter(tag => tag.length > 0)

  emit('export', tags)
}

// Update inline suggestion for export tags
const updateInlineSuggestion = () => {
  if (!exportTagsInputRef.value) {
    inlineSuggestion.value = null
    return
  }

  const input = exportTags.value
  const cursor = exportTagsInputRef.value.selectionStart || 0
  cursorPosition.value = cursor

  const suggestion = getInlineSuggestion(input, cursor, availableTags.value)
  inlineSuggestion.value = suggestion.completionText
}

// Handle tag input changes
const handleTagInput = () => {
  updateInlineSuggestion()
}

// Handle tag autocomplete on Tab key
const handleTagKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Tab' && inlineSuggestion.value) {
    event.preventDefault()

    // Accept the inline suggestion
    const input = exportTags.value
    const cursor = cursorPosition.value
    const suggestion = getInlineSuggestion(input, cursor, availableTags.value)

    if (suggestion.completionText) {
      const newValue = input.substring(0, cursor) + suggestion.completionText + input.substring(cursor)
      exportTags.value = newValue

      // Move cursor to end of completed tag
      nextTick(() => {
        if (exportTagsInputRef.value && suggestion.completionText) {
          const newCursorPos = cursor + suggestion.completionText.length
          exportTagsInputRef.value.setSelectionRange(newCursorPos, newCursorPos)
          updateInlineSuggestion()
        }
      })
    }
  } else if (event.key === 'Escape') {
    // Clear suggestion on Escape
    inlineSuggestion.value = null
  }
}

// Calculate position for inline suggestion using cursor coordinates
const getSuggestionPosition = (): { left: string; top: string } => {
  if (!exportTagsInputRef.value || !inlineSuggestion.value) {
    return { left: '0px', top: '0px' }
  }

  const input = exportTagsInputRef.value

  // Use cursor position if available
  if (typeof input.selectionStart === 'number') {
    // Create a temporary span to measure text width up to cursor
    const measurer = document.createElement('span')
    const computedStyle = window.getComputedStyle(input)

    measurer.style.cssText = `
      position: absolute;
      visibility: hidden;
      white-space: pre;
      font: ${computedStyle.font};
      font-size: ${computedStyle.fontSize};
      font-family: ${computedStyle.fontFamily};
      font-weight: ${computedStyle.fontWeight};
      letter-spacing: ${computedStyle.letterSpacing};
    `

    // Measure text width up to cursor position
    const textBeforeCursor = input.value.substring(0, input.selectionStart)
    measurer.textContent = textBeforeCursor

    document.body.appendChild(measurer)
    const textWidth = measurer.getBoundingClientRect().width
    document.body.removeChild(measurer)

    // Get input's padding
    const paddingLeft = parseInt(computedStyle.paddingLeft) || 12
    const paddingTop = parseInt(computedStyle.paddingTop) || 12

    return {
      left: `${paddingLeft + textWidth + 0.5}px`,
      top: `${paddingTop + 0.5}px`
    }
  }

  return { left: '0px', top: '0px' }
}

// Export filter dropdown functions
const toggleExportFilterDropdown = () => {
  showExportFilterDropdown.value = !showExportFilterDropdown.value
}

const closeExportFilterDropdown = () => {
  showExportFilterDropdown.value = false
}

const toggleExportTag = (tag: string) => {
  const index = selectedExportTags.value.indexOf(tag)
  if (index === -1) {
    selectedExportTags.value.push(tag)
  } else {
    selectedExportTags.value.splice(index, 1)
  }
}

const clearAllExportTags = () => {
  selectedExportTags.value = []
}

const applyExportTags = () => {
  // Add selected tags to the input box
  const currentTags = exportTags.value.trim()
  const newTags = selectedExportTags.value.join(', ')

  if (currentTags && newTags) {
    exportTags.value = currentTags + ', ' + newTags
  } else if (newTags) {
    exportTags.value = newTags
  }

  // Clear selections and close dropdown
  selectedExportTags.value = []
  showExportFilterDropdown.value = false
}

// Handle import
const handleImport = () => {
  emit('import')
}

// Command Management - Filtered commands based on selected tags (OR logic)
const filteredManagementCommands = computed(() => {
  if (selectedManagementTags.value.length === 0) {
    return props.commands
  }

  return props.commands.filter(command => {
    // Use pre-normalized tags for performance (from optimization)
    // OR logic: command matches if it has ANY of the selected tags
    return selectedManagementTags.value.some(selectedTag =>
      command.tagsNormalized.some(commandTag =>
        commandTag.includes(selectedTag.toLowerCase())
      )
    )
  })
})

const managementEmptyMessage = computed(() => {
  if (selectedManagementTags.value.length > 0) {
    return 'No commands match the selected tags'
  }
  return 'No commands available'
})

// Management filter dropdown
const toggleManagementFilterDropdown = () => {
  showManagementFilterDropdown.value = !showManagementFilterDropdown.value
}

const toggleManagementTag = (tag: string) => {
  const index = selectedManagementTags.value.indexOf(tag)
  if (index === -1) {
    selectedManagementTags.value.push(tag)
  } else {
    selectedManagementTags.value.splice(index, 1)
  }
}

const clearManagementTags = () => {
  selectedManagementTags.value = []
}

// Close all dropdowns when clicking outside
const closeAllDropdowns = () => {
  showManagementFilterDropdown.value = false
  showExportFilterDropdown.value = false
}

// Bulk selection
const selectAllCommands = () => {
  selectedCommandIds.value = filteredManagementCommands.value.map(cmd => cmd.id)
}

const deselectAllCommands = () => {
  selectedCommandIds.value = []
}

const toggleCommandSelection = (id: number) => {
  const index = selectedCommandIds.value.indexOf(id)
  if (index === -1) {
    selectedCommandIds.value.push(id)
  } else {
    selectedCommandIds.value.splice(index, 1)
  }
}

// Bulk actions
const handleBulkDelete = () => {
  if (selectedCommandIds.value.length === 0) return
  emit('bulk-delete', [...selectedCommandIds.value])
  selectedCommandIds.value = []
}

const handleBulkExport = () => {
  if (selectedCommandIds.value.length === 0) return
  emit('bulk-export', [...selectedCommandIds.value])
}
</script>

<style scoped>
/* Override modal-body for tabs */
.modal-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  height: calc(90vh - 100px);
  overflow: hidden;
}

/* Component-specific styles */
.settings-section {
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
}

.settings-section:last-child {
  border-bottom: none;
  margin-bottom: 0;
}

.settings-section h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
}

.section-description {
  margin: 0 0 16px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.tag-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-size: 14px;
  box-sizing: border-box;
}

.tag-input:focus {
  outline: none;
  border-color: var(--accent);
}

.help-text {
  display: block;
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: 12px;
}

.button-group {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.action-button {
  padding: 12px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  background-color: var(--bg-input);
  border-radius: 8px;
  border: 1px solid var(--border);
}

.stat-label {
  color: var(--text-secondary);
  font-size: 14px;
}

.stat-value {
  color: var(--text-primary);
  font-weight: 600;
  font-size: 16px;
}

.autocomplete-container {
  position: relative;
  width: 100%;
}

.inline-suggestion {
  position: absolute;
  pointer-events: none;
  color: var(--text-muted);
  font-size: 14px;
  font-family: inherit;
  white-space: nowrap;
  z-index: 1;
}

/* Export filter dropdown styles */
.export-input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}

.export-filter-button {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 16px;
  background: var(--bg-surface);
  color: var(--text-placeholder);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border: 1px solid var(--border);
  flex-shrink: 0;
}

.export-filter-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.export-filter-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--shadow);
  z-index: var(--z-dropdown);
  margin-top: 4px;
  width: 300px;
  max-height: 400px;
  overflow: hidden;
}

.export-filter-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.export-filter-list {
  max-height: 300px;
  overflow-y: auto;
  padding: 8px 0;
}

.export-filter-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
}

.export-filter-item:hover {
  background: var(--bg-hover);
}

.export-filter-item.selected {
  background: var(--accent);
  color: var(--text-primary);
}

.tag-name {
  flex: 1;
}

.checkmark {
  color: var(--text-primary);
  font-weight: bold;
  margin-left: 8px;
}

.export-filter-footer {
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  gap: 8px;
}

.clear-all-btn,
.apply-btn {
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
}

.clear-all-btn {
  background: var(--border);
  color: var(--text-primary);
}

.clear-all-btn:hover {
  background: var(--border-hover);
}

.apply-btn {
  background: var(--accent);
  color: var(--text-primary);
}

.apply-btn:hover {
  background: var(--accent-hover);
}

/* Button icon and counter styles */
.action-button {
  display: flex;
  align-items: center;
  gap: 8px;
}

.command-counter {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: normal;
}

/* Tab Navigation */
.tab-navigation {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--bg-input);
  padding: 0 12px;
  border-bottom: 1px solid var(--border);
  gap: 8px;
}

.tabs {
  display: flex;
  gap: 0;
  flex: 1;
}

.tab-button {
  padding: 12px 16px;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 13px;
  font-weight: 400;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  border-bottom: 2px solid transparent;
}

.tab-button:hover {
  color: var(--text-primary);
}

.tab-button:focus-visible {
  outline: none;
  color: var(--text-primary);
}

.tab-button.active {
  color: var(--text-primary);
  border-bottom-color: var(--accent);
}

.close-button {
  background: none;
  border: none;
  color: var(--text-tertiary);
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  margin-bottom: 4px;
}

.close-button:hover {
  background: var(--border);
  color: var(--text-primary);
}

.close-button:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

/* Command Management Tab */
.management-tab {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  overflow: hidden;
}

.management-controls {
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.controls-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.management-filter-button {
  width: 32px;
  height: 32px;
  padding: 0;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--bg-surface);
  color: var(--text-placeholder);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  vertical-align: middle;
}

.management-filter-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.management-filter-button:focus-visible {
  outline: none;
  border-color: var(--accent);
}

.management-filter-button.active {
  background: var(--accent);
  color: var(--text-primary);
  border-color: var(--accent);
}

.filter-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: var(--z-dropdown);
  width: 200px;
}

.bulk-selection {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.selection-counter {
  font-size: 13px;
  color: var(--text-tertiary);
  margin-left: 4px;
}

.control-button {
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s;
  height: 32px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
}

.control-button:hover {
  background: var(--bg-hover);
}

.control-button:focus-visible {
  outline: none;
  border-color: var(--accent);
}

.spacer {
  flex: 1;
}

.action-buttons {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.action-button {
  padding: 8px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  border: none;
  transition: all 0.2s;
  min-width: 80px;
  height: 32px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.delete-button {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.delete-button:hover:not(:disabled) {
  background-color: var(--danger);
  border-color: var(--danger);
}

.delete-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}

.delete-button:disabled {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.5;
}

.export-button {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.export-button:hover:not(:disabled) {
  background-color: var(--accent);
  border-color: var(--accent);
}

.export-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}

.export-button:disabled {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.5;
}

.command-list-container {
  flex: 1;
  overflow: hidden;
  min-height: 400px;
  display: flex;
  flex-direction: column;
}

/* Coming Soon Styles */
.coming-soon-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
}

.coming-soon-content {
  text-align: center;
  padding: 60px 40px;
}

.coming-soon-icon {
  font-size: 64px;
  margin-bottom: 24px;
}

.coming-soon-title {
  margin: 0 0 12px 0;
  color: var(--text-primary);
  font-size: 24px;
  font-weight: 600;
}

.coming-soon-text {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 16px;
}

/* Import Button */
.import-button {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.import-button:hover {
  background-color: var(--accent);
  border-color: var(--accent);
}

.import-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}
</style>
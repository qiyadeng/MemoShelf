<template>
  <div v-if="show" class="modal-overlay" @click.self="handleClose">
    <div class="modal-content bulk-publish-modal" @click="closeFilterDropdown">
      <div class="modal-header">
        <h2>Bulk Publish</h2>
        <button class="close-button" @click="handleClose" :disabled="isPublishing">&times;</button>
      </div>

      <div class="modal-body">
        <!-- Library picker -->
        <div class="bp-library-picker" v-if="libraries.length > 1">
          <label>Target library</label>
          <select v-model="selectedLibraryId" :disabled="isPublishing">
            <option v-for="lib in libraries" :key="lib.id" :value="lib.id">
              {{ lib.name }} ({{ lib.github_repo }})
            </option>
          </select>
        </div>
        <div class="bp-library-picker" v-else-if="libraries.length === 1">
          <label>Target library</label>
          <div class="bp-library-single">{{ libraries[0].name }} ({{ libraries[0].github_repo }})</div>
        </div>

        <!-- Controls row (matches Manage Commands) -->
        <div class="management-controls">
          <div class="controls-row">
            <div class="bulk-selection">
              <input
                type="checkbox"
                class="select-all-checkbox"
                :checked="allSelected"
                :indeterminate="someSelected && !allSelected"
                @change="toggleSelectAll"
                :disabled="isPublishing"
              />
              <span class="selection-counter" :class="{ muted: selectedCount === 0 }">
                {{ selectedCount }} selected
              </span>
              <button
                @click.stop="toggleFilterDropdown"
                :class="['management-filter-button', { active: selectedFilterTags.length > 0 }]"
                title="Filter by tags"
                :disabled="isPublishing"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
                </svg>
              </button>

              <!-- Filter dropdown -->
              <div v-if="showFilterDropdown" class="filter-dropdown" @click.stop>
                <TagSelector
                  :available-tags="availableTags"
                  :selected-tags="selectedFilterTags"
                  title="Filter by Tags"
                  @toggle="toggleFilterTag"
                  @clear-all="clearFilterTags"
                />
              </div>
            </div>

            <div class="spacer"></div>

            <div class="action-buttons">
              <button class="bp-cancel" @click="handleClose" :disabled="isPublishing">
                {{ isDone ? 'Close' : 'Cancel' }}
              </button>
              <button
                v-if="!isDone"
                class="bp-publish-btn"
                @click="startPublish"
                :disabled="selectedCount === 0 || isPublishing || !selectedLibraryId"
              >
                {{ isPublishing ? 'Publishing...' : 'Publish' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Command list (reuses CommandList component) -->
        <div v-if="!isDone" class="command-list-container">
          <CommandList
            :commands="filteredLocalCommands"
            :selected-ids="selectedIdsArray"
            @toggle="toggleCommand"
            :empty-message="emptyMessage"
          />
        </div>

        <!-- Results list (shown after publish) -->
        <div v-if="isDone" class="bp-results-list">
          <div
            v-for="r in results"
            :key="r.commandId"
            class="bp-result-item"
            :class="{ 'bp-published': r.success, 'bp-failed': !r.success }"
          >
            <span class="bp-result-title">{{ r.title }}</span>
            <span v-if="r.success" class="bp-status bp-status-ok">Done</span>
            <span v-else class="bp-status bp-status-err" :title="r.error">Failed</span>
          </div>
        </div>

        <!-- Progress bar -->
        <div v-if="isPublishing" class="bp-progress">
          <div class="bp-progress-bar">
            <div class="bp-progress-fill" :style="{ width: progressPercent + '%' }"></div>
          </div>
          <span class="bp-progress-text">{{ progressCurrent }} / {{ progressTotal }}</span>
        </div>

        <!-- Results summary -->
        <div v-if="isDone" class="bp-summary">
          <span class="bp-summary-ok" v-if="succeededCount > 0">{{ succeededCount }} published</span>
          <span class="bp-summary-err" v-if="failedCount > 0">{{ failedCount }} failed</span>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import type { Library, CommandWithTags, BulkPublishResult } from '../../shared/types'
import CommandList from './CommandList.vue'
import TagSelector from './TagSelector.vue'

interface Props {
  show: boolean
  commands: CommandWithTags[]
  libraries: Library[]
}

const props = defineProps<Props>()

const emit = defineEmits<{
  cancel: []
  done: []
}>()

const selectedIds = ref<Set<number>>(new Set())
const selectedLibraryId = ref<number | null>(null)
const isPublishing = ref(false)
const isDone = ref(false)
const results = ref<BulkPublishResult[]>([])
const progressCurrent = ref(0)
const progressTotal = ref(0)

// Tag filter state
const selectedFilterTags = ref<string[]>([])
const showFilterDropdown = ref(false)

// Only show local commands
const localCommands = computed(() =>
  props.commands.filter(c => c.source === 'local')
)

// Available tags from local commands
const availableTags = computed(() => {
  const tags = new Set<string>()
  localCommands.value.forEach(cmd => {
    cmd.tagsArray.forEach(tag => {
      if (tag.trim()) tags.add(tag.trim())
    })
  })
  return Array.from(tags).sort()
})

// Filtered by selected tags (OR logic, matching Manage Commands)
const filteredLocalCommands = computed(() => {
  if (selectedFilterTags.value.length === 0) return localCommands.value

  return localCommands.value.filter(cmd =>
    selectedFilterTags.value.some(selectedTag =>
      cmd.tagsNormalized.some(cmdTag =>
        cmdTag.includes(selectedTag.toLowerCase())
      )
    )
  )
})

const emptyMessage = computed(() => {
  if (selectedFilterTags.value.length > 0) return 'No commands match the selected tags'
  return 'No local commands to publish.'
})

// Selection (array for CommandList, Set for internal tracking)
const selectedIdsArray = computed(() => Array.from(selectedIds.value))
const selectedCount = computed(() => selectedIds.value.size)
const allSelected = computed(() =>
  filteredLocalCommands.value.length > 0 && selectedIds.value.size === filteredLocalCommands.value.length
)
const someSelected = computed(() => selectedIds.value.size > 0)

const progressPercent = computed(() =>
  progressTotal.value > 0 ? Math.round((progressCurrent.value / progressTotal.value) * 100) : 0
)

const succeededCount = computed(() => results.value.filter(r => r.success).length)
const failedCount = computed(() => results.value.filter(r => !r.success).length)

function toggleCommand(id: number) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedIds.value = next
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
  } else {
    selectedIds.value = new Set(filteredLocalCommands.value.map(c => c.id))
  }
}

// Tag filter controls
function toggleFilterDropdown() {
  showFilterDropdown.value = !showFilterDropdown.value
}

function closeFilterDropdown() {
  showFilterDropdown.value = false
}

function toggleFilterTag(tag: string) {
  const index = selectedFilterTags.value.indexOf(tag)
  if (index === -1) {
    selectedFilterTags.value.push(tag)
  } else {
    selectedFilterTags.value.splice(index, 1)
  }
}

function clearFilterTags() {
  selectedFilterTags.value = []
}

// Auto-select library if only one
watch(() => props.libraries, (libs) => {
  if (libs.length === 1) {
    selectedLibraryId.value = libs[0].id
  } else if (libs.length > 1 && !selectedLibraryId.value) {
    selectedLibraryId.value = libs[0].id
  }
}, { immediate: true })

// Reset state when modal opens
watch(() => props.show, (visible) => {
  if (visible) {
    selectedIds.value = new Set()
    selectedFilterTags.value = []
    showFilterDropdown.value = false
    isPublishing.value = false
    isDone.value = false
    results.value = []
    progressCurrent.value = 0
    progressTotal.value = 0
  }
})

// Listen for progress updates from main process
let cleanupProgress: (() => void) | null = null

watch(() => props.show, (visible) => {
  if (visible) {
    cleanupProgress = window.electronAPI.library.onBulkPublishProgress((data) => {
      progressCurrent.value = data.index + 1
      progressTotal.value = data.total
      results.value = [...results.value, data.result]
    })
  } else if (cleanupProgress) {
    cleanupProgress()
    cleanupProgress = null
  }
})

onUnmounted(() => {
  if (cleanupProgress) {
    cleanupProgress()
  }
})

async function startPublish() {
  if (!selectedLibraryId.value || selectedCount.value === 0) return

  isPublishing.value = true
  isDone.value = false
  results.value = []
  progressCurrent.value = 0
  progressTotal.value = selectedCount.value

  try {
    const commandIds = Array.from(selectedIds.value)
    const response = await window.electronAPI.library.bulkPublish(selectedLibraryId.value, commandIds)
    if (!response.success && response.error) {
      results.value = [{ commandId: 0, title: '', success: false, error: response.error }]
    }
  } catch (error) {
    console.error('Bulk publish error:', error)
  } finally {
    isPublishing.value = false
    isDone.value = true
  }
}

function handleClose() {
  if (isPublishing.value) return
  if (isDone.value) {
    emit('done')
  } else {
    emit('cancel')
  }
}
</script>

<style scoped>
.bulk-publish-modal {
  max-width: 560px;
  width: 90vw;
}

/* Library picker */
.bp-library-picker {
  margin-bottom: 12px;
}

.bp-library-picker label {
  display: block;
  font-size: 12px;
  color: var(--text-tertiary);
  margin-bottom: 4px;
}

.bp-library-picker select {
  width: 100%;
  padding: 8px 10px;
  padding-right: 28px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  appearance: none;
  -webkit-appearance: none;
  outline: none;
  cursor: pointer;
  background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L5 5L9 1' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.bp-library-picker select:focus {
  border-color: var(--accent);
}

.bp-library-picker select option {
  background: var(--bg-surface);
  color: var(--text-primary);
}

.bp-library-single {
  padding: 8px 10px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
}

/* Controls row — matches Manage Commands tab */
.management-controls {
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  margin-bottom: 0;
}

.controls-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.bulk-selection {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
  padding-left: 17px;
}

.select-all-checkbox {
  appearance: none;
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--border);
  border-radius: 3px;
  background: var(--bg-surface);
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition: all 0.15s;
}

.select-all-checkbox:checked {
  background: var(--accent);
  border-color: var(--accent);
}

.select-all-checkbox:checked::after {
  content: '';
  position: absolute;
  left: 4.5px;
  top: 1.5px;
  width: 4px;
  height: 8px;
  border: solid var(--bg-app);
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.select-all-checkbox:indeterminate {
  background: var(--accent);
  border-color: var(--accent);
}

.select-all-checkbox:indeterminate::after {
  content: '';
  position: absolute;
  left: 3px;
  top: 6px;
  width: 7px;
  height: 0;
  border: solid var(--bg-app);
  border-width: 0 0 2px 0;
}

.select-all-checkbox:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.selection-counter {
  font-size: 13px;
  color: var(--text-tertiary);
}

.selection-counter.muted {
  color: var(--text-placeholder);
}

.management-filter-button {
  width: 28px;
  height: 28px;
  padding: 0;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-placeholder);
  cursor: pointer;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
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

.management-filter-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.filter-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: var(--z-dropdown);
  width: 200px;
}

.spacer {
  flex: 1;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* Command list container */
.command-list-container {
  height: 320px;
  display: flex;
  flex-direction: column;
}

/* Results list (post-publish) */
.bp-results-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.bp-result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
}

.bp-result-item:last-child {
  border-bottom: none;
}

.bp-published {
  background: rgba(34, 197, 94, 0.06);
}

.bp-failed {
  background: rgba(239, 68, 68, 0.06);
}

.bp-result-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.bp-status {
  font-size: 11px;
  font-weight: 500;
  flex-shrink: 0;
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: 8px;
}

.bp-status-ok {
  color: #22c55e;
  background: rgba(34, 197, 94, 0.12);
}

.bp-status-err {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}

/* Progress */
.bp-progress {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 10px;
}

.bp-progress-bar {
  flex: 1;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.bp-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.2s;
}

.bp-progress-text {
  font-size: 12px;
  color: var(--text-tertiary);
  flex-shrink: 0;
}

/* Summary */
.bp-summary {
  margin-top: 12px;
  display: flex;
  gap: 12px;
  font-size: 13px;
  font-weight: 500;
}

.bp-summary-ok {
  color: #22c55e;
}

.bp-summary-err {
  color: #ef4444;
}

/* Footer buttons */
.bp-cancel {
  padding: 8px 16px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
}

.bp-cancel:hover:not(:disabled) {
  background: var(--bg-surface);
}

.bp-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.bp-publish-btn {
  padding: 8px 16px;
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background 0.15s;
}

.bp-publish-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.bp-publish-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

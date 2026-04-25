<template>
  <div v-if="show && library" class="library-management-modal-overlay" @click.self="handleClose">
    <div class="library-management-modal" @click="closeDropdowns">
      <div class="library-management-modal-header">
        <div class="library-management-copy">
          <div class="library-management-title-row">
            <h3>{{ library.name }}</h3>
            <span
              v-if="defaultWritableLibrary?.id === library.id"
              class="library-role-badge default"
            >Default writable</span>
          </div>
          <p class="library-management-path">{{ library.github_repo }}</p>
          <p class="library-management-note">{{ managementContextNote }}</p>
        </div>
        <button class="library-management-close" @click="handleClose" aria-label="Close library management">×</button>
      </div>

      <div class="library-changes-panel">
        <div class="library-changes-header">
          <div class="library-changes-copy">
            <h5>Changes</h5>
            <p class="library-changes-note">
              {{ changesSummary.headline }}. {{ changesSummary.detail }}
            </p>
          </div>
          <div class="library-changes-actions">
            <button
              class="library-action-btn subtle"
              @click="$emit('refresh')"
              :disabled="syncing"
              title="Refresh working tree status"
            >
              Refresh
            </button>
            <button
              v-if="changesSummary.canSync"
              @click="$emit('sync', library.id)"
              class="library-action-btn subtle"
              :disabled="syncing"
              :title="changesSummary.syncTitle"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="23 4 23 10 17 10"></polyline>
                <polyline points="1 20 1 14 7 14"></polyline>
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
              </svg>
              {{ syncing ? 'Syncing...' : 'Sync' }}
            </button>
          </div>
        </div>

        <div class="library-changes-grid">
          <div class="library-change-card">
            <span class="library-change-label">Origin</span>
            <span class="library-change-value">{{ library.origin ? 'GitHub' : 'Local only' }}</span>
            <span class="library-change-meta">
              {{ library.origin ? library.origin.url : 'No remote origin configured for this library.' }}
            </span>
            <span v-if="library.origin?.ref" class="library-change-meta">Ref: {{ library.origin.ref }}</span>
          </div>

          <div class="library-change-card">
            <span class="library-change-label">Working tree</span>
            <span class="library-change-value" :class="`library-change-value--${changesSummary.tone}`">
              {{ workingTreeLabel }}
            </span>
            <span class="library-change-meta">{{ changesSummary.detail }}</span>
            <span v-if="library.working_tree.checked_at" class="library-change-meta">
              Checked {{ formatSyncTime(library.working_tree.checked_at) }}
            </span>
          </div>

          <div
            v-if="library.working_tree.state === 'dirty' || library.working_tree.state === 'clean'"
            class="library-change-card library-change-card--counts"
          >
            <span class="library-change-label">File summary</span>
            <div class="library-change-counts">
              <span class="library-change-count"><strong>{{ library.working_tree.modified }}</strong> modified</span>
              <span class="library-change-count"><strong>{{ library.working_tree.added }}</strong> new</span>
              <span class="library-change-count"><strong>{{ library.working_tree.deleted }}</strong> deleted</span>
            </div>
          </div>
        </div>

        <div v-if="library.origin" class="library-origin-panel">
          <div class="library-origin-header">
            <div class="library-changes-copy">
              <h5>Origin workflow</h5>
              <p v-if="workflowSummary" class="library-changes-note">
                {{ workflowSummary.headline }}. {{ workflowSummary.detail }}
              </p>
              <p v-else-if="workflowError" class="library-changes-note library-changes-note--danger">
                {{ workflowError }}
              </p>
              <p v-else class="library-changes-note">
                Checking git-backed workflow support for this library.
              </p>
            </div>
          </div>

          <div class="library-changes-grid">
            <div class="library-change-card">
              <span class="library-change-label">Remote</span>
              <span class="library-change-value">{{ workflowSummary?.remote_name || 'Unavailable' }}</span>
              <span class="library-change-meta">{{ library.origin.url }}</span>
            </div>

            <div class="library-change-card">
              <span class="library-change-label">Branch</span>
              <span class="library-change-value">{{ workflowSummary?.current_branch || 'Detached / unknown' }}</span>
              <span class="library-change-meta">Base: {{ workflowSummary?.default_branch || 'Unknown' }}</span>
              <span class="library-change-meta">
                {{ workflowSummary?.has_upstream ? 'Tracks an upstream branch.' : 'No upstream branch configured.' }}
              </span>
            </div>
          </div>

          <div class="library-origin-actions">
            <button
              v-if="library.working_tree.state === 'not_repo'"
              class="library-action-btn subtle"
              :disabled="!!workflowBusy"
              title="Choose the real git-backed folder for this library"
              @click="$emit('relink')"
            >
              {{ workflowBusy === 'relink' ? 'Relinking...' : 'Relink Working Copy' }}
            </button>
            <button
              class="library-action-btn subtle"
              :disabled="!!workflowBusy || !workflowActionState.fetch.available"
              :title="workflowActionState.fetch.reason || 'Fetch origin refs'"
              @click="$emit('fetch-origin')"
            >
              {{ workflowBusy === 'fetch' ? 'Fetching...' : 'Fetch' }}
            </button>
            <button
              class="library-action-btn subtle"
              :disabled="!!workflowBusy || !workflowActionState.update.available"
              :title="workflowActionState.update.reason || 'Fast-forward this working copy from origin'"
              @click="$emit('update-origin')"
            >
              {{ workflowBusy === 'update' ? 'Updating...' : 'Update' }}
            </button>
            <button
              class="library-action-btn subtle"
              :disabled="!!workflowBusy || !workflowActionState.commit.available"
              :title="workflowActionState.commit.reason || 'Commit local changes in this library'"
              @click="$emit('commit')"
            >
              {{ workflowBusy === 'commit' ? 'Committing...' : 'Commit' }}
            </button>
            <button
              class="library-action-btn subtle"
              :disabled="!!workflowBusy || !workflowActionState.push.available"
              :title="workflowActionState.push.reason || 'Push the current branch to origin'"
              @click="$emit('push')"
            >
              {{ workflowBusy === 'push' ? 'Pushing...' : 'Push' }}
            </button>
            <button
              class="library-action-btn subtle"
              :disabled="!!workflowBusy || !workflowActionState.pull_request.available"
              :title="workflowActionState.pull_request.reason || 'Open a pull request from this branch'"
              @click="$emit('pull-request')"
            >
              {{ workflowBusy === 'pull_request' ? 'Opening...' : 'Pull Request' }}
            </button>
          </div>

          <p
            v-if="workflowActionNote"
            class="library-origin-note"
            :class="{ 'library-origin-note--warning': !!workflowSummaryReason }"
          >
            {{ workflowActionNote }}
          </p>
        </div>
      </div>

      <div class="management-controls">
        <div class="controls-row">
          <div class="bulk-selection">
            <input
              type="checkbox"
              class="select-all-checkbox"
              :checked="isAllSelected"
              :indeterminate="isIndeterminate"
              @change="toggleSelectAll"
            />
            <span class="selection-counter" :class="{ muted: selectedCommandIds.length === 0 }">
              {{ selectedCommandIds.length }} selected
            </span>
            <button
              @click.stop="toggleManagementFilterDropdown"
              :class="['management-filter-button', { active: selectedManagementTags.length > 0 }]"
              title="Filter by tags"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
              </svg>
            </button>

            <div v-if="showManagementFilterDropdown" class="filter-dropdown" @click.stop>
              <TagSelector
                :available-tags="availableTags"
                :selected-tags="selectedManagementTags"
                title="Filter by Tags"
                @toggle="toggleManagementTag"
                @clear-all="clearManagementTags"
              />
            </div>
          </div>

          <div class="spacer"></div>

          <div class="action-buttons">
            <button
              v-if="canDeleteManagedCommands"
              @click="handleBulkDelete"
              :disabled="selectedCommandIds.length === 0"
              class="action-button delete-icon-button"
              title="Delete selected"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 6h18"></path>
                <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
              </svg>
            </button>
            <button
              v-if="canImportIntoManagedLibrary"
              @click="$emit('import')"
              class="action-button import-button"
            >
              Import
            </button>
            <div class="export-dropdown-wrap" @click.stop>
              <button
                @click="toggleExportDropdown"
                :disabled="selectedCommandIds.length === 0"
                class="action-button export-button"
              >
                Export
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="m6 9 6 6 6-6"></path>
                </svg>
              </button>
              <div v-if="showExportDropdown" class="export-dropdown">
                <button class="export-dropdown-item" @click="handleExportBundle">As Bundle (.json)</button>
                <button class="export-dropdown-item" @click="handleExportAsLibrary">As Library (.zip)</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="command-list-container">
        <CommandList
          :commands="filteredManagementCommands"
          :selected-ids="selectedCommandIds"
          :empty-message="managementEmptyMessage"
          @toggle="toggleCommandSelection"
        />
      </div>

      <div v-if="feedbackMessage" class="sync-message" :class="feedbackMessageType">
        {{ feedbackMessage }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CommandList from './CommandList.vue'
import TagSelector from './TagSelector.vue'
import { getAllTags, matchesTagFilter } from '../utils/tags'
import { describeLibraryChanges } from '../utils/library-changes'
import type { Library, LibraryGitWorkflowSummary } from '../../shared/types'

interface ManagedCommand {
  id: number
  title: string
  body: string
  description?: string
  tags: string
  tagsArray: string[]
  tagsNormalized: string[]
  language?: string
  source?: string
  library_id?: number | null
  remote_path?: string | null
  created_at: string
  updated_at: string
}

interface Props {
  show: boolean
  library: Library | null
  defaultWritableLibrary: Library | null
  commands: ManagedCommand[]
  syncing: boolean
  workflowSummary: LibraryGitWorkflowSummary | null
  workflowError: string
  workflowBusy: null | 'fetch' | 'update' | 'relink' | 'commit' | 'push' | 'pull_request'
  feedbackMessage: string
  feedbackMessageType: 'success' | 'error'
}

const props = defineProps<Props>()

const emit = defineEmits<{
  close: []
  refresh: []
  sync: [libraryId: number]
  'fetch-origin': []
  'update-origin': []
  relink: []
  commit: []
  push: []
  'pull-request': []
  import: []
  'bulk-delete': [ids: number[]]
  'bulk-export': [ids: number[]]
  'export-library': [ids: number[]]
}>()

const selectedCommandIds = ref<number[]>([])
const selectedManagementTags = ref<string[]>([])
const showManagementFilterDropdown = ref(false)
const showExportDropdown = ref(false)

function isWritableLocalLibrary(library: Library | null | undefined): library is Library {
  return !!library && library.type === 'local' && !!library.manifest_path && library.permission !== 'consumer'
}

const canDeleteManagedCommands = computed(() => isWritableLocalLibrary(props.library))
const canImportIntoManagedLibrary = computed(() => {
  return !!props.library && props.library.id === props.defaultWritableLibrary?.id
})
const managementContextNote = computed(() => {
  if (!props.library) return ''
  if (canImportIntoManagedLibrary.value) {
    return 'Imports and new commands land in this default writable library.'
  }
  if (props.library.type === 'local') {
    return 'This local library is readable here, but imports and new commands still target the default writable library.'
  }
  return 'This subscribed library is managed in context here. Export stays available, but destructive local delete is hidden.'
})
const changesSummary = computed(() => {
  if (!props.library) {
    return {
      headline: '',
      detail: '',
      tone: 'neutral' as const,
      canSync: false,
      syncTitle: '',
    }
  }

  return describeLibraryChanges(props.library)
})
const workflowActionState = computed(() => props.workflowSummary?.actions || {
  fetch: { available: false, reason: null },
  update: { available: false, reason: null },
  commit: { available: false, reason: null },
  push: { available: false, reason: null },
  pull_request: { available: false, reason: null },
})
const workflowSummaryReason = computed(() => {
  return workflowActionState.value.pull_request.reason
    || workflowActionState.value.push.reason
    || workflowActionState.value.update.reason
    || workflowActionState.value.commit.reason
    || workflowActionState.value.fetch.reason
    || ''
})
const workflowActionNote = computed(() => {
  if (props.workflowError) return props.workflowError
  if (!props.workflowSummary) return ''
  return workflowSummaryReason.value || ''
})
const workingTreeLabel = computed(() => {
  switch (props.library?.working_tree.state) {
    case 'dirty':
      return 'Dirty'
    case 'clean':
      return 'Clean'
    case 'not_repo':
      return 'Not a git repo'
    case 'git_unavailable':
      return 'Git unavailable'
    case 'no_working_copy':
      return 'No working copy'
    case 'error':
      return 'Status error'
    default:
      return ''
  }
})
const availableTags = computed(() => getAllTags(props.commands))
const filteredManagementCommands = computed(() => {
  if (selectedManagementTags.value.length === 0) {
    return props.commands
  }

  return props.commands.filter(command =>
    matchesTagFilter(command.tagsNormalized, selectedManagementTags.value)
  )
})
const managementEmptyMessage = computed(() => {
  if (!props.library) {
    return 'Choose a library to manage its commands'
  }
  if (selectedManagementTags.value.length > 0) {
    return 'No commands in this library match the selected tags'
  }
  return 'No commands in this library'
})
const isAllSelected = computed(() =>
  filteredManagementCommands.value.length > 0 &&
  selectedCommandIds.value.length === filteredManagementCommands.value.length
)
const isIndeterminate = computed(() =>
  selectedCommandIds.value.length > 0 &&
  selectedCommandIds.value.length < filteredManagementCommands.value.length
)

function closeDropdowns() {
  showManagementFilterDropdown.value = false
  showExportDropdown.value = false
}

function resetState() {
  selectedCommandIds.value = []
  selectedManagementTags.value = []
  showManagementFilterDropdown.value = false
  showExportDropdown.value = false
}

function handleClose() {
  resetState()
  emit('close')
}

function toggleManagementFilterDropdown() {
  showManagementFilterDropdown.value = !showManagementFilterDropdown.value
}

function toggleManagementTag(tag: string) {
  const index = selectedManagementTags.value.indexOf(tag)
  if (index === -1) {
    selectedManagementTags.value.push(tag)
  } else {
    selectedManagementTags.value.splice(index, 1)
  }
}

function clearManagementTags() {
  selectedManagementTags.value = []
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedCommandIds.value = []
  } else {
    selectedCommandIds.value = filteredManagementCommands.value.map(cmd => cmd.id)
  }
}

function toggleCommandSelection(id: number) {
  const index = selectedCommandIds.value.indexOf(id)
  if (index === -1) {
    selectedCommandIds.value.push(id)
  } else {
    selectedCommandIds.value.splice(index, 1)
  }
}

function handleBulkDelete() {
  if (selectedCommandIds.value.length === 0) return
  emit('bulk-delete', [...selectedCommandIds.value])
  selectedCommandIds.value = []
}

function toggleExportDropdown() {
  showExportDropdown.value = !showExportDropdown.value
}

function handleExportBundle() {
  showExportDropdown.value = false
  if (selectedCommandIds.value.length === 0) return
  emit('bulk-export', [...selectedCommandIds.value])
}

function handleExportAsLibrary() {
  showExportDropdown.value = false
  if (selectedCommandIds.value.length === 0) return
  emit('export-library', [...selectedCommandIds.value])
}

function formatSyncTime(timestamp: string) {
  return new Date(timestamp).toLocaleString()
}

watch(() => props.show, visible => {
  if (!visible) resetState()
})

watch(() => props.library?.id, () => {
  resetState()
})

watch(filteredManagementCommands, commands => {
  const visibleIds = new Set(commands.map(command => command.id))
  selectedCommandIds.value = selectedCommandIds.value.filter(id => visibleIds.has(id))
})
</script>

<style scoped>
.library-management-modal-overlay {
  position: fixed;
  inset: 0;
  z-index: calc(var(--z-modal) + 1);
  background: rgba(0, 0, 0, 0.64);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.library-management-modal {
  width: min(1200px, calc(100vw - 48px));
  height: min(860px, calc(100vh - 48px));
  background: var(--bg-app);
  border: 1px solid var(--border);
  border-radius: 18px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
}

.library-management-modal-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.library-management-copy {
  min-width: 0;
}

.library-management-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.library-management-title-row h3 {
  margin: 0;
  font-size: 20px;
  color: var(--text-primary);
}

.library-management-path {
  margin: 0 0 4px 0;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: monospace;
  word-break: break-all;
}

.library-management-note {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 13px;
}

.library-management-close {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-surface);
  color: var(--text-secondary);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}

.library-management-close:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.library-role-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  flex-shrink: 0;
}

.library-role-badge.default {
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text-primary);
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
}

.library-changes-panel {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--bg-input);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex-shrink: 0;
}

.library-changes-header,
.library-origin-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.library-changes-copy h5 {
  margin: 0 0 4px 0;
  font-size: 15px;
  color: var(--text-primary);
}

.library-changes-note {
  margin: 0;
  color: var(--text-secondary);
  font-size: 13px;
}

.library-changes-note--danger {
  color: #ef5350;
}

.library-changes-actions,
.library-origin-actions,
.action-buttons {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.library-changes-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
}

.library-change-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-surface) 82%, transparent);
  min-width: 0;
}

.library-change-card--counts {
  justify-content: space-between;
}

.library-change-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.library-change-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.library-change-value--success {
  color: #66bb6a;
}

.library-change-value--warning {
  color: #f5b64b;
}

.library-change-value--danger {
  color: #ef5350;
}

.library-change-meta {
  font-size: 12px;
  color: var(--text-secondary);
  word-break: break-word;
}

.library-change-counts {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.library-change-count {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 6px 8px;
  border-radius: 999px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  font-size: 12px;
  color: var(--text-secondary);
}

.library-change-count strong {
  color: var(--text-primary);
}

.library-origin-panel {
  border-top: 1px solid var(--border);
  padding-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.library-origin-note {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
}

.library-origin-note--warning {
  color: #f5b64b;
}

.library-action-btn {
  width: auto;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-tertiary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
}

.library-action-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.library-action-btn:disabled,
.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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

.bulk-selection {
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
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
}

.select-all-checkbox:checked,
.select-all-checkbox:indeterminate {
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
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-placeholder);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.management-filter-button:hover,
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

.spacer {
  flex: 1;
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
  height: 32px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.delete-icon-button,
.export-button,
.import-button {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-primary);
}

.delete-icon-button {
  min-width: 32px;
  width: 32px;
  padding: 0;
  color: var(--text-tertiary);
}

.delete-icon-button:hover:not(:disabled) {
  background-color: var(--danger);
  border-color: var(--danger);
  color: var(--text-primary);
}

.export-button:hover:not(:disabled),
.import-button:hover:not(:disabled) {
  background-color: var(--accent);
  border-color: var(--accent);
}

.export-dropdown-wrap {
  position: relative;
}

.export-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: var(--z-dropdown);
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  min-width: 180px;
  overflow: hidden;
}

.export-dropdown-item {
  display: block;
  width: 100%;
  padding: 10px 14px;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.export-dropdown-item:hover {
  background: var(--bg-hover);
}

.export-dropdown-item + .export-dropdown-item {
  border-top: 1px solid var(--border);
}

.command-list-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.sync-message {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
  flex-shrink: 0;
}

.sync-message.success {
  color: #66bb6a;
  background: rgba(102, 187, 106, 0.1);
}

.sync-message.error {
  color: #ef5350;
  background: rgba(239, 83, 80, 0.1);
}

@media (max-width: 900px) {
  .library-management-modal {
    width: calc(100vw - 24px);
    height: calc(100vh - 24px);
    padding: 18px;
  }

  .controls-row,
  .library-management-modal-header,
  .library-changes-header,
  .library-origin-header {
    flex-direction: column;
    align-items: stretch;
  }

  .spacer {
    display: none;
  }
}
</style>

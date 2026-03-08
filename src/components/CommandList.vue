<template>
  <div class="command-list">
    <VList
      v-if="commands.length > 0"
      class="list"
      :data="commands"
    >
      <template #default="{ item: command }">
        <div
          class="command-list-item"
          :class="{ selected: isSelected(command.id) }"
          @click="$emit('toggle', command.id)"
        >
          <div class="checkbox-container">
            <input
              type="checkbox"
              :checked="isSelected(command.id)"
              @click.stop="$emit('toggle', command.id)"
              class="command-checkbox"
            />
          </div>

          <div class="command-details">
            <div class="command-title">{{ command.title }}</div>
            <div v-if="command.description" class="command-description">
              {{ command.description }}
            </div>
            <div class="command-meta">
              <span class="command-language">{{ command.language }}</span>
              <span v-if="command.tagsArray.length > 0" class="command-tags">
                {{ command.tagsArray.join(', ') }}
              </span>
            </div>
          </div>
        </div>
      </template>
    </VList>

    <div v-else class="empty-state">
      {{ emptyMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { VList } from 'virtua/vue'

interface Command {
  id: number
  title: string
  body: string
  description?: string
  tags: string
  tagsArray: string[] // Pre-parsed tags
  tagsNormalized: string[] // Pre-normalized (lowercase) for filtering
  language?: string
  created_at: string
  updated_at: string
}

interface Props {
  commands: Command[]
  selectedIds: number[]
  emptyMessage?: string
}

const props = withDefaults(defineProps<Props>(), {
  emptyMessage: 'No commands available'
})

defineEmits<{
  toggle: [id: number]
}>()

const isSelected = (id: number): boolean => {
  return props.selectedIds.includes(id)
}
</script>

<style scoped>
.command-list {
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.list {
  flex: 1;
  overflow: hidden;
}

.command-list-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s;
  border-bottom: 1px solid var(--border);
}

.command-list-item:last-child {
  border-bottom: none;
}

.command-list-item:hover {
  background: var(--bg-hover);
}

.command-list-item.selected {
  background: var(--accent-glow);
}

.checkbox-container {
  display: flex;
  align-items: center;
  padding-top: 2px;
  flex-shrink: 0;
}

.command-checkbox {
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

.command-checkbox:checked {
  background: var(--accent);
  border-color: var(--accent);
}

.command-checkbox:checked::after {
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

.command-checkbox:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.command-details {
  flex: 1;
  min-width: 0;
}

.command-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-description {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.command-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.command-language {
  text-transform: capitalize;
}

.command-tags {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 14px;
}
</style>

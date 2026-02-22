<template>
  <div class="tag-selector">
    <div class="tag-selector-header">
      <span>{{ title }}</span>
      <button @click="$emit('clear-all')" class="clear-all-btn">Clear All</button>
    </div>

    <div class="tag-search">
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        placeholder="Search tags..."
        class="tag-search-input"
      />
    </div>

    <VList
      v-if="sortedTags.length > 0"
      class="tag-list"
      :data="sortedTags"
    >
      <template #default="{ item: tag }">
        <div
          class="tag-item"
          :class="{ selected: isSelected(tag) }"
          @click="$emit('toggle', tag)"
        >
          <span class="tag-name">{{ tag }}</span>
          <span v-if="isSelected(tag)" class="checkmark">✓</span>
        </div>
      </template>
    </VList>

    <div v-else class="empty-state">
      {{ searchQuery ? 'No matching tags' : 'No tags available' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, nextTick } from 'vue'
import { VList } from 'virtua/vue'

interface Props {
  availableTags: string[]
  selectedTags: string[]
  title?: string
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Select Tags'
})

defineEmits<{
  toggle: [tag: string]
  'clear-all': []
}>()

const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

onMounted(() => {
  nextTick(() => searchInputRef.value?.focus())
})

const sortedTags = computed(() => {
  const query = searchQuery.value.toLowerCase()
  const filtered = query
    ? props.availableTags.filter(tag => tag.toLowerCase().includes(query))
    : props.availableTags
  return [...filtered].sort()
})

const isSelected = (tag: string): boolean => {
  return props.selectedTags.includes(tag)
}
</script>

<style scoped>
.tag-selector {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 12px var(--shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  max-height: 400px;
}

.tag-selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  flex-shrink: 0;
}

.clear-all-btn {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: var(--border);
  color: var(--text-primary);
  transition: all 0.2s;
}

.clear-all-btn:hover {
  background: var(--border-hover);
}

.clear-all-btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}

.tag-search {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tag-search-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-deep);
  color: var(--text-secondary);
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
}

.tag-search-input:focus {
  border-color: var(--accent);
}

.tag-search-input::placeholder {
  color: var(--text-tertiary);
}

.tag-list {
  flex: 1;
  overflow: hidden;
  min-height: 200px;
}

.tag-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 16px;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  color: var(--text-secondary);
}

.tag-item:hover {
  background: var(--bg-hover);
}

.tag-item.selected {
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

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: var(--text-tertiary);
  font-size: 14px;
}
</style>

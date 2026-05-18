<template>
  <div v-if="show" class="modal-overlay" @click.self="close" @keydown.esc.stop.prevent="close">
    <div class="modal-content">
      <div class="modal-header">
        <h2>Quick Capture</h2>
        <button class="close-button" @click="close">x</button>
      </div>
      <div class="modal-body">
        <textarea
          ref="captureInput"
          v-model="captureText"
          class="capture-textarea"
          placeholder="Paste or dictate text here..."
          rows="12"
        ></textarea>
      </div>
      <div class="modal-footer">
        <button @click="close" class="cancel-button">Close</button>
        <button @click="close" class="copy-button">Copy</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: [text: string]
}>()

const captureText = ref('')
const captureInput = ref<HTMLTextAreaElement>()

const close = () => {
  emit('close', captureText.value)
}

defineExpose({
  close,
})

onBeforeUnmount(() => {
  if (props.show && captureText.value.trim()) {
    close()
  }
})

watch(() => props.show, (isShown) => {
  if (isShown) {
    captureText.value = ''
    nextTick(() => {
      captureInput.value?.focus()
    })
  }
})
</script>

<style scoped>
.capture-textarea {
  background-color: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  color: var(--text-primary);
  font-size: 14px;
  font-family: Monaco, Menlo, "Ubuntu Mono", Consolas, monospace;
  line-height: 1.6;
  resize: vertical;
  min-height: 260px;
  width: 100%;
}

.capture-textarea:focus {
  outline: none;
  border-color: var(--accent);
}

.copy-button {
  padding: 10px 20px;
  background-color: var(--accent);
  color: var(--text-primary);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.copy-button:hover,
.copy-button:focus-visible {
  background-color: var(--accent-hover);
  outline: none;
}
</style>

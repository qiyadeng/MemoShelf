import { ref, onMounted } from 'vue'

const settings = ref<Record<string, unknown>>({})
const loaded = ref(false)

async function load() {
  try {
    settings.value = await window.electronAPI.settings.getAll()
  } catch (e) {
    console.warn('[useSettings] Failed to load settings:', e)
    settings.value = {}
  }
  loaded.value = true
}

async function updateSetting(key: string, value: unknown): Promise<{ success: boolean; error?: string }> {
  try {
    const result = await window.electronAPI.settings.set(key, value)
    if (result.success) {
      settings.value = { ...settings.value, [key]: value }
    } else {
      console.warn(`[useSettings] Failed to set "${key}":`, result.error)
    }
    return result
  } catch (e) {
    const error = (e as Error).message
    console.warn(`[useSettings] Error setting "${key}":`, error)
    return { success: false, error }
  }
}

export function useSettings() {
  onMounted(() => {
    if (!loaded.value) load()
  })

  return { settings, updateSetting, loaded }
}

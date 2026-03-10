<script setup lang="ts">
// Import the ref function from Vue for creating reactive data
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import CommandModal from './components/CommandModal.vue'
import VariableInputModal from './components/VariableInputModal.vue'
import SettingsModal from './components/SettingsModal.vue'
import HelpModal from './components/HelpModal.vue'
import DescriptionModal from './components/DescriptionModal.vue'
import TagSelector from './components/TagSelector.vue'
import DuplicateResolutionModal from './components/DuplicateResolutionModal.vue'
import BulkPublishModal from './components/BulkPublishModal.vue'
import { Copy, Edit, Trash2, HelpCircle, Settings, Anvil, CirclePlus, Upload, CloudOff, PackagePlus } from 'lucide-vue-next'
import { VList } from 'virtua/vue'
import { extractVariables, substituteVariables, hasVariables, highlightVariables, type VariableValues } from './utils/variables'
import { useSettings } from './composables/useSettings'
import { exportCommands, importCommands, validateExportData, generateExportFilename, detectDuplicates, type DuplicateMatch, type ImportCommand } from './utils/importExport'
import { fuzzySearchCommands } from './utils/fuzzySearch'
import { getAllTags } from './utils/tags'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js'
import type { CommandWithTags, Library } from '../shared/types'

type Command = CommandWithTags

// ── Settings ───────────────────────────────────────────────────
const { settings } = useSettings()

// Platform detection - use the synchronous platform property
const isWindows = ref(false)
const isMaximized = ref(false)

// Safely detect platform
try {
  if (window.electronAPI && window.electronAPI.platform) {
    isWindows.value = window.electronAPI.platform === 'win32'
  }
} catch (error) {
  console.error('Error detecting platform:', error)
}

// Window control functions
// Note: (window.electronAPI as any) is needed because vue-tsc can't resolve
// the 'window' property from the preload's declare global via project references
const minimizeWindow = async () => {
  if ((window.electronAPI as any)?.window) {
    await (window.electronAPI as any).window.minimize()
  }
}

const maximizeWindow = async () => {
  if ((window.electronAPI as any)?.window) {
    await (window.electronAPI as any).window.maximize()
    // Update maximized state after toggling
    isMaximized.value = await (window.electronAPI as any).window.isMaximized()
  }
}

const closeWindow = async () => {
  if ((window.electronAPI as any)?.window) {
    await (window.electronAPI as any).window.close()
  }
}

// Check maximized state on mount (only for Windows)
const checkMaximizedState = async () => {
  if (isWindows.value && (window.electronAPI as any)?.window) {
    isMaximized.value = await (window.electronAPI as any).window.isMaximized()
  }
}

// Search query refs
const searchQuery = ref('')  // Immediate value (updates on every keystroke)
const debouncedSearchQuery = refDebounced(searchQuery, 200)  // Debounced value (updates after typing stops)
const searchInputRef = ref<HTMLInputElement>()

// Tag filtering state
const selectedTags = ref<string[]>([])
const showFilterDropdown = ref(false)

// Tag management functions
const toggleTag = (tag: string) => {
  const index = selectedTags.value.indexOf(tag)
  if (index === -1) {
    selectedTags.value.push(tag)
  } else {
    selectedTags.value.splice(index, 1)
  }
}

const clearAllTags = () => {
  selectedTags.value = []
}

// Get all available tags from commands
const availableTags = computed(() => {
  return getAllTags(commands.value)
})

// Create a reactive array to store our sample commands for testing. I will connect this later with the DB.
const commands = ref<Command[]>([])
// Libraries lookup map for displaying source badges on remote commands
const libraries = ref<Map<number, Library>>(new Map())
 // Modal state
const showModal = ref(false)
const modalMode = ref<'add' | 'edit'>('add')
const selectedCommandForEdit = ref<Command | null>(null)

// Variable input modal state
const showVariableModal = ref(false)
const currentVariables = ref<string[]>([])
const pendingCommand = ref<string>('')

// Settings modal state
const showSettingsModal = ref(false)

// Help modal state
const showHelpModal = ref(false)

// Description modal state
const showDescriptionModal = ref(false)
const descriptionModalTitle = ref('')
const descriptionModalContent = ref('')

// Duplicate resolution modal state
const showDuplicateModal = ref(false)
const pendingDuplicates = ref<DuplicateMatch[]>([])
const pendingImportCommands = ref<ImportCommand[]>([])

// Publish modal state
const showPublishModal = ref(false)
const publishTargetCommandId = ref<number | null>(null)
const publishing = ref(false)
const unpublishing = ref(false)
const showBulkPublishModal = ref(false)

// Initialized libraries (can publish to these)
const initializedLibraries = computed(() => {
  return Array.from(libraries.value.values()).filter(lib => lib.manifest_path)
})

// Notification state
const notificationMessage = ref('')
const showNotification = ref(false)
let notificationTimeout: number | null = null

// Show notification function
const showNotificationToast = (message: string, duration = 2000) => {
  // Clear any existing timeout
  if (notificationTimeout) {
    clearTimeout(notificationTimeout)
  }

  notificationMessage.value = message
  showNotification.value = true

  notificationTimeout = window.setTimeout(() => {
    showNotification.value = false
  }, duration)
}
//Load commands from database
const loadCommands = async () => {
  try {
    // Load commands and libraries in parallel
    const [dbCommands, dbLibraries] = await Promise.all([
      window.electronAPI.database.getAllCommands(),
      window.electronAPI.library.getAll() as Promise<Library[]>
    ])
    // Pre-parse and pre-normalize tags for performance
    commands.value = dbCommands.map(cmd => {
      const tagsArray = JSON.parse(cmd.tags || '[]')
      return {
        ...cmd,
        tagsArray,
        tagsNormalized: tagsArray.map((tag: string) => tag.toLowerCase())
      }
    })
    // Build lookup map for library names
    const map = new Map<number, Library>()
    for (const lib of dbLibraries) {
      map.set(lib.id, lib)
    }
    libraries.value = map
  }catch(error){
    console.error('Error loading commands from database:', error)
  }
} // Load commands when the component is mounted

// Store click handler so we can remove it on unmount
const outsideClickHandler = (event: MouseEvent) => {
  const target = event.target as HTMLElement
  const filterContainer = target.closest('.search-container')
  if (!filterContainer && showFilterDropdown.value) {
    showFilterDropdown.value = false
  }
}

onMounted(() => {
  loadCommands()
  checkMaximizedState()
  //keyboard event listener
  document.addEventListener('keydown', handleKeyboard)

  // Add click listener to close filter dropdown when clicking outside
  document.addEventListener('click', outsideClickHandler)

  // Listen for window-shown event from main process
  if (window.electronAPI) {
    window.electronAPI.onWindowShown(() => {
      // Clear search and focus input when window is shown via global hotkey
      searchQuery.value = '' // refDebounced will automatically clear debouncedSearchQuery
      selectedCommandId.value = null
      showFilterDropdown.value = false

      // Focus the search input
      setTimeout(() => {
        const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      }, 100)
    })
  }
})

// Cleanup event listeners and timers on unmount
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyboard)
  document.removeEventListener('click', outsideClickHandler)
  if (notificationTimeout) clearTimeout(notificationTimeout)
})
// Two-stage filtering: tags first, then fuzzy search
const filteredCommands = computed(() => {
  let dataset = commands.value

  // Stage 1: Filter by selected tags (if any)
  if (selectedTags.value.length > 0) {
    dataset = dataset.filter(command => {
      // Use pre-normalized tags for performance (avoid runtime toLowerCase)
      // Command must have ANY selected tag (OR logic - more tags = more results)
      return selectedTags.value.some(selectedTag =>
        command.tagsNormalized.some(commandTag =>
          commandTag.includes(selectedTag.toLowerCase())
        )
      )
    })
  }

  // Stage 2: Fuzzy search within filtered dataset
  return fuzzySearchCommands(dataset, debouncedSearchQuery.value)
})

// Handle search input keyboard events
const handleSearchKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (filteredCommands.value.length > 0) {
      selectedCommandId.value = filteredCommands.value[0].id
      const input = event.target as HTMLInputElement
      input.blur()
    }
  }
}

// Toggle filter dropdown (will be redesigned for tag selection in Phase 2)
const toggleFilterDropdown = () => {
  showFilterDropdown.value = !showFilterDropdown.value
}

const closeFilterDropdown = () => {
  showFilterDropdown.value = false
}

// Function to copy command body to clipboard
const copyCommand = async (command: Command) => {
  // Check if the command contains variables
  if (hasVariables(command.body)) {
    // Extract variables and show input modal
    const variables = extractVariables(command.body)
    currentVariables.value = variables
    pendingCommand.value = command.body
    pendingCommandLanguage.value = command.language
    showVariableModal.value = true
  } else {
    // No variables, copy directly
    await copyToClipboard(command.body, command.language)
  }
}

// Function to copy raw command with variables intact (for Shift+C)
const copyCommandTemplate = async (text: string, language: string) => {
  await copyToClipboard(text, language)
}

// Helper to strip HTML tags for plain text preview
const stripHtml = (html: string): string => {
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

// Get preview HTML for command body (strip HTML for richtext, highlight variables)
const getCommandPreview = (body: string, language: string): string => {
  let text: string
  if (language === 'richtext' || language === 'markdown') {
    text = stripHtml(body)
  } else {
    text = body
  }
  // Escape HTML to prevent XSS, then highlight {{variables}}
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  return DOMPurify.sanitize(highlightVariables(escaped))
}

// LRU cache for rendered content (markdown/HTML) - max 100 entries
const renderedContentCache = new Map<string, { html: string, plain: string }>()
const MAX_CACHE_SIZE = 100

// Actual clipboard copy function with HTML generation
const copyToClipboard = async (text: string, language: string = 'plaintext') => {
  try {
    // Generate HTML based on language
    let html: string | undefined
    let plainText = text

    if (language === 'richtext' || language === 'markdown') {
      // Use cache for expensive rendering operations
      const cacheKey = `${language}:${text}`
      let cached = renderedContentCache.get(cacheKey)

      if (!cached) {
        // Not cached - compute and cache
        if (language === 'richtext') {
          // Rich text is already HTML from TipTap (TipTap sanitizes by default)
          // Sanitize for extra safety when copying to clipboard
          html = DOMPurify.sanitize(text)
          // Extract plain text from HTML for plain text clipboard
          plainText = stripHtml(html)
        } else if (language === 'markdown') {
          // Convert markdown to HTML and sanitize to prevent XSS in receiving apps
          const rawHtml = marked.parse(text, { async: false })
          html = DOMPurify.sanitize(rawHtml)
          plainText = text // For markdown, keep original as plain text
        }

        // Cache the result
        cached = { html: html!, plain: plainText }
        renderedContentCache.set(cacheKey, cached)

        // LRU eviction: Keep cache size reasonable
        if (renderedContentCache.size > MAX_CACHE_SIZE) {
          const firstKey = renderedContentCache.keys().next().value
          renderedContentCache.delete(firstKey!)
        }
      }

      html = cached.html
      plainText = cached.plain
    } else if (language !== 'plaintext') {
      // Generate syntax highlighted HTML (no caching for code - less frequently copied)
      try {
        const highlighted = hljs.highlight(text, { language }).value
        html = `<pre><code class="hljs language-${language}">${highlighted}</code></pre>`
      } catch (error) {
        // Fallback to plain text if language not supported
        console.warn('Language not supported, copying as plain text:', language)
        html = undefined
      }
    }

    // Write to clipboard with both formats
    await window.electronAPI.clipboard.write({ text: plainText, html })

    // Show toast with or without preview
    if (settings.value['display.previewOnCopy'] !== false) {
      const preview = plainText.length > 60 ? plainText.substring(0, 60).trimEnd() + '...' : plainText
      // Collapse whitespace for cleaner preview
      const cleanPreview = preview.replace(/\s+/g, ' ').trim()
      showNotificationToast(`Copied: ${cleanPreview}`)
    } else {
      showNotificationToast('Copied to clipboard!')
    }
  } catch (error) {
    console.error('Error copying command to clipboard:', error)
    showNotificationToast('Failed to copy')
  }
}

// Variable for storing language of pending command
const pendingCommandLanguage = ref('plaintext')

// Handle variable input submission
const handleVariableSubmit = async (values: VariableValues) => {
  try {
    const processedCommand = substituteVariables(pendingCommand.value, values)
    await copyToClipboard(processedCommand, pendingCommandLanguage.value)
    showVariableModal.value = false

    // Clear state
    currentVariables.value = []
    pendingCommand.value = ''
    pendingCommandLanguage.value = 'plaintext'
  } catch (error) {
    console.error('Error processing variables:', error)
  }
}

// Handle variable input cancellation
const handleVariableCancel = () => {
  showVariableModal.value = false

  // Clear state
  currentVariables.value = []
  pendingCommand.value = ''
  pendingCommandLanguage.value = 'plaintext'
}

// Export functionality
const handleExport = async (filterTags: string[]) => {
  try {
    // Export commands with filtering
    const exportData = exportCommands(commands.value, filterTags)
    const filename = generateExportFilename(filterTags)

    // Show save dialog
    const result = await window.electronAPI.file.saveDialog(filename)
    if (result.success && result.filePath) {
      // Write file
      const writeResult = await window.electronAPI.file.writeFile(result.filePath, JSON.stringify(exportData, null, 2))
      if (writeResult.success) {
        alert(`Successfully exported ${exportData.total_commands} commands!`)
      } else {
        console.error('Export failed:', writeResult.error)
        alert('Failed to save export file')
      }
    }
  } catch (error) {
    console.error('Export error:', error)
    alert('Export failed: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// Deduplicate commands within import bundle (keep only unique bodies)
const deduplicateImportBundle = (commands: ImportCommand[]): ImportCommand[] => {
  const seen = new Map<string, ImportCommand>()
  const duplicatesFound: string[] = []

  commands.forEach(cmd => {
    const normalizedBody = cmd.body.trim()
    if (seen.has(normalizedBody)) {
      duplicatesFound.push(cmd.title)
    } else {
      seen.set(normalizedBody, cmd)
    }
  })

  // duplicatesFound tracked for deduplication but no logging needed

  return Array.from(seen.values())
}

// Import functionality
const handleImport = async () => {
  try {
    // Show open dialog
    const result = await window.electronAPI.file.openDialog()
    if (result.success && result.filePath) {
      // Read file
      const readResult = await window.electronAPI.file.readFile(result.filePath)
      if (readResult.success && readResult.content) {
        // Parse and validate JSON
        const importData = JSON.parse(readResult.content)
        validateExportData(importData)

        // Convert to database format
        let commandsToImport = importCommands(importData)

        // Deduplicate within the import bundle itself (remove internal duplicates)
        const originalCount = commandsToImport.length
        commandsToImport = deduplicateImportBundle(commandsToImport)
        const internalDuplicatesRemoved = originalCount - commandsToImport.length

        // Detect duplicates with existing library
        const duplicates = detectDuplicates(commandsToImport, commands.value)

        if (duplicates.length > 0) {
          // Show duplicate resolution modal
          pendingDuplicates.value = duplicates
          pendingImportCommands.value = commandsToImport
          showDuplicateModal.value = true
        } else {
          // No duplicates, import all commands directly
          await processImport(commandsToImport, [])
        }
      } else {
        alert('Failed to read import file')
      }
    }
  } catch (error) {
    console.error('Import error:', error)
    alert('Import failed: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// Handle duplicate resolution from modal
const handleDuplicateResolution = async (actions: ('skip' | 'replace')[]) => {
  showDuplicateModal.value = false

  // Build set of all duplicate bodies for fast lookup
  const duplicateBodies = new Set<string>()
  pendingDuplicates.value.forEach(duplicate => {
    duplicateBodies.add(duplicate.importCommand.body.trim())
  })

  // Separate import commands into duplicates and new commands
  const duplicateCommands: ImportCommand[] = []
  const newCommands: ImportCommand[] = []

  pendingImportCommands.value.forEach(cmd => {
    const normalizedBody = cmd.body.trim()
    if (duplicateBodies.has(normalizedBody)) {
      duplicateCommands.push(cmd)
    } else {
      newCommands.push(cmd)
    }
  })

  // Process user's choice for each duplicate
  const idsToReplace: number[] = []
  const duplicatesToImport: ImportCommand[] = []

  pendingDuplicates.value.forEach((duplicate, index) => {
    if (actions[index] === 'replace') {
      // Mark existing command for deletion
      idsToReplace.push(duplicate.existingCommand.id)
      // Add import command to import list (find by body match)
      const importCmd = duplicateCommands.find(
        cmd => cmd.body.trim() === duplicate.importCommand.body.trim()
      )
      if (importCmd) {
        // Create a clean copy to avoid Vue reactivity issues
        const cleanCmd = {
          title: importCmd.title,
          body: importCmd.body,
          description: importCmd.description,
          tags: importCmd.tags,
          language: importCmd.language
        }
        // Check if not already added (by body comparison)
        const alreadyAdded = duplicatesToImport.some(
          cmd => cmd.body.trim() === cleanCmd.body.trim()
        )
        if (!alreadyAdded) {
          duplicatesToImport.push(cleanCmd)
        }
      }
    }
    // If action is 'skip', we don't add to either list (existing stays, import skipped)
  })

  // ALWAYS import new commands + import duplicates marked for replacement
  // Create clean copies of new commands too
  const cleanNewCommands = newCommands.map(cmd => ({
    title: cmd.title,
    body: cmd.body,
    description: cmd.description,
    tags: cmd.tags,
    language: cmd.language
  }))

  const commandsToAdd = [...cleanNewCommands, ...duplicatesToImport]

  await processImport(commandsToAdd, idsToReplace)
}

// Process the actual import
const processImport = async (commandsToAdd: ImportCommand[], idsToReplace: number[]) => {
  try {
    // Delete existing commands if replacing
    if (idsToReplace.length > 0) {
      for (const id of idsToReplace) {
        await window.electronAPI.database.deleteCommand(id)
      }
    }

    // Add commands to database
    let successCount = 0
    let errorCount = 0

    for (const command of commandsToAdd) {
      try {
        const addResult = await window.electronAPI.database.addCommand(command)
        if (addResult.success) {
          successCount++
        } else {
          errorCount++
          console.error('Failed to add command:', command.title)
        }
      } catch (error) {
        errorCount++
        console.error('Error adding command:', error)
      }
    }

    // Reload commands and show results
    await loadCommands()

    const replacedCount = idsToReplace.length
    const skippedCount = pendingDuplicates.value.length - replacedCount

    // Build detailed message
    const parts: string[] = []

    if (successCount > 0) {
      parts.push(`✓ Imported ${successCount} command(s)`)
    }
    if (replacedCount > 0) {
      parts.push(`✓ Replaced ${replacedCount} existing command(s)`)
    }
    if (skippedCount > 0) {
      parts.push(`• Kept ${skippedCount} existing command(s) unchanged`)
    }
    if (errorCount > 0) {
      parts.push(`✗ Failed to import ${errorCount} command(s)`)
    }

    const message = parts.length > 0 ? parts.join('\n') : 'Import completed: No changes made.'

    if (successCount > 0 || replacedCount > 0) {
      alert('Import Successful!\n\n' + message)
    } else if (errorCount > 0) {
      alert('Import Failed!\n\n' + message)
    } else {
      alert(message)
    }

    // Close settings modal and clear pending data
    showSettingsModal.value = false
    pendingDuplicates.value = []
    pendingImportCommands.value = []
  } catch (error) {
    console.error('Import processing error:', error)
    alert('Import failed: ' + (error instanceof Error ? error.message : String(error)))
  }
}

// Bulk delete functionality
const handleBulkDelete = async (ids: number[]) => {
  if (ids.length === 0) return

  const confirmDelete = confirm(
    `Are you sure you want to delete ${ids.length} command${ids.length > 1 ? 's' : ''}?\n\nThis action cannot be undone.`
  )

  if (!confirmDelete) return

  try {
    let successCount = 0
    let errorCount = 0

    for (const id of ids) {
      try {
        const result = await window.electronAPI.database.deleteCommand(id)
        if (result.success) {
          successCount++
        } else {
          errorCount++
          console.error('Failed to delete command ID:', id)
        }
      } catch (error) {
        errorCount++
        console.error('Error deleting command ID:', id, error)
      }
    }

    // Reload commands
    await loadCommands()

    // Show notification
    if (successCount > 0) {
      showNotificationToast(
        `Deleted ${successCount} command${successCount > 1 ? 's' : ''}${errorCount > 0 ? ` (${errorCount} failed)` : ''}`
      )
    } else {
      showNotificationToast('Failed to delete commands')
    }
  } catch (error) {
    console.error('Bulk delete error:', error)
    showNotificationToast('Failed to delete commands')
  }
}

// Bulk export functionality
const handleBulkExport = async (ids: number[]) => {
  if (ids.length === 0) return

  try {
    // Get selected commands
    const selectedCommands = commands.value.filter(cmd => ids.includes(cmd.id))

    // Create export data
    const exportData = {
      version: '2.0',
      export_date: new Date().toISOString(),
      total_commands: selectedCommands.length,
      commands: selectedCommands.map(cmd => ({
        title: cmd.title,
        body: cmd.body,
        description: cmd.description,
        tags: JSON.parse(cmd.tags),
        language: cmd.language
      }))
    }

    const filename = `snipforge_selected_${selectedCommands.length}_commands.json`

    // Show save dialog
    const result = await window.electronAPI.file.saveDialog(filename)
    if (result.success && result.filePath) {
      // Write file
      const writeResult = await window.electronAPI.file.writeFile(
        result.filePath,
        JSON.stringify(exportData, null, 2)
      )
      if (writeResult.success) {
        showNotificationToast(`Exported ${selectedCommands.length} command${selectedCommands.length > 1 ? 's' : ''}`)
      } else {
        console.error('Export failed:', writeResult.error)
        showNotificationToast('Failed to save export file')
      }
    }
  } catch (error) {
    console.error('Bulk export error:', error)
    showNotificationToast('Export failed')
  }
}

// Function to delete a command by id
const deleteCommand = async (id: number) => {
  const selectedCommand = commands.value.find(cmd => cmd.id === id)
  if (!selectedCommand) return
  // Confirm deletion
  const confirmDelete = confirm(`Are you sure you want to delete the command: "${selectedCommand.title}"?\n\nThis action 
  cannot be undone.`)
  if (!confirmDelete) return
  // Call the API to delete the command
  try {
    const result = await window.electronAPI.database.deleteCommand(id)
    if (result.success) {
      showNotificationToast('Command deleted')
      // refresh the command list and clear selection
      await loadCommands()
      selectedCommandId.value = null
    } else {
      console.error('Failed to delete command:', result.error)
      showNotificationToast('Failed to delete command')
    }
  } catch (error) {
    console.error('Error deleting command:', error)
    showNotificationToast('Failed to delete command')
  }
}
  // Command editing functions
  const editCommand = async (id: number) => {
    const selectedCommand = commands.value.find(cmd => cmd.id === id)
    if (!selectedCommand) return

    selectedCommandForEdit.value = selectedCommand
    modalMode.value = 'edit'
    showModal.value = true
  }
  // Publish command to a library
  const startPublish = (commandId: number) => {
    const libs = initializedLibraries.value
    if (libs.length === 0) {
      showNotificationToast('No initialized libraries — subscribe and init a library first')
      return
    }
    if (libs.length === 1) {
      // Only one library — publish directly
      doPublish(libs[0].id, commandId)
    } else {
      // Multiple libraries — show picker
      publishTargetCommandId.value = commandId
      showPublishModal.value = true
    }
  }

  const doPublish = async (libraryId: number, commandId: number) => {
    publishing.value = true
    showPublishModal.value = false
    try {
      const result = await window.electronAPI.library.publish(libraryId, commandId)
      if (result.success) {
        const lib = libraries.value.get(libraryId)
        const action = result.created ? 'Published' : 'Updated'
        showNotificationToast(`${action} to ${lib?.name || 'library'}`)
      } else {
        showNotificationToast(`Publish failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Publish error:', error)
      showNotificationToast('Failed to publish command')
    } finally {
      publishing.value = false
    }
  }

  // Unpublish (remove from library repo)
  const startUnpublish = async (commandId: number) => {
    const command = commands.value.find(c => c.id === commandId)
    if (!command || command.source !== 'remote' || !command.library_id || !command.remote_path) return

    const lib = libraries.value.get(command.library_id)
    if (!lib?.manifest_path) return

    const confirmed = window.confirm(`Remove "${command.title}" from ${lib.name}?\n\nThis deletes the file from the GitHub repo. Subscribers will lose this command on their next sync.`)
    if (!confirmed) return

    unpublishing.value = true
    try {
      const result = await window.electronAPI.library.unpublish(command.library_id, command.remote_path)
      if (result.success) {
        showNotificationToast(`Removed from ${lib.name}`)
        await loadCommands()
      } else {
        showNotificationToast(`Unpublish failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Unpublish error:', error)
      showNotificationToast('Failed to remove from library')
    } finally {
      unpublishing.value = false
    }
  }

  // Handle modal save
  const handleModalSave = async (formData: { title: string; body: string; description: string; tags: string; language: string }) =>
   {
    try {
      if (modalMode.value === 'edit' && selectedCommandForEdit.value) {
        // Update existing command
        const result = await window.electronAPI.database.updateCommand(selectedCommandForEdit.value.id,
  formData)
        if (result.success) {
          showNotificationToast('Command updated')
          await loadCommands()
        } else {
          console.error('Failed to update command:', result.error)
          showNotificationToast('Failed to update command')
        }
      } else {
        // Add new command
        const result = await window.electronAPI.database.addCommand(formData)
        if (result.success) {
          showNotificationToast('Command added')
          await loadCommands()
        } else {
          console.error('Failed to add command:', result.error)
          showNotificationToast('Failed to add command')
        }
      }
      showModal.value = false
    } catch (error) {
      console.error('Error saving command:', error)
      showNotificationToast('Failed to save command')
    }
  }
  // Handle modal cancel
  const handleModalCancel = () => {
    showModal.value = false
    selectedCommandForEdit.value = null
  }
  
// ── Shortcut Matching ──────────────────────────────────────────
// Default shortcuts (duplicated from settings.ts to avoid main process import)
const DEFAULT_SHORTCUTS: Record<string, string> = {
  'navigate.up': 'ArrowUp',
  'navigate.down': 'ArrowDown',
  'action.copy': 'c',
  'action.copyTemplate': 'Shift+c',
  'action.new': 'n',
  'action.edit': 'e',
  'action.publish': 'p',
  'action.bulkPublish': 'Shift+p',
  'action.unpublish': 'u',
  'action.delete': 'Backspace',
}

const shortcuts = computed(() => {
  const stored = settings.value['shortcuts'] as Record<string, string> | undefined
  return { ...DEFAULT_SHORTCUTS, ...stored }
})

function matchesShortcut(event: KeyboardEvent, binding: string): boolean {
  const parts = binding.split('+')
  const key = parts[parts.length - 1]
  const modifiers = parts.slice(0, -1).map(m => m.toLowerCase())

  const requireShift = modifiers.includes('shift')
  const requireCmdOrCtrl = modifiers.includes('cmdorctrl')
  const requireAlt = modifiers.includes('alt')

  if (requireShift !== event.shiftKey) return false
  if (requireCmdOrCtrl !== (event.metaKey || event.ctrlKey)) return false
  if (requireAlt !== event.altKey) return false
  // Reject extra modifiers not in the binding
  if (!requireCmdOrCtrl && (event.metaKey || event.ctrlKey)) return false

  return event.key.toLowerCase() === key.toLowerCase()
}

function matchAction(event: KeyboardEvent, action: string): boolean {
  const binding = shortcuts.value[action]
  return binding ? matchesShortcut(event, binding) : false
}

// keyboard Navigation and actions
const handleKeyboard = (event: KeyboardEvent) => {
  const target = event.target as HTMLElement

  // Handle ESC first - it should always work to cancel/close things
  if (event.key === 'Escape') {
    event.preventDefault()
    // ESC priority: modals -> filter dropdown -> command selection -> blur input -> clear search
    if (showVariableModal.value) {
      handleVariableCancel()
    } else if (showModal.value) {
      handleModalCancel()
    } else if (showDuplicateModal.value) {
      showDuplicateModal.value = false
    } else if (showSettingsModal.value) {
      showSettingsModal.value = false
    } else if (showHelpModal.value) {
      showHelpModal.value = false
    } else if (showDescriptionModal.value) {
      showDescriptionModal.value = false
    } else if (showPublishModal.value) {
      showPublishModal.value = false
    } else if (showFilterDropdown.value) {
      showFilterDropdown.value = false
    } else if (selectedCommandId.value !== null) {
      selectedCommandId.value = null
    } else if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
      ;(target as HTMLInputElement).blur()
    } else if (searchQuery.value) {
      searchQuery.value = '' // refDebounced will automatically clear debouncedSearchQuery
    }
    return
  }

  // Handle Cmd/Ctrl+F to focus search bar
  if (event.key === 'f' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    selectedCommandId.value = null // Deselect command
    const searchInput = document.querySelector('input[type="text"]') as HTMLInputElement
    if (searchInput) {
      searchInput.focus()
      searchInput.select()
    }
    return
  }

  // Don't process hotkeys when modal is open or filter dropdown is open
  if (showModal.value || showVariableModal.value || showSettingsModal.value || showHelpModal.value || showDescriptionModal.value || showDuplicateModal.value || showPublishModal.value || showFilterDropdown.value) return

  // Don't process hotkeys when user is typing in an input field
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

  if (filteredCommands.value.length === 0) return

  if (matchAction(event, 'navigate.down')) {
    event.preventDefault()
    const currentIndex = filteredCommands.value.findIndex(cmd => cmd.id === selectedCommandId.value)
    const nextIndex = Math.min(currentIndex + 1, filteredCommands.value.length - 1)
    selectedCommandId.value = filteredCommands.value[nextIndex].id
  } else if (matchAction(event, 'navigate.up')) {
    event.preventDefault()
    const currentIndex = filteredCommands.value.findIndex(cmd => cmd.id === selectedCommandId.value)
    const prevIndex = Math.max(currentIndex - 1, 0)
    selectedCommandId.value = filteredCommands.value[prevIndex].id
  } else if (matchAction(event, 'action.copy')) {
    event.preventDefault()
    const selectedCommand = filteredCommands.value.find(cmd => cmd.id === selectedCommandId.value)
    if (selectedCommand) copyCommand(selectedCommand)
  } else if (matchAction(event, 'action.copyTemplate')) {
    event.preventDefault()
    const selectedCommand = filteredCommands.value.find(cmd => cmd.id === selectedCommandId.value)
    if (selectedCommand) copyCommandTemplate(selectedCommand.body, selectedCommand.language)
  } else if (matchAction(event, 'action.edit')) {
    event.preventDefault()
    const selectedCommand = filteredCommands.value.find(cmd => cmd.id === selectedCommandId.value)
    if (selectedCommand) editCommand(selectedCommand.id)
  } else if (matchAction(event, 'action.new')) {
    event.preventDefault()
    selectedCommandForEdit.value = null
    modalMode.value = 'add'
    showModal.value = true
  } else if (matchAction(event, 'action.bulkPublish')) {
    event.preventDefault()
    if (initializedLibraries.value.length > 0) showBulkPublishModal.value = true
  } else if (matchAction(event, 'action.publish')) {
    event.preventDefault()
    const selectedCommand = filteredCommands.value.find(cmd => cmd.id === selectedCommandId.value)
    if (selectedCommand) startPublish(selectedCommand.id)
  } else if (matchAction(event, 'action.unpublish')) {
    event.preventDefault()
    const selectedCommand = filteredCommands.value.find(cmd => cmd.id === selectedCommandId.value)
    if (selectedCommand && selectedCommand.source === 'remote') startUnpublish(selectedCommand.id)
  } else if (matchAction(event, 'action.delete')) {
    event.preventDefault()
    const selectedCommand = filteredCommands.value.find(cmd => cmd.id === selectedCommandId.value)
    if (selectedCommand) deleteCommand(selectedCommand.id)
  }
}

// To track which command is selected
const selectedCommandId = ref<number | null>(null);

// Configure marked for better markdown support (used in modal)
marked.setOptions({
  breaks: true,
  gfm: true
})

// Cache for description tooltips to avoid redundant regex operations
const descriptionTooltipCache = new Map<number, string>()

// Get plain text from markdown description for tooltip (strip markdown syntax)
const getDescriptionTooltip = (commandId: number, description: string): string => {
  if (!description) return ''

  // Check cache first
  if (descriptionTooltipCache.has(commandId)) {
    return descriptionTooltipCache.get(commandId)!
  }

  // Strip markdown syntax for plain text display
  let plainText = description
    .replace(/\*\*(.+?)\*\*/g, '$1')  // **bold**
    .replace(/\*(.+?)\*/g, '$1')      // *italic*
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')  // [text](url)
    .replace(/`(.+?)`/g, '$1')        // `code`
    .replace(/^#+\s+/gm, '')          // # heading

  // Take first 100 characters or first 2 lines, whichever is shorter
  const lines = plainText.split('\n').slice(0, 2)
  const preview = lines.join(' ')
  const result = preview.length > 100 ? preview.substring(0, 100) + '...' : preview

  // Cache the result
  descriptionTooltipCache.set(commandId, result)

  return result
}

// Clear tooltip cache when commands change
watch(commands, () => {
  descriptionTooltipCache.clear()
})

// Clear command selection when tag filters change (filtering = new search)
watch(selectedTags, () => {
  selectedCommandId.value = null
})

// Open description modal
const openDescriptionModal = (title: string, description: string) => {
  descriptionModalTitle.value = title
  descriptionModalContent.value = description
  showDescriptionModal.value = true
}


</script>

<template>
  <div class="app-container">
    <!-- Custom title bar with integrated search and controls -->
    <div class="custom-titlebar">
      <!-- Left section: Traffic lights + App branding -->
      <div class="left-section">
        <div class="traffic-light-space"></div>
        <div class="app-branding">
          <h1 class="app-title">SnipForge</h1>
          <Anvil class="app-icon" :size="20" />
        </div>
      </div>

      <!-- Middle section: Search bar -->
      <div class="middle-section search-container">
        <div class="search-wrapper">
          <input type="text"
            ref="searchInputRef"
            placeholder="search commands..."
            v-model="searchQuery"
            @keydown="handleSearchKeyDown"
            @focus="selectedCommandId = null"
            class="search-input"
          />
          <button
            @click="toggleFilterDropdown"
            :class="['filter-button', { active: selectedTags.length > 0, open: showFilterDropdown }]"
            title="Filter by tags"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46"></polygon>
            </svg>
          </button>

          <!-- Tag selector dropdown -->
          <div v-if="showFilterDropdown" class="filter-dropdown" @click.stop>
            <TagSelector
              :availableTags="availableTags"
              :selectedTags="selectedTags"
              @toggle="toggleTag"
              @clear-all="clearAllTags"
            />
          </div>
        </div>

      </div>

      <!-- Right section: Control buttons -->
      <div class="right-section">
        <button class="add-button" @click="modalMode = 'add'; selectedCommandForEdit = null; showModal = true" title="Add new command (n)">
          <CirclePlus :size="18" />
        </button>
        <button
          v-if="initializedLibraries.length > 0"
          class="bulk-publish-button"
          @click="showBulkPublishModal = true"
          title="Bulk publish (Shift+P)"
        >
          <PackagePlus :size="18" />
        </button>
        <button class="help-button" @click="showHelpModal = true" title="Help">
          <HelpCircle :size="16" />
        </button>
        <button class="settings-button" @click="showSettingsModal = true" title="Settings">
          <Settings :size="18" />
        </button>

        <!-- Windows window controls -->
        <div v-if="isWindows" class="window-controls">
          <button class="window-control-btn minimize-btn" @click="minimizeWindow" title="Minimize">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="0" y="5" width="12" height="2" fill="currentColor"/>
            </svg>
          </button>
          <button class="window-control-btn maximize-btn" @click="maximizeWindow" :title="isMaximized ? 'Restore' : 'Maximize'">
            <svg v-if="!isMaximized" width="12" height="12" viewBox="0 0 12 12">
              <rect x="1" y="1" width="10" height="10" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
            <svg v-else width="12" height="12" viewBox="0 0 12 12">
              <rect x="2" y="0" width="10" height="10" stroke="currentColor" stroke-width="1.5" fill="none"/>
              <rect x="0" y="2" width="10" height="10" stroke="currentColor" stroke-width="1.5" fill="none"/>
            </svg>
          </button>
          <button class="window-control-btn close-btn-window" @click="closeWindow" title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12">
              <path d="M 1,1 L 11,11 M 11,1 L 1,11" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Main content area -->
    <div class="main-content">
      <!-- Virtual scrolling container for search results -->
      <VList
        class="results"
        :data="filteredCommands"
        :item-key="(command: Command) => command.id"
      >
        <template #default="{ item: command, index }">
          <div
            class="command-item"
            :class="{'selected': selectedCommandId === command.id}"
            :tabindex="selectedCommandId === command.id || (selectedCommandId === null && index === 0) ? 0 : -1"
            @click="selectedCommandId = command.id"
            @focus="selectedCommandId = command.id"
          >
            <div class="command-content">
              <div class="command-title-row">
                <span class="command-title">{{ command.title }}</span>
                <span
                  v-if="command.source === 'remote' && command.library_id"
                  class="source-badge"
                  :title="libraries.get(command.library_id)?.name + ' (' + libraries.get(command.library_id)?.github_repo + ')'"
                >
                  <!-- Folder icon for local libraries, GitHub icon for remote -->
                  <svg v-if="libraries.get(command.library_id)?.type === 'local'" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                  <svg v-else width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                </span>
                <button
                  v-if="command.description"
                  class="info-icon"
                  @click.stop="openDescriptionModal(command.title, command.description)"
                  tabindex="-1"
                  :title="getDescriptionTooltip(command.id, command.description)"
                >
                  <HelpCircle :size="14" />
                </button>
              </div>
              <div class="command-body" v-html="getCommandPreview(command.body, command.language)"></div>
              <div v-if="settings['display.tagPills'] !== false && command.tagsArray && command.tagsArray.length > 0" class="command-tags">
                <span v-for="tag in command.tagsArray" :key="tag" class="tag-pill">{{ tag }}</span>
              </div>
            </div>
            <div class="command-actions">
              <button @click.stop="copyCommand(command)" tabindex="-1" title="Copy command">
                <Copy :size="16" />
              </button>
              <button
                v-if="initializedLibraries.length > 0 && command.source !== 'remote'"
                @click.stop="startPublish(command.id)"
                tabindex="-1"
                title="Publish to library"
                :disabled="publishing"
              >
                <Upload :size="16" />
              </button>
              <button
                v-if="command.source === 'remote' && command.library_id && command.remote_path && libraries.get(command.library_id)?.manifest_path"
                @click.stop="startUnpublish(command.id)"
                tabindex="-1"
                title="Remove from library"
                :disabled="unpublishing"
                class="unpublish-btn"
              >
                <CloudOff :size="16" />
              </button>
              <button @click.stop="editCommand(command.id)" tabindex="-1" title="Edit command">
                <Edit :size="16" />
              </button>
              <button @click.stop="deleteCommand(command.id)" tabindex="-1" title="Delete command">
                <Trash2 :size="16" />
              </button>
            </div>
          </div>
        </template>
      </VList>
    </div>

    <!-- Command Modal -->
    <CommandModal
      :show="showModal"
      :mode="modalMode"
      :command="selectedCommandForEdit"
      :commands="commands"
      @save="handleModalSave"
      @cancel="handleModalCancel"
    />

    <!-- Variable Input Modal -->
    <VariableInputModal
      :show="showVariableModal"
      :variables="currentVariables"
      @submit="handleVariableSubmit"
      @cancel="handleVariableCancel"
    />

    <!-- Settings Modal -->
    <SettingsModal
      :show="showSettingsModal"
      :commands="commands"
      @export="handleExport"
      @import="handleImport"
      @bulk-delete="handleBulkDelete"
      @bulk-export="handleBulkExport"
      @cancel="showSettingsModal = false"
      @libraries-changed="loadCommands"
    />

    <!-- Help Modal -->
    <HelpModal
      :show="showHelpModal"
      @cancel="showHelpModal = false"
    />

    <!-- Description Modal -->
    <DescriptionModal
      :show="showDescriptionModal"
      :title="descriptionModalTitle"
      :description="descriptionModalContent"
      @cancel="showDescriptionModal = false"
    />

    <!-- Duplicate Resolution Modal -->
    <DuplicateResolutionModal
      :show="showDuplicateModal"
      :duplicates="pendingDuplicates"
      @cancel="showDuplicateModal = false"
      @apply="handleDuplicateResolution"
    />

    <!-- Publish to Library Modal -->
    <div v-if="showPublishModal" class="modal-overlay" @click.self="showPublishModal = false">
      <div class="publish-modal">
        <h3>Publish to Library</h3>
        <p class="publish-description">Choose a library to publish this command to:</p>
        <div class="publish-library-list">
          <button
            v-for="lib in initializedLibraries"
            :key="lib.id"
            class="publish-library-option"
            @click="doPublish(lib.id, publishTargetCommandId!)"
          >
            <span class="publish-library-name">{{ lib.name }}</span>
            <span class="publish-library-repo">{{ lib.github_repo }}</span>
          </button>
        </div>
        <button class="publish-cancel" @click="showPublishModal = false">Cancel</button>
      </div>
    </div>

    <!-- Bulk Publish Modal -->
    <BulkPublishModal
      :show="showBulkPublishModal"
      :commands="commands"
      :libraries="initializedLibraries"
      @cancel="showBulkPublishModal = false"
      @done="showBulkPublishModal = false; loadCommands()"
    />

    <!-- Notification Toast -->
    <Transition name="toast">
      <div v-if="showNotification" class="notification-toast">
        {{ notificationMessage }}
      </div>
    </Transition>
  </div>
</template>

<style>
:root {
  --accent: #ec5002ee;
  --accent-hover: #d4470a;
  --accent-light: #ff6b2e;
  --accent-glow: rgba(236, 80, 2, 0.15);
  --bg-app: #181818;
  --bg-input: #1a1a1a;
  --bg-deep: #1e1e1e;
  --bg-surface: #2a2a2a;
  --bg-elevated: #2d2d2d;
  --bg-hover: #3a3a3a;
  --border: #404040;
  --border-hover: #505050;
  --text-primary: #ffffff;
  --text-secondary: #cccccc;
  --text-tertiary: #999999;
  --text-muted: #666666;
  --text-placeholder: #b3b3b3;
  --overlay: rgba(0, 0, 0, 0.7);
  --shadow: rgba(0, 0, 0, 0.3);
  --danger: #d32f2f;
  --z-dropdown: 500;
  --z-modal: 1000;
  --z-modal-top: 1100;
  --z-toast: 2000;
}

/* Make parent elements pass-through containers */
html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

/* Hide default system scrollbars */
* {
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE/Edge */
}

*::-webkit-scrollbar {
  display: none; /* Webkit browsers */
}

/* App container */
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}

/* Titlebar */
.custom-titlebar {
  height: 64px;
  display: flex;
  align-items: stretch;
  padding: 0;
  border-bottom: 1px solid var(--bg-surface);
  -webkit-app-region: drag;
}

/* Left section */
.left-section {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  height: 100%;
  width: auto;
  padding: 0 12px;
  gap: 3px;
  flex-shrink: 0;
}

/* Traffic lights area */
.traffic-light-space {
  width: 70px;
  height: 20px;
  flex-shrink: 0;
}

/* App title and icon */
.app-branding {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 4px;
  width: auto;
  flex-shrink: 0;
}

.app-title {
  margin-left: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-primary);
  align-self: left;
}

.app-icon {
  color: var(--accent);
  flex-shrink: 0;
}

/* Search section */
.middle-section {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

.search-container {
  position: relative;
  padding: 0 0.5%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}


.search-input {
  width: 320px;
  height: 36px;
  margin: 2px 0 0 0;
  padding: 0 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 18px;
  color: var(--text-primary);
  font-size: 0.875rem;
  outline: none;
  box-sizing: border-box;
  -webkit-app-region: no-drag;
}

.filter-button {
  width: 32px;
  height: 32px;
  border-radius: 16px;
  background: var(--bg-surface);
  color: var(--text-placeholder);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border: 1px solid var(--border);
  -webkit-app-region: no-drag;
  outline: none;
}

.filter-button:focus-visible,
.filter-button.open {
  border-color: var(--accent);
}

.filter-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.filter-button.active {
  background: var(--accent);
  color: var(--text-primary);
  border-color: var(--accent);
}

.filter-dropdown {
  position: absolute;
  top: 100%;
  right: -173px;
  background: transparent;
  z-index: var(--z-dropdown);
  margin-top: 4px;
  width: 200px;
}


.search-input:focus {
  border-color: var(--accent);
  background: var(--bg-surface);
}

.search-input::placeholder {
  color: var(--text-placeholder);
}

/* Controls section */
.right-section {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  height: 100%;
  width: auto;
  padding: 0 0.5%;
  flex-shrink: 0;
}

/* Main content */
.main-content {
  flex: 1;
  padding: 20px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Control buttons */
.add-button,
.bulk-publish-button,
.help-button,
.settings-button {
  background: none;
  border: 1px solid transparent;
  padding: 7px;
  cursor: pointer;
  color: var(--accent);
  transition: all 0.2s;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  -webkit-app-region: no-drag;
  outline: none;
}

.add-button:focus-visible,
.bulk-publish-button:focus-visible,
.help-button:focus-visible,
.settings-button:focus-visible {
  border-color: var(--accent);
}

.add-button:hover,
.bulk-publish-button:hover,
.help-button:hover,
.settings-button:hover {
  background-color: var(--bg-surface);
  color: var(--text-primary);
}

/* Window controls (Windows only) */
.window-controls {
  display: flex;
  align-items: center;
  gap: 0;
  margin-left: 8px;
  -webkit-app-region: no-drag;
}

.window-control-btn {
  background: none;
  border: none;
  padding: 8px;
  cursor: pointer;
  color: var(--accent);
  transition: all 0.2s;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  -webkit-app-region: no-drag;
}

.window-control-btn:hover {
  background-color: var(--bg-surface);
  color: var(--text-primary);
}

/* Command list - Virtual scrolling container */
.results {
  flex: 1;
  overflow: hidden; /* VList handles scrolling internally */
  padding: 0;
  height: 100%; /* VList needs explicit height */
}

.command-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  margin-bottom: 1px;
  background: var(--bg-input);
  border: 2px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.command-item:hover {
  background-color: var(--bg-surface);
}

.command-item.selected {
  border-color: var(--accent);
}

/* Remove browser focus outline on commands - we use .selected class instead */
.command-item:focus {
  outline: none;
}

.command-content {
  flex: 1;
  min-width: 0;
}

.command-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  min-width: 0;
}

.command-title {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.source-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  color: var(--accent);
  cursor: default;
}

.info-icon {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--text-placeholder);
  transition: all 0.2s;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.info-icon:hover {
  color: var(--accent);
  background-color: var(--bg-surface);
}

.command-body {
  color: var(--text-placeholder);
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.command-body :deep(*) {
  display: inline;
  margin: 0;
  padding: 0;
}

.command-body :deep(code) {
  background-color: var(--bg-surface);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: 'Courier New', monospace;
  font-size: 11px;
}

.command-body :deep(strong) {
  font-weight: 600;
}

.command-body :deep(em) {
  font-style: italic;
}

.command-body :deep(a) {
  color: inherit;
  text-decoration: none;
  cursor: default;
  pointer-events: none;
}

.command-item.selected .command-body {
  color: var(--text-primary);
}

.variable-highlight {
  color: #e8a948;
  font-weight: 500;
}

/* Tag pills */
.command-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}

.tag-pill {
  display: inline-block;
  padding: 1px 7px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 9999px;
  background-color: var(--bg-surface);
  color: var(--text-tertiary);
  border: 1px solid var(--border);
  white-space: nowrap;
  line-height: 1.5;
}

.command-item.selected .tag-pill {
  background-color: var(--bg-elevated);
  color: var(--text-secondary);
  border-color: var(--border-hover);
}

/* Command actions */
.command-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s;
}

.command-item:hover .command-actions,
.command-item.selected .command-actions {
  opacity: 1;
}

.command-actions button {
  background: none;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: var(--text-placeholder);
  transition: all 0.2s;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.command-actions button:hover {
  background-color: var(--border);
  color: var(--text-primary);
}

.command-actions .unpublish-btn:hover {
  color: #e06c75;
}

/* Shared modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--overlay);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: var(--z-modal);
  -webkit-app-region: no-drag;
}

.modal-content {
  background-color: var(--bg-elevated);
  border-radius: 12px;
  width: 90vw;
  max-width: 600px;
  max-height: 90vh;
  border: 1px solid var(--border);
  box-shadow: 0 10px 30px var(--shadow);
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 600;
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
}

.close-button:hover {
  background-color: var(--border);
  color: var(--text-primary);
}

.close-button:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.modal-body {
  padding: 24px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 20px 24px;
  border-top: 1px solid var(--border);
}

/* Form elements */
.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: var(--text-primary);
  font-weight: 500;
  font-size: 14px;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 12px;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background-color: var(--bg-input);
  color: var(--text-primary);
  font-size: 14px;
  font-family: inherit;
  box-sizing: border-box;
  display: block;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: var(--accent);
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

/* Modal buttons */
.cancel-button,
.save-button {
  padding: 10px 20px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background-color 0.2s;
}

.cancel-button {
  background-color: var(--border);
  color: var(--text-primary);
}

.cancel-button:hover {
  background-color: var(--border-hover);
}

.cancel-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}

.save-button {
  background-color: var(--accent);
  color: var(--text-primary);
}

.save-button:hover {
  background-color: var(--accent-hover);
}

.save-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}

/* Notification Toast */
/* Publish Modal */
.publish-modal {
  background: var(--bg-deep);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 20px;
  min-width: 320px;
  max-width: 400px;
}

.publish-modal h3 {
  margin: 0 0 4px;
  font-size: 16px;
  color: var(--text-primary);
}

.publish-description {
  margin: 0 0 12px;
  font-size: 13px;
  color: var(--text-tertiary);
}

.publish-library-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 12px;
}

.publish-library-option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 10px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.publish-library-option:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
}

.publish-library-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.publish-library-repo {
  font-size: 12px;
  color: var(--text-tertiary);
}

.publish-cancel {
  width: 100%;
  padding: 8px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
}

.publish-cancel:hover {
  background: var(--bg-surface);
}

.notification-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--bg-elevated);
  color: var(--text-primary);
  padding: 12px 24px;
  border-radius: 8px;
  border: 1px solid var(--border);
  box-shadow: 0 4px 12px var(--shadow);
  font-size: 14px;
  font-weight: 500;
  z-index: var(--z-toast);
  pointer-events: none;
}

/* Toast transition animations */
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(20px);
}

/* Shared markdown content styles */
.markdown-content {
  color: var(--text-secondary);
  line-height: 1.6;
}

.markdown-content h1,
.markdown-content h2,
.markdown-content h3 {
  color: var(--text-primary);
  margin-top: 16px;
  margin-bottom: 8px;
}

.markdown-content h1 {
  font-size: 1.5em;
}

.markdown-content h2 {
  font-size: 1.3em;
}

.markdown-content h3 {
  font-size: 1.1em;
}

.markdown-content p {
  margin: 8px 0;
}

.markdown-content a {
  color: var(--accent);
  text-decoration: underline;
}

.markdown-content a:hover {
  color: var(--accent-light);
}

.markdown-content code {
  background-color: var(--bg-surface);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: 'Courier New', monospace;
  font-size: 0.9em;
}

.markdown-content pre {
  background-color: var(--bg-surface);
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
}

.markdown-content pre code {
  background: none;
  padding: 0;
}

.markdown-content ul,
.markdown-content ol {
  margin: 8px 0;
  padding-left: 24px;
}

.markdown-content li {
  margin: 4px 0;
}

.markdown-content blockquote {
  border-left: 3px solid var(--accent);
  padding-left: 12px;
  margin: 8px 0;
  color: var(--text-placeholder);
}

.markdown-content img {
  max-width: 100%;
  height: auto;
  border-radius: 4px;
  margin: 8px 0;
}

.markdown-content strong {
  font-weight: 600;
}

.markdown-content em {
  font-style: italic;
}

/* Reduced motion preference */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
</style>

<template>
  <div v-if="show" class="modal-overlay" @click.self="$emit('cancel')">
    <div class="modal-content" @click="closeAllDropdowns">
      <!-- Tab Navigation with close button -->
      <div class="tab-navigation">
        <div class="tabs">
          <button
            class="tab-button"
            :class="{ active: activeTab === 'general' }"
            @click="activeTab = 'general'"
          >
            General
          </button>
          <button
            class="tab-button"
            :class="{ active: activeTab === 'connectors' }"
            @click="activeTab = 'connectors'"
          >
            Connectors
          </button>
          <button
            class="tab-button"
            :class="{ active: activeTab === 'libraries' }"
            @click="activeTab = 'libraries'"
          >
            Libraries
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

        <!-- Tab 1: General -->
        <div v-if="activeTab === 'general'" class="general-tab">
          <!-- Updates -->
          <div class="settings-section">
            <h3>Updates</h3>
            <div class="update-compact-row">
              <div class="update-left">
                <span class="update-version">v{{ updateStatus.currentVersion || '...' }}</span>
                <span v-if="updateStatus.updateAvailable" class="update-available">
                  — v{{ updateStatus.latestVersion }} available
                </span>
                <span v-else-if="updateStatus.lastChecked" class="update-up-to-date">
                  — up to date
                </span>
              </div>
              <button
                class="update-check-btn"
                @click="manualCheckForUpdate"
                :disabled="updateChecking"
              >
                {{ updateChecking ? 'Checking...' : 'Check for updates' }}
              </button>
            </div>
            <div class="toggle-row">
              <div class="toggle-label">
                <span class="toggle-title">Check automatically</span>
              </div>
              <button
                class="toggle-switch"
                :class="{ on: settings['update.autoCheck'] !== false }"
                @click="updateSetting('update.autoCheck', settings['update.autoCheck'] === false)"
                role="switch"
                :aria-checked="settings['update.autoCheck'] !== false"
              >
                <span class="toggle-knob" />
              </button>
            </div>
          </div>

          <div class="settings-section">
            <h3>Global Hotkey</h3>
            <p class="section-description">
              Keyboard shortcut to show/hide SnipForge from anywhere.
            </p>
            <div class="hotkey-picker">
              <button
                class="hotkey-display"
                :class="{ listening: hotkeyListening }"
                @click="startHotkeyCapture"
                @keydown="captureHotkey"
                @blur="cancelHotkeyCapture"
              >
                <span v-if="hotkeyListening" class="hotkey-listening-text">
                  Press a key combo...
                </span>
                <span v-else class="hotkey-keys">{{ formatHotkeyDisplay(currentHotkey) }}</span>
              </button>
              <span v-if="hotkeyFeedback" class="hotkey-feedback" :class="hotkeyFeedbackType">
                {{ hotkeyFeedback }}
              </span>
            </div>
          </div>

          <!-- Display Settings -->
          <div class="settings-section">
            <h3>Display</h3>
            <div class="toggle-row">
              <div class="toggle-label">
                <span class="toggle-title">Tag pills</span>
                <span class="toggle-desc">Show tags as pills on commands in the list</span>
              </div>
              <button
                class="toggle-switch"
                :class="{ on: settings['display.tagPills'] !== false }"
                @click="updateSetting('display.tagPills', settings['display.tagPills'] === false)"
                role="switch"
                :aria-checked="settings['display.tagPills'] !== false"
              >
                <span class="toggle-knob" />
              </button>
            </div>
            <div class="toggle-row">
              <div class="toggle-label">
                <span class="toggle-title">Preview on copy</span>
                <span class="toggle-desc">Show a snippet of the copied text in the notification</span>
              </div>
              <button
                class="toggle-switch"
                :class="{ on: settings['display.previewOnCopy'] !== false }"
                @click="updateSetting('display.previewOnCopy', settings['display.previewOnCopy'] === false)"
                role="switch"
                :aria-checked="settings['display.previewOnCopy'] !== false"
              >
                <span class="toggle-knob" />
              </button>
            </div>
          </div>

          <!-- Keyboard Shortcuts -->
          <div class="settings-section">
            <h3>Keyboard Shortcuts</h3>
            <p class="section-description">
              Click a shortcut to rebind it. Press Escape to cancel.
            </p>
            <div class="shortcuts-table">
              <div
                v-for="action in shortcutActions"
                :key="action.id"
                class="shortcut-row"
              >
                <span class="shortcut-action">{{ action.label }}</span>
                <button
                  class="shortcut-key"
                  :class="{ listening: shortcutListeningAction === action.id }"
                  @click="startShortcutCapture(action.id)"
                  @keydown="captureShortcut($event, action.id)"
                  @blur="cancelShortcutCapture"
                >
                  <span v-if="shortcutListeningAction === action.id" class="shortcut-listening-text">
                    Press a key...
                  </span>
                  <span v-else>{{ formatShortcutDisplay(currentShortcuts[action.id]) }}</span>
                </button>
              </div>
            </div>
            <div class="shortcuts-footer">
              <span v-if="shortcutFeedback" class="shortcut-feedback" :class="shortcutFeedbackType">
                {{ shortcutFeedback }}
              </span>
              <button
                class="reset-shortcuts-button"
                @click="resetShortcuts"
                :disabled="!hasCustomShortcuts"
              >
                Reset to defaults
              </button>
            </div>
          </div>

        </div>

        <!-- Tab 2: Connectors -->
        <div v-if="activeTab === 'connectors'" class="connectors-tab">
          <div class="settings-section" style="border-bottom: none;">
            <h3>Connected Services</h3>
            <p class="section-description">
              External services that SnipForge can sync with.
            </p>

            <div class="connector-list">
              <!-- GitHub Connector -->
              <div class="connector-row">
                <div class="connector-icon" :class="{ 'connector-icon--avatar': authStatus.authenticated && authStatus.user?.avatar_url }">
                  <img
                    v-if="authStatus.authenticated && authStatus.user?.avatar_url"
                    :src="authStatus.user.avatar_url"
                    :alt="authStatus.user.login"
                    class="connector-avatar"
                  />
                  <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                </div>
                <div class="connector-info">
                  <span class="connector-name">GitHub</span>
                  <span v-if="authStatus.authenticated" class="connector-status connected">
                    @{{ authStatus.user?.login }}
                  </span>
                  <span v-else class="connector-status">Not connected</span>
                </div>
                <div class="connector-action">
                  <!-- Authenticated: disconnect -->
                  <button
                    v-if="authStatus.authenticated"
                    @click="handleLogout"
                    class="connector-button disconnect"
                  >
                    Disconnect
                  </button>
                  <!-- Not authenticated: connect flow -->
                  <button
                    v-else-if="!deviceFlow.active"
                    @click="startLogin"
                    class="connector-button connect"
                    :disabled="deviceFlow.loading"
                  >
                    {{ deviceFlow.loading ? 'Starting...' : 'Connect' }}
                  </button>
                </div>
              </div>

              <!-- Device Flow inline (shown when connecting) -->
              <div v-if="!authStatus.authenticated && deviceFlow.active && !deviceFlow.completed" class="connector-device-flow">
                <p class="device-flow-instruction">
                  Open the link below and enter this code:
                </p>
                <div class="device-code-display">
                  <code class="device-code">{{ deviceFlow.userCode }}</code>
                  <button @click="copyDeviceCode" class="copy-code-button" title="Copy code">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                </div>
                <button @click="openVerificationUrl" class="verification-link-button">
                  Open github.com/login/device
                </button>
                <p class="device-flow-status">
                  <span class="spinner"></span>
                  Waiting for authorization...
                </p>
                <button @click="cancelLogin" class="cancel-auth-button">Cancel</button>
              </div>
            </div>

            <!-- Error message -->
            <p v-if="libraryError && activeTab === 'connectors'" class="library-error" style="margin-top: 12px;">{{ libraryError }}</p>
          </div>
        </div>

        <!-- Tab 3: Remote Libraries -->
        <div v-if="activeTab === 'libraries'" class="libraries-tab">
          <!-- Library Subscriptions Section -->
          <div class="settings-section">
            <!-- Section header: title + sync all -->
            <div class="section-header-row">
              <h3>Libraries</h3>
              <div class="section-header-actions">
                <button
                  v-if="libraries.length > 0"
                  @click="handleSyncAll"
                  class="sync-all-button"
                  :disabled="syncing"
                >
                  <svg :class="['sync-icon', { spinning: syncing }]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <polyline points="1 20 1 14 7 14"></polyline>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                  </svg>
                  {{ syncing ? 'Syncing...' : 'Sync All' }}
                </button>
              </div>
            </div>
            <!-- Auto-sync row -->
            <div class="auto-sync-row">
              <div class="auto-sync-left">
                <span class="auto-sync-label">Auto-sync</span>
                <button
                  class="toggle-switch toggle-switch--small"
                  :class="{ on: autoSyncEnabled }"
                  @click="toggleAutoSync"
                  role="switch"
                  :aria-checked="autoSyncEnabled"
                >
                  <span class="toggle-knob" />
                </button>
              </div>
              <span class="last-synced-text">Last synced: {{ lastSyncedDisplay }}</span>
            </div>

            <!-- Add library controls -->
            <div class="add-library-row">
              <!-- Subscribe to GitHub repo -->
              <div v-if="authStatus.authenticated" class="subscribe-form">
                <input
                  v-model="newRepoUrl"
                  type="text"
                  class="repo-input"
                  placeholder="owner/repo or GitHub URL"
                  @keydown.enter="handleSubscribe"
                  :disabled="subscribing"
                />
                <button
                  @click="handleSubscribe"
                  class="subscribe-button"
                  :disabled="subscribing || !newRepoUrl.trim()"
                >
                  {{ subscribing ? 'Adding...' : 'Subscribe' }}
                </button>
              </div>
              <!-- Open local folder -->
              <button
                @click="handleOpenLocalFolder"
                class="open-folder-button"
                :disabled="subscribing"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                Open Folder
              </button>
            </div>

            <!-- Error message -->
            <p v-if="libraryError" class="library-error">{{ libraryError }}</p>

            <!-- Library list -->
            <div v-if="libraries.length > 0" class="library-list">
              <div v-for="lib in libraries" :key="lib.id" class="library-item">
                <div class="library-info">
                  <div class="library-name-row">
                    <span class="library-name">
                      <!-- Folder icon for local, GitHub icon for remote -->
                      <svg v-if="lib.type === 'local'" class="library-type-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                      </svg>
                      <svg v-else class="library-type-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                      </svg>
                      {{ lib.name }}
                    </span>
                    <span
                      v-if="lib.type === 'github' && (lib.permission === 'owner' || lib.permission === 'curator')"
                      class="library-role-badge"
                      :class="lib.permission"
                    >{{ lib.permission === 'owner' ? 'Owner' : 'Curator' }}</span>
                    <button
                      v-if="lib.manifest_path"
                      class="toggle-switch toggle-switch--small"
                      :class="{ on: lib.auto_sync === 1 }"
                      @click="handleToggleLibraryAutoSync(lib)"
                      role="switch"
                      :aria-checked="lib.auto_sync === 1"
                      :title="lib.auto_sync === 1 ? 'Disable auto-sync' : 'Enable auto-sync'"
                    >
                      <span class="toggle-knob" />
                    </button>
                  </div>
                  <span class="library-repo" :title="lib.github_repo">{{ lib.type === 'local' ? shortenPath(lib.github_repo) : lib.github_repo }}</span>
                  <span v-if="!lib.manifest_path" class="library-status not-initialized">
                    Not initialized
                  </span>
                  <span v-else-if="lib.last_synced_at" class="library-synced">
                    Last synced: {{ formatSyncTime(lib.last_synced_at) }}
                  </span>
                </div>
                <div class="library-actions">
                  <template v-if="!lib.manifest_path">
                    <button
                      @click="openInitModal(lib)"
                      class="library-action-btn init"
                      :disabled="initializing"
                      title="Initialize as SnipForge library"
                    >
                      Init
                    </button>
                  </template>
                  <template v-else>
                    <button
                      @click="handleSyncLibrary(lib.id)"
                      class="library-action-btn"
                      :disabled="syncing"
                      title="Sync"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"></polyline>
                        <polyline points="1 20 1 14 7 14"></polyline>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                      </svg>
                    </button>
                  </template>
                  <button
                    @click="handleRemoveLibrary(lib)"
                    class="library-action-btn danger"
                    :title="lib.type === 'local' ? 'Remove' : 'Unsubscribe'"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            <div v-else class="empty-libraries">
              <p>No libraries yet.</p>
              <p class="section-description">Open a local folder or subscribe to a GitHub repo.</p>
            </div>

            <!-- Sync result notification -->
            <div v-if="syncMessage" class="sync-message" :class="syncMessageType">
              {{ syncMessage }}
            </div>
          </div>
        </div>

        <!-- Tab 2: Command Management -->
        <div v-if="activeTab === 'management'" class="management-tab">
          <!-- Controls Section -->
          <div class="management-controls">
            <div class="controls-row">
              <!-- Left: Selection + Filter -->
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
                <button @click.stop="toggleManagementFilterDropdown" :class="['management-filter-button', { active: selectedManagementTags.length > 0 }]" title="Filter by tags">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
              </div>

              <div class="spacer"></div>

              <!-- Right: Actions -->
              <div class="action-buttons">
                <button
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
                  @click="handleImport"
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
                    <button class="export-dropdown-item" @click="handleExportBundle">
                      As Bundle (.json)
                    </button>
                    <button class="export-dropdown-item" @click="handleExportAsLibrary">
                      As Library (.zip)
                    </button>
                  </div>
                </div>
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

    <!-- Library Picker Modal -->
    <div v-if="libraryPicker.visible" class="init-modal-overlay" @click.self="closeLibraryPicker">
      <div class="init-modal" style="width: 420px;">
        <h3>Choose a Library</h3>
        <p class="init-modal-repo">This repo has {{ libraryPicker.libraries.length }} libraries</p>
        <div class="picker-list">
          <button
            v-for="lib in libraryPicker.libraries"
            :key="lib.manifestPath"
            class="picker-item"
            @click="handlePickLibrary(lib)"
          >
            <div class="picker-item-name">{{ lib.name }}</div>
            <div class="picker-item-meta">
              <span class="picker-item-path">{{ lib.path || '/' }}</span>
              <span class="picker-item-count">{{ lib.commandCount }} command{{ lib.commandCount !== 1 ? 's' : '' }}</span>
            </div>
            <div v-if="lib.description" class="picker-item-desc">{{ lib.description }}</div>
          </button>
        </div>
        <div class="init-modal-actions">
          <button @click="closeLibraryPicker" class="init-modal-cancel">Cancel</button>
        </div>
      </div>
    </div>

    <!-- Init Library Modal -->
    <div v-if="initModal.visible" class="init-modal-overlay" @click.self="closeInitModal">
      <div class="init-modal" @click="locationOpen = false">
        <h3>Initialize Library</h3>
        <p class="init-modal-repo">{{ initModal.repo }}</p>
        <div class="init-modal-field">
          <label>Name</label>
          <input
            v-model="initModal.name"
            type="text"
            class="init-modal-input"
            placeholder="My Team Commands"
            @keydown.enter="handleInitLibrary"
          />
        </div>
        <div class="init-modal-field">
          <label>Description</label>
          <input
            v-model="initModal.description"
            type="text"
            class="init-modal-input"
            placeholder="Optional description"
            @keydown.enter="handleInitLibrary"
          />
        </div>
        <div v-if="initModal.type !== 'local'" class="init-modal-field">
          <label>Location <span class="field-hint">(where to create .snipforge.json)</span></label>
          <div class="location-combobox" @click.stop>
            <div class="location-input-wrap">
              <input
                v-model="initModal.subpath"
                type="text"
                class="init-modal-input location-input"
                placeholder="repository root"
                @focus="handleLocationFocus"
              />
              <button
                type="button"
                class="location-chevron-btn"
                @click="locationOpen = !locationOpen"
                :disabled="initModal.foldersLoading && initModal.folders.length === 0"
              >
                <span class="chevron" :class="{ open: locationOpen }">&#9662;</span>
              </button>
            </div>
            <ul v-if="locationOpen && (initModal.folders.length > 0 || initModal.foldersLoading)" class="location-options">
              <li
                v-for="folder in initModal.folders"
                :key="folder"
                @click="selectFolder(folder)"
              >
                {{ folder }}
              </li>
              <li v-if="initModal.foldersLoading" class="loading-item">
                Loading folders...
              </li>
            </ul>
          </div>
        </div>
        <p v-if="initModal.error" class="init-modal-error">{{ initModal.error }}</p>
        <div class="init-modal-actions">
          <button @click="closeInitModal" class="init-modal-cancel">Cancel</button>
          <button
            @click="handleInitLibrary"
            class="init-modal-confirm"
            :disabled="initializing || !initModal.name.trim()"
          >
            {{ initializing ? 'Creating...' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
    <!-- Export as Library Modal -->
    <div v-if="exportLibraryModal.visible" class="init-modal-overlay" @click.self="closeExportLibraryModal">
      <div class="init-modal">
        <h3>Export as Library</h3>
        <p class="init-modal-repo">
          {{ exportLibraryModal.commandCount }} command{{ exportLibraryModal.commandCount !== 1 ? 's' : '' }} will be exported
        </p>
        <div class="init-modal-field">
          <label>Library Name</label>
          <input
            v-model="exportLibraryModal.name"
            type="text"
            class="init-modal-input"
            placeholder="My Commands"
            @keydown.enter="handleExportLibrary"
          />
        </div>
        <div class="init-modal-field">
          <label>Description</label>
          <input
            v-model="exportLibraryModal.description"
            type="text"
            class="init-modal-input"
            placeholder="Optional description"
            @keydown.enter="handleExportLibrary"
          />
        </div>
        <p v-if="exportLibraryModal.error" class="init-modal-error">{{ exportLibraryModal.error }}</p>
        <div class="init-modal-actions">
          <button @click="closeExportLibraryModal" class="init-modal-cancel">Cancel</button>
          <button
            @click="handleExportLibrary"
            class="init-modal-confirm"
            :disabled="exportLibraryModal.exporting || !exportLibraryModal.name.trim()"
          >
            {{ exportLibraryModal.exporting ? 'Exporting...' : 'Export' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { Download, Upload } from 'lucide-vue-next'
import { getAllTags } from '../utils/tags'
import { getInlineSuggestion } from '../utils/autocomplete'
import { useSettings } from '../composables/useSettings'
import CommandList from './CommandList.vue'
import TagSelector from './TagSelector.vue'
import type { Library, AuthStatus, UpdateStatus, DiscoveredLibrary } from '../../shared/types'

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
    source?: string
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
  'libraries-changed': []
}>()

// Tab state
type Tab = 'general' | 'connectors' | 'libraries' | 'management'
const activeTab = ref<Tab>('general')

// ── Settings ───────────────────────────────────────────────────
const { settings, updateSetting, loaded: settingsLoaded } = useSettings()

// ── Update Status ───────────────────────────────────────────────
type StatusWithBanner = UpdateStatus & { showBanner: boolean }
const updateStatus = ref<StatusWithBanner>({
  currentVersion: '',
  latestVersion: null,
  updateAvailable: false,
  releaseUrl: 'https://snipforge.dev',
  lastChecked: null,
  showBanner: false,
})
const updateChecking = ref(false)

async function loadUpdateStatus() {
  try {
    updateStatus.value = await (window.electronAPI as any).update.getStatus()
  } catch (e) {
    console.warn('[Settings] Failed to get update status:', e)
  }
}

async function manualCheckForUpdate() {
  updateChecking.value = true
  try {
    updateStatus.value = await (window.electronAPI as any).update.check()
  } catch (e) {
    console.warn('[Settings] Manual check failed:', e)
  }
  updateChecking.value = false
}

// ── Hotkey Picker State ────────────────────────────────────────
const currentHotkey = ref('CommandOrControl+Shift+Space')
const hotkeyListening = ref(false)
const hotkeyFeedback = ref('')
const hotkeyFeedbackType = ref<'success' | 'error'>('success')
let hotkeyFeedbackTimer: ReturnType<typeof setTimeout> | null = null

const isMac = window.electronAPI.platform === 'darwin'

function formatHotkeyDisplay(accelerator: string): string {
  if (!accelerator) return ''
  const parts = accelerator.split('+')
  const mapped = parts.map(part => {
    const lower = part.toLowerCase()
    if (isMac) {
      if (lower === 'commandorcontrol' || lower === 'cmdorctrl') return '\u2318'
      if (lower === 'command' || lower === 'cmd' || lower === 'meta') return '\u2318'
      if (lower === 'control' || lower === 'ctrl') return '\u2303'
      if (lower === 'alt' || lower === 'option') return '\u2325'
      if (lower === 'shift') return '\u21E7'
    } else {
      if (lower === 'commandorcontrol' || lower === 'cmdorctrl') return 'Ctrl'
      if (lower === 'command' || lower === 'cmd' || lower === 'meta') return 'Super'
      if (lower === 'control' || lower === 'ctrl') return 'Ctrl'
      if (lower === 'alt') return 'Alt'
      if (lower === 'shift') return 'Shift'
    }
    // Capitalize single keys
    if (part.length === 1) return part.toUpperCase()
    return part
  })
  return isMac ? mapped.join('') : mapped.join(' + ')
}

function startHotkeyCapture() {
  hotkeyListening.value = true
  hotkeyFeedback.value = ''
}

function cancelHotkeyCapture() {
  hotkeyListening.value = false
}

function captureHotkey(event: KeyboardEvent) {
  if (!hotkeyListening.value) return

  // Ignore bare modifier keys
  const modifierKeys = ['Control', 'Shift', 'Alt', 'Meta']
  if (modifierKeys.includes(event.key)) return

  event.preventDefault()
  event.stopPropagation()

  // Must have at least one modifier
  if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
    return
  }

  // Build Electron accelerator string
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('CommandOrControl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')

  // Map key to Electron accelerator key name
  let key = event.key
  if (key === ' ') key = 'Space'
  else if (key.length === 1) key = key.toUpperCase()
  else if (key === 'ArrowUp') key = 'Up'
  else if (key === 'ArrowDown') key = 'Down'
  else if (key === 'ArrowLeft') key = 'Left'
  else if (key === 'ArrowRight') key = 'Right'
  else if (key === 'Escape') { cancelHotkeyCapture(); return }

  parts.push(key)
  const accelerator = parts.join('+')

  hotkeyListening.value = false
  saveHotkey(accelerator)
}

async function saveHotkey(accelerator: string) {
  const result = await updateSetting('general.hotkey', accelerator)
  if (result.success) {
    currentHotkey.value = accelerator
    showHotkeyFeedback('Hotkey updated', 'success')
  } else {
    showHotkeyFeedback(result.error || 'Failed to set hotkey', 'error')
  }
}

function showHotkeyFeedback(message: string, type: 'success' | 'error') {
  hotkeyFeedback.value = message
  hotkeyFeedbackType.value = type
  if (hotkeyFeedbackTimer) clearTimeout(hotkeyFeedbackTimer)
  hotkeyFeedbackTimer = setTimeout(() => { hotkeyFeedback.value = '' }, 3000)
}

// ── Shortcut Remapping ─────────────────────────────────────────
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

const shortcutActions = [
  { id: 'navigate.up', label: 'Navigate up' },
  { id: 'navigate.down', label: 'Navigate down' },
  { id: 'action.copy', label: 'Copy command' },
  { id: 'action.copyTemplate', label: 'Copy template' },
  { id: 'action.new', label: 'New command' },
  { id: 'action.edit', label: 'Edit command' },
  { id: 'action.publish', label: 'Publish' },
  { id: 'action.bulkPublish', label: 'Bulk publish' },
  { id: 'action.unpublish', label: 'Unpublish' },
  { id: 'action.delete', label: 'Delete command' },
]

const currentShortcuts = computed(() => {
  const stored = settings.value['shortcuts'] as Record<string, string> | undefined
  return { ...DEFAULT_SHORTCUTS, ...stored }
})

const hasCustomShortcuts = computed(() => {
  const stored = settings.value['shortcuts'] as Record<string, string> | undefined
  if (!stored) return false
  return Object.entries(stored).some(([k, v]) => DEFAULT_SHORTCUTS[k] !== v)
})

const shortcutListeningAction = ref<string | null>(null)
const shortcutFeedback = ref('')
const shortcutFeedbackType = ref<'success' | 'error'>('success')
let shortcutFeedbackTimer: ReturnType<typeof setTimeout> | null = null

function formatShortcutDisplay(binding: string): string {
  if (!binding) return ''
  const parts = binding.split('+')
  const mapped = parts.map(part => {
    const lower = part.toLowerCase()
    if (isMac) {
      if (lower === 'cmdorctrl') return '\u2318'
      if (lower === 'shift') return '\u21E7'
      if (lower === 'alt') return '\u2325'
    } else {
      if (lower === 'cmdorctrl') return 'Ctrl'
      if (lower === 'shift') return 'Shift'
      if (lower === 'alt') return 'Alt'
    }
    // Special key display
    if (lower === 'arrowup') return '\u2191'
    if (lower === 'arrowdown') return '\u2193'
    if (lower === 'arrowleft') return '\u2190'
    if (lower === 'arrowright') return '\u2192'
    if (lower === 'backspace') return '\u232B'
    if (lower === 'space') return 'Space'
    if (lower === 'enter') return '\u21B5'
    if (lower === 'tab') return '\u21E5'
    // Single letter uppercase
    if (part.length === 1) return part.toUpperCase()
    return part
  })
  return isMac ? mapped.join('') : mapped.join(' + ')
}

function startShortcutCapture(actionId: string) {
  shortcutListeningAction.value = actionId
  shortcutFeedback.value = ''
}

function cancelShortcutCapture() {
  shortcutListeningAction.value = null
}

function captureShortcut(event: KeyboardEvent, actionId: string) {
  if (shortcutListeningAction.value !== actionId) return

  // Ignore bare modifier keys
  const modifierKeys = ['Control', 'Shift', 'Alt', 'Meta']
  if (modifierKeys.includes(event.key)) return

  event.preventDefault()
  event.stopPropagation()

  if (event.key === 'Escape') { cancelShortcutCapture(); return }

  // Build binding string
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) parts.push('CmdOrCtrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')

  let key = event.key
  if (key === ' ') key = 'Space'
  else if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') { /* keep as-is */ }
  else if (key.length === 1) key = key.toLowerCase()

  parts.push(key)
  const binding = parts.join('+')

  // Check for conflicts with other shortcuts
  const conflict = Object.entries(currentShortcuts.value).find(
    ([id, b]) => id !== actionId && b.toLowerCase() === binding.toLowerCase()
  )
  if (conflict) {
    const conflictLabel = shortcutActions.find(a => a.id === conflict[0])?.label || conflict[0]
    showShortcutFeedback(`Already used by "${conflictLabel}"`, 'error')
    shortcutListeningAction.value = null
    return
  }

  shortcutListeningAction.value = null
  saveShortcut(actionId, binding)
}

async function saveShortcut(actionId: string, binding: string) {
  const updated = { ...currentShortcuts.value, [actionId]: binding }
  const result = await updateSetting('shortcuts', updated)
  if (result.success) {
    showShortcutFeedback('Shortcut updated', 'success')
  } else {
    showShortcutFeedback(result.error || 'Failed to save', 'error')
  }
}

async function resetShortcuts() {
  const result = await updateSetting('shortcuts', { ...DEFAULT_SHORTCUTS })
  if (result.success) {
    showShortcutFeedback('Shortcuts reset to defaults', 'success')
  }
}

function showShortcutFeedback(message: string, type: 'success' | 'error') {
  shortcutFeedback.value = message
  shortcutFeedbackType.value = type
  if (shortcutFeedbackTimer) clearTimeout(shortcutFeedbackTimer)
  shortcutFeedbackTimer = setTimeout(() => { shortcutFeedback.value = '' }, 3000)
}

// ── GitHub Auth State ──────────────────────────────────────────
const authStatus = ref<AuthStatus>({ authenticated: false, user: null })
const deviceFlow = ref({
  active: false,
  loading: false,
  completed: false,
  userCode: '',
  verificationUri: '',
  deviceCode: '',
  interval: 5,
})
let pollTimer: ReturnType<typeof setTimeout> | null = null

// ── Library State ──────────────────────────────────────────────
const libraries = ref<Library[]>([])
const newRepoUrl = ref('')
const subscribing = ref(false)
const syncing = ref(false)
const libraryError = ref('')
const syncMessage = ref('')
const syncMessageType = ref<'success' | 'error'>('success')

// ── Library Picker State ──────────────────────────────────────
const libraryPicker = ref({
  visible: false,
  repoUrl: '',
  libraries: [] as DiscoveredLibrary[],
})

function closeLibraryPicker() {
  libraryPicker.value.visible = false
}

async function handlePickLibrary(lib: DiscoveredLibrary) {
  libraryPicker.value.visible = false
  subscribing.value = true
  libraryError.value = ''

  try {
    const result = await (window.electronAPI as any).library.subscribe(libraryPicker.value.repoUrl, lib.path)
    if (result.success) {
      newRepoUrl.value = ''
      await loadLibraries()
      syncMessage.value = `Subscribed to ${lib.name}! Added ${result.syncResult?.added || 0} commands.`
      syncMessageType.value = 'success'
      emit('libraries-changed')
      clearSyncMessage()
    } else {
      libraryError.value = result.error || 'Failed to subscribe'
    }
  } catch (e) {
    libraryError.value = (e as Error).message
  } finally {
    subscribing.value = false
  }
}

// ── Auto-Sync State ───────────────────────────────────────────
const autoSyncEnabled = ref(false)
const lastSyncedTimestamp = ref<string | null>(null)
const lastSyncedDisplay = ref('Never')
let lastSyncedTimer: ReturnType<typeof setInterval> | null = null
let autoSyncCleanup: (() => void) | null = null

// Compute relative time display from timestamp
function updateLastSyncedDisplay() {
  if (!lastSyncedTimestamp.value) {
    lastSyncedDisplay.value = 'Never'
    return
  }
  lastSyncedDisplay.value = formatSyncTime(lastSyncedTimestamp.value)
}

async function toggleAutoSync() {
  const newValue = !autoSyncEnabled.value
  const result = await updateSetting('library.autoSync', newValue)
  if (result.success) {
    autoSyncEnabled.value = newValue
  }
}

async function handleToggleLibraryAutoSync(lib: Library) {
  if (!autoSyncEnabled.value) return
  const newValue = lib.auto_sync !== 1
  try {
    const result = await (window.electronAPI as any).library.setAutoSync(lib.id, newValue)
    if (result.success) {
      lib.auto_sync = newValue ? 1 : 0
    }
  } catch { /* ignore */ }
}

function setupAutoSyncListener() {
  if (autoSyncCleanup) autoSyncCleanup()
  autoSyncCleanup = window.electronAPI.library.onAutoSyncResult((data) => {
    lastSyncedTimestamp.value = data.timestamp
    updateLastSyncedDisplay()
    // Reload libraries to reflect updated sync timestamps
    loadLibraries()
    // Show a brief sync message
    if (data.results && data.results.length > 0) {
      let totalAdded = 0, totalUpdated = 0, totalRemoved = 0
      for (const r of data.results) {
        totalAdded += r.result.added
        totalUpdated += r.result.updated
        totalRemoved += r.result.removed
      }
      const total = totalAdded + totalUpdated + totalRemoved
      if (total === 0) {
        syncMessage.value = 'Auto-sync: all up to date.'
      } else {
        const parts: string[] = []
        if (totalAdded) parts.push(`${totalAdded} added`)
        if (totalUpdated) parts.push(`${totalUpdated} updated`)
        if (totalRemoved) parts.push(`${totalRemoved} removed`)
        syncMessage.value = `Auto-sync: ${parts.join(', ')}`
      }
      syncMessageType.value = 'success'
      emit('libraries-changed')
      clearSyncMessage()
    }
  })
}

// Start periodic refresh of the relative time display
function startLastSyncedRefresh() {
  if (lastSyncedTimer) clearInterval(lastSyncedTimer)
  lastSyncedTimer = setInterval(updateLastSyncedDisplay, 30000)
}

onMounted(() => {
  setupAutoSyncListener()
  startLastSyncedRefresh()
  loadUpdateStatus()
})

onUnmounted(() => {
  if (autoSyncCleanup) autoSyncCleanup()
  if (lastSyncedTimer) clearInterval(lastSyncedTimer)
})

// ── Init Library State ─────────────────────────────────────────
const locationOpen = ref(false)
const locationDropdownRef = ref<HTMLElement>()
const initializing = ref(false)
const initModal = ref({
  visible: false,
  libraryId: 0,
  repo: '',
  type: 'github' as 'github' | 'local',
  name: '',
  description: '',
  subpath: '',
  error: '',
  folders: [] as string[],
  foldersLoading: false,
})

async function openInitModal(lib: Library) {
  const repoName = lib.github_repo.split('/').pop() || lib.github_repo
  const prettyName = repoName.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  initModal.value = {
    visible: true,
    libraryId: lib.id,
    repo: lib.type === 'local' ? shortenPath(lib.github_repo) : lib.github_repo,
    type: lib.type || 'github',
    name: prettyName,
    description: '',
    subpath: '',
    error: '',
    folders: [],
    foldersLoading: lib.type !== 'local',
  }

  // Only fetch folders for GitHub repos (local libraries always use root)
  if (lib.type !== 'local') {
    try {
      const result = await (window.electronAPI as any).library.getRepoFolders(lib.github_repo)
      if (result.success) {
        initModal.value.folders = result.folders
      }
    } catch { /* ignore — dropdown just shows root */ }
    initModal.value.foldersLoading = false
  }
}

let suppressFocusOpen = false

function selectFolder(folder: string) {
  initModal.value.subpath = folder
  locationOpen.value = false
  // Focus the input so user can keep typing, but suppress the @focus reopening
  suppressFocusOpen = true
  nextTick(() => {
    const input = document.querySelector('.location-input') as HTMLInputElement
    if (input) {
      input.focus()
      input.setSelectionRange(input.value.length, input.value.length)
    }
    setTimeout(() => { suppressFocusOpen = false }, 50)
  })
}

function handleLocationFocus() {
  if (!suppressFocusOpen) {
    locationOpen.value = true
  }
}

function closeInitModal() {
  initModal.value.visible = false
  initModal.value.error = ''
  locationOpen.value = false
}

async function handleInitLibrary() {
  if (!initModal.value.name.trim() || initializing.value) return
  initializing.value = true
  initModal.value.error = ''

  try {
    const subpath = initModal.value.subpath.trim().replace(/^\/+/, '').replace(/\/+$/, '')
    const result = await (window.electronAPI as any).library.init(
      initModal.value.libraryId,
      initModal.value.name.trim(),
      initModal.value.description.trim(),
      subpath || undefined
    )
    if (result.success) {
      closeInitModal()
      await loadLibraries()
      syncMessage.value = `Library initialized! ${result.syncResult?.added || 0} commands synced.`
      syncMessageType.value = 'success'
      emit('libraries-changed')
      clearSyncMessage()
    } else {
      initModal.value.error = result.error || 'Failed to initialize library'
    }
  } catch (e) {
    initModal.value.error = (e as Error).message
  } finally {
    initializing.value = false
  }
}

// ── Export as Library State ────────────────────────────────────
const exportLibraryModal = ref({
  visible: false,
  name: '',
  description: '',
  commandCount: 0,
  commandIds: [] as number[],
  error: '',
  exporting: false,
})

function openExportLibraryModal() {
  const ids = selectedCommandIds.value.length > 0
    ? [...selectedCommandIds.value]
    : []
  const count = ids.length > 0
    ? ids.length
    : props.commands.filter(c => c.source === 'local').length

  exportLibraryModal.value = {
    visible: true,
    name: '',
    description: '',
    commandCount: count,
    commandIds: ids,
    error: '',
    exporting: false,
  }
}

function closeExportLibraryModal() {
  exportLibraryModal.value.visible = false
  exportLibraryModal.value.error = ''
}

async function handleExportLibrary() {
  if (!exportLibraryModal.value.name.trim() || exportLibraryModal.value.exporting) return
  exportLibraryModal.value.exporting = true
  exportLibraryModal.value.error = ''

  try {
    const result = await window.electronAPI.library.exportZip(
      [...exportLibraryModal.value.commandIds],
      exportLibraryModal.value.name.trim(),
      exportLibraryModal.value.description.trim(),
    )
    if (result.success) {
      closeExportLibraryModal()
      syncMessage.value = `Exported ${result.commandCount} command${result.commandCount !== 1 ? 's' : ''} as library`
      syncMessageType.value = 'success'
      clearSyncMessage()
    } else if (result.error !== 'cancelled') {
      exportLibraryModal.value.error = result.error || 'Export failed'
    }
  } catch (e) {
    exportLibraryModal.value.error = (e as Error).message
  } finally {
    exportLibraryModal.value.exporting = false
  }
}

// Load auth status, libraries, and settings when modal opens
watch(() => props.show, async (visible) => {
  if (visible) {
    await loadAuthStatus()
    await loadLibraries()
    // Load current hotkey and auto-sync settings
    try {
      const all = await window.electronAPI.settings.getAll()
      if (all['general.hotkey'] && typeof all['general.hotkey'] === 'string') {
        currentHotkey.value = all['general.hotkey']
      }
      autoSyncEnabled.value = all['library.autoSync'] === true
    } catch { /* defaults are fine */ }
    // Derive last synced from library data
    deriveLastSynced()
  } else {
    // Clear device flow on close
    cancelLogin()
    hotkeyListening.value = false
  }
})

// Derive most recent sync timestamp from loaded libraries
function deriveLastSynced() {
  let latest: string | null = null
  for (const lib of libraries.value) {
    if (lib.last_synced_at) {
      if (!latest || lib.last_synced_at > latest) {
        latest = lib.last_synced_at
      }
    }
  }
  if (latest) {
    lastSyncedTimestamp.value = latest
  }
  updateLastSyncedDisplay()
}

async function loadAuthStatus() {
  try {
    authStatus.value = await (window.electronAPI as any).auth.getStatus()
  } catch {
    authStatus.value = { authenticated: false, user: null }
  }
}

async function loadLibraries() {
  try {
    libraries.value = await (window.electronAPI as any).library.getAll()
  } catch {
    libraries.value = []
  }
}

// ── Auth Functions ─────────────────────────────────────────────
async function startLogin() {
  deviceFlow.value.loading = true
  libraryError.value = ''
  try {
    const result = await (window.electronAPI as any).auth.login()
    if (!result.success) {
      libraryError.value = result.error || 'Failed to start login'
      return
    }
    deviceFlow.value = {
      active: true,
      loading: false,
      completed: false,
      userCode: result.user_code,
      verificationUri: result.verification_uri,
      deviceCode: result.device_code,
      interval: result.interval || 5,
    }
    startPolling()
  } catch (e) {
    libraryError.value = (e as Error).message
    deviceFlow.value.loading = false
  }
}

function startPolling() {
  if (pollTimer) clearTimeout(pollTimer)
  const interval = Math.max(deviceFlow.value.interval, 5) * 1000

  async function poll() {
    try {
      const result = await (window.electronAPI as any).auth.pollLogin(deviceFlow.value.deviceCode)
      if (result.success) {
        stopPolling()
        deviceFlow.value.completed = true
        deviceFlow.value.active = false
        authStatus.value = { authenticated: true, user: result.user || null }
        await loadLibraries()
        return
      } else if (result.error === 'expired_token') {
        stopPolling()
        cancelLogin()
        libraryError.value = 'Login code expired. Please try again.'
        return
      } else if (result.error === 'slow_down') {
        deviceFlow.value.interval += 5
      }
      // Schedule next poll with current interval (handles slow_down increases)
      const nextInterval = Math.max(deviceFlow.value.interval, 5) * 1000
      pollTimer = setTimeout(poll, nextInterval)
    } catch (e) {
      console.error('[Auth] Poll error:', e)
      // Retry after current interval on error
      const nextInterval = Math.max(deviceFlow.value.interval, 5) * 1000
      pollTimer = setTimeout(poll, nextInterval)
    }
  }

  // First poll after initial delay
  pollTimer = setTimeout(poll, interval)
}

function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer)
    pollTimer = null
  }
}

function cancelLogin() {
  stopPolling()
  deviceFlow.value = {
    active: false,
    loading: false,
    completed: false,
    userCode: '',
    verificationUri: '',
    deviceCode: '',
    interval: 5,
  }
}

async function copyDeviceCode() {
  try {
    await (window.electronAPI as any).clipboard.writeText(deviceFlow.value.userCode)
  } catch { /* ignore */ }
}

async function openVerificationUrl() {
  try {
    await (window.electronAPI as any).shell.openExternal(deviceFlow.value.verificationUri || 'https://github.com/login/device')
  } catch { /* ignore */ }
}

async function handleLogout() {
  try {
    await (window.electronAPI as any).auth.logout()
    authStatus.value = { authenticated: false, user: null }
  } catch { /* ignore */ }
}

// ── Library Functions ──────────────────────────────────────────
async function handleSubscribe() {
  if (!newRepoUrl.value.trim() || subscribing.value) return
  subscribing.value = true
  libraryError.value = ''
  syncMessage.value = ''

  try {
    const result = await (window.electronAPI as any).library.subscribe(newRepoUrl.value.trim())
    if (result.needsPick) {
      // Multiple libraries found — show picker
      libraryPicker.value = {
        visible: true,
        repoUrl: newRepoUrl.value.trim(),
        libraries: result.libraries,
      }
      return
    }
    if (result.success) {
      newRepoUrl.value = ''
      await loadLibraries()
      const lib = result.library
      const sr = result.syncResult
      if (!lib?.manifest_path) {
        syncMessage.value = `Subscribed to ${lib?.github_repo}. Click Init to set up the library.`
      } else {
        syncMessage.value = `Subscribed! Added ${sr?.added || 0} commands.`
      }
      syncMessageType.value = 'success'
      emit('libraries-changed')
      clearSyncMessage()
    } else {
      libraryError.value = result.error || 'Failed to subscribe'
    }
  } catch (e) {
    libraryError.value = (e as Error).message
  } finally {
    subscribing.value = false
  }
}

async function handleOpenLocalFolder() {
  subscribing.value = true
  libraryError.value = ''
  syncMessage.value = ''

  try {
    const result = await (window.electronAPI as any).library.openLocal()
    if (!result.success) {
      if (result.error !== 'cancelled') {
        libraryError.value = result.error || 'Failed to open folder'
      }
      return
    }
    await loadLibraries()
    const lib = result.library
    const sr = result.syncResult
    if (!lib?.manifest_path) {
      syncMessage.value = `Added folder. Click Init to create a library manifest.`
    } else {
      syncMessage.value = `Opened library! Added ${sr?.added || 0} commands.`
    }
    syncMessageType.value = 'success'
    emit('libraries-changed')
    clearSyncMessage()
  } catch (e) {
    libraryError.value = (e as Error).message
  } finally {
    subscribing.value = false
  }
}

function shortenPath(fullPath: string): string {
  // Show last 2 path segments for readability, e.g. "~/Projects/my-commands"
  const parts = fullPath.replace(/\/$/, '').split('/')
  if (parts.length <= 3) return fullPath
  const home = parts[0] === '' && parts[1] === 'Users' && parts.length > 2
  if (home) {
    return '~/' + parts.slice(3).join('/')
  }
  return '.../' + parts.slice(-2).join('/')
}

function handleRemoveLibrary(lib: Library) {
  if (lib.type === 'local') {
    handleUnsubscribe(lib.id, lib.name, true)
  } else {
    handleUnsubscribe(lib.id, lib.name, false)
  }
}

async function handleUnsubscribe(libraryId: number, name: string, isLocal = false) {
  const action = isLocal ? 'Remove' : 'Unsubscribe from'
  const detail = isLocal ? 'This will remove the commands from your list. The folder and its files will not be touched.' : 'This will remove all commands from this library.'
  if (!confirm(`${action} "${name}"? ${detail}`)) return
  try {
    const result = await (window.electronAPI as any).library.unsubscribe(libraryId)
    if (result.success) {
      await loadLibraries()
      syncMessage.value = `Unsubscribed from ${name}`
      syncMessageType.value = 'success'
      emit('libraries-changed')
      clearSyncMessage()
    } else {
      libraryError.value = result.error || 'Failed to unsubscribe'
    }
  } catch (e) {
    libraryError.value = (e as Error).message
  }
}

async function handleSyncLibrary(libraryId: number) {
  syncing.value = true
  syncMessage.value = ''
  libraryError.value = ''
  try {
    const result = await (window.electronAPI as any).library.sync(libraryId)
    if (result.success) {
      await loadLibraries()
      deriveLastSynced()
      const total = (result.added || 0) + (result.updated || 0) + (result.removed || 0)
      if (total === 0) {
        syncMessage.value = 'Already up to date.'
      } else {
        const parts: string[] = []
        if (result.added) parts.push(`${result.added} added`)
        if (result.updated) parts.push(`${result.updated} updated`)
        if (result.removed) parts.push(`${result.removed} removed`)
        syncMessage.value = `Synced: ${parts.join(', ')}`
      }
      syncMessageType.value = 'success'
      emit('libraries-changed')
      clearSyncMessage()
    } else {
      libraryError.value = result.error || 'Sync failed'
    }
  } catch (e) {
    libraryError.value = (e as Error).message
  } finally {
    syncing.value = false
  }
}

async function handleSyncAll() {
  syncing.value = true
  syncMessage.value = ''
  libraryError.value = ''
  try {
    const result = await (window.electronAPI as any).library.syncAll()
    if (result.success && result.results) {
      await loadLibraries()
      deriveLastSynced()
      let totalAdded = 0, totalUpdated = 0, totalRemoved = 0
      const errors: string[] = []
      for (const r of result.results) {
        totalAdded += r.result.added
        totalUpdated += r.result.updated
        totalRemoved += r.result.removed
        errors.push(...r.result.errors)
      }
      const total = totalAdded + totalUpdated + totalRemoved
      if (total === 0 && errors.length === 0) {
        syncMessage.value = 'All libraries up to date.'
      } else {
        const parts: string[] = []
        if (totalAdded) parts.push(`${totalAdded} added`)
        if (totalUpdated) parts.push(`${totalUpdated} updated`)
        if (totalRemoved) parts.push(`${totalRemoved} removed`)
        syncMessage.value = parts.length ? `Synced: ${parts.join(', ')}` : ''
        if (errors.length) {
          libraryError.value = errors.join('; ')
        }
      }
      syncMessageType.value = errors.length ? 'error' : 'success'
      emit('libraries-changed')
      clearSyncMessage()
    } else {
      libraryError.value = result.error || 'Sync failed'
    }
  } catch (e) {
    libraryError.value = (e as Error).message
  } finally {
    syncing.value = false
  }
}

function formatSyncTime(iso: string): string {
  try {
    const d = new Date(iso)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const minutes = Math.floor(diff / 60000)
    if (minutes < 1) return 'just now'
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  } catch {
    return iso
  }
}

let syncMessageTimer: ReturnType<typeof setTimeout> | null = null
function clearSyncMessage() {
  if (syncMessageTimer) clearTimeout(syncMessageTimer)
  syncMessageTimer = setTimeout(() => {
    syncMessage.value = ''
  }, 5000)
}

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
const showExportDropdown = ref(false)

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
  showExportDropdown.value = false
  locationOpen.value = false
}

// Bulk selection
const isAllSelected = computed(() =>
  filteredManagementCommands.value.length > 0 &&
  selectedCommandIds.value.length === filteredManagementCommands.value.length
)

const isIndeterminate = computed(() =>
  selectedCommandIds.value.length > 0 &&
  selectedCommandIds.value.length < filteredManagementCommands.value.length
)

const toggleSelectAll = () => {
  if (isAllSelected.value) {
    selectedCommandIds.value = []
  } else {
    selectedCommandIds.value = filteredManagementCommands.value.map(cmd => cmd.id)
  }
}

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

// Export dropdown
const toggleExportDropdown = () => {
  showExportDropdown.value = !showExportDropdown.value
}

const handleExportBundle = () => {
  showExportDropdown.value = false
  handleBulkExport()
}

const handleExportAsLibrary = () => {
  showExportDropdown.value = false
  openExportLibraryModal()
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

.selection-counter {
  font-size: 13px;
  color: var(--text-tertiary);
}

.selection-counter.muted {
  color: var(--text-placeholder);
}

.spacer {
  flex: 1;
}

.action-buttons {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
  align-items: center;
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

.delete-icon-button {
  background-color: var(--bg-surface);
  border: 1px solid var(--border);
  color: var(--text-tertiary);
  min-width: 32px;
  width: 32px;
  padding: 0;
}

.delete-icon-button:hover:not(:disabled) {
  background-color: var(--danger);
  border-color: var(--danger);
  color: var(--text-primary);
}

.delete-icon-button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 1px var(--accent);
}

.delete-icon-button:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
  opacity: 0.4;
}

.export-dropdown-wrap {
  position: relative;
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
  opacity: 0.4;
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
  transition: background 0.15s;
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
  min-height: 400px;
  display: flex;
  flex-direction: column;
}

/* General Tab */
.general-tab {
  flex: 1;
  overflow-y: auto;
}

.hotkey-picker {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.hotkey-display {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 200px;
  max-width: 320px;
  padding: 12px 20px;
  background: var(--bg-input);
  border: 1.5px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 18px;
  font-weight: 500;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
}

.hotkey-display:hover {
  border-color: var(--border-hover);
  background: var(--bg-surface);
}

.hotkey-display:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.hotkey-display.listening {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  animation: hotkey-pulse 1.5s ease-in-out infinite;
}

@keyframes hotkey-pulse {
  0%, 100% { box-shadow: 0 0 0 1px var(--accent); }
  50% { box-shadow: 0 0 0 3px rgba(236, 80, 2, 0.3); }
}

.hotkey-keys {
  font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
}

.hotkey-listening-text {
  color: var(--text-tertiary);
  font-size: 14px;
  font-weight: 400;
  letter-spacing: 0;
}

.hotkey-feedback {
  font-size: 13px;
  padding: 0;
  transition: opacity 0.2s;
}

.hotkey-feedback.success {
  color: #66bb6a;
}

.hotkey-feedback.error {
  color: #ef5350;
}

/* Toggle rows (display settings) */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
}

.toggle-row + .toggle-row {
  border-top: 1px solid var(--border);
}

.toggle-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toggle-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.toggle-desc {
  font-size: 12px;
  color: var(--text-tertiary);
}

/* Shortcuts table */
.shortcuts-table {
  display: flex;
  flex-direction: column;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 0;
}

.shortcut-row + .shortcut-row {
  border-top: 1px solid var(--border);
}

.shortcut-action {
  font-size: 13px;
  color: var(--text-secondary);
}

.shortcut-key {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 60px;
  padding: 4px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  outline: none;
  font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
}

.shortcut-key:hover {
  border-color: var(--border-hover);
  background: var(--bg-surface);
}

.shortcut-key:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
}

.shortcut-key.listening {
  border-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent);
  animation: hotkey-pulse 1.5s ease-in-out infinite;
}

.shortcut-listening-text {
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 400;
}

.shortcuts-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  min-height: 32px;
}

.shortcut-feedback {
  font-size: 13px;
  transition: opacity 0.2s;
}

.shortcut-feedback.success {
  color: #66bb6a;
}

.shortcut-feedback.error {
  color: #ef5350;
}

.reset-shortcuts-button {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-surface);
  color: var(--text-secondary);
  transition: all 0.2s;
  margin-left: auto;
}

.reset-shortcuts-button:hover:not(:disabled) {
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.reset-shortcuts-button:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Connectors Tab */
.connectors-tab {
  flex: 1;
  overflow-y: auto;
}

.connector-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.connector-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
  transition: border-color 0.2s;
}

.connector-row:hover {
  border-color: var(--border-hover);
}

.connector-icon {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: var(--bg-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text-secondary);
}

.connector-icon--avatar {
  border-radius: 50%;
  background: none;
  overflow: hidden;
}

.connector-avatar {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.connector-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.connector-name {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
}

.connector-status {
  color: var(--text-tertiary);
  font-size: 12px;
}

.connector-status.connected {
  color: var(--text-secondary);
}

.connector-action {
  flex-shrink: 0;
}

.connector-button {
  padding: 6px 14px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--border);
}

.connector-button.connect {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.connector-button.connect:hover:not(:disabled) {
  background: var(--accent-hover);
  border-color: var(--accent-hover);
}

.connector-button.connect:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.connector-button.disconnect {
  background: var(--bg-surface);
  color: var(--text-secondary);
}

.connector-button.disconnect:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--text-primary);
}

.connector-device-flow {
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 10px;
}

/* Libraries Tab */
.libraries-tab {
  flex: 1;
  overflow-y: auto;
}

/* Section header row */
.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.section-header-row h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.section-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Auto-sync row */
.auto-sync-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding: 0 2px;
}

.auto-sync-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.auto-sync-label {
  font-size: 12px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.last-synced-text {
  font-size: 11px;
  color: var(--text-muted);
}

/* Library name row with auto-sync toggle */
.library-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
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

.library-role-badge.owner {
  background: color-mix(in srgb, var(--accent) 20%, transparent);
  color: var(--accent);
}

.library-role-badge.curator {
  background: color-mix(in srgb, #3b82f6 20%, transparent);
  color: #6ba3f7;
}

.toggle-switch {
  position: relative;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  border: none;
  background: var(--border);
  cursor: pointer;
  padding: 0;
  transition: background 0.2s;
  flex-shrink: 0;
}

.toggle-switch.on {
  background: var(--accent);
}


.toggle-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--text-primary);
  transition: transform 0.2s;
  pointer-events: none;
}

.toggle-switch.on .toggle-knob {
  transform: translateX(16px);
}

/* Small toggle variant for per-library auto-sync */
.toggle-switch--small {
  width: 28px;
  height: 16px;
  border-radius: 8px;
}

.toggle-switch--small .toggle-knob {
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
}

.toggle-switch--small.on .toggle-knob {
  transform: translateX(12px);
}


/* GitHub Auth */
.auth-section {
  margin-top: 12px;
}

.github-login-button {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 20px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.github-login-button:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-hover);
}

.github-login-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Device Flow */
.device-flow-prompt {
  margin-top: 12px;
}

.device-flow-instruction {
  margin: 0 0 12px 0;
  color: var(--text-secondary);
  font-size: 14px;
}

.device-code-display {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.device-code {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 4px;
  color: var(--accent-light);
  background: var(--bg-input);
  padding: 12px 20px;
  border-radius: 8px;
  border: 1px solid var(--border);
  font-family: monospace;
}

.copy-code-button {
  width: 32px;
  height: 32px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.copy-code-button:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.verification-link-button {
  display: inline-block;
  padding: 8px 16px;
  background: var(--accent);
  color: var(--text-primary);
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  margin-bottom: 12px;
}

.verification-link-button:hover {
  background: var(--accent-hover);
}

.device-flow-status {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 13px;
  margin: 0 0 8px 0;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.cancel-auth-button {
  padding: 6px 12px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-tertiary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.cancel-auth-button:hover {
  background: var(--bg-surface);
  color: var(--text-primary);
}

/* Authenticated user */
.auth-user-info {
  margin-top: 12px;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-avatar {
  border-radius: 50%;
  border: 1px solid var(--border);
}

.user-details {
  display: flex;
  flex-direction: column;
  flex: 1;
}

.user-name {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
}

.user-login {
  color: var(--text-tertiary);
  font-size: 12px;
}

.logout-button {
  padding: 6px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.logout-button:hover {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--text-primary);
}

/* Library Subscriptions */
.sync-all-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.sync-all-button:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.sync-all-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.sync-icon {
  flex-shrink: 0;
}

.sync-icon.spinning {
  animation: spin 1s linear infinite;
}

.subscribe-form {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.repo-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
}

.repo-input:focus {
  outline: none;
  border-color: var(--accent);
}

.repo-input::placeholder {
  color: var(--text-muted);
}

.subscribe-button {
  padding: 8px 16px;
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
  white-space: nowrap;
}

.subscribe-button:hover:not(:disabled) {
  background: var(--accent-hover);
}

.subscribe-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.add-library-row {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.add-library-row .subscribe-form {
  flex: 1;
  margin-bottom: 0;
}

.open-folder-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;
}

.open-folder-button:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--border-hover);
}

.open-folder-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.library-type-icon {
  vertical-align: -1px;
  margin-right: 4px;
  opacity: 0.6;
}

.library-error {
  color: #ef5350;
  font-size: 13px;
  margin: 0 0 12px 0;
  padding: 8px 12px;
  background: rgba(239, 83, 80, 0.1);
  border-radius: 6px;
}

.library-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.library-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: border-color 0.2s;
}

.library-item:hover {
  border-color: var(--border-hover);
}

.library-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.library-name {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 500;
}

.library-repo {
  color: var(--text-tertiary);
  font-size: 12px;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.library-synced {
  color: var(--text-muted);
  font-size: 11px;
}

.library-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.library-action-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.library-action-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.library-action-btn.danger:hover:not(:disabled) {
  background: var(--danger);
  border-color: var(--danger);
  color: var(--text-primary);
}

.library-action-btn.init {
  width: auto;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent, #58a6ff);
  border-color: var(--accent, #58a6ff);
}

.library-action-btn.init:hover:not(:disabled) {
  background: var(--accent, #58a6ff);
  color: #fff;
}

.library-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.library-status.not-initialized {
  color: var(--text-tertiary);
  font-size: 12px;
  font-style: italic;
}

.empty-libraries {
  text-align: center;
  padding: 24px 16px;
  color: var(--text-tertiary);
  font-size: 14px;
}

.empty-libraries p {
  margin: 0 0 4px 0;
}

.sync-message {
  margin-top: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 13px;
}

.sync-message.success {
  color: #66bb6a;
  background: rgba(102, 187, 106, 0.1);
}

.sync-message.error {
  color: #ef5350;
  background: rgba(239, 83, 80, 0.1);
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

/* Init Library Modal */
.init-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1100;
}

.init-modal {
  background: var(--bg-surface, #1e1e1e);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 380px;
  max-width: 90vw;
}

.init-modal h3 {
  margin: 0 0 4px 0;
  color: var(--text-primary);
  font-size: 16px;
  font-weight: 600;
}

.init-modal-repo {
  margin: 0 0 16px 0;
  color: var(--text-tertiary);
  font-size: 13px;
  font-family: monospace;
}

.init-modal-field {
  margin-bottom: 12px;
}

.init-modal-field label {
  display: block;
  margin-bottom: 4px;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 500;
}

.field-hint {
  color: var(--text-tertiary);
  font-weight: 400;
}

.init-modal-input {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-input, #2a2a2a);
  color: var(--text-primary);
  font-size: 14px;
  box-sizing: border-box;
}

.init-modal-input:focus {
  outline: none;
  border-color: var(--accent, #58a6ff);
}

.location-combobox {
  position: relative;
}

.location-input-wrap {
  display: flex;
  align-items: stretch;
}

.location-input-wrap .location-input {
  flex: 1;
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
  border-right: none;
}

.location-input-wrap .location-input::placeholder {
  font-style: italic;
  color: var(--text-tertiary);
}

.location-chevron-btn {
  padding: 0 10px;
  border: 1px solid var(--border);
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;
  background: var(--bg-input, #2a2a2a);
  color: var(--text-tertiary);
  cursor: pointer;
  display: flex;
  align-items: center;
}

.location-chevron-btn:hover {
  color: var(--text-primary);
}

.location-chevron-btn:disabled {
  opacity: 0.5;
  cursor: wait;
}

.location-chevron-btn .chevron {
  font-size: 10px;
  transition: transform 0.15s;
}

.location-chevron-btn .chevron.open {
  transform: rotate(180deg);
}

.location-options {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--bg-surface, #1e1e1e);
  border: 1px solid var(--border);
  border-radius: 6px;
  list-style: none;
  padding: 4px 0;
  margin-bottom: 0;
  max-height: 180px;
  overflow-y: auto;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.location-options li {
  padding: 7px 12px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background-color 0.15s;
}

.location-options li:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.location-options li.loading-item {
  color: var(--text-tertiary);
  font-style: italic;
  cursor: default;
}

.init-modal-error {
  margin: 0 0 12px 0;
  color: var(--danger, #f85149);
  font-size: 13px;
}

.init-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.init-modal-cancel {
  padding: 6px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  cursor: pointer;
}

.init-modal-cancel:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.init-modal-confirm {
  padding: 6px 14px;
  border: 1px solid var(--accent, #58a6ff);
  border-radius: 6px;
  background: var(--accent, #58a6ff);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.init-modal-confirm:hover:not(:disabled) {
  opacity: 0.9;
}

.init-modal-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ── Library Picker ─────────────────────────────────────────── */
.picker-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 300px;
  overflow-y: auto;
}

.picker-item {
  display: block;
  width: 100%;
  text-align: left;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-input, #2a2a2a);
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.picker-item:hover {
  border-color: var(--accent, #58a6ff);
  background: var(--bg-hover);
}

.picker-item-name {
  font-size: 14px;
  font-weight: 500;
}

.picker-item-meta {
  display: flex;
  gap: 8px;
  margin-top: 2px;
  font-size: 12px;
  color: var(--text-tertiary);
}

.picker-item-path {
  font-family: monospace;
}

.picker-item-count {
  color: var(--text-muted);
}

.picker-item-desc {
  margin-top: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

/* ── Updates Section ────────────────────────────────────────── */
.update-compact-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.update-left {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
}

.update-version {
  color: var(--text-secondary);
}

.update-available {
  color: var(--accent);
  font-weight: 500;
}

.update-up-to-date {
  color: var(--text-muted);
}

.update-check-btn {
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  color: var(--text-secondary);
  font-size: 12px;
  padding: 4px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}

.update-check-btn:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--border-hover);
  color: var(--text-primary);
}

.update-check-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
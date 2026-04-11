/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface Window {
  // expose in the `electron/preload/index.ts`
  ipcRenderer: import('electron').IpcRenderer
  electronAPI: {
    database: {
      getAllCommands: () => Promise<any[]>
      updateCommand: (id: number, updates: any) => Promise<{ success: boolean; error?: string }>
      deleteCommand: (id: number) => Promise<{ success: boolean; error?: string }>
      addCommand: (command: any) => Promise<{ success: boolean; id?: number; error?: string }>
    }
    clipboard: {
      writeText: (text: string) => Promise<void>
      write: (data: { text: string; html?: string }) => Promise<void>
      readText: () => Promise<string>
    }
    dialog: {
      showInputDialog: (title: string, label: string, defaultValue?: string) => Promise<{ success: boolean; value: string | null }>
    }
    onWindowShown: (callback: () => void) => void
    onCommandsChanged: (callback: () => void) => () => void
    file: {
      saveDialog: (defaultFilename: string) => Promise<{ success: boolean; filePath: string | null }>
      openDialog: () => Promise<{ success: boolean; filePath: string | null }>
      writeFile: (filePath: string, content: string) => Promise<{ success: boolean; error?: string }>
      readFile: (filePath: string) => Promise<{ success: boolean; content?: string; error?: string }>
    }
    platform: string
    shell: {
      openExternal: (url: string) => Promise<void>
    }
    settings: {
      get: (key: string) => Promise<unknown>
      set: (key: string, value: unknown) => Promise<{ success: boolean; error?: string }>
      getAll: () => Promise<Record<string, unknown>>
    }
    window: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
      isMaximized: () => Promise<boolean>
      getPlatform: () => Promise<string>
    }
    auth: {
      login: () => Promise<{ success: boolean; user_code?: string; verification_uri?: string; device_code?: string; interval?: number; expires_in?: number; error?: string }>
      pollLogin: (deviceCode: string) => Promise<{ success: boolean; user?: any; error?: string }>
      logout: () => Promise<{ success: boolean }>
      getStatus: () => Promise<{ authenticated: boolean; user: any }>
    }
    library: {
      subscribe: (repoUrl: string) => Promise<{ success: boolean; library?: any; syncResult?: any; error?: string }>
      unsubscribe: (libraryId: number) => Promise<{ success: boolean; error?: string }>
      setAutoSync: (libraryId: number, enabled: boolean) => Promise<{ success: boolean; error?: string }>
      sync: (libraryId: number) => Promise<{ success: boolean; added?: number; updated?: number; removed?: number; errors?: string[]; error?: string }>
      syncAll: () => Promise<{ success: boolean; results?: any[]; error?: string }>
      getAll: () => Promise<any[]>
      getDefaultWritableLocalLibrary: () => Promise<{ success: boolean; library: any | null; error?: string }>
      setupDefaultWritableLocalLibrary: () => Promise<{ success: boolean; library?: any; syncResult?: any; cancelled?: boolean; error?: string }>
      browse: (repoUrl: string) => Promise<{ success: boolean; manifest?: any; commands?: any[]; error?: string }>
      openLocal: () => Promise<{ success: boolean; library?: any; syncResult?: any; error?: string }>
      init: (libraryId: number, name: string, description: string, subpath?: string) => Promise<{ success: boolean; library?: any; syncResult?: any; error?: string }>
      getRepoFolders: (repoUrl: string) => Promise<{ success: boolean; folders: string[]; error?: string }>
      publish: (libraryId: number, commandId: number) => Promise<{ success: boolean; path?: string; created?: boolean; error?: string }>
      unpublish: (libraryId: number, remotePath: string) => Promise<{ success: boolean; error?: string }>
      bulkPublish: (libraryId: number, commandIds: number[]) => Promise<{ success: boolean; results: import('../shared/types').BulkPublishResult[]; succeeded?: number; failed?: number; error?: string }>
      onBulkPublishProgress: (callback: (data: { result: import('../shared/types').BulkPublishResult; index: number; total: number }) => void) => () => void
      exportZip: (commandIds: number[], name: string, description: string) => Promise<{ success: boolean; path?: string; commandCount?: number; error?: string }>
      onAutoSyncResult: (callback: (data: { timestamp: string; results: Array<{ libraryId: number; name: string; result: { added: number; updated: number; removed: number; errors: string[] } }> }) => void) => () => void
    }
  }
}

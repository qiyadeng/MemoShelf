import { contextBridge, ipcRenderer } from "electron"
import type { Command, Library, SyncResult, AuthStatus, GitHubUser } from "../../shared/types"
//expose db methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // db methods
  database:{
    getAllCommands: (): Promise<Command[]> =>
      ipcRenderer.invoke('db:getAllCommands'),
    updateCommand: (id: number, updates: Partial<Command>): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('db:updateCommand', id, updates),
    deleteCommand: (id: number): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('db:deleteCommand', id),
    addCommand: (command: Omit<Command, 'id' | 'created_at' | 'updated_at'>): Promise<{ success: boolean; id?: number; error?: string }> =>
      ipcRenderer.invoke('db:addCommand', command)
},
  //clipboard methods
  clipboard : {
    writeText: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
    write: (data: { text: string, html?: string }) => ipcRenderer.invoke('clipboard:write', data),
    readText: (): Promise<string> => ipcRenderer.invoke('clipboard:readText')
  },
  //dialog methods
  dialog: {
    showInputDialog: (title: string, label: string, defaultValue?: string): Promise<{success: boolean, value: string| null}> =>
      ipcRenderer.invoke('dialog:showInputDialog', title, label, defaultValue)
  },
  // window events
  onWindowShown: (callback: () => void) => {
    ipcRenderer.on('window-shown', callback)
  },
  // file operations
  file: {
    saveDialog: (defaultFilename: string): Promise<{success: boolean, filePath: string | null}> =>
      ipcRenderer.invoke('file:saveDialog', defaultFilename),
    openDialog: (): Promise<{success: boolean, filePath: string | null}> =>
      ipcRenderer.invoke('file:openDialog'),
    writeFile: (filePath: string, content: string): Promise<{success: boolean, error?: string}> =>
      ipcRenderer.invoke('file:writeFile', filePath, content),
    readFile: (filePath: string): Promise<{success: boolean, content?: string, error?: string}> =>
      ipcRenderer.invoke('file:readFile', filePath)
  },
  //system info
  platform: process.platform,
  // shell methods
  shell: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('shell:openExternal', url)
  },
  // window control methods
  window: {
    minimize: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize: (): Promise<void> => ipcRenderer.invoke('window:maximize'),
    close: (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    getPlatform: (): Promise<string> => ipcRenderer.invoke('window:getPlatform')
  },
  // GitHub auth methods
  auth: {
    login: (): Promise<{ success: boolean; user_code?: string; verification_uri?: string; device_code?: string; interval?: number; expires_in?: number; error?: string }> =>
      ipcRenderer.invoke('auth:login'),
    pollLogin: (deviceCode: string): Promise<{ success: boolean; user?: GitHubUser; error?: string }> =>
      ipcRenderer.invoke('auth:pollLogin', deviceCode),
    logout: (): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('auth:logout'),
    getStatus: (): Promise<AuthStatus> =>
      ipcRenderer.invoke('auth:getStatus'),
  },
  // Library methods
  library: {
    subscribe: (repoUrl: string): Promise<{ success: boolean; library?: Library; syncResult?: SyncResult; error?: string }> =>
      ipcRenderer.invoke('library:subscribe', repoUrl),
    unsubscribe: (libraryId: number): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('library:unsubscribe', libraryId),
    sync: (libraryId: number): Promise<{ success: boolean; added?: number; updated?: number; removed?: number; errors?: string[]; error?: string }> =>
      ipcRenderer.invoke('library:sync', libraryId),
    syncAll: (): Promise<{ success: boolean; results?: Array<{ library: Library; result: SyncResult }>; error?: string }> =>
      ipcRenderer.invoke('library:syncAll'),
    getAll: (): Promise<Library[]> =>
      ipcRenderer.invoke('library:getAll'),
    browse: (repoUrl: string): Promise<{ success: boolean; manifest?: any; commands?: any[]; error?: string }> =>
      ipcRenderer.invoke('library:browse', repoUrl),
    init: (libraryId: number, name: string, description: string, subpath?: string): Promise<{ success: boolean; library?: Library; syncResult?: SyncResult; error?: string }> =>
      ipcRenderer.invoke('library:init', libraryId, name, description, subpath),
    getRepoFolders: (repoUrl: string): Promise<{ success: boolean; folders: string[]; error?: string }> =>
      ipcRenderer.invoke('library:getRepoFolders', repoUrl),
  }
})
// tell the compiler what's availible on the window object
declare global {
  interface Window {
    electronAPI: {
      database: {
        getAllCommands: () => Promise<Command[]>
        updateCommand: (id: number, updates: Partial<Command>) => Promise<{ success: boolean; error?: string }>
        deleteCommand: (id: number) => Promise<{ success: boolean; error?: string }>
        addCommand: (command: Omit<Command, 'id' | 'created_at' | 'updated_at'>) => Promise<{ success: boolean; id?: number; error?: string }>
      },
      clipboard: {
        writeText: (text: string) => Promise<void>,
        write: (data: { text: string, html?: string }) => Promise<void>,
        readText: () => Promise<string>
      },
      dialog: {
        showInputDialog: (title: string, label: string, defaultValue?: string) => Promise<{success: boolean, value: string | null}>
      },
      onWindowShown: (callback: () => void) => void,
      file: {
        saveDialog: (defaultFilename: string) => Promise<{success: boolean, filePath: string | null}>
        openDialog: () => Promise<{success: boolean, filePath: string | null}>
        writeFile: (filePath: string, content: string) => Promise<{success: boolean, error?: string}>
        readFile: (filePath: string) => Promise<{success: boolean, content?: string, error?: string}>
      },
      platform: string,
      shell: {
        openExternal: (url: string) => Promise<void>
      },
      window: {
        minimize: () => Promise<void>
        maximize: () => Promise<void>
        close: () => Promise<void>
        isMaximized: () => Promise<boolean>
        getPlatform: () => Promise<string>
      },
      auth: {
        login: () => Promise<{ success: boolean; user_code?: string; verification_uri?: string; device_code?: string; interval?: number; expires_in?: number; error?: string }>
        pollLogin: (deviceCode: string) => Promise<{ success: boolean; user?: GitHubUser; error?: string }>
        logout: () => Promise<{ success: boolean }>
        getStatus: () => Promise<AuthStatus>
      },
      library: {
        subscribe: (repoUrl: string) => Promise<{ success: boolean; library?: Library; syncResult?: SyncResult; error?: string }>
        unsubscribe: (libraryId: number) => Promise<{ success: boolean; error?: string }>
        sync: (libraryId: number) => Promise<{ success: boolean; added?: number; updated?: number; removed?: number; errors?: string[]; error?: string }>
        syncAll: () => Promise<{ success: boolean; results?: Array<{ library: Library; result: SyncResult }>; error?: string }>
        getAll: () => Promise<Library[]>
        browse: (repoUrl: string) => Promise<{ success: boolean; manifest?: any; commands?: any[]; error?: string }>
        init: (libraryId: number, name: string, description: string, subpath?: string) => Promise<{ success: boolean; library?: Library; syncResult?: SyncResult; error?: string }>
        getRepoFolders: (repoUrl: string) => Promise<{ success: boolean; folders: string[]; error?: string }>
      }
    }
  }
}

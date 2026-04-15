import { afterEach, describe, expect, it, vi } from 'vitest'

const exposeInMainWorld = vi.fn()
const on = vi.fn()
const removeListener = vi.fn()
const invoke = vi.fn()

vi.mock('electron', () => ({
    contextBridge: {
        exposeInMainWorld,
    },
    ipcRenderer: {
        on,
        removeListener,
        invoke,
    },
}))

afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
})

describe('preload event subscriptions', () => {
    it('returns a cleanup function for window-shown subscriptions', async () => {
        await import('../electron/preload/index')

        const exposedApi = exposeInMainWorld.mock.calls[0]?.[1]
        expect(exposedApi).toBeTruthy()

        const callback = vi.fn()
        const cleanup = exposedApi.onWindowShown(callback)

        expect(on).toHaveBeenCalledWith('window-shown', expect.any(Function))
        expect(typeof cleanup).toBe('function')

        cleanup()

        const listener = on.mock.calls[0]?.[1]
        expect(removeListener).toHaveBeenCalledWith('window-shown', listener)
    })

    it('exposes the library workflow API alongside the legacy subscribe alias', async () => {
        await import('../electron/preload/index')

        const exposedApi = exposeInMainWorld.mock.calls[0]?.[1]
        expect(exposedApi).toBeTruthy()

        await exposedApi.library.addWorkingCopyFromOrigin('https://github.com/org/repo', 'sub/path')
        await exposedApi.library.subscribe('https://github.com/org/repo', 'sub/path')
        await exposedApi.library.getWorkflowSummary(42)
        await exposedApi.library.fetchOrigin(42)
        await exposedApi.library.updateFromOrigin(42)
        await exposedApi.library.commitChanges(42, 'Save local edits')
        await exposedApi.library.pushChanges(42)
        await exposedApi.library.openPullRequest(42)

        expect(invoke).toHaveBeenCalledWith('library:addWorkingCopyFromOrigin', 'https://github.com/org/repo', 'sub/path')
        expect(invoke).toHaveBeenCalledWith('library:subscribe', 'https://github.com/org/repo', 'sub/path')
        expect(invoke).toHaveBeenCalledWith('library:getWorkflowSummary', 42)
        expect(invoke).toHaveBeenCalledWith('library:fetchOrigin', 42)
        expect(invoke).toHaveBeenCalledWith('library:updateFromOrigin', 42)
        expect(invoke).toHaveBeenCalledWith('library:commitChanges', 42, 'Save local edits')
        expect(invoke).toHaveBeenCalledWith('library:pushChanges', 42)
        expect(invoke).toHaveBeenCalledWith('library:openPullRequest', 42)
    })
})

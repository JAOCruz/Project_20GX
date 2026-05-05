import { contextBridge, ipcRenderer } from 'electron'

const api = {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (key: string, value: string) => ipcRenderer.invoke('set-config', key, value),
  scanReplays: (folderPath: string) => ipcRenderer.invoke('scan-replays', folderPath),
  cancelScan: () => ipcRenderer.invoke('cancel-scan'),
  indexCombos: (daysBack?: number) => ipcRenderer.invoke('index-combos', daysBack),
  getReplayWinner: (replayPath: string) => ipcRenderer.invoke('get-replay-winner', replayPath),
  openReplay: (replayPath: string, startFrame?: number) =>
    ipcRenderer.invoke('open-replay', replayPath, startFrame),
  getTrainingMods: () => ipcRenderer.invoke('get-training-mods'),
  setTrainingMod: (codeId: string, enabled: boolean) =>
    ipcRenderer.invoke('set-training-mod', codeId, enabled),
  getBookmarks: () => ipcRenderer.invoke('get-bookmarks'),
  addBookmark: (bookmark: any) => ipcRenderer.invoke('add-bookmark', bookmark),
  removeBookmark: (id: string) => ipcRenderer.invoke('remove-bookmark', id),
  clearBookmarks: () => ipcRenderer.invoke('clear-bookmarks'),
  playBookmarkQueue: () => ipcRenderer.invoke('play-bookmark-queue'),
  onScanProgress: (callback: (data: { current: number; total: number }) => void) => {
    const handler = (_: any, data: { current: number; total: number }) => callback(data)
    ipcRenderer.on('scan-progress', handler)
    return () => ipcRenderer.removeListener('scan-progress', handler)
  }
}

export type Api = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = api
}

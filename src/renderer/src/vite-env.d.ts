/// <reference types="vite/client" />

interface Window {
  electron: {
    selectFolder: () => Promise<string | null>
    selectFile: () => Promise<string | null>
    getConfig: () => Promise<{ dolphinPath: string; replayFolder: string; unclePunchPath: string }>
    setConfig: (key: string, value: string) => Promise<boolean>
    scanReplays: (folderPath: string) => Promise<{ replays: any[]; total: number; cancelled?: boolean }>
    cancelScan: () => Promise<boolean>
    indexCombos: (daysBack?: number) => Promise<{ indexed: number; skipped: number; total: number }>
    analyzeMissedOpportunities: (replayPath: string, startFrame: number, endFrame: number, playerIndex: number) => Promise<{ success: boolean; error?: string; opportunities: any[] }>
    getReplayWinner: (replayPath: string) => Promise<{ winnerPort: number | null }>
    openReplay: (replayPath: string, startFrame?: number) => Promise<{ success: boolean; error?: string; frameSeek?: boolean; fallback?: boolean }>
    getTrainingMods: () => Promise<{ available: boolean; error?: string; codes?: { id: string; name: string; enabled: boolean }[] }>
    setTrainingMod: (codeId: string, enabled: boolean) => Promise<{ success: boolean; error?: string }>
    getBookmarks: () => Promise<any[]>
    addBookmark: (bookmark: any) => Promise<{ success: boolean; bookmark?: any }>
    removeBookmark: (id: string) => Promise<{ success: boolean }>
    clearBookmarks: () => Promise<{ success: boolean }>
    playBookmarkQueue: () => Promise<{ success: boolean; error?: string }>
    launchUnclePunch: () => Promise<{ success: boolean; error?: string }>
    onScanProgress: (callback: (data: { current: number; total: number }) => void) => () => void
  }
}

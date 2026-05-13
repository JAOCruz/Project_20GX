import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'

// Disable GPU acceleration to prevent black screen issues on some systems
app.disableHardwareAcceleration()
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { SlippiGame } from '@slippi/slippi-js'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import { analyzeMissedOpportunities } from './analyzer'

const store = new Store()

// --- Cache ---
const CACHE_FILE = join(app.getPath('userData'), 'replay-cache-v2.json')
const CACHE_VERSION = 4

interface CacheEntry {
  mtimeMs: number
  version: number
  data: any
}

function loadCache(): Record<string, CacheEntry> {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = fs.readFileSync(CACHE_FILE, 'utf-8')
      return JSON.parse(raw)
    }
  } catch (e) {
    console.error('Cache load failed:', e)
  }
  return {}
}

function saveCache(cache: Record<string, CacheEntry>) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache))
  } catch (e) {
    console.error('Cache save failed:', e)
  }
}

// --- Dolphin / Slippi Playback Helpers ---

interface TrainingCodeDef {
  id: string
  name: string
  definition: string[]
}

const TRAINING_CODES: TrainingCodeDef[] = [
  {
    id: 'actionable-green',
    name: 'Turn Green When Actionable',
    definition: [
      'C20CC818 00000011',
      '3CE08048 80E79D30',
      '54E7443E 2C070208',
      '40820018 80EDB61C',
      '88E70000 891F000C',
      '7C074000 40820058',
      '48000049 7CA802A6',
      'C0250000 D03F04BC',
      'C0250004 D03F04C4',
      '38600000 907F04C0',
      '907F04B8 907F04C8',
      '907F04CC 907F04D0',
      '907F04D4 38600001',
      '889F0504 50643E30',
      '989F0504 48000010',
      '4E800021 437F0000',
      '43340000 80010024',
      '60000000 00000000',
      'C208A478 00000011',
      '3CE08048 80E79D30',
      '54E7443E 2C070208',
      '40820018 80EDB61C',
      '88E70000 891F000C',
      '7C074000 40820058',
      '48000049 7CA802A6',
      'C0250000 D03F04BC',
      'C0250004 D03F04C4',
      '38600000 907F04C0',
      '907F04B8 907F04C8',
      '907F04CC 907F04D0',
      '907F04D4 38600001',
      '889F0504 50643E30',
      '989F0504 48000010',
      '4E800021 437F0000',
      '43340000 8001002C',
      '60000000 00000000',
    ],
  },
  {
    id: 'lcancel-red',
    name: 'Flash Red on Unsuccessful L-Cancel',
    definition: [
      'C208D690 00000003',
      '88A5067F 2C050007',
      '4180000C 39E000D4',
      '99E30564 00000000',
      'C20C0148 0000000C',
      '387F0488 89FE0564',
      '2C0F00D4 41820008',
      '4800004C 39E00091',
      '99FE0564 3DE0437F',
      '91FE0518 3DE0C200',
      '91FE0524 3DE00000',
      '91FE051C 91FE0520',
      '91FE0528 91FE052C',
      '91FE0530 3DE0C280',
      '91FE0534 3DE0800C',
      '61EF0150 7DE903A6',
      '4E800420 00000000',
    ],
  },
  {
    id: 'iasa-yellow',
    name: 'Yellow Color Overlay During IASA Frames',
    definition: [
      'C2071960 00000007',
      '98032218 98030504',
      '3C00437F 900304B8',
      '900304BC 900304C4',
      '38000000 900304C0',
      '900304C8 900304CC',
      '900304D0 900304D4',
      '60000000 00000000',
    ],
  },
  {
    id: 'fastfall-cyan',
    name: 'Turn Cyan when Fastfall is Available',
    definition: [
      'C207D554 00000009',
      '88030504 2C000091',
      '41A20038 3C00C200',
      '900304BC 900304C0',
      '900304C4 38000000',
      '900304B8 900304C8',
      '900304CC 900304D0',
      '3C00C280 900304D4',
      '38000091 98030504',
      'C0230624 00000000',
    ],
  },
]

/** Find the actual Slippi Playback Dolphin binary from launcher path */
function findPlaybackDolphin(launcherPath: string): string | null {
  // If user already selected the playback Dolphin directly
  const lower = launcherPath.toLowerCase()
  if (lower.includes('slippi dolphin')) {
    return launcherPath
  }

  if (process.platform === 'darwin') {
    const home = process.env.HOME
    // Slippi Launcher downloads playback Dolphin to Application Support
    const appSupportPath = path.join(
      home!,
      'Library/Application Support/Slippi Launcher/playback/Slippi Dolphin.app'
    )
    if (fs.existsSync(appSupportPath)) return appSupportPath

    // Try inside launcher bundle (unlikely but possible)
    const bundlePath = path.join(launcherPath, 'Contents/Resources/Slippi Dolphin.app')
    if (fs.existsSync(bundlePath)) return bundlePath
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    const winPath = path.join(appData!, 'Slippi Launcher/playback/Slippi Dolphin.exe')
    if (fs.existsSync(winPath)) return winPath

    // Maybe they selected the playback exe directly
    if (lower.endsWith('.exe')) return launcherPath
  }

  return null
}

/** Return all candidate GALE01.ini / GALE01r2.ini paths for the current platform */
function getGale01IniPaths(dolphinPath: string): string[] {
  if (process.platform === 'darwin') {
    const home = process.env.HOME
    const bases = [
      path.join(home!, 'Library/Application Support/Slippi Launcher/playback/User/GameSettings'),
      path.join(home!, 'Library/Application Support/Dolphin/User/GameSettings'),
      path.join(home!, 'Library/Application Support/Slippi Dolphin/User/GameSettings'),
    ]
    const result: string[] = []
    for (const base of bases) {
      // Slippi often uses GALE01r2.ini for Melee 1.02, check that first
      result.push(path.join(base, 'GALE01r2.ini'))
      result.push(path.join(base, 'GALE01.ini'))
    }
    return result
  } else if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    const bases = [
      path.join(appData!, 'Slippi Launcher/playback/User/GameSettings'),
      path.join(path.dirname(dolphinPath), 'User/GameSettings'),
    ]
    const result: string[] = []
    for (const base of bases) {
      result.push(path.join(base, 'GALE01r2.ini'))
      result.push(path.join(base, 'GALE01.ini'))
    }
    return result
  }
  return []
}

/** Find the first existing GALE01.ini / GALE01r2.ini path */
function findGale01Ini(dolphinPath: string): string | null {
  for (const p of getGale01IniPaths(dolphinPath)) {
    if (fs.existsSync(p)) return p
  }
  return null
}

/** Write a Slippi communication JSON file for frame-seeking playback */
function createSlippiCommFile(replayPath: string, startFrame?: number, endFrame?: number): string {
  const tempDir = path.join(app.getPath('temp'), 'ssbm-coach')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  const commPath = path.join(tempDir, 'current-replay.json')
  const data: Record<string, any> = {
    mode: 'normal',
    replay: replayPath,
    commandId: String(Date.now())
  }

  if (startFrame !== undefined) {
    // Start ~2 seconds before the combo so you see the setup
    const adjustedFrame = Math.max(-123, Math.floor(startFrame) - 120)
    data.startFrame = adjustedFrame
  }

  if (typeof endFrame === 'number' && !isNaN(endFrame)) {
    // Stop ~2 seconds after the combo ends
    data.endFrame = Math.floor(endFrame) + 120
  }

  fs.writeFileSync(commPath, JSON.stringify(data, null, 2))
  return commPath
}

/** Parse GALE01.ini and return currently enabled training codes */
function getEnabledTrainingCodes(iniPath: string): string[] {
  try {
    if (!fs.existsSync(iniPath)) return []
    const content = fs.readFileSync(iniPath, 'utf-8')
    const lines = content.split(/\r?\n/)
    const enabled: string[] = []
    let inEnabledSection = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed === '[Gecko_Enabled]') {
        inEnabledSection = true
        continue
      }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inEnabledSection = false
        continue
      }
      if (inEnabledSection && trimmed) {
        // Check if this is one of our known codes
        const codeName = trimmed.replace(/^\$/, '')
        const known = TRAINING_CODES.find((c) => c.name === codeName)
        if (known) {
          enabled.push(known.id)
        }
      }
    }
    return enabled
  } catch (e) {
    console.error('Failed to parse GALE01.ini:', e)
    return []
  }
}

/** Check if a code definition already exists in the [Gecko] section */
function codeDefinitionExists(lines: string[], codeName: string): boolean {
  let inGeckoSection = false
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === '[Gecko]') {
      inGeckoSection = true
      continue
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      inGeckoSection = false
      continue
    }
    if (inGeckoSection && trimmed.startsWith('$')) {
      const name = trimmed.replace(/^\$/, '').trim()
      if (name === codeName) return true
    }
  }
  return false
}

/** Inject a code definition into the [Gecko] section if missing */
function injectCodeDefinition(lines: string[], codeDef: TrainingCodeDef): void {
  if (codeDefinitionExists(lines, codeDef.name)) return

  // Find [Gecko] section
  let geckoIndex = lines.findIndex((l) => l.trim() === '[Gecko]')
  if (geckoIndex === -1) {
    // No [Gecko] section — prepend one
    lines.unshift('[Gecko]')
    geckoIndex = 0
  }

  // Find end of [Gecko] section (next section or end of file)
  let insertIndex = geckoIndex + 1
  for (let i = geckoIndex + 1; i < lines.length; i++) {
    const trimmed = lines[i].trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) break
    insertIndex = i + 1
  }

  // Insert blank line + code header + definition lines
  const block = ['', '$' + codeDef.name, ...codeDef.definition]
  lines.splice(insertIndex, 0, ...block)
}

/** Apply a single code toggle to one GALE01.ini file */
function applyCodeToggleToFile(iniPath: string, codeDef: TrainingCodeDef, enabled: boolean): boolean {
  try {
    if (!fs.existsSync(iniPath)) {
      return false
    }
    const content = fs.readFileSync(iniPath, 'utf-8')
    const lines = content.split(/\r?\n/)

    // Ensure code definition exists in [Gecko] before enabling
    if (enabled) {
      injectCodeDefinition(lines, codeDef)
    }

    let inEnabledSection = false
    let enabledSectionIndex = -1
    let codeLineIndex = -1

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim()
      if (trimmed === '[Gecko_Enabled]') {
        inEnabledSection = true
        enabledSectionIndex = i
        continue
      }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        inEnabledSection = false
        continue
      }
      if (inEnabledSection) {
        const lineName = trimmed.replace(/^\$/, '')
        if (lineName === codeDef.name) {
          codeLineIndex = i
        }
      }
    }

    if (enabled) {
      if (codeLineIndex === -1) {
        if (enabledSectionIndex === -1) {
          lines.push('')
          lines.push('[Gecko_Enabled]')
          lines.push('$' + codeDef.name)
        } else {
          lines.splice(enabledSectionIndex + 1, 0, '$' + codeDef.name)
        }
      }
    } else {
      if (codeLineIndex !== -1) {
        lines.splice(codeLineIndex, 1)
      }
    }

    // Only backup the ORIGINAL file once — never overwrite backup with already-modified content
    const backupPath = iniPath + '.backup'
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, content)
    }

    fs.writeFileSync(iniPath, lines.join('\n'))
    return true
  } catch (e) {
    console.error('Failed to toggle training code in', iniPath, e)
    return false
  }
}

/** Toggle a training code on/off in the ONE existing GALE01.ini / GALE01r2.ini file */
function setTrainingCodeEnabled(dolphinPath: string, codeId: string, enabled: boolean): boolean {
  const codeDef = TRAINING_CODES.find((c) => c.id === codeId)
  if (!codeDef) return false

  const iniPath = findGale01Ini(dolphinPath)
  if (!iniPath) return false

  return applyCodeToggleToFile(iniPath, codeDef, enabled)
}

let cancelScanFlag = false

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'followWindow',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// IPC Handlers
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openFile']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('get-config', () => ({
  dolphinPath: store.get('dolphinPath', ''),
  replayFolder: store.get('replayFolder', ''),
  unclePunchPath: store.get('unclePunchPath', '')
}))

ipcMain.handle('set-config', (_, key: string, value: string) => {
  store.set(key, value)
  return true
})

ipcMain.handle('cancel-scan', () => {
  cancelScanFlag = true
  return true
})

function findSlpFiles(dir: string): string[] {
  const results: string[] = []
  try {
    const list = fs.readdirSync(dir)
    for (const file of list) {
      const fullPath = path.join(dir, file)
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) {
        results.push(...findSlpFiles(fullPath))
      } else if (file.endsWith('.slp')) {
        results.push(fullPath)
      }
    }
  } catch (e) {
    console.error('Error reading dir:', dir, e)
  }
  return results
}

function getMonthLabel(rootDir: string, filePath: string): string | null {
  const relative = path.relative(rootDir, filePath)
  const firstFolder = relative.split(path.sep)[0]
  if (/^\d{4}-\d{2}$/.test(firstFolder)) {
    return firstFolder
  }
  return null
}

function sendProgress(current: number, total: number) {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    win.webContents.send('scan-progress', { current, total })
  }
}

ipcMain.handle('scan-replays', async (event, folderPath: string) => {
  cancelScanFlag = false
  const files = findSlpFiles(folderPath)
  const cache = loadCache()
  const newCache: Record<string, CacheEntry> = {}
  const replays: any[] = []

  const CONCURRENCY = 16
  const PROGRESS_INTERVAL = 50

  // Process files in parallel batches for much faster scanning
  for (let i = 0; i < files.length; i += CONCURRENCY) {
    if (cancelScanFlag) break

    const batch = files.slice(i, i + CONCURRENCY)

    // Send progress update
    if (i % PROGRESS_INTERVAL === 0 || i + CONCURRENCY >= files.length) {
      sendProgress(Math.min(i + CONCURRENCY, files.length), files.length)
    }

    const results = await Promise.all(
      batch.map(async (filePath) => {
        try {
          const stat = fs.statSync(filePath)
          const cached = cache[filePath]

          // Use cache if file hasn't changed AND cache version matches
          if (cached && cached.mtimeMs === stat.mtimeMs && cached.version === CACHE_VERSION) {
            return { type: 'cached' as const, filePath, data: cached.data, entry: cached }
          }

          const game = new SlippiGame(filePath)
          const settings = game.getSettings()
          const metadata = game.getMetadata()

          if (!settings || !metadata) return null

          const data = {
            path: filePath,
            fileName: path.basename(filePath),
            date: metadata.startAt,
            lastFrame: metadata.lastFrame,
            stageId: settings.stageId,
            isTeams: settings.isTeams,
            winnerPort: null as number | null,
            month: getMonthLabel(folderPath, filePath),
            combos: null as any[] | null, // indexed separately for performance
            players: settings.players.map((p: any) => ({
              port: p.port,
              characterId: p.characterId,
              characterColor: p.characterColor,
              teamId: p.teamId,
              connectCode: p.connectCode,
              displayName: p.displayName,
              nametag: p.nametag
            }))
          }

          return { type: 'fresh' as const, filePath, data, mtimeMs: stat.mtimeMs }
        } catch (e) {
          console.error('Parse error:', filePath, e)
          return null
        }
      })
    )

    for (const result of results) {
      if (!result) continue
      if (result.type === 'cached') {
        replays.push(result.data)
        newCache[result.filePath] = result.entry
      } else {
        replays.push(result.data)
        newCache[result.filePath] = { mtimeMs: result.mtimeMs, version: CACHE_VERSION, data: result.data }
      }
    }

    // Yield to event loop between batches
    await new Promise((resolve) => setImmediate(resolve))
  }

  saveCache(newCache)
  sendProgress(files.length, files.length)
  return { replays, total: files.length, cancelled: cancelScanFlag }
})

ipcMain.handle('index-combos', async (_, daysBack: number = 0) => {
  const cache = loadCache()
  let files = Object.keys(cache)

  // Filter to recent games if requested
  const cutoffDate = daysBack > 0 ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000) : null

  if (cutoffDate) {
    files = files.filter((fp) => {
      const entry = cache[fp]
      if (!entry?.data?.date) return false
      try {
        return new Date(entry.data.date) >= cutoffDate
      } catch {
        return false
      }
    })
  }

  // Sort by date descending (newest first) so user sees recent results ASAP
  files.sort((a, b) => {
    const da = cache[a]?.data?.date ? new Date(cache[a].data.date).getTime() : 0
    const db = cache[b]?.data?.date ? new Date(cache[b].data.date).getTime() : 0
    return db - da
  })

  let indexed = 0
  let skipped = 0
  const BATCH_SIZE = 50

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i]
    const entry = cache[filePath]

    if (!entry || entry.data.combos !== null && entry.version === CACHE_VERSION) {
      skipped++
      continue
    }

    try {
      const game = new SlippiGame(filePath)
      const settings = game.getSettings()
      const metadata = game.getMetadata()
      const stats = game.getStats()
      const latestFrame = game.getLatestFrame()

      // --- Winner detection (only possible during deep index) ---
      let winnerPort: number | null = null
      if (latestFrame && settings?.players) {
        let maxStocks = -1
        let minPercent = Infinity
        for (const p of settings.players) {
          const framePlayer = latestFrame.players[p.playerIndex]
          if (framePlayer?.post) {
            const stocks = framePlayer.post.stocksRemaining
            const percent = framePlayer.post.percent ?? 0
            if (stocks > maxStocks || (stocks === maxStocks && percent < minPercent)) {
              maxStocks = stocks
              minPercent = percent
              winnerPort = p.port
            }
          }
        }
      }
      entry.data.winnerPort = winnerPort

      // --- L-cancel stats per player ---
      if (stats?.actionCounts && settings?.players) {
        entry.data.lCancelStats = stats.actionCounts.map((ac: any) => {
          const player = settings.players.find((p: any) => p.playerIndex === ac.playerIndex)
          return {
            playerIndex: ac.playerIndex,
            port: player?.port,
            characterId: player?.characterId,
            success: ac.lCancelCount?.success || 0,
            fail: ac.lCancelCount?.fail || 0,
            attackCounts: ac.attackCount || {}
          }
        })
      }

      if (stats?.conversions && settings && metadata) {
        entry.data.combos = stats.conversions.map((c: any) => {
          // In slippi-js, conversion.playerIndex is the VICTIM (the one getting hit)
          // and moves[0].playerIndex / lastHitBy is the AGGRESSOR (the one landing hits)
          const victimIndex = c.playerIndex
          const aggressorIndex = c.moves[0]?.playerIndex ?? c.lastHitBy ?? settings.players.find((p: any) => p.playerIndex !== victimIndex)?.playerIndex

          const victim = settings.players.find((p: any) => p.playerIndex === victimIndex)
          const aggressor = settings.players.find((p: any) => p.playerIndex === aggressorIndex)

          const lastMoveId = c.moves[c.moves.length - 1]?.moveId
          const aerialMoves = [13, 14, 15, 16, 17] // Nair, Fair, Bair, Uair, Dair
          const isAerialKill = c.didKill && aerialMoves.includes(lastMoveId)

          let category = 'combo'
          if (c.didKill && isAerialKill) category = 'edgeguard'
          else if (c.didKill && c.openingType === 'counter-attack') category = 'punish-kill'
          else if (c.didKill) category = 'kill'
          else if (c.openingType === 'counter-attack') category = 'punish'
          else if (c.openingType === 'neutral-win' && c.damage < 25) category = 'opening'
          else if (c.openingType === 'trade') category = 'trade'

          return {
            startFrame: c.startFrame,
            endFrame: c.endFrame,
            playerIndex: aggressorIndex,
            playerCharacter: aggressor?.characterId,
            opponentCharacter: victim?.characterId,
            opponentPort: victim?.port,
            startPercent: c.startPercent,
            endPercent: c.endPercent,
            damage: c.endPercent - c.startPercent,
            didKill: c.didKill,
            openingType: c.openingType || 'unknown',
            category,
            moves: c.moves.map((m: any) => ({
              frame: m.frame,
              moveId: m.moveId,
              hitCount: m.hitCount,
              damage: m.damage
            })),
            stageId: settings.stageId,
            date: metadata.startAt,
            month: getMonthLabel(filePath, filePath),
            path: filePath
          }
        })
      } else {
        entry.data.combos = []
        entry.data.lCancelStats = []
      }

      indexed++
    } catch (e) {
      console.error('Combo indexing failed:', filePath, e)
      entry.data.combos = []
      entry.data.lCancelStats = []
    }

    // Progress update
    if (i % 10 === 0 || i === files.length - 1) {
      sendProgress(i + 1, files.length)
    }

    // Yield to event loop
    if (i > 0 && i % BATCH_SIZE === 0) {
      await new Promise((resolve) => setImmediate(resolve))
    }
  }

  saveCache(cache)
  sendProgress(files.length, files.length)
  return { indexed, skipped, total: files.length }
})

ipcMain.handle('analyze-missed-opportunities', async (_, replayPath: string, startFrame: number, endFrame: number, playerIndex: number) => {
  try {
    const game = new SlippiGame(replayPath)
    const opportunities = analyzeMissedOpportunities(game, startFrame, endFrame, playerIndex)
    return { success: true, opportunities }
  } catch (e) {
    console.error('Analyzer failed:', e)
    return { success: false, error: String(e), opportunities: [] }
  }
})

ipcMain.handle('get-replay-winner', async (_, replayPath: string) => {
  try {
    const game = new SlippiGame(replayPath)
    const settings = game.getSettings()
    const latestFrame = game.getLatestFrame()

    if (!latestFrame || !settings?.players) return { winnerPort: null }

    let winnerPort: number | null = null
    let maxStocks = -1
    let minPercent = Infinity

    for (const p of settings.players) {
      const framePlayer = latestFrame.players[p.playerIndex]
      if (framePlayer?.post) {
        const stocks = framePlayer.post.stocksRemaining
        const percent = framePlayer.post.percent ?? 0
        if (stocks > maxStocks || (stocks === maxStocks && percent < minPercent)) {
          maxStocks = stocks
          minPercent = percent
          winnerPort = p.port
        }
      }
    }

    return { winnerPort }
  } catch (e) {
    return { winnerPort: null }
  }
})

ipcMain.handle('launch-uncle-punch', async () => {
  const dolphinPath = store.get('dolphinPath', '') as string
  const unclePunchPath = store.get('unclePunchPath', '') as string

  if (!dolphinPath) {
    return { success: false, error: 'Dolphin path not configured. Go to Settings.' }
  }

  if (!unclePunchPath) {
    return { success: false, error: 'Uncle Punch ISO path not configured. Go to Settings.' }
  }

  if (!fs.existsSync(unclePunchPath)) {
    return { success: false, error: 'Uncle Punch ISO not found at configured path.' }
  }

  const playbackDolphin = findPlaybackDolphin(dolphinPath)

  return new Promise((resolve) => {
    if (process.platform === 'darwin') {
      const binaryPath = playbackDolphin && playbackDolphin.endsWith('.app')
        ? path.join(playbackDolphin, 'Contents/MacOS/Slippi Dolphin')
        : playbackDolphin || dolphinPath

      const cmd = binaryPath && fs.existsSync(binaryPath) && !binaryPath.endsWith('.app')
        ? `"${binaryPath}" "${unclePunchPath}"`
        : `open "${dolphinPath}" --args "${unclePunchPath}"`

      exec(cmd, (error) => {
        if (error) {
          resolve({ success: false, error: String(error) })
        } else {
          resolve({ success: true })
        }
      })
    } else {
      const exe = playbackDolphin || dolphinPath
      exec(`"${exe}" "${unclePunchPath}"`, (error) => {
        if (error) {
          resolve({ success: false, error: String(error) })
        } else {
          resolve({ success: true })
        }
      })
    }
  })
})

ipcMain.handle('open-replay', async (_, replayPath: string, startFrame?: number, endFrame?: number) => {
  const dolphinPath = store.get('dolphinPath', '') as string

  if (!dolphinPath) {
    return { success: false, error: 'Dolphin path not configured. Go to Settings.' }
  }

  if (!fs.existsSync(dolphinPath)) {
    return { success: false, error: 'Dolphin not found at configured path.' }
  }

  // Try to find the actual Slippi Playback Dolphin for frame-seeking
  const playbackDolphin = findPlaybackDolphin(dolphinPath)

  if (playbackDolphin) {
    // Use Slippi comm spec (-i JSON) for frame-seeking support
    const commFile = createSlippiCommFile(replayPath, startFrame, endFrame)

    return new Promise((resolve) => {
      if (process.platform === 'darwin') {
        // On macOS, invoke the binary directly inside the app bundle.
        // Using `open` with --args can cause Dolphin to show a selection menu
        // instead of starting the replay immediately.
        const binaryPath = playbackDolphin.endsWith('.app')
          ? path.join(playbackDolphin, 'Contents/MacOS/Slippi Dolphin')
          : playbackDolphin

        const cmd = fs.existsSync(binaryPath)
          ? `"${binaryPath}" -i "${commFile}"`
          : `open "${playbackDolphin}" --args -i "${commFile}"`

        exec(cmd, (error) => {
          if (error) {
            console.error('Failed to launch Dolphin with comm file:', error)
            // Fall back to old behavior
            exec(`open "${dolphinPath}" "${replayPath}"`, (err2) => {
              if (err2) {
                resolve({ success: false, error: String(err2) })
              } else {
                resolve({ success: true, fallback: true })
              }
            })
          } else {
            resolve({ success: true, frameSeek: true })
          }
        })
      } else {
        // Windows/Linux - invoke binary directly
        exec(`"${playbackDolphin}" -i "${commFile}"`, (error) => {
          if (error) {
            console.error('Failed to launch Dolphin with comm file:', error)
            resolve({ success: false, error: String(error) })
          } else {
            resolve({ success: true, frameSeek: true })
          }
        })
      }
    })
  }

  // Fallback: open via launcher (no frame seeking)
  return new Promise((resolve) => {
    if (process.platform === 'darwin' && dolphinPath.endsWith('.app')) {
      exec(`open "${dolphinPath}" "${replayPath}"`, (error) => {
        if (error) {
          console.error('Failed to launch Dolphin:', error)
          resolve({ success: false, error: String(error) })
        } else {
          resolve({ success: true })
        }
      })
    } else {
      exec(`"${dolphinPath}" "${replayPath}"`, (error) => {
        if (error) {
          console.error('Failed to launch Dolphin:', error)
          resolve({ success: false, error: String(error) })
        } else {
          resolve({ success: true })
        }
      })
    }
  })
})

// --- Training Mod IPCs ---

ipcMain.handle('get-training-mods', async () => {
  const dolphinPath = store.get('dolphinPath', '') as string
  if (!dolphinPath) {
    return { available: false, error: 'Dolphin path not configured', codes: [] }
  }

  const playbackDolphin = findPlaybackDolphin(dolphinPath)
  if (!playbackDolphin) {
    return { available: false, error: 'Playback Dolphin not found. Please select Slippi Dolphin or Slippi Launcher.', codes: [] }
  }

  const iniPath = findGale01Ini(playbackDolphin)
  if (!iniPath) {
    return { available: false, error: 'GALE01.ini / GALE01r2.ini not found. Launch Slippi Dolphin once to generate it.', codes: [] }
  }

  const enabledIds = getEnabledTrainingCodes(iniPath)
  const lines = fs.readFileSync(iniPath, 'utf-8').split(/\r?\n/)
  return {
    available: true,
    codes: TRAINING_CODES.map((c) => ({
      id: c.id,
      name: c.name,
      enabled: enabledIds.includes(c.id),
      definitionPresent: codeDefinitionExists(lines, c.name)
    }))
  }
})

ipcMain.handle('set-training-mod', async (_, codeId: string, enabled: boolean) => {
  const dolphinPath = store.get('dolphinPath', '') as string
  if (!dolphinPath) {
    return { success: false, error: 'Dolphin path not configured' }
  }

  const playbackDolphin = findPlaybackDolphin(dolphinPath)
  if (!playbackDolphin) {
    return { success: false, error: 'Playback Dolphin not found' }
  }

  const ok = setTrainingCodeEnabled(playbackDolphin, codeId, enabled)
  return { success: ok }
})


// --- Bookmarks ---

interface Bookmark {
  id: string
  path: string
  fileName: string
  startFrame: number
  endFrame: number
  playerIndex?: number
  playerCharacter?: number
  opponentCharacter?: number
  damage: number
  didKill: boolean
  category: string
  date: string
  createdAt: string
}

ipcMain.handle('get-bookmarks', async () => {
  return store.get('bookmarks', []) as Bookmark[]
})

ipcMain.handle('add-bookmark', async (_, bookmark: Omit<Bookmark, 'id' | 'createdAt'>) => {
  const bookmarks = store.get('bookmarks', []) as Bookmark[]
  const newBookmark: Bookmark = {
    ...bookmark,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString()
  }
  bookmarks.push(newBookmark)
  store.set('bookmarks', bookmarks)
  return { success: true, bookmark: newBookmark }
})

ipcMain.handle('remove-bookmark', async (_, id: string) => {
  const bookmarks = store.get('bookmarks', []) as Bookmark[]
  const filtered = bookmarks.filter((b) => b.id !== id)
  store.set('bookmarks', filtered)
  return { success: true }
})

ipcMain.handle('clear-bookmarks', async () => {
  store.set('bookmarks', [])
  return { success: true }
})

ipcMain.handle('play-bookmark-queue', async () => {
  const bookmarks = store.get('bookmarks', []) as Bookmark[]
  if (bookmarks.length === 0) {
    return { success: false, error: 'No bookmarks to play' }
  }

  const dolphinPath = store.get('dolphinPath', '') as string
  if (!dolphinPath) {
    return { success: false, error: 'Dolphin path not configured' }
  }

  const playbackDolphin = findPlaybackDolphin(dolphinPath)
  if (!playbackDolphin) {
    return { success: false, error: 'Playback Dolphin not found' }
  }

  const tempDir = path.join(app.getPath('temp'), 'ssbm-coach')
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true })
  }

  const queueFile = path.join(tempDir, 'bookmark-queue.json')
  const queueData = {
    mode: 'queue',
    commandId: `queue-${Date.now()}`,
    queue: bookmarks.map((b) => ({
      path: b.path,
      startFrame: Math.max(-123, b.startFrame - 120),
      endFrame: b.endFrame + 60
    }))
  }

  fs.writeFileSync(queueFile, JSON.stringify(queueData, null, 2))

  return new Promise((resolve) => {
    if (process.platform === 'darwin') {
      const binaryPath = playbackDolphin.endsWith('.app')
        ? path.join(playbackDolphin, 'Contents/MacOS/Slippi Dolphin')
        : playbackDolphin
      const cmd = fs.existsSync(binaryPath)
        ? `"${binaryPath}" -i "${queueFile}"`
        : `open "${playbackDolphin}" --args -i "${queueFile}"`
      exec(cmd, (error) => {
        if (error) {
          resolve({ success: false, error: String(error) })
        } else {
          resolve({ success: true })
        }
      })
    } else {
      exec(`"${playbackDolphin}" -i "${queueFile}"`, (error) => {
        if (error) {
          resolve({ success: false, error: String(error) })
        } else {
          resolve({ success: true })
        }
      })
    }
  })
})

import { useState, useEffect, useMemo, useRef } from 'react'
import {
  FolderOpen,
  Play,
  Search,
  HardDrive,
  Zap,
  Crosshair,
  Disc,
  Calendar,
  Clock,
  MapPin,
  Users,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  X,
  Dumbbell,
  ExternalLink,
  RefreshCw
} from 'lucide-react'
import { CHARACTERS, STAGES } from './constants'
import ComboSearch from './ComboSearch'
import StatsDashboard from './StatsDashboard'
import WeaknessAnalysis from './WeaknessAnalysis'
import Bookmarks from './Bookmarks'
import Coach from './Coach'

interface Player {
  port: number
  characterId: number
  characterColor: number
  connectCode?: string
  displayName?: string
  nametag?: string
}

interface Replay {
  path: string
  fileName: string
  date?: string
  lastFrame?: number
  stageId?: number
  isTeams?: boolean
  winnerPort: number | null
  month?: string
  players: Player[]
  combos: any[] | null
  lCancelStats?: {
    playerIndex: number
    port?: number
    characterId?: number
    success: number
    fail: number
    attackCounts: Record<string, number>
  }[]
}

interface DropdownProps {
  label: string
  value: number | null
  options: { value: number; label: string }[]
  onChange: (val: number | null) => void
  activeClass?: string
}

function Dropdown({ label, value, options, onChange, activeClass = 'cyan' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selected = value === null ? 'All' : options.find((o) => o.value === value)?.label || 'All'
  const isActive = value !== null

  const btnBase =
    'flex items-center justify-between gap-3 h-10 px-3 rounded-lg text-xs font-semibold tracking-wider font-orbitron transition min-w-[140px]'
  const btnIdle =
    activeClass === 'cyan'
      ? 'pill-cyan'
      : 'pill-pink'
  const btnOpen =
    activeClass === 'cyan'
      ? 'pill-cyan-active'
      : 'pill-pink-active'

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={`${btnBase} ${open || isActive ? btnOpen : btnIdle}`}
      >
        <span className="truncate">{label}: {selected}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 min-w-[180px] max-h-64 overflow-y-auto rounded-lg border border-slate-700/50 bg-[#0f172a] shadow-xl py-1">
          <div
            onClick={() => { onChange(null); setOpen(false) }}
            className={`px-3 py-2 text-xs font-orbitron tracking-wider cursor-pointer transition ${
              value === null
                ? activeClass === 'cyan'
                  ? 'bg-cyan-500/10 text-cyan-400'
                  : 'bg-fuchsia-500/10 text-fuchsia-400'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`}
          >
            ALL
          </div>
          {options.map((opt) => (
            <div
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`px-3 py-2 text-xs font-orbitron tracking-wider cursor-pointer transition ${
                value === opt.value
                  ? activeClass === 'cyan'
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'bg-fuchsia-500/10 text-fuchsia-400'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<'library' | 'combos' | 'stats' | 'weakness' | 'bookmarks' | 'coach' | 'settings'>('library')
  const [config, setConfig] = useState({ dolphinPath: '', replayFolder: '', unclePunchPath: '' })
  const [replays, setReplays] = useState<Replay[]>([])
  const [loading, setLoading] = useState(false)
  const [indexing, setIndexing] = useState(false)
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 })
  const [searchTerm, setSearchTerm] = useState('')
  const [characterFilter, setCharacterFilter] = useState<number | null>(null)
  const [stageFilter, setStageFilter] = useState<number | null>(null)
  const [monthFilter, setMonthFilter] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState<'date' | 'duration'>('date')
  const [sortDesc, setSortDesc] = useState(true)
  const [error, setError] = useState('')
  const [apiKey, setApiKey] = useState('')

  // Training mod state
  interface TrainingCode {
    id: string
    name: string
    enabled: boolean
  }
  const [trainingCodes, setTrainingCodes] = useState<TrainingCode[]>([])
  const [trainingModsAvailable, setTrainingModsAvailable] = useState(false)

  useEffect(() => {
    loadConfig()
  }, [])

  useEffect(() => {
    if (config.dolphinPath) {
      loadTrainingMods()
    }
  }, [config.dolphinPath])

  // Register scan progress listener
  useEffect(() => {
    const cleanup = window.electron.onScanProgress((data) => {
      setScanProgress(data)
    })
    return cleanup
  }, [])

  const loadConfig = async () => {
    try {
      const cfg = await window.electron.getConfig()
      setConfig(cfg)
      if (cfg.replayFolder) {
        scanReplays(cfg.replayFolder)
      }
    } catch (e) {
      setError('Failed to load config')
    }
  }

  const scanReplays = async (folder: string) => {
    setLoading(true)
    setScanProgress({ current: 0, total: 0 })
    setError('')
    try {
      const result = await window.electron.scanReplays(folder)
      setReplays(result.replays)
      if (result.cancelled) {
        setError('Scan cancelled by user')
      }
    } catch (e) {
      setError('Failed to scan replays')
    }
    setLoading(false)
    setScanProgress({ current: 0, total: 0 })
  }

  const handleIndexCombos = async (daysBack?: number) => {
    setIndexing(true)
    setScanProgress({ current: 0, total: 0 })
    setError('')
    try {
      await window.electron.indexCombos(daysBack)
      // Reload replays from cache to get combo data
      if (config.replayFolder) {
        const result = await window.electron.scanReplays(config.replayFolder)
        setReplays(result.replays)
      }
    } catch (e) {
      setError('Failed to index combos')
    }
    setIndexing(false)
    setScanProgress({ current: 0, total: 0 })
  }

  const handleCancelScan = async () => {
    await window.electron.cancelScan()
  }

  const handleSelectFolder = async () => {
    const folder = await window.electron.selectFolder()
    if (folder) {
      await window.electron.setConfig('replayFolder', folder)
      setConfig((c) => ({ ...c, replayFolder: folder }))
      scanReplays(folder)
    }
  }

  const handleSelectDolphin = async () => {
    const file = await window.electron.selectFile()
    if (file) {
      await window.electron.setConfig('dolphinPath', file)
      setConfig((c) => ({ ...c, dolphinPath: file }))
    }
  }

  const handleSelectUnclePunch = async () => {
    const file = await window.electron.selectFile()
    if (file) {
      await window.electron.setConfig('unclePunchPath', file)
      setConfig((c) => ({ ...c, unclePunchPath: file }))
    }
  }

  const handleLaunchUnclePunch = async () => {
    const result = await window.electron.launchUnclePunch()
    if (!result.success) {
      alert(result.error)
    }
  }

  const handleRefresh = async () => {
    if (!config.replayFolder) {
      setError('No replay folder configured. Go to Settings.')
      return
    }
    setLoading(true)
    setIndexing(true)
    setError('')
    try {
      const scanResult = await window.electron.scanReplays(config.replayFolder)
      setReplays(scanResult.replays)
      await window.electron.indexCombos()
      const indexResult = await window.electron.scanReplays(config.replayFolder)
      setReplays(indexResult.replays)
    } catch (e) {
      setError('Refresh failed')
    }
    setLoading(false)
    setIndexing(false)
  }

  const loadTrainingMods = async () => {
    try {
      const result = await window.electron.getTrainingMods()
      setTrainingModsAvailable(result.available)
      if (result.available && result.codes) {
        setTrainingCodes(result.codes)
      }
    } catch (e) {
      console.error('Failed to load training mods:', e)
    }
  }

  const toggleTrainingMod = async (codeId: string, enabled: boolean) => {
    try {
      const result = await window.electron.setTrainingMod(codeId, enabled)
      if (result.success) {
        setTrainingCodes((prev) =>
          prev.map((c) => (c.id === codeId ? { ...c, enabled } : c))
        )
      }
    } catch (e) {
      console.error('Failed to toggle training mod:', e)
    }
  }

  const openReplay = async (replayPath: string) => {
    const result = await window.electron.openReplay(replayPath)
    if (!result.success) {
      alert(result.error)
    }
  }

  const formatDuration = (frames?: number) => {
    if (!frames) return '0:00'
    const seconds = Math.floor(frames / 60)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown'
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      })
    } catch {
      return 'Invalid'
    }
  }

  const sortedAndFilteredReplays = useMemo(() => {
    let result = [...replays]

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (r) =>
          r.fileName.toLowerCase().includes(term) ||
          r.players.some((p) =>
            (CHARACTERS[p.characterId] || '').toLowerCase().includes(term)
          ) ||
          r.players.some((p) => (p.connectCode || '').toLowerCase().includes(term)) ||
          r.players.some((p) => (p.displayName || '').toLowerCase().includes(term)) ||
          r.players.some((p) => (p.nametag || '').toLowerCase().includes(term))
      )
    }

    if (characterFilter !== null) {
      result = result.filter((r) =>
        r.players.some((p) => p.characterId === characterFilter)
      )
    }

    if (stageFilter !== null) {
      result = result.filter((r) => r.stageId === stageFilter)
    }

    if (monthFilter !== null) {
      result = result.filter((r) => r.month === monthFilter)
    }

    result.sort((a, b) => {
      if (sortBy === 'date') {
        const da = a.date ? new Date(a.date).getTime() : 0
        const db = b.date ? new Date(b.date).getTime() : 0
        return sortDesc ? db - da : da - db
      } else {
        const da = a.lastFrame || 0
        const db = b.lastFrame || 0
        return sortDesc ? db - da : da - db
      }
    })

    return result
  }, [replays, searchTerm, characterFilter, stageFilter, monthFilter, sortBy, sortDesc])

  const charOptions = useMemo(
    () =>
      Array.from(new Set(replays.flatMap((r) => r.players.map((p) => p.characterId))))
        .sort()
        .map((id) => ({ value: id, label: (CHARACTERS[id] || `Char ${id}`).toUpperCase() })),
    [replays]
  )

  const stageOptions = useMemo(
    () =>
      Array.from(new Set(replays.map((r) => r.stageId).filter((s): s is number => s !== undefined)))
        .sort()
        .map((id) => ({ value: id, label: (STAGES[id] || `Stage ${id}`).toUpperCase() })),
    [replays]
  )

  const monthOptions = useMemo(
    () =>
      Array.from(new Set(replays.map((r) => r.month).filter((m): m is string => m !== undefined)))
        .sort()
        .reverse()
        .map((m) => ({ value: m, label: m })),
    [replays]
  )

  const scanPercent = scanProgress.total > 0
    ? Math.round((scanProgress.current / scanProgress.total) * 100)
    : 0

  return (
    <div className="h-screen flex flex-col relative">
      {/* Header */}
      <header className="pl-20 pr-6 py-3 flex items-center justify-between relative z-20 shrink-0" style={{ WebkitAppRegion: 'drag' } as any}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center">
              <Crosshair size={18} className="text-cyan-400" />
            </div>
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_rgba(74,222,128,0.6)]" />
          </div>
          <div>
            <h1 className="font-orbitron text-lg font-bold tracking-wider leading-none text-cyan-400">
              20GX
            </h1>
            <span className="font-mono-data text-xs text-slate-600 tracking-[0.15em]">COACH OS v0.1</span>
          </div>
        </div>

        <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
          {config.replayFolder && (
            <button
              onClick={handleRefresh}
              disabled={loading || indexing}
              className="flex items-center gap-2 h-9 px-3 rounded-lg text-xs font-orbitron tracking-wider text-cyan-400 hover:text-cyan-300 border border-cyan-500/20 hover:border-cyan-500/30 bg-cyan-500/5 hover:bg-cyan-500/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Rescan replays and re-index combos"
            >
              <RefreshCw size={13} className={`${loading || indexing ? 'animate-spin' : ''}`} />
              REFRESH
            </button>
          )}
          <nav className="flex gap-1 p-1 rounded-xl bg-slate-900/60 border border-slate-700/20">
          <button
            onClick={() => setActiveTab('library')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 font-orbitron ${
              activeTab === 'library'
                ? 'tab-active'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Library
          </button>
          <button
            onClick={() => setActiveTab('combos')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 font-orbitron ${
              activeTab === 'combos'
                ? 'tab-active'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Combos
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 font-orbitron ${
              activeTab === 'stats'
                ? 'tab-active'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Stats
          </button>
          <button
            onClick={() => setActiveTab('weakness')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 font-orbitron ${
              activeTab === 'weakness'
                ? 'tab-active'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Weakness
          </button>
          <button
            onClick={() => setActiveTab('bookmarks')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 font-orbitron ${
              activeTab === 'bookmarks'
                ? 'tab-active'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Bookmarks
          </button>
          <button
            onClick={() => setActiveTab('coach')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 font-orbitron ${
              activeTab === 'coach'
                ? 'tab-active'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Coach
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-5 py-2 rounded-lg text-sm font-semibold tracking-wide transition-all duration-200 font-orbitron ${
              activeTab === 'settings'
                ? 'tab-active'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            Setup
          </button>
        </nav>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-hidden relative z-10 min-h-0">
        {activeTab === 'library' && (
          <div className="h-full flex flex-col min-h-0">
            {/* Toolbar Row 1 */}
            <div className="px-6 py-3 flex items-center gap-3 flex-wrap border-b border-slate-800/50 shrink-0">
              <button
                onClick={handleSelectFolder}
                className="flex items-center gap-2 h-10 px-5 btn-primary rounded-lg text-xs shrink-0"
              >
                <FolderOpen size={14} />
                {config.replayFolder ? 'RESCAN' : 'LOAD REPLAYS'}
              </button>

              {config.replayFolder && (
                <span className="font-mono-data text-xs text-slate-600 truncate max-w-[200px]" title={config.replayFolder}>
                  {config.replayFolder}
                </span>
              )}

              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
                  <input
                    type="text"
                    placeholder="Search characters, tags, codes..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full h-10 pl-9 pr-4 input-dark rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono-data text-xs text-slate-600 tracking-wider">SORT</span>
                <button
                  onClick={() => {
                    if (sortBy === 'date') {
                      setSortDesc(!sortDesc)
                    } else {
                      setSortBy('date')
                      setSortDesc(true)
                    }
                  }}
                  className={`flex items-center gap-1 h-8 px-3 rounded-lg transition text-xs font-orbitron tracking-wider ${
                    sortBy === 'date'
                      ? 'pill-cyan-active'
                      : 'pill-cyan'
                  }`}
                >
                  <Calendar size={11} />
                  DATE
                  {sortBy === 'date' && (sortDesc ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
                </button>
                <button
                  onClick={() => {
                    if (sortBy === 'duration') {
                      setSortDesc(!sortDesc)
                    } else {
                      setSortBy('duration')
                      setSortDesc(true)
                    }
                  }}
                  className={`flex items-center gap-1 h-8 px-3 rounded-lg transition text-xs font-orbitron tracking-wider ${
                    sortBy === 'duration'
                      ? 'pill-cyan-active'
                      : 'pill-cyan'
                  }`}
                >
                  <Clock size={11} />
                  TIME
                  {sortBy === 'duration' && (sortDesc ? <ChevronDown size={11} /> : <ChevronUp size={11} />)}
                </button>
              </div>
            </div>

            {/* Toolbar Row 2 — Dropdowns */}
            {(charOptions.length > 0 || stageOptions.length > 0 || monthOptions.length > 0) && (
              <div className="px-6 py-2.5 flex items-center gap-3 flex-wrap border-b border-slate-800/30 shrink-0">
                {monthOptions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Calendar size={13} className="text-slate-700 shrink-0" />
                    <Dropdown
                      label="MONTH"
                      value={monthFilter}
                      options={monthOptions.map((o) => ({ value: o.value, label: o.label }))}
                      onChange={(val) => setMonthFilter(val as string | null)}
                      activeClass="cyan"
                    />
                  </div>
                )}

                {charOptions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Users size={13} className="text-slate-700 shrink-0" />
                    <Dropdown
                      label="CHAR"
                      value={characterFilter}
                      options={charOptions}
                      onChange={setCharacterFilter}
                      activeClass="cyan"
                    />
                  </div>
                )}

                {stageOptions.length > 0 && (
                  <div className="flex items-center gap-2">
                    <MapPin size={13} className="text-slate-700 shrink-0" />
                    <Dropdown
                      label="STAGE"
                      value={stageFilter}
                      options={stageOptions}
                      onChange={setStageFilter}
                      activeClass="pink"
                    />
                  </div>
                )}

                {(characterFilter !== null || stageFilter !== null || monthFilter !== null) && (
                  <button
                    onClick={() => { setCharacterFilter(null); setStageFilter(null); setMonthFilter(null) }}
                    className="h-8 px-3 rounded-lg text-xs font-orbitron tracking-wider text-slate-500 hover:text-slate-300 border border-slate-800 hover:border-slate-600 transition"
                  >
                    CLEAR FILTERS
                  </button>
                )}
              </div>
            )}

            {/* Progress bar during scan */}
            {loading && scanProgress.total > 0 && (
              <div className="px-6 py-2 border-b border-slate-800/30 shrink-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono-data text-cyan-500/70">
                    PARSING {scanProgress.current.toLocaleString()} / {scanProgress.total.toLocaleString()} REPLAYS
                  </span>
                  <span className="text-xs font-mono-data text-cyan-500/70">{scanPercent}%</span>
                </div>
                <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500/60 rounded-full transition-all duration-200"
                    style={{ width: `${scanPercent}%` }}
                  />
                </div>
                <div className="flex justify-end mt-1.5">
                  <button
                    onClick={handleCancelScan}
                    className="flex items-center gap-1 text-xs font-orbitron text-slate-500 hover:text-red-400 transition"
                  >
                    <X size={10} />
                    CANCEL
                  </button>
                </div>
              </div>
            )}

            {/* Replay list */}
            <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
              {error && (
                <div className="mb-4 p-4 bg-red-950/20 border border-red-500/10 rounded-xl flex items-center gap-3 text-sm text-red-300 font-mono-data">
                  <AlertCircle size={16} className="text-red-400" />
                  {error}
                </div>
              )}

              {loading && replays.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-4">
                  <div className="relative w-14 h-14">
                    <div className="absolute inset-0 border-2 border-slate-800 rounded-full" />
                    <div className="absolute inset-0 border-2 border-t-cyan-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
                  </div>
                  <p className="font-orbitron text-sm tracking-[0.2em] text-slate-500">Scanning replays...</p>
                </div>
              ) : sortedAndFilteredReplays.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-600">
                  <div className="w-16 h-16 rounded-2xl bg-slate-800/30 border border-slate-700/20 flex items-center justify-center mb-4">
                    <HardDrive size={30} className="text-slate-700" />
                  </div>
                  <p className="font-orbitron text-base font-bold text-slate-500 tracking-wide">No replays found</p>
                  <p className="text-sm mt-1 text-slate-700 font-mono-data">Select your Slippi replay folder</p>
                </div>
              ) : (
                <div className="grid gap-2">
                  {sortedAndFilteredReplays.map((replay) => (
                    <div
                      key={replay.path}
                      className="card rounded-xl p-4 group"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Meta row */}
                          <div className="flex items-center gap-2.5 mb-2">
                            <span className="font-mono-data text-xs text-slate-500">
                              {formatDate(replay.date)}
                            </span>
                            {replay.month && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700/50 font-mono-data">
                                {replay.month}
                              </span>
                            )}
                            <span className="badge-stage px-2 py-0.5 rounded">
                              {(STAGES[replay.stageId ?? -1] || 'Unknown').toUpperCase()}
                            </span>
                            <span className="font-mono-data text-xs text-slate-600 flex items-center gap-1">
                              <Clock size={10} />
                              {formatDuration(replay.lastFrame)}
                            </span>
                          </div>

                          {/* Players row */}
                          <div className="flex items-center gap-3 flex-wrap">
                            {replay.players.map((player, idx) => (
                              <div key={player.port} className="flex items-center gap-2">
                                {idx > 0 && (
                                  <span className="text-slate-700 text-xs font-orbitron font-bold">VS</span>
                                )}
                                <span className="text-[15px] font-semibold text-slate-200">
                                  {CHARACTERS[player.characterId] || `Char ${player.characterId}`}
                                </span>
                                {player.connectCode && (
                                  <span className="badge-mono px-1.5 py-0.5 rounded">
                                    {player.connectCode}
                                  </span>
                                )}
                                {player.displayName && (
                                  <span className="text-xs text-slate-500">
                                    {player.displayName}
                                  </span>
                                )}
                                {player.nametag && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700/50 font-mono-data">
                                    {player.nametag}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <button
                          onClick={() => openReplay(replay.path)}
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-2 h-10 px-5 btn-play rounded-lg text-xs shrink-0"
                        >
                          <Play size={14} fill="currentColor" />
                          PLAY
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {replays.length > 0 && (
              <div className="px-6 py-3 border-t border-slate-800/50 text-xs text-slate-600 flex justify-between items-center font-mono-data tracking-wide shrink-0">
                <span>
                  Showing <span className="text-cyan-500/70">{sortedAndFilteredReplays.length}</span> of{' '}
                  <span className="text-cyan-500/70">{replays.length}</span> replays
                </span>
                <div className="flex gap-5">
                  <span><span className="text-purple-400/60">{monthOptions.length}</span> months</span>
                  <span><span className="text-purple-400/60">{charOptions.length}</span> characters</span>
                  <span><span className="text-purple-400/60">{stageOptions.length}</span> stages</span>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'combos' && (
          <ComboSearch
            replays={replays}
            onPlayCombo={(path, startFrame) => {
              window.electron.openReplay(path, startFrame)
            }}
            onIndexCombos={handleIndexCombos}
            indexing={indexing}
            indexProgress={scanProgress}
          />
        )}

        {activeTab === 'stats' && (
          <StatsDashboard replays={replays} />
        )}

        {activeTab === 'weakness' && (
          <WeaknessAnalysis replays={replays} />
        )}

        {activeTab === 'bookmarks' && (
          <Bookmarks
            onPlayCombo={(path, startFrame) => {
              window.electron.openReplay(path, startFrame)
            }}
          />
        )}

        {activeTab === 'coach' && (
          <Coach
            replays={replays}
            apiKey={apiKey}
            onApiKeyChange={setApiKey}
          />
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto py-8 px-6 h-full overflow-y-auto">
            <div className="mb-8">
              <h2 className="font-orbitron text-2xl font-bold text-cyan-400 tracking-wider">System Setup</h2>
              <p className="text-sm text-slate-600 mt-1 font-mono-data">Configure paths for optimal performance</p>
            </div>

            <div className="space-y-4">
              <div className="card rounded-xl p-6">
                <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2 font-orbitron tracking-wider">
                  <Zap size={15} className="text-cyan-400" />
                  EMULATOR CONFIG
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 tracking-[0.15em] font-orbitron">
                      DOLPHIN APPLICATION PATH
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        readOnly
                        value={config.dolphinPath}
                        placeholder="/Applications/Slippi Launcher.app"
                        className="flex-1 h-10 px-4 bg-slate-950/50 border border-slate-800 rounded-lg text-sm text-slate-300 font-mono-data focus:outline-none focus:border-cyan-500/20 transition"
                      />
                      <button
                        onClick={handleSelectDolphin}
                        className="h-10 px-5 btn-primary rounded-lg text-xs shrink-0"
                      >
                        SELECT APP
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-slate-700 font-mono-data leading-relaxed">
                      Select your <span className="text-cyan-500/60">Slippi Launcher.app</span> from Applications. 
                      This is required for .slp replay playback. Regular Dolphin will not work without the Slippi plugin.
                    </p>
                  </div>
                </div>
              </div>

              <div className="card rounded-xl p-6">
                <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2 font-orbitron tracking-wider">
                  <Disc size={15} className="text-purple-400" />
                  REPLAY DATABASE
                </h3>
                <div className="flex gap-3">
                  <input
                    type="text"
                    readOnly
                    value={config.replayFolder}
                    placeholder="~/Documents/Slippi"
                    className="flex-1 h-10 px-4 bg-slate-950/50 border border-slate-800 rounded-lg text-sm text-slate-300 font-mono-data focus:outline-none focus:border-cyan-500/20 transition"
                  />
                  <button
                    onClick={handleSelectFolder}
                    className="h-10 px-5 btn-primary rounded-lg text-xs shrink-0"
                  >
                    BROWSE
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate-700 font-mono-data">
                  Default location: <span className="text-cyan-500/50">~/Documents/Slippi</span>
                </p>
              </div>

              <div className="card rounded-xl p-6">
                <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2 font-orbitron tracking-wider">
                  <Crosshair size={15} className="text-green-400" />
                  TRAINING MOD OVERLAYS
                </h3>
                {!config.dolphinPath ? (
                  <p className="text-xs text-slate-700 font-mono-data">
                    Configure your Dolphin path above to enable training mod features.
                  </p>
                ) : !trainingModsAvailable ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600 font-mono-data">
                      Training mod overlays require Slippi Playback Dolphin. These are built-in Gecko codes that visualize frame data during replay playback.
                    </p>
                    <p className="text-xs text-slate-700 font-mono-data">
                      If you selected <span className="text-cyan-500/60">Slippi Launcher.app</span>, make sure you've played at least one replay through it so the playback Dolphin is downloaded.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600 font-mono-data mb-3">
                      Toggle visual overlays that render directly in Dolphin during replay playback. These are built-in Gecko codes — no mods required.
                    </p>
                    {trainingCodes.map((code) => (
                      <label
                        key={code.id}
                        className="flex items-center gap-3 p-2.5 rounded-lg bg-slate-950/30 border border-slate-800/50 cursor-pointer hover:border-slate-700 transition"
                      >
                        <input
                          type="checkbox"
                          checked={code.enabled}
                          onChange={(e) => toggleTrainingMod(code.id, e.target.checked)}
                          className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-green-500 focus:ring-green-500/20 focus:ring-1"
                        />
                        <span className="text-xs text-slate-300 font-mono-data">{code.name}</span>
                      </label>
                    ))}
                    <p className="text-xs text-slate-700 font-mono-data mt-2">
                      Changes apply on next replay launch. A backup of GALE01.ini is created automatically.
                    </p>
                  </div>
                )}
              </div>

              <div className="card rounded-xl p-6">
                <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2 font-orbitron tracking-wider">
                  <Dumbbell size={15} className="text-orange-400" />
                  UNCLE PUNCH TRAINING
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 tracking-[0.15em] font-orbitron">
                      UNCLE PUNCH ISO PATH
                    </label>
                    <div className="flex gap-3">
                      <input
                        type="text"
                        readOnly
                        value={config.unclePunchPath}
                        placeholder="~/Documents/Project_20GX/Tools/TM-CE/TM-CE.iso"
                        className="flex-1 h-10 px-4 bg-slate-950/50 border border-slate-800 rounded-lg text-sm text-slate-300 font-mono-data focus:outline-none focus:border-cyan-500/20 transition"
                      />
                      <button
                        onClick={handleSelectUnclePunch}
                        className="h-10 px-5 btn-primary rounded-lg text-xs shrink-0"
                      >
                        SELECT ISO
                      </button>
                    </div>
                    <p className="mt-3 text-xs text-slate-700 font-mono-data leading-relaxed">
                      Select your <span className="text-orange-500/60">TM-CE.iso</span> (Uncle Punch Training Mode). 
                      This lets you launch training scenarios directly from the app.
                    </p>
                  </div>

                  {config.unclePunchPath && (
                    <button
                      onClick={handleLaunchUnclePunch}
                      className="flex items-center gap-2 h-10 px-5 btn-play rounded-lg text-xs"
                    >
                      <ExternalLink size={14} />
                      LAUNCH UNCLE PUNCH
                    </button>
                  )}
                </div>
              </div>

              <div className="panel-soon rounded-xl p-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-40 h-40 bg-cyan-500/5 rounded-full blur-3xl" />
                <h3 className="text-sm font-bold text-slate-400 mb-3 font-orbitron tracking-wider relative">Upcoming Modules</h3>
                <ul className="space-y-2.5 text-sm text-slate-600 font-mono-data relative">
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-500/40" />
                    Video export to MP4 (ffmpeg + Dolphin frame dumps)
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500/40" />
                    Extended Gecko codes (UCF, lag reduction, faster melee settings)
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500/40" />
                    Weakness → curated Uncle Punch event linking
                  </li>
                  <li className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500/40" />
                    Replay annotation & note-taking
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App

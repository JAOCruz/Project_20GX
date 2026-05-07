import { useState, useMemo, useEffect, useRef } from 'react'
import { Play, Search, Sword, Skull, ChevronDown, ChevronUp, X, Calendar, Database, Zap, Users, Star, Dumbbell, Lightbulb, RefreshCw } from 'lucide-react'
import { CHARACTERS, STAGES } from './constants'
import { getMoveName, getSearchableMoves, formatComboString } from './moves'
import { StockIcon } from './components/StockIcon'

interface ComboMove {
  frame: number
  moveId: number
  hitCount: number
  damage: number
}

interface Player {
  port: number
  characterId: number
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
  month?: string
  combos: any[] | null
  players: Player[]
}

interface Props {
  replays: Replay[]
  onPlayCombo: (path: string, startFrame: number, endFrame: number) => void
  onIndexCombos: (daysBack?: number) => Promise<void>
  indexing: boolean
  indexProgress: { current: number; total: number }
}

const OPENING_LABELS: Record<string, string> = {
  'neutral-win': 'Neutral Opening',
  'counter-attack': 'Counter Attack',
  'trade': 'Trade',
  'unknown': 'Unknown',
}

function formatDuration(frames?: number) {
  if (!frames) return '0:00'
  const seconds = Math.floor(frames / 60)
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function formatDate(dateStr?: string) {
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

// Check if a move sequence appears in order within a conversion
function matchesSequence(moves: ComboMove[], sequence: number[]): boolean {
  if (sequence.length === 0 || sequence.every((s) => s === -1)) return true
  const filtered = sequence.filter((s) => s !== -1)
  if (filtered.length === 0) return true

  let seqIdx = 0
  for (const move of moves) {
    if (move.moveId === filtered[seqIdx]) {
      seqIdx++
      if (seqIdx === filtered.length) return true
    }
  }
  return false
}

function ComboSearch({ replays, onPlayCombo, onIndexCombos, indexing, indexProgress }: Props) {
  const analyzeCombo = async (conv: any) => {
    const key = `${conv.path}-${conv.startFrame}`
    setAnalyses((prev) => ({ ...prev, [key]: { loading: true, opportunities: [] } }))
    try {
      const result = await window.electron.analyzeMissedOpportunities(
        conv.path,
        conv.startFrame,
        conv.endFrame,
        conv.playerIndex
      )
      if (result.success) {
        setAnalyses((prev) => ({ ...prev, [key]: { loading: false, opportunities: result.opportunities } }))
      } else {
        setAnalyses((prev) => ({ ...prev, [key]: { loading: false, opportunities: [] } }))
      }
    } catch (e) {
      setAnalyses((prev) => ({ ...prev, [key]: { loading: false, opportunities: [] } }))
    }
  }
  const [charFilter, setCharFilter] = useState<number | null>(null)
  const [opponentFilter, setOpponentFilter] = useState<number | null>(null)
  const [stageFilter, setStageFilter] = useState<number | null>(null)
  const [moveSequence, setMoveSequence] = useState<number[]>([-1, -1, -1])
  const [minDamage, setMinDamage] = useState<number>(0)
  const [showAll, setShowAll] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [expandedGame, setExpandedGame] = useState<string | null>(null)
  const [analyses, setAnalyses] = useState<Record<string, { loading: boolean; opportunities: any[] }>>({})
  const [trainingCodes, setTrainingCodes] = useState<{ id: string; name: string; enabled: boolean }[]>([])

  const codesLoadedRef = useRef(false)

  useEffect(() => {
    loadTrainingCodes()

    // Retry loading training codes if Dolphin was just configured in another tab
    const interval = setInterval(() => {
      if (!codesLoadedRef.current) {
        loadTrainingCodes()
      } else {
        clearInterval(interval)
      }
    }, 2000)

    const onVisible = () => {
      if (!document.hidden) loadTrainingCodes()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const loadTrainingCodes = async () => {
    try {
      const result = await window.electron.getTrainingMods()
      if (result.available && result.codes) {
        setTrainingCodes(result.codes)
        codesLoadedRef.current = true
      }
    } catch (e) {
      console.error('Failed to load training codes:', e)
    }
  }

  const toggleTrainingCode = async (codeId: string, enabled: boolean) => {
    try {
      const result = await window.electron.setTrainingMod(codeId, enabled)
      if (result.success) {
        setTrainingCodes((prev) => prev.map((c) => (c.id === codeId ? { ...c, enabled } : c)))
      }
    } catch (e) {
      console.error('Failed to toggle training code:', e)
    }
  }
  const [scope, setScope] = useState<number>(7) // default: this week
  const [perspective, setPerspective] = useState<'aggressor' | 'victim' | 'both'>('both')

  // Extract all conversions from all replays
  const allConversions = useMemo(() => {
    const result: any[] = []
    for (const replay of replays) {
      if (replay.combos) {
        result.push(...replay.combos)
      }
    }
    return result
  }, [replays])

  // Compute date distribution for smart indexing
  const dateStats = useMemo(() => {
    const now = Date.now()
    const oneDay = 24 * 60 * 60 * 1000
    let today = 0
    let thisWeek = 0
    let thisMonth = 0
    let total = 0
    for (const r of replays) {
      if (!r.date) continue
      total++
      const d = new Date(r.date).getTime()
      const age = now - d
      if (age <= 1 * oneDay) today++
      if (age <= 7 * oneDay) thisWeek++
      if (age <= 30 * oneDay) thisMonth++
    }
    return { today, thisWeek, thisMonth, total }
  }, [replays])

  // Filter which replays have matching interactions
  const filteredReplays = useMemo(() => {
    let result = [...replays]

    // Only show replays that have indexed combos
    result = result.filter((r) => r.combos && r.combos.length > 0)

    // Sort by date descending (newest first)
    result.sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0
      const db = b.date ? new Date(b.date).getTime() : 0
      return db - da
    })

    return result
  }, [replays])

  // For a given replay, filter its interactions based on criteria
  const getMatchingInteractions = (replay: Replay): any[] => {
    if (!replay.combos || !Array.isArray(replay.combos)) return []

    let interactions = [...replay.combos]

    if (charFilter !== null) {
      if (perspective === 'aggressor') {
        interactions = interactions.filter((c) => c?.playerCharacter === charFilter)
      } else if (perspective === 'victim') {
        interactions = interactions.filter((c) => c?.opponentCharacter === charFilter)
      } else {
        interactions = interactions.filter((c) => c?.playerCharacter === charFilter || c?.opponentCharacter === charFilter)
      }
    }

    if (opponentFilter !== null) {
      interactions = interactions.filter((c) => c?.opponentCharacter === opponentFilter)
    }

    if (stageFilter !== null) {
      interactions = interactions.filter((c) => c?.stageId === stageFilter)
    }

    if (moveSequence.some((m) => m !== -1)) {
      interactions = interactions.filter((c) => matchesSequence(c?.moves ?? [], moveSequence))
    }

    if (minDamage > 0) {
      interactions = interactions.filter((c) => (c?.damage ?? 0) >= minDamage)
    }

    if (!showAll) {
      interactions = interactions.filter((c) => !!c?.didKill)
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      interactions = interactions.filter((c: any) => {
        const moves = c?.moves ?? []
        const moveNames = moves.map((m: any) => getMoveName(c?.playerCharacter, m?.moveId).toLowerCase())
        return moveNames.some((name: string) => name.includes(term))
      })
    }

    if (categoryFilter !== 'all') {
      interactions = interactions.filter((c: any) => c?.category === categoryFilter)
    }

    return interactions
  }

  // Replays that have at least one matching interaction
  const replaysWithMatches = useMemo(() => {
    let result = filteredReplays
      .map((r) => ({ replay: r, matches: getMatchingInteractions(r) }))
      .filter((item) => item.matches.length > 0)

    if (tagFilter) {
      const term = tagFilter.toLowerCase()
      result = result.filter(({ replay }) =>
        replay.players.some((p) =>
          (p.connectCode || '').toLowerCase().includes(term) ||
          (p.displayName || '').toLowerCase().includes(term) ||
          (p.nametag || '').toLowerCase().includes(term)
        )
      )
    }

    return result
  }, [filteredReplays, charFilter, opponentFilter, stageFilter, categoryFilter, moveSequence, minDamage, showAll, searchTerm, tagFilter, perspective])

  const uniqueOpponents = useMemo(
    () => Array.from(new Set(allConversions.map((c: any) => c.opponentCharacter).filter((c: any): c is number => c !== undefined))).sort(),
    [allConversions]
  )

  const uniqueStages = useMemo(
    () => Array.from(new Set(allConversions.map((c: any) => c.stageId).filter((s: any): s is number => s !== undefined))).sort(),
    [allConversions]
  )

  const searchableMoves = useMemo(() => getSearchableMoves(charFilter ?? undefined), [charFilter])

  const clearFilters = () => {
    setCharFilter(null)
    setOpponentFilter(null)
    setStageFilter(null)
    setCategoryFilter('all')
    setMoveSequence([-1, -1, -1])
    setMinDamage(0)
    setShowAll(false)
    setSearchTerm('')
    setTagFilter('')
    setExpandedGame(null)
    setPerspective('both')
  }

  const handleScopeIndex = () => {
    onIndexCombos(scope > 0 ? scope : undefined)
  }

  const hasFilters = charFilter !== null || opponentFilter !== null || stageFilter !== null || categoryFilter !== 'all' || moveSequence.some((m) => m !== -1) || minDamage > 0 || showAll || searchTerm !== '' || tagFilter !== '' || perspective !== 'both'

  const totalKills = allConversions.filter((c) => c.didKill).length
  const indexPercent = indexProgress.total > 0
    ? Math.round((indexProgress.current / indexProgress.total) * 100)
    : 0

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Filter bar */}
      <div className="px-6 py-3 border-b border-slate-800/50 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Scope selector + refresh */}
          <div className="flex items-center gap-2">
            <Database size={14} className="text-purple-500/60" />
            <span className="text-xs font-orbitron tracking-wider text-slate-500">SCOPE</span>
            <select
              value={scope}
              onChange={(e) => setScope(Number(e.target.value))}
              className="h-9 px-3 bg-slate-950/50 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-purple-500/30"
            >
              <option value={1}>Today</option>
              <option value={7}>This Week</option>
              <option value={30}>This Month</option>
              <option value={0}>All Games</option>
            </select>
            <button
              onClick={handleScopeIndex}
              disabled={indexing}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-orbitron tracking-wider text-purple-400 hover:text-purple-300 border border-purple-500/20 hover:border-purple-500/30 bg-purple-500/5 hover:bg-purple-500/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RefreshCw size={12} className={indexing ? 'animate-spin' : ''} />
              {indexing ? 'INDEXING...' : 'INDEX'}
            </button>
          </div>

          <div className="w-px h-6 bg-slate-800/50" />

          <div className="flex items-center gap-2">
            <Sword size={14} className="text-cyan-500/60" />
            <span className="text-xs font-orbitron tracking-wider text-slate-500">CHAR</span>
            <select
              value={charFilter ?? ''}
              onChange={(e) => {
                const val = e.target.value === '' ? null : Number(e.target.value)
                setCharFilter(val)
                setMoveSequence([-1, -1, -1])
              }}
              className="h-9 px-3 bg-slate-950/50 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500/30"
            >
              <option value="">Any Character</option>
              {Object.entries(CHARACTERS).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-orbitron tracking-wider text-slate-500">VIEW</span>
            <select
              value={perspective}
              onChange={(e) => setPerspective(e.target.value as 'aggressor' | 'victim' | 'both')}
              className="h-9 px-3 bg-slate-950/50 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500/30"
            >
              <option value="both">Both Roles</option>
              <option value="aggressor">As Aggressor</option>
              <option value="victim">As Victim</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-orbitron tracking-wider text-slate-500">VS</span>
            <select
              value={opponentFilter ?? ''}
              onChange={(e) => setOpponentFilter(e.target.value === '' ? null : Number(e.target.value))}
              className="h-9 px-3 bg-slate-950/50 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500/30"
            >
              <option value="">Any</option>
              {uniqueOpponents.map((id) => (
                <option key={id} value={id}>{CHARACTERS[id] || `Char ${id}`}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-orbitron tracking-wider text-slate-500">STAGE</span>
            <select
              value={stageFilter ?? ''}
              onChange={(e) => setStageFilter(e.target.value === '' ? null : Number(e.target.value))}
              className="h-9 px-3 bg-slate-950/50 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500/30"
            >
              <option value="">Any</option>
              {uniqueStages.map((id) => (
                <option key={id} value={id}>{STAGES[id] || `Stage ${id}`}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-orbitron tracking-wider text-slate-500">TYPE</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 px-3 bg-slate-950/50 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500/30"
            >
              <option value="all">All</option>
              <option value="edgeguard">Edgeguard</option>
              <option value="kill">Kill</option>
              <option value="punish-kill">Punish Kill</option>
              <option value="punish">Punish</option>
              <option value="opening">Opening</option>
              <option value="combo">Combo</option>
              <option value="trade">Trade</option>
            </select>
          </div>

          {/* Move sequence builder */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-orbitron tracking-wider text-slate-500">SEQUENCE</span>
            {[0, 1, 2].map((idx) => (
              <select
                key={idx}
                value={moveSequence[idx]}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setMoveSequence((prev) => {
                    const next = [...prev]
                    next[idx] = val
                    return next
                  })
                }}
                className="h-9 px-2 bg-slate-950/50 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500/30 w-[100px]"
              >
                <option value={-1}>{idx === 0 ? 'Any' : '—'}</option>
                {searchableMoves.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-orbitron tracking-wider text-slate-500">MIN DMG</span>
            <input
              type="number"
              min={0}
              max={999}
              value={minDamage}
              onChange={(e) => setMinDamage(Number(e.target.value))}
              className="h-9 w-14 px-1 bg-slate-950/50 border border-slate-800 rounded-lg text-xs text-slate-300 text-center focus:outline-none focus:border-cyan-500/30"
            />
          </div>

          <button
            onClick={() => setShowAll(!showAll)}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-orbitron tracking-wider transition ${
              showAll
                ? 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}
          >
            <Skull size={12} />
            {showAll ? 'ALL' : 'KILLS'}
          </button>

          <div className="flex-1 min-w-[120px]">
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                type="text"
                placeholder="Search moves..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 pl-9 pr-3 bg-slate-950/50 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500/30"
              />
            </div>
          </div>

          <div className="flex-1 min-w-[120px]">
            <div className="relative">
              <Users size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
              <input
                type="text"
                placeholder="Tag / Code / Name..."
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="w-full h-9 pl-9 pr-3 bg-slate-950/50 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-cyan-500/30"
              />
            </div>
          </div>

          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 h-9 px-3 rounded-lg text-xs font-orbitron text-slate-500 hover:text-slate-300 border border-slate-800 hover:border-slate-600 transition"
            >
              <X size={11} />
              CLEAR
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-6 py-2 border-b border-slate-800/30 flex items-center gap-5 shrink-0">
        <span className="text-xs font-mono-data text-slate-500">
          <span className="text-cyan-500/70">{replaysWithMatches.length.toLocaleString()}</span> games
        </span>
        <span className="text-xs font-mono-data text-slate-500">
          Total kills indexed: <span className="text-red-400/70">{totalKills.toLocaleString()}</span>
        </span>
        {!showAll && (
          <span className="text-xs font-mono-data text-slate-600">
            Showing only stock-taking interactions
          </span>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
        {allConversions.length === 0 && !indexing ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/30 border border-slate-700/20 flex items-center justify-center mb-4">
              <Sword size={30} className="text-slate-700" />
            </div>
            <p className="font-orbitron text-base font-bold text-slate-500 tracking-wide">Interactions Not Indexed</p>
            <p className="text-sm mt-1 text-slate-700 font-mono-data max-w-md text-center">
              Frame-by-frame analysis finds every stock-taking interaction. Choose a scope — recent games index in seconds.
            </p>

            {/* Date stats */}
            <div className="flex items-center gap-4 mt-3 mb-1">
              <span className="text-xs font-mono-data text-slate-600 flex items-center gap-1">
                <Database size={10} />
                {dateStats.total.toLocaleString()} games total
              </span>
              {dateStats.thisWeek > 0 && (
                <span className="text-xs font-mono-data text-green-500/70 flex items-center gap-1">
                  <Calendar size={10} />
                  {dateStats.thisWeek} this week
                </span>
              )}
              {dateStats.thisMonth > 0 && dateStats.thisMonth !== dateStats.thisWeek && (
                <span className="text-xs font-mono-data text-cyan-500/70 flex items-center gap-1">
                  <Calendar size={10} />
                  {dateStats.thisMonth} this month
                </span>
              )}
            </div>

            {/* Scope buttons */}
            <div className="flex items-center gap-2 mt-4">
              {dateStats.today > 0 && (
                <button
                  onClick={() => { setScope(1); onIndexCombos(1) }}
                  className="flex items-center gap-2 h-10 px-4 btn-primary rounded-lg text-xs"
                >
                  <Zap size={13} />
                  TODAY
                  <span className="text-xs opacity-60 font-mono-data">{dateStats.today}</span>
                </button>
              )}
              {dateStats.thisWeek > 0 && (
                <button
                  onClick={() => { setScope(7); onIndexCombos(7) }}
                  className={`flex items-center gap-2 h-10 px-4 rounded-lg text-xs transition ${
                    dateStats.today > 0
                      ? 'bg-slate-800/40 border border-slate-700/50 hover:border-cyan-500/30 text-slate-300'
                      : 'btn-primary'
                  }`}
                >
                  <Calendar size={13} />
                  THIS WEEK
                  <span className="text-xs opacity-60 font-mono-data">~{dateStats.thisWeek}</span>
                </button>
              )}
              {dateStats.thisMonth > 0 && (
                <button
                  onClick={() => { setScope(30); onIndexCombos(30) }}
                  className="flex items-center gap-2 h-10 px-4 bg-slate-800/40 border border-slate-700/50 hover:border-cyan-500/30 text-slate-300 rounded-lg text-xs transition"
                >
                  <Calendar size={13} />
                  THIS MONTH
                  <span className="text-xs opacity-60 font-mono-data">~{dateStats.thisMonth}</span>
                </button>
              )}
              <button
                onClick={() => onIndexCombos()}
                className="flex items-center gap-2 h-10 px-4 bg-slate-800/40 border border-slate-700/50 hover:border-purple-500/30 text-slate-400 rounded-lg text-xs transition"
              >
                <Database size={13} />
                ALL GAMES
                <span className="text-xs opacity-60 font-mono-data">{dateStats.total}</span>
              </button>
            </div>
          </div>
        ) : indexing ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-4">
            <div className="relative w-14 h-14">
              <div className="absolute inset-0 border-2 border-slate-800 rounded-full" />
              <div className="absolute inset-0 border-2 border-t-purple-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
            </div>
            <div className="text-center">
              <p className="font-orbitron text-sm tracking-[0.2em] text-slate-500">Indexing interactions...</p>
              <p className="text-xs font-mono-data text-slate-600 mt-1">
                {indexProgress.current.toLocaleString()} / {indexProgress.total.toLocaleString()} replays
              </p>
            </div>
            <div className="w-64 h-1.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500/60 rounded-full transition-all duration-200"
                style={{ width: `${indexPercent}%` }}
              />
            </div>
          </div>
        ) : replaysWithMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/30 border border-slate-700/20 flex items-center justify-center mb-4">
              <Sword size={30} className="text-slate-700" />
            </div>
            <p className="font-orbitron text-base font-bold text-slate-500 tracking-wide">No games match</p>
            <p className="text-sm mt-1 text-slate-700 font-mono-data">Try adjusting filters or enable ALL interactions</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {replaysWithMatches.map(({ replay, matches }) => {
              const isExpanded = expandedGame === replay.path
              return (
                <div key={replay.path} className="card rounded-xl overflow-hidden">
                  {/* Game header */}
                  <button
                    onClick={() => setExpandedGame(isExpanded ? null : replay.path)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/30 transition text-left"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="font-mono-data text-sm text-slate-500 shrink-0">
                        {formatDate(replay.date)}
                      </span>
                      <span className="badge-stage px-2 py-0.5 rounded text-xs shrink-0">
                        {(STAGES[replay.stageId ?? -1] || 'Unknown').toUpperCase()}
                      </span>
                      <span className="text-sm font-mono-data text-slate-600 shrink-0">
                        {formatDuration(replay.lastFrame)}
                      </span>
                      <div className="flex items-center gap-2 flex-wrap">
                        {replay.players.map((player, idx) => (
                          <span key={player.port} className="flex items-center gap-1">
                            {idx > 0 && <span className="text-slate-700 text-sm font-orbitron">VS</span>}
                            <span className="text-base font-semibold text-slate-200">
                              {CHARACTERS[player.characterId] || `Char ${player.characterId}`}
                            </span>
                            {player.connectCode && (
                              <span className="text-sm text-slate-600 font-mono-data">({player.connectCode})</span>
                            )}
                            {player.nametag && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700/50 font-mono-data">{player.nametag}</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <span className="ml-auto text-sm px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono-data shrink-0">
                        {matches.length} interaction{matches.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {isExpanded ? <ChevronUp size={14} className="text-slate-500 shrink-0 ml-2" /> : <ChevronDown size={14} className="text-slate-500 shrink-0 ml-2" />}
                  </button>

                  {/* Expanded interactions */}
                  {isExpanded && (
                    <div className="px-3 pb-3 grid gap-1.5">
                      {matches.map((conv, idx) => (
                        <div
                          key={`${conv.path}-${conv.startFrame}-${idx}`}
                          className="bg-slate-950/40 border border-slate-800/50 rounded-lg p-3 group hover:border-slate-700 transition"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              {/* Character matchup — shows WHO is doing the comboing */}
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <StockIcon characterId={conv.playerCharacter ?? -1} size={18} />
                                <span className="text-base font-bold text-cyan-400">
                                  {CHARACTERS[conv.playerCharacter ?? -1] || 'Unknown'}
                                </span>
                                <span className="text-base text-slate-500">
                                  {conv.didKill ? 'took stock from' : 'comboed'}
                                </span>
                                <StockIcon characterId={conv.opponentCharacter ?? -1} size={18} />
                                <span className="text-base font-bold text-slate-300">
                                  {CHARACTERS[conv.opponentCharacter ?? -1] || 'Unknown'}
                                </span>
                                {conv.didKill && (
                                  <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-orbitron">
                                    <Skull size={8} />
                                    STOCK
                                  </span>
                                )}
                                {conv.openingType && conv.openingType !== 'unknown' && (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-cyan-500/5 text-cyan-500/60 border border-cyan-500/10 font-mono-data">
                                    {OPENING_LABELS[conv.openingType] || conv.openingType}
                                  </span>
                                )}
                                <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700/50 font-mono-data">
                                  Frame {(conv.startFrame ?? 0).toLocaleString()}
                                </span>
                              </div>

                              {/* Move chain */}
                              <div className="text-base text-slate-300 leading-relaxed">
                                {formatComboString(conv.playerCharacter ?? 0, conv.moves ?? [])}
                              </div>

                              {/* Damage + meta — damage is now prominent */}
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className="text-sm font-mono-data font-bold text-purple-400">
                                  {Math.round(conv.damage ?? 0)}%
                                  <span className="font-normal text-slate-600 ml-1">
                                    ({Math.round(conv.startPercent ?? 0)}% → {Math.round(conv.endPercent ?? 0)}%)
                                  </span>
                                </span>
                                <span className="text-sm font-mono-data text-slate-600">
                                  {(conv.moves ?? []).length} hits
                                </span>
                                <span className="text-sm font-mono-data text-slate-600">
                                  {((conv.endFrame ?? 0) - (conv.startFrame ?? 0))}f
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition">
                              <button
                                onClick={() => analyzeCombo(conv)}
                                className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-orbitron tracking-wider text-orange-400 hover:text-orange-300 border border-orange-500/20 hover:border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 transition"
                                title="Analyze missed opportunities"
                              >
                                <Lightbulb size={12} />
                                ANALYZE
                              </button>
                              <button
                                onClick={async () => {
                                  try {
                                    await window.electron.addBookmark({
                                      path: conv.path,
                                      fileName: replay.fileName,
                                      startFrame: conv.startFrame,
                                      endFrame: conv.endFrame,
                                      playerIndex: conv.playerIndex,
                                      playerCharacter: conv.playerCharacter,
                                      opponentCharacter: conv.opponentCharacter,
                                      damage: conv.damage,
                                      didKill: conv.didKill,
                                      category: conv.category || 'combo',
                                      date: replay.date || new Date().toISOString()
                                    })
                                  } catch (e) {
                                    console.error('Failed to bookmark:', e)
                                  }
                                }}
                                className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-500 hover:text-yellow-400 hover:bg-yellow-500/10 border border-transparent hover:border-yellow-500/20 transition"
                                title="Bookmark"
                              >
                                <Star size={14} />
                              </button>
                              <button
                                onClick={() => onPlayCombo(conv.path, conv.startFrame ?? 0, conv.endFrame ?? (conv.startFrame ?? 0) + 60)}
                                className="flex items-center gap-2 h-9 px-4 btn-play rounded-lg text-xs"
                              >
                                <Play size={12} fill="currentColor" />
                                PLAY
                              </button>
                            </div>

                            {/* Training overlays */}
                            {trainingCodes.length > 0 && (
                              <div className="mt-2 flex items-center gap-2">
                                <span className="text-[10px] font-orbitron tracking-wider text-slate-600">OVERLAYS</span>
                                <span className="text-[10px] text-orange-400/70 font-mono-data hidden sm:inline">
                                  (quit Dolphin first)
                                </span>
                                {trainingCodes.map((code) => (
                                  <button
                                    key={code.id}
                                    onClick={() => toggleTrainingCode(code.id, !code.enabled)}
                                    title={code.name}
                                    className={`w-5 h-5 rounded border transition ${
                                      code.enabled
                                        ? code.id === 'actionable-green'
                                          ? 'bg-green-500/40 border-green-500/60'
                                          : code.id === 'lcancel-red'
                                          ? 'bg-red-500/40 border-red-500/60'
                                          : code.id === 'iasa-yellow'
                                          ? 'bg-yellow-500/40 border-yellow-500/60'
                                          : 'bg-cyan-500/40 border-cyan-500/60'
                                        : 'bg-slate-800/40 border-slate-700/30 hover:border-slate-600'
                                    }`}
                                  >
                                    <div className={`w-2 h-2 rounded-full mx-auto ${
                                      code.enabled
                                        ? code.id === 'actionable-green'
                                          ? 'bg-green-400'
                                          : code.id === 'lcancel-red'
                                          ? 'bg-red-400'
                                          : code.id === 'iasa-yellow'
                                          ? 'bg-yellow-400'
                                          : 'bg-cyan-400'
                                        : 'bg-slate-600'
                                    }`} />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Missed opportunities analysis */}
                          {(() => {
                            const key = `${conv.path}-${conv.startFrame}`
                            const analysis = analyses[key]
                            if (!analysis) return null
                            if (analysis.loading) return (
                              <div className="mt-2 flex items-center gap-2 text-xs text-orange-400/70 font-mono-data">
                                <div className="w-3 h-3 border-2 border-orange-500/30 border-t-orange-400 rounded-full animate-spin" />
                                Analyzing frames...
                              </div>
                            )
                            if (analysis.opportunities.length === 0) return (
                              <div className="mt-2 text-xs text-slate-600 font-mono-data">
                                No missed opportunities detected in this interaction.
                              </div>
                            )
                            return (
                              <div className="mt-2 space-y-1.5">
                                {analysis.opportunities.map((opp: any, i: number) => (
                                  <div
                                    key={i}
                                    className={`p-2.5 rounded-lg border ${
                                      opp.type === 'missed-tech'
                                        ? 'bg-red-500/5 border-red-500/10'
                                        : opp.type === 'wrong-read-tech-chase'
                                        ? 'bg-orange-500/5 border-orange-500/10'
                                        : 'bg-yellow-500/5 border-yellow-500/10'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 mb-1">
                                      <Dumbbell size={12} className={
                                        opp.type === 'missed-tech' ? 'text-red-400' :
                                        opp.type === 'wrong-read-tech-chase' ? 'text-orange-400' :
                                        'text-yellow-400'
                                      } />
                                      <span className={`text-xs font-bold font-orbitron ${
                                        opp.type === 'missed-tech' ? 'text-red-300' :
                                        opp.type === 'wrong-read-tech-chase' ? 'text-orange-300' :
                                        'text-yellow-300'
                                      }`}>
                                        {opp.description}
                                      </span>
                                      <span className="text-[10px] text-slate-600 font-mono-data ml-auto">
                                        Frame {opp.frame.toLocaleString()}
                                      </span>
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-mono-data leading-relaxed">
                                      {opp.suggestion}
                                    </p>
                                    <button
                                      onClick={async () => {
                                        const result = await window.electron.launchUnclePunch()
                                        if (!result.success) alert(result.error)
                                      }}
                                      className="mt-1.5 flex items-center gap-1.5 text-[11px] font-orbitron tracking-wider text-orange-400 hover:text-orange-300 transition"
                                    >
                                      <Dumbbell size={11} />
                                      PRACTICE IN UNCLE PUNCH → {(opp.unclePunchEvent || 'TRAINING').toUpperCase()}
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )
                          })()}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default ComboSearch

import { useState, useEffect } from 'react'
import { Play, Star, Trash2, X, Film, Dumbbell, Lightbulb } from 'lucide-react'
import { CHARACTERS } from './constants'

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

interface Props {
  onPlayCombo: (path: string, startFrame: number, endFrame: number) => void
}

const CATEGORY_COLORS: Record<string, string> = {
  edgeguard: 'text-red-400',
  'punish-kill': 'text-orange-400',
  kill: 'text-yellow-400',
  punish: 'text-orange-300',
  opening: 'text-cyan-400',
  combo: 'text-purple-400',
  trade: 'text-slate-400',
}

function Bookmarks({ onPlayCombo }: Props) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [loading, setLoading] = useState(true)
  const [analyses, setAnalyses] = useState<Record<string, { loading: boolean; opportunities: any[] }>>({})
  const [trainingCodes, setTrainingCodes] = useState<{ id: string; name: string; enabled: boolean }[]>([])

  useEffect(() => {
    loadBookmarks()
    loadTrainingCodes()
  }, [])

  const loadTrainingCodes = async () => {
    try {
      const result = await window.electron.getTrainingMods()
      if (result.available && result.codes) {
        setTrainingCodes(result.codes)
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

  const loadBookmarks = async () => {
    try {
      const result = await window.electron.getBookmarks()
      setBookmarks(result)
    } catch (e) {
      console.error('Failed to load bookmarks:', e)
    }
    setLoading(false)
  }

  const removeBookmark = async (id: string) => {
    try {
      await window.electron.removeBookmark(id)
      setBookmarks((prev) => prev.filter((b) => b.id !== id))
    } catch (e) {
      console.error('Failed to remove bookmark:', e)
    }
  }

  const clearAll = async () => {
    try {
      await window.electron.clearBookmarks()
      setBookmarks([])
    } catch (e) {
      console.error('Failed to clear bookmarks:', e)
    }
  }

  const playQueue = async () => {
    try {
      const result = await window.electron.playBookmarkQueue()
      if (!result.success) {
        alert(result.error)
      }
    } catch (e) {
      console.error('Failed to play queue:', e)
    }
  }

  const analyzeBookmark = async (b: Bookmark) => {
    const key = b.id
    setAnalyses((prev) => ({ ...prev, [key]: { loading: true, opportunities: [] } }))

    let playerIndex = b.playerIndex
    // Fallback: if old bookmark lacks playerIndex, try to get it from replay
    if (playerIndex === undefined) {
      try {
        const game = await window.electron.getReplayWinner(b.path)
        // We can't easily get playerIndex from getReplayWinner, so we'll skip analysis for old bookmarks
        // Or we could add a new IPC handler, but for now just skip
        setAnalyses((prev) => ({ ...prev, [key]: { loading: false, opportunities: [] } }))
        alert('This bookmark was saved before analysis support was added. Please re-bookmark it from the Combos tab.')
        return
      } catch (e) {
        setAnalyses((prev) => ({ ...prev, [key]: { loading: false, opportunities: [] } }))
        return
      }
    }

    try {
      const result = await window.electron.analyzeMissedOpportunities(
        b.path,
        b.startFrame,
        b.endFrame,
        playerIndex
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

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center text-slate-600">
        <div className="relative w-14 h-14">
          <div className="absolute inset-0 border-2 border-slate-800 rounded-full" />
          <div className="absolute inset-0 border-2 border-t-cyan-500 border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-6 py-3 border-b border-slate-800/50 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Star size={16} className="text-yellow-500/70" />
          <span className="text-sm font-orbitron tracking-wider text-slate-400">BOOKMARKS</span>
          <span className="text-xs font-mono-data text-slate-600">{bookmarks.length}</span>
        </div>
        {bookmarks.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={playQueue}
              className="flex items-center gap-2 h-9 px-4 btn-play rounded-lg text-xs"
            >
              <Film size={13} />
              PLAY QUEUE
            </button>
            <button
              onClick={clearAll}
              className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-orbitron text-slate-500 hover:text-red-400 border border-slate-800 hover:border-red-500/30 transition"
            >
              <Trash2 size={12} />
              CLEAR
            </button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
        {bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/30 border border-slate-700/20 flex items-center justify-center mb-4">
              <Star size={30} className="text-slate-700" />
            </div>
            <p className="font-orbitron text-base font-bold text-slate-500 tracking-wide">No Bookmarks</p>
            <p className="text-sm mt-1 text-slate-700 font-mono-data max-w-md text-center">
              Star conversions in the Combos tab to build your highlight reel.
            </p>
          </div>
        ) : (
          <div className="grid gap-2">
            {bookmarks.map((b) => {
              const analysis = analyses[b.id]
              return (
                <div
                  key={b.id}
                  className="card rounded-xl p-4 group"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-base font-bold text-cyan-400">
                          {CHARACTERS[b.playerCharacter ?? -1] || 'Unknown'}
                        </span>
                        <span className="text-sm text-slate-500">
                          {b.didKill ? 'took stock from' : 'comboed'}
                        </span>
                        <span className="text-base font-bold text-slate-300">
                          {CHARACTERS[b.opponentCharacter ?? -1] || 'Unknown'}
                        </span>
                        <span className={`text-xs px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700/50 font-mono-data ${CATEGORY_COLORS[b.category] || 'text-slate-400'}`}>
                          {b.category}
                        </span>
                        {b.didKill && (
                          <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20 font-orbitron">
                            <Star size={8} fill="currentColor" />
                            STOCK
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-600 font-mono-data">
                        <span>{b.fileName}</span>
                        <span>·</span>
                        <span>Frame {b.startFrame.toLocaleString()}</span>
                        <span>·</span>
                        <span className="text-purple-400 font-bold">{Math.round(b.damage)}%</span>
                        <span>·</span>
                        <span>{new Date(b.date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => analyzeBookmark(b)}
                        className="flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-orbitron tracking-wider text-orange-400 hover:text-orange-300 border border-orange-500/20 hover:border-orange-500/30 bg-orange-500/5 hover:bg-orange-500/10 transition"
                        title="Analyze missed opportunities"
                      >
                        <Lightbulb size={12} />
                        ANALYZE
                      </button>
                      <button
                        onClick={() => onPlayCombo(b.path, b.startFrame, b.endFrame)}
                        className="flex items-center gap-2 h-9 px-4 btn-play rounded-lg text-xs"
                      >
                        <Play size={12} fill="currentColor" />
                        PLAY
                      </button>
                      <button
                        onClick={() => removeBookmark(b.id)}
                        className="flex items-center justify-center w-9 h-9 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Training overlays */}
                  {trainingCodes.length > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-[10px] font-orbitron tracking-wider text-slate-600">OVERLAYS</span>
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

                  {/* Missed opportunities analysis */}
                  {analysis && (
                    <div className="mt-2">
                      {analysis.loading ? (
                        <div className="flex items-center gap-2 text-xs text-orange-400/70 font-mono-data">
                          <div className="w-3 h-3 border-2 border-orange-500/30 border-t-orange-400 rounded-full animate-spin" />
                          Analyzing frames...
                        </div>
                      ) : analysis.opportunities.length === 0 ? (
                        <div className="text-xs text-slate-600 font-mono-data">
                          No missed opportunities detected in this interaction.
                        </div>
                      ) : (
                        <div className="space-y-1.5">
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
                                PRACTICE IN UNCLE PUNCH → {opp.unclePunchEvent.toUpperCase()}
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
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

export default Bookmarks

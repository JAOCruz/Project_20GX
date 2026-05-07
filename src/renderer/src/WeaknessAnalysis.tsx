import { useMemo, useState } from 'react'
import { AlertTriangle, Shield, Sword, Skull, TrendingDown, Target, Zap, ChevronRight, Dumbbell, X } from 'lucide-react'
import { CHARACTERS, STAGES } from './constants'
import { StockIcon } from './components/StockIcon'

interface Player {
  port: number
  characterId: number
  connectCode?: string
  displayName?: string
}

interface Replay {
  path: string
  fileName: string
  date?: string
  stageId?: number
  isTeams?: boolean
  winnerPort: number | null
  players: Player[]
  combos: any[] | null
}

interface Props {
  replays: Replay[]
}

const CATEGORY_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  edgeguard: { label: 'Edgeguarded', color: 'text-red-400', icon: <Skull size={12} /> },
  'punish-kill': { label: 'Punished', color: 'text-orange-400', icon: <Sword size={12} /> },
  kill: { label: 'Killed', color: 'text-yellow-400', icon: <Skull size={12} /> },
  punish: { label: 'Punished (survived)', color: 'text-orange-300', icon: <Sword size={12} /> },
  opening: { label: 'Neutral Lost', color: 'text-cyan-400', icon: <Target size={12} /> },
  combo: { label: 'Comboed', color: 'text-purple-400', icon: <Zap size={12} /> },
  trade: { label: 'Traded', color: 'text-slate-400', icon: <Shield size={12} /> },
}

/** Map death categories to Uncle Punch training events */
const UNCLE_PUNCH_EVENTS: Record<string, { event: string; subEvent: string; tip: string }> = {
  edgeguard: {
    event: 'Ledge Options',
    subEvent: 'Ledge Dash / Sweetspot',
    tip: 'Drill ledge options against your worst matchup',
  },
  'punish-kill': {
    event: 'DI / Tech Chase',
    subEvent: 'Survival DI & SDI',
    tip: 'Work on survival DI to escape kill confirms',
  },
  kill: {
    event: 'DI / Tech Chase',
    subEvent: 'Survival DI',
    tip: 'Practice DI to live longer at high percents',
  },
  punish: {
    event: 'DI / Tech Chase',
    subEvent: 'Combo DI & SDI',
    tip: 'Work on defensive options out of hitstun',
  },
  opening: {
    event: 'Neutral / Spacing',
    subEvent: 'Spacing & Approach',
    tip: 'Review neutral game fundamentals',
  },
  combo: {
    event: 'DI / Tech Chase',
    subEvent: 'SDI & Combo DI',
    tip: 'Practice SDI to escape multi-hit combos',
  },
  trade: {
    event: 'Neutral / Spacing',
    subEvent: 'Spacing & Disjoints',
    tip: 'Focus on safer spacing in neutral',
  },
}

interface TrainingRec {
  event: string
  subEvent: string
  tip: string
  reason: string
}

function getTrainingRecommendation(char: any): TrainingRec | null {
  if (!char.topDeathCauses || char.topDeathCauses.length === 0) return null

  const [topCat] = char.topDeathCauses[0]
  const mapping = UNCLE_PUNCH_EVENTS[topCat]
  if (!mapping) return null

  const info = CATEGORY_LABELS[topCat] || { label: topCat }
  const reason = `${Math.round((char.topDeathCauses[0][1] / Math.max(char.stocksLost, 1)) * 100)}% of stocks lost to ${info.label}`

  return {
    event: mapping.event,
    subEvent: mapping.subEvent,
    tip: mapping.tip,
    reason,
  }
}

function getCoachingTip(char: any): string | null {
  if (char.winRate < 40) return 'Review neutral game — your win rate is below 40%'
  if (char.avgDeathDamage < 40) return 'Work on defensive options — dying at very low %'
  if (char.avgDeathDamage > 80) return 'Work on DI and survival — you live long but still lose'

  const edgeguardPct = char.topDeathCauses.find(([c]: [string, number]) => c === 'edgeguard')
  if (edgeguardPct && char.stocksLost > 0 && (edgeguardPct[1] / char.stocksLost) > 0.4) {
    return 'Drill ledge options — over 40% of deaths are offstage'
  }

  return null
}

function formatPercent(n: number): string {
  return `${Math.round(n)}%`
}

function WeaknessAnalysis({ replays }: Props) {
  const [activeTraining, setActiveTraining] = useState<number | null>(null)

  const analysis = useMemo(() => {
    const indexedReplays = replays.filter((r) => r.combos !== null && r.winnerPort !== null)
    if (indexedReplays.length === 0) return null

    // Per-character stats
    const charStats: Record<number, {
      games: number
      wins: number
      losses: number
      stocksLost: number
      stocksTaken: number
      deathsByCategory: Record<string, number>
      avgDamagePerStock: number[]
      worstStages: Record<number, number>
      worstMatchups: Record<number, number>
    }> = {}

    for (const replay of indexedReplays) {
      if (replay.isTeams) continue // Skip teams for simplicity

      const winner = replay.players.find((p) => p.port === replay.winnerPort)
      const loser = replay.players.find((p) => p.port !== replay.winnerPort)
      if (!winner || !loser) continue

      const wChar = winner.characterId
      const lChar = loser.characterId

      // Winner stats
      if (!charStats[wChar]) {
        charStats[wChar] = {
          games: 0, wins: 0, losses: 0, stocksLost: 0, stocksTaken: 0,
          deathsByCategory: {}, avgDamagePerStock: [],
          worstStages: {}, worstMatchups: {}
        }
      }
      charStats[wChar].games++
      charStats[wChar].wins++

      // Loser stats
      if (!charStats[lChar]) {
        charStats[lChar] = {
          games: 0, wins: 0, losses: 0, stocksLost: 0, stocksTaken: 0,
          deathsByCategory: {}, avgDamagePerStock: [],
          worstStages: {}, worstMatchups: {}
        }
      }
      charStats[lChar].games++
      charStats[lChar].losses++

      // Track stocks lost by loser (combos where loser is the victim)
      if (replay.combos) {
        for (const combo of replay.combos) {
          // combo.opponentCharacter is the victim
          if (combo.opponentCharacter === lChar && combo.didKill) {
            charStats[lChar].stocksLost++
            charStats[wChar].stocksTaken++
            const cat = combo.category || 'combo'
            charStats[lChar].deathsByCategory[cat] = (charStats[lChar].deathsByCategory[cat] || 0) + 1
            charStats[lChar].avgDamagePerStock.push(combo.damage)
          }
        }
      }

      // Worst matchup for loser
      charStats[lChar].worstMatchups[wChar] = (charStats[lChar].worstMatchups[wChar] || 0) + 1

      // Worst stage for loser
      if (replay.stageId !== undefined) {
        charStats[lChar].worstStages[replay.stageId] = (charStats[lChar].worstStages[replay.stageId] || 0) + 1
      }
    }

    // Compute derived stats
    const result = Object.entries(charStats).map(([charId, stats]) => {
      const id = Number(charId)
      const winRate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0
      const avgDeathDamage = stats.avgDamagePerStock.length > 0
        ? stats.avgDamagePerStock.reduce((a, b) => a + b, 0) / stats.avgDamagePerStock.length
        : 0

      const topDeathCauses = Object.entries(stats.deathsByCategory)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)

      const worstMatchup = Object.entries(stats.worstMatchups)
        .sort((a, b) => b[1] - a[1])[0]

      const worstStage = Object.entries(stats.worstStages)
        .sort((a, b) => b[1] - a[1])[0]

      return {
        characterId: id,
        characterName: CHARACTERS[id] || `Char ${id}`,
        games: stats.games,
        wins: stats.wins,
        losses: stats.losses,
        winRate,
        stocksLost: stats.stocksLost,
        avgDeathDamage,
        topDeathCauses,
        worstMatchup: worstMatchup ? { charId: Number(worstMatchup[0]), count: worstMatchup[1] } : null,
        worstStage: worstStage ? { stageId: Number(worstStage[0]), count: worstStage[1] } : null,
      }
    })

    return result.sort((a, b) => b.games - a.games)
  }, [replays])

  const handleTrain = async (charId: number) => {
    setActiveTraining(charId)
    try {
      const result = await window.electron.launchUnclePunch()
      if (!result.success) {
        alert(result.error)
      }
    } catch (e) {
      alert('Failed to launch Uncle Punch. Make sure the ISO path is configured in Settings.')
    }
    // Keep the training card open so they can see the recommendation
  }

  const closeTraining = () => setActiveTraining(null)

  if (!analysis || analysis.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-slate-600">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/30 border border-slate-700/20 flex items-center justify-center mb-4">
          <AlertTriangle size={30} className="text-slate-700" />
        </div>
        <p className="font-orbitron text-base font-bold text-slate-500 tracking-wide">No Analysis Data</p>
        <p className="text-sm mt-1 text-slate-700 font-mono-data max-w-md text-center">
          Index interactions with "ALL GAMES" scope to analyze your weaknesses. Winner detection requires indexed data.
        </p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-6 py-3 border-b border-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-orange-500/70" />
          <span className="text-sm font-orbitron tracking-wider text-slate-400">WEAKNESS ANALYSIS</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {analysis.map((char) => {
            const trainingRec = getTrainingRecommendation(char)
            const coachingTip = getCoachingTip(char)
            const isTrainingOpen = activeTraining === char.characterId

            return (
              <div key={char.characterId} className="card rounded-xl p-5">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <StockIcon characterId={char.characterId} size={24} />
                    <span className="text-lg font-bold text-slate-100 font-orbitron">{char.characterName}</span>
                    <span className={`text-sm font-mono-data font-bold ${char.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercent(char.winRate)} WR
                    </span>
                  </div>
                  <span className="text-xs text-slate-600 font-mono-data">{char.games} games</span>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="bg-slate-950/30 rounded-lg p-2.5 text-center">
                    <span className="text-lg font-bold text-green-400 font-orbitron">{char.wins}</span>
                    <p className="text-[10px] text-slate-600 font-mono-data mt-0.5">WINS</p>
                  </div>
                  <div className="bg-slate-950/30 rounded-lg p-2.5 text-center">
                    <span className="text-lg font-bold text-red-400 font-orbitron">{char.losses}</span>
                    <p className="text-[10px] text-slate-600 font-mono-data mt-0.5">LOSSES</p>
                  </div>
                  <div className="bg-slate-950/30 rounded-lg p-2.5 text-center">
                    <span className="text-lg font-bold text-purple-400 font-orbitron">{Math.round(char.avgDeathDamage)}%</span>
                    <p className="text-[10px] text-slate-600 font-mono-data mt-0.5">AVG DEATH</p>
                  </div>
                </div>

                {/* Coaching tip */}
                {coachingTip && (
                  <div className="mb-3 p-2.5 rounded-lg bg-orange-500/5 border border-orange-500/10">
                    <p className="text-[11px] text-orange-300 font-mono-data leading-relaxed">
                      <span className="font-bold">TIP:</span> {coachingTip}
                    </p>
                  </div>
                )}

                {/* Death causes */}
                {char.topDeathCauses.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[10px] font-orbitron tracking-wider text-slate-500 mb-2">HOW YOU DIE</p>
                    <div className="space-y-1.5">
                      {char.topDeathCauses.map(([cat, count]) => {
                        const info = CATEGORY_LABELS[cat] || { label: cat, color: 'text-slate-400', icon: <Skull size={12} /> }
                        const pct = char.stocksLost > 0 ? Math.round((count / char.stocksLost) * 100) : 0
                        return (
                          <div key={cat} className="flex items-center gap-2">
                            <span className={`flex items-center gap-1 text-xs ${info.color}`}>
                              {info.icon}
                              {info.label}
                            </span>
                            <div className="flex-1 h-1.5 bg-slate-800/50 rounded-full overflow-hidden">
                              <div className="h-full bg-red-500/40 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono-data w-8 text-right">{pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Training recommendation */}
                {trainingRec && (
                  <div className="mb-3">
                    {isTrainingOpen ? (
                      <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Dumbbell size={14} className="text-orange-400" />
                            <span className="text-xs font-bold text-orange-300 font-orbitron">UNCLE PUNCH TRAINING</span>
                          </div>
                          <button
                            onClick={closeTraining}
                            className="w-6 h-6 flex items-center justify-center rounded text-slate-500 hover:text-slate-300 transition"
                          >
                            <X size={12} />
                          </button>
                        </div>
                        <div className="space-y-1.5">
                          <p className="text-xs text-slate-300 font-mono-data">
                            Event: <span className="text-orange-300 font-bold">{trainingRec.event}</span>
                          </p>
                          <p className="text-xs text-slate-400 font-mono-data">
                            Focus: <span className="text-slate-200">{trainingRec.subEvent}</span>
                          </p>
                          <p className="text-[11px] text-slate-500 font-mono-data leading-relaxed">
                            {trainingRec.reason}. {trainingRec.tip}
                          </p>
                        </div>
                        <p className="mt-2 text-[10px] text-slate-600 font-mono-data">
                          Uncle Punch launched. Select the event from the in-game menu.
                        </p>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleTrain(char.characterId)}
                        className="w-full flex items-center justify-center gap-2 h-9 px-4 rounded-lg text-xs font-orbitron tracking-wider bg-orange-500/5 text-orange-400 border border-orange-500/20 hover:bg-orange-500/10 hover:border-orange-500/30 transition"
                      >
                        <Dumbbell size={13} />
                        TRAIN THIS — {trainingRec.event.toUpperCase()}
                      </button>
                    )}
                  </div>
                )}

                {/* Worst matchup / stage */}
                <div className="flex gap-3">
                  {char.worstMatchup && (
                    <div className="flex-1 bg-slate-950/30 rounded-lg p-2.5">
                      <p className="text-[10px] font-orbitron tracking-wider text-slate-500 mb-1">WORST MATCHUP</p>
                      <div className="flex items-center gap-1.5">
                        <TrendingDown size={12} className="text-red-400" />
                        <span className="text-sm font-bold text-slate-200">
                          vs {CHARACTERS[char.worstMatchup.charId] || 'Unknown'}
                        </span>
                        <span className="text-[10px] text-slate-600 font-mono-data">({char.worstMatchup.count} losses)</span>
                      </div>
                    </div>
                  )}
                  {char.worstStage && (
                    <div className="flex-1 bg-slate-950/30 rounded-lg p-2.5">
                      <p className="text-[10px] font-orbitron tracking-wider text-slate-500 mb-1">WORST STAGE</p>
                      <div className="flex items-center gap-1.5">
                        <ChevronRight size={12} className="text-orange-400" />
                        <span className="text-sm font-bold text-slate-200">
                          {STAGES[char.worstStage.stageId] || 'Unknown'}
                        </span>
                        <span className="text-[10px] text-slate-600 font-mono-data">({char.worstStage.count} losses)</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default WeaknessAnalysis

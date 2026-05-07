import { useMemo } from 'react'
import { BarChart3, Sword, Skull, MapPin, Calendar, TrendingUp, Activity, Target } from 'lucide-react'
import { CHARACTERS, STAGES } from './constants'
import { getMoveName } from './moves'
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
  lastFrame?: number
  stageId?: number
  month?: string
  combos: any[] | null
  players: Player[]
  lCancelStats?: {
    playerIndex: number
    port?: number
    characterId?: number
    success: number
    fail: number
    attackCounts: Record<string, number>
  }[]
}

interface Props {
  replays: Replay[]
}

function formatNumber(n: number): string {
  return n.toLocaleString()
}

function Bar({ value, max, color = 'cyan', label, count, prefix }: { value: number; max: number; color?: string; label: string; count: number; prefix?: React.ReactNode }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  const colorClasses: Record<string, string> = {
    cyan: 'bg-cyan-500/60',
    purple: 'bg-purple-500/60',
    green: 'bg-green-500/60',
    red: 'bg-red-500/60',
    yellow: 'bg-yellow-500/60',
  }
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-400 font-mono-data w-24 truncate text-right shrink-0 flex items-center justify-end gap-1.5">
        {prefix}
        {label}
      </span>
      <div className="flex-1 h-5 bg-slate-800/50 rounded-full overflow-hidden relative">
        <div
          className={`h-full ${colorClasses[color] || colorClasses.cyan} rounded-full transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 font-mono-data w-10 text-right shrink-0">{count}</span>
    </div>
  )
}

function StatCard({ icon, label, value, subtext }: { icon: React.ReactNode; label: string; value: string; subtext?: string }) {
  return (
    <div className="card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs font-orbitron tracking-wider text-slate-500">{label}</span>
      </div>
      <p className="text-2xl font-bold text-slate-200 font-orbitron">{value}</p>
      {subtext && <p className="text-xs text-slate-600 font-mono-data mt-1">{subtext}</p>}
    </div>
  )
}

function StatsDashboard({ replays }: Props) {
  const stats = useMemo(() => {
    const totalGames = replays.length
    let totalConversions = 0
    let totalKills = 0
    let totalDamage = 0
    let killDamages: number[] = []
    let openingTypes: Record<string, number> = {}
    let charGames: Record<number, number> = {}
    let stageGames: Record<number, number> = {}
    let killMoves: Record<string, number> = {}
    let timeline: Record<string, number> = {}
    let lCancelStats: Record<number, { success: number; fail: number; rate: number }> = {}

    for (const replay of replays) {
      // Character games played
      for (const player of replay.players) {
        charGames[player.characterId] = (charGames[player.characterId] || 0) + 1
      }

      // Stage games
      if (replay.stageId !== undefined) {
        stageGames[replay.stageId] = (stageGames[replay.stageId] || 0) + 1
      }

      // Timeline (by day for last 30 days, then by week)
      if (replay.date) {
        const d = new Date(replay.date)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        timeline[key] = (timeline[key] || 0) + 1
      }

      // Combo stats
      if (replay.combos) {
        for (const combo of replay.combos) {
          totalConversions++
          totalDamage += combo.damage || 0

          if (combo.didKill) {
            totalKills++
            killDamages.push(combo.damage || 0)

            // Track last move as kill move
            if (combo.moves && combo.moves.length > 0) {
              const lastMove = combo.moves[combo.moves.length - 1]
              const moveName = getMoveName(combo.playerCharacter, lastMove.moveId)
              killMoves[moveName] = (killMoves[moveName] || 0) + 1
            }
          }

          // Opening type
          if (combo.openingType) {
            openingTypes[combo.openingType] = (openingTypes[combo.openingType] || 0) + 1
          }
        }
      }
    }

    const avgKillDamage = killDamages.length > 0
      ? Math.round(killDamages.reduce((a, b) => a + b, 0) / killDamages.length)
      : 0

    const avgComboDamage = totalConversions > 0
      ? Math.round(totalDamage / totalConversions)
      : 0

    // Aggregate L-cancel stats by character
    for (const replay of replays) {
      if (replay.lCancelStats) {
        for (const lc of replay.lCancelStats) {
          if (lc.characterId === undefined) continue
          if (!lCancelStats[lc.characterId]) {
            lCancelStats[lc.characterId] = { success: 0, fail: 0, rate: 0 }
          }
          lCancelStats[lc.characterId].success += lc.success
          lCancelStats[lc.characterId].fail += lc.fail
        }
      }
    }

    // Calculate L-cancel rates
    const lCancelArray = Object.entries(lCancelStats)
      .map(([charId, data]) => {
        const total = data.success + data.fail
        return {
          characterId: Number(charId),
          characterName: CHARACTERS[Number(charId)] || `Char ${charId}`,
          success: data.success,
          fail: data.fail,
          total,
          rate: total > 0 ? Math.round((data.success / total) * 100) : 0
        }
      })
      .filter((d) => d.total > 0)
      .sort((a, b) => b.total - a.total)

    // Sort timeline by date
    const sortedTimeline = Object.entries(timeline)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-30) // Last 30 days with data

    // Top kill moves
    const topKillMoves = Object.entries(killMoves)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)

    // Top characters by games
    const topChars = Object.entries(charGames)
      .map(([id, count]) => ({ id: Number(id), count }))
      .sort((a, b) => b.count - a.count)

    // Top stages
    const topStages = Object.entries(stageGames)
      .map(([id, count]) => ({ id: Number(id), count }))
      .sort((a, b) => b.count - a.count)

    return {
      totalGames,
      totalConversions,
      totalKills,
      avgKillDamage,
      avgComboDamage,
      openingTypes,
      topChars,
      topStages,
      topKillMoves,
      sortedTimeline,
      lCancelArray,
    }
  }, [replays])

  const maxCharGames = stats.topChars[0]?.count || 0
  const maxStageGames = stats.topStages[0]?.count || 0
  const maxKillMoves = stats.topKillMoves[0]?.[1] || 0
  const maxTimeline = Math.max(...stats.sortedTimeline.map(([, c]) => c), 1)

  const totalOpenings = Object.values(stats.openingTypes).reduce((a, b) => a + b, 0)

  const hasData = stats.totalGames > 0 && stats.totalConversions > 0

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Header */}
      <div className="px-6 py-3 border-b border-slate-800/50 shrink-0">
        <div className="flex items-center gap-2">
          <BarChart3 size={16} className="text-cyan-500/70" />
          <span className="text-xs font-orbitron tracking-wider text-slate-400">COMBAT ANALYTICS</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-600">
            <div className="w-16 h-16 rounded-2xl bg-slate-800/30 border border-slate-700/20 flex items-center justify-center mb-4">
              <BarChart3 size={30} className="text-slate-700" />
            </div>
            <p className="font-orbitron text-base font-bold text-slate-500 tracking-wide">No Data Yet</p>
            <p className="text-sm mt-1 text-slate-700 font-mono-data max-w-md text-center">
              Index interactions in the Combos tab to generate your stats dashboard.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <StatCard
              icon={<Sword size={14} className="text-cyan-400" />}
              label="GAMES PLAYED"
              value={formatNumber(stats.totalGames)}
            />
            <StatCard
              icon={<Activity size={14} className="text-purple-400" />}
              label="CONVERSIONS"
              value={formatNumber(stats.totalConversions)}
              subtext={`${stats.avgComboDamage}% avg damage`}
            />
            <StatCard
              icon={<Skull size={14} className="text-red-400" />}
              label="STOCKS TAKEN"
              value={formatNumber(stats.totalKills)}
              subtext={`${stats.avgKillDamage}% avg kill damage`}
            />
            <StatCard
              icon={<Target size={14} className="text-green-400" />}
              label="KILL RATE"
              value={stats.totalConversions > 0 ? `${Math.round((stats.totalKills / stats.totalConversions) * 100)}%` : '0%'}
              subtext="of conversions end in stock"
            />
          </div>
        )}

        {hasData && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Character breakdown */}
            <div className="card rounded-xl p-4">
              <h3 className="text-xs font-orbitron tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <TrendingUp size={13} className="text-cyan-400" />
                GAMES BY CHARACTER
              </h3>
              <div className="space-y-1.5">
                {stats.topChars.slice(0, 10).map((char) => (
                  <Bar
                    key={char.id}
                    label={CHARACTERS[char.id] || `Char ${char.id}`}
                    value={char.count}
                    max={maxCharGames}
                    count={char.count}
                    color="cyan"
                    prefix={<StockIcon characterId={char.id} size={14} />}
                  />
                ))}
              </div>
            </div>

            {/* Stage breakdown */}
            <div className="card rounded-xl p-4">
              <h3 className="text-xs font-orbitron tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                <MapPin size={13} className="text-purple-400" />
                GAMES BY STAGE
              </h3>
              <div className="space-y-1.5">
                {stats.topStages.slice(0, 10).map((stage) => (
                  <Bar
                    key={stage.id}
                    label={STAGES[stage.id] || `Stage ${stage.id}`}
                    value={stage.count}
                    max={maxStageGames}
                    count={stage.count}
                    color="purple"
                  />
                ))}
              </div>
            </div>

            {/* Opening types */}
            {totalOpenings > 0 && (
              <div className="card rounded-xl p-4">
                <h3 className="text-xs font-orbitron tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Target size={13} className="text-green-400" />
                  OPENING TYPES
                </h3>
                <div className="space-y-1.5">
                  {Object.entries(stats.openingTypes)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => {
                      const labels: Record<string, string> = {
                        'neutral-win': 'Neutral Win',
                        'counter-attack': 'Counter Attack',
                        'trade': 'Trade',
                        'unknown': 'Unknown',
                      }
                      return (
                        <Bar
                          key={type}
                          label={labels[type] || type}
                          value={count}
                          max={totalOpenings}
                          count={count}
                          color={type === 'neutral-win' ? 'green' : type === 'counter-attack' ? 'yellow' : 'red'}
                        />
                      )
                    })}
                </div>
              </div>
            )}

            {/* Top kill moves */}
            {stats.topKillMoves.length > 0 && (
              <div className="card rounded-xl p-4">
                <h3 className="text-xs font-orbitron tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Skull size={13} className="text-red-400" />
                  TOP KILL MOVES
                </h3>
                <div className="space-y-1.5">
                  {stats.topKillMoves.map(([moveName, count]) => (
                    <Bar
                      key={moveName}
                      label={moveName}
                      value={count}
                      max={maxKillMoves}
                      count={count}
                      color="red"
                    />
                  ))}
                </div>
              </div>
            )}

            {/* L-Cancel Stats */}
            {stats.lCancelArray.length > 0 && (
              <div className="card rounded-xl p-4">
                <h3 className="text-xs font-orbitron tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Activity size={13} className="text-green-400" />
                  L-CANCEL ACCURACY
                </h3>
                <div className="space-y-2">
                  {stats.lCancelArray.map((lc) => (
                    <div key={lc.characterId} className="flex items-center gap-3">
                      <span className="text-xs text-slate-300 font-mono-data w-24 truncate flex items-center gap-1.5">
                        <StockIcon characterId={lc.characterId} size={14} />
                        {lc.characterName}
                      </span>
                      <div className="flex-1 h-4 bg-slate-800/50 rounded-full overflow-hidden relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${lc.rate >= 90 ? 'bg-green-500/60' : lc.rate >= 70 ? 'bg-yellow-500/60' : 'bg-red-500/60'}`}
                          style={{ width: `${lc.rate}%` }}
                        />
                      </div>
                      <span className={`text-xs font-mono-data font-bold w-10 text-right ${lc.rate >= 90 ? 'text-green-400' : lc.rate >= 70 ? 'text-yellow-400' : 'text-red-400'}`}>
                        {lc.rate}%
                      </span>
                      <span className="text-xs text-slate-600 font-mono-data">
                        {lc.success}/{lc.total}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            {stats.sortedTimeline.length > 0 && (
              <div className="card rounded-xl p-4 lg:col-span-2">
                <h3 className="text-xs font-orbitron tracking-wider text-slate-400 mb-3 flex items-center gap-2">
                  <Calendar size={13} className="text-cyan-400" />
                  ACTIVITY TIMELINE
                </h3>
                <div className="flex items-end gap-1 h-24">
                  {stats.sortedTimeline.map(([date, count]) => {
                    const h = Math.max(4, Math.round((count / maxTimeline) * 100))
                    return (
                      <div key={date} className="flex-1 flex flex-col items-center gap-1 group">
                        <div
                          className="w-full bg-cyan-500/30 hover:bg-cyan-400/50 rounded-t transition-all duration-200 min-w-[3px]"
                          style={{ height: `${h}%` }}
                          title={`${date}: ${count} games`}
                        />
                      </div>
                    )
                  })}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-xs text-slate-700 font-mono-data">
                    {stats.sortedTimeline[0]?.[0]}
                  </span>
                  <span className="text-xs text-slate-700 font-mono-data">
                    {stats.sortedTimeline[stats.sortedTimeline.length - 1]?.[0]}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default StatsDashboard

import { useState, useMemo } from 'react'
import { Brain, MessageSquare, Zap, AlertTriangle, Target, TrendingUp, Send, Key, Loader2 } from 'lucide-react'
import { CHARACTERS } from './constants'

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
  apiKey: string
  onApiKeyChange: (key: string) => void
}

function Coach({ replays, apiKey, onApiKeyChange }: Props) {
  const [question, setQuestion] = useState('')
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(false)
  const [showApiInput, setShowApiInput] = useState(!apiKey)

  const insights = useMemo(() => {
    const indexed = replays.filter((r) => r.combos !== null && r.winnerPort !== null)
    if (indexed.length === 0) return []

    const tips: { icon: React.ReactNode; title: string; body: string; severity: 'info' | 'warning' | 'critical' }[] = []

    // Character stats
    const charStats: Record<number, { games: number; wins: number; losses: number; stocksLost: number; edgeguardDeaths: number; avgDeathDmg: number[] }> = {}

    for (const replay of indexed) {
      if (replay.isTeams) continue
      const winner = replay.players.find((p) => p.port === replay.winnerPort)
      const loser = replay.players.find((p) => p.port !== replay.winnerPort)
      if (!winner || !loser) continue

      const wChar = winner.characterId
      const lChar = loser.characterId

      for (const id of [wChar, lChar]) {
        if (!charStats[id]) charStats[id] = { games: 0, wins: 0, losses: 0, stocksLost: 0, edgeguardDeaths: 0, avgDeathDmg: [] }
        charStats[id].games++
      }
      charStats[wChar].wins++
      charStats[lChar].losses++

      if (replay.combos) {
        for (const combo of replay.combos) {
          if (combo.opponentCharacter === lChar && combo.didKill) {
            charStats[lChar].stocksLost++
            charStats[lChar].avgDeathDmg.push(combo.damage)
            if (combo.category === 'edgeguard') charStats[lChar].edgeguardDeaths++
          }
        }
      }
    }

    for (const [charIdStr, stats] of Object.entries(charStats)) {
      const charId = Number(charIdStr)
      const name = CHARACTERS[charId] || 'Unknown'
      const winRate = stats.games > 0 ? (stats.wins / stats.games) * 100 : 0
      const edgeguardRate = stats.stocksLost > 0 ? (stats.edgeguardDeaths / stats.stocksLost) * 100 : 0
      const avgDmg = stats.avgDeathDmg.length > 0
        ? stats.avgDeathDmg.reduce((a, b) => a + b, 0) / stats.avgDeathDmg.length
        : 0

      if (winRate < 40 && stats.games >= 3) {
        tips.push({
          icon: <AlertTriangle size={14} />,
          title: `${name} Win Rate is ${Math.round(winRate)}%`,
          body: `You're losing ${Math.round(100 - winRate)}% of your ${name} games. Consider reviewing neutral game replays or practicing the ${name} Discord matchup chart.`,
          severity: 'critical'
        })
      }

      if (edgeguardRate > 40 && stats.stocksLost >= 3) {
        tips.push({
          icon: <Target size={14} />,
          title: `${edgeguardRate.toFixed(0)}% of stocks lost to edgeguards`,
          body: `Your ${name} is dying off-stage frequently. Drill ledge options and recovery patterns in Uncle Punch's Recovery event.`,
          severity: 'warning'
        })
      }

      if (avgDmg > 80 && stats.stocksLost >= 3) {
        tips.push({
          icon: <Zap size={14} />,
          title: `Average death at ${Math.round(avgDmg)}%`,
          body: `Your ${name} is living long but still dying. Work on DI and survival — check the Uncle Punch DI Training event.`,
          severity: 'info'
        })
      }

      if (avgDmg < 40 && stats.stocksLost >= 3) {
        tips.push({
          icon: <TrendingUp size={14} />,
          title: `Average death at ${Math.round(avgDmg)}% — early kills`,
          body: `You're getting killed at very low percents. Focus on defensive options: SDI, DI, and teching.`,
          severity: 'critical'
        })
      }
    }

    return tips
  }, [replays])

  const indexedReplays = replays.filter((r) => r.combos !== null && r.winnerPort !== null)

  const askGemini = async () => {
    if (!apiKey || !question.trim()) return
    setLoading(true)
    setResponse('')

    try {
      const statsSummary = insights.map((i) => `${i.title}: ${i.body}`).join('\n')
      const prompt = `You are a Super Smash Bros. Melee coach. The player has the following stats from their recent replays:\n\n${statsSummary}\n\nPlayer question: ${question}\n\nGive concise, actionable advice (2-3 paragraphs max). Be specific about drills and concepts.`

      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }]
        })
      })

      const data = await res.json()
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from Gemini.'
      setResponse(text)
    } catch (e) {
      setResponse('Error: ' + String(e))
    }

    setLoading(false)
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      <div className="px-6 py-3 border-b border-slate-800/50 shrink-0 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-purple-400" />
          <span className="text-sm font-orbitron tracking-wider text-slate-400">AI COACH</span>
        </div>
        <button
          onClick={() => setShowApiInput(!showApiInput)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-orbitron text-slate-500 hover:text-slate-300 border border-slate-800 hover:border-slate-600 transition"
        >
          <Key size={12} />
          {showApiInput ? 'HIDE KEY' : 'API KEY'}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
        {showApiInput && (
          <div className="card rounded-xl p-4 mb-4">
            <label className="block text-xs font-orbitron tracking-wider text-slate-500 mb-2">
              GEMINI API KEY
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="AIzaSy..."
              className="w-full h-10 px-4 bg-slate-950/50 border border-slate-800 rounded-lg text-sm text-slate-300 font-mono-data focus:outline-none focus:border-purple-500/30"
            />
            <p className="text-xs text-slate-700 font-mono-data mt-2">
              Get your key free at{' '}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" className="text-purple-400/60 hover:text-purple-400">
                aistudio.google.com/app/apikey
              </a>
            </p>
          </div>
        )}

        {indexedReplays.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-600">
            <Brain size={30} className="text-slate-700 mb-3" />
            <p className="font-orbitron text-sm text-slate-500">Index games to generate coaching insights</p>
          </div>
        ) : (
          <>
            {/* Auto-generated insights */}
            {insights.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-orbitron tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <AlertTriangle size={13} className="text-yellow-400" />
                  DETECTED WEAKNESSES
                </h3>
                <div className="grid gap-2">
                  {insights.map((tip, idx) => (
                    <div
                      key={idx}
                      className={`card rounded-xl p-4 border-l-2 ${
                        tip.severity === 'critical'
                          ? 'border-l-red-500'
                          : tip.severity === 'warning'
                            ? 'border-l-yellow-500'
                            : 'border-l-cyan-500'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`${tip.severity === 'critical' ? 'text-red-400' : tip.severity === 'warning' ? 'text-yellow-400' : 'text-cyan-400'}`}>
                          {tip.icon}
                        </span>
                        <span className="text-sm font-bold text-slate-200">{tip.title}</span>
                      </div>
                      <p className="text-sm text-slate-400 leading-relaxed">{tip.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ask Gemini */}
            {apiKey && (
              <div className="card rounded-xl p-4">
                <h3 className="text-xs font-orbitron tracking-wider text-slate-500 mb-3 flex items-center gap-2">
                  <MessageSquare size={13} className="text-purple-400" />
                  ASK GEMINI
                </h3>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && askGemini()}
                    placeholder="Why do I keep losing to Marth?"
                    className="flex-1 h-10 px-4 bg-slate-950/50 border border-slate-800 rounded-lg text-sm text-slate-300 focus:outline-none focus:border-purple-500/30"
                  />
                  <button
                    onClick={askGemini}
                    disabled={loading || !question.trim()}
                    className="flex items-center gap-2 h-10 px-4 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded-lg text-xs font-orbitron hover:bg-purple-500/20 transition disabled:opacity-50"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    ASK
                  </button>
                </div>
                {response && (
                  <div className="bg-slate-950/40 border border-slate-800/50 rounded-lg p-4">
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{response}</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default Coach

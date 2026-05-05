# 20GX Coach — Complete Feature Documentation

## Architecture Overview
- **Electron main process** (`src/main/index.ts`): File I/O, Slippi parsing, caching, Dolphin launching
- **Preload** (`src/preload/index.ts`): Secure IPC bridge
- **React renderer** (`src/renderer/src/`): UI components, state management
- **Two-phase scan**: Fast header scan → On-demand deep index with `getStats()`
- **Cache**: `~/Library/Application Support/ssbm-coach/replay-cache-v2.json` with versioning

---

## Tabs

### 1. LIBRARY
- Fast recursive scan of `.slp` files
- Detects `YYYY-MM` subfolder structure
- Search by filename, character, connect code, display name, nametag
- Filter by character, stage, month
- Sort by date or duration (newest-first default)
- Shows date, stage, duration, players with tags
- "Load Replays / Rescan" button

### 2. COMBOS
- **Smart indexing**: Today (1 day) / This Week (7 days) / This Month (30 days) / All Games
- Games-first view: expand a game to see its interactions
- **Character matchup**: Shows aggressor → victim clearly (e.g. "Falcon took stock from Fox")
- **Filters**:
  - Character (aggressor)
  - VS (opponent character)
  - Stage
  - **Category**: All / Edgeguard / Kill / Punish Kill / Punish / Opening / Combo / Trade
  - Move sequence builder (Move 1 → Move 2 → Move 3)
  - Min damage
  - Kills Only / All toggle
  - Move name search
  - Player tag search (connect code, display name, nametag)
- **Bookmark star** on each conversion → saves to Bookmarks tab
- **PLAY button** on each conversion → launches Dolphin at startFrame - 120f

### 3. STATS
- Total games, conversions, stocks taken, kill rate
- Games by character (bar chart)
- Games by stage (bar chart)
- Opening types breakdown (Neutral Win / Counter Attack / Trade)
- Top kill moves
- Activity timeline (last 30 days)
- **L-Cancel accuracy** per character with color-coded bars (green ≥90%, yellow ≥70%, red <70%)

### 4. WEAKNESS
- Per-character analysis (only works after full indexing):
  - Win rate
  - Wins / Losses / Avg death damage
  - **How you die**: edgeguard %, punish %, etc.
  - Worst matchup
  - Worst stage
- Auto-generated coaching tips based on thresholds:
  - Win rate < 40% → "Review neutral game"
  - Edgeguard deaths > 40% → "Drill ledge options"
  - Avg death < 40% → "Work on defensive options"
  - Avg death > 80% → "Work on DI and survival"

### 5. BOOKMARKS
- Starred conversions from Combos tab
- Shows file, frame, characters, damage, category
- **PLAY QUEUE**: generates `mode: "queue"` JSON and launches Dolphin with all bookmarks back-to-back
- Remove individual bookmarks or clear all

### 6. COACH (AI)
- **Auto-insights**: Rule-based coaching tips from weakness data (no API key needed)
- **Gemini integration**: Enter API key → ask questions about your replays
- Calls Gemini 2.0 Flash with stats summary + player question
- API key stored in React state (not persisted — user re-enters each session)

### 7. SETUP
- Dolphin path selection (`.app` bundle picker on macOS)
- Replay folder selection
- **Training Mod Overlays**: Toggle Gecko codes in GALE01.ini:
  - Turn Green When Actionable
  - Flash Red on Unsuccessful L-Cancel
  - Yellow Color Overlay During IASA Frames
  - Turn Cyan when Fastfall is Available
- Automatic GALE01.ini backup before modification
- Upcoming modules list

---

## Data Model (Indexed)

### Replay
```typescript
{
  path: string
  fileName: string
  date: string
  lastFrame: number
  stageId: number
  isTeams: boolean
  winnerPort: number | null  // populated during index-combos
  month: string
  players: Player[]
  combos: Conversion[] | null
  lCancelStats: LCancelStat[]
}
```

### Conversion (Combo/Interaction)
```typescript
{
  startFrame: number
  endFrame: number
  playerIndex: number
  playerCharacter: number
  opponentCharacter: number
  opponentPort: number
  startPercent: number
  endPercent: number
  damage: number
  didKill: boolean
  openingType: string
  category: 'edgeguard' | 'kill' | 'punish-kill' | 'punish' | 'opening' | 'combo' | 'trade'
  moves: { frame, moveId, hitCount, damage }[]
  stageId: number
  date: string
  path: string
}
```

### L-Cancel Stat
```typescript
{
  playerIndex: number
  port: number
  characterId: number
  success: number
  fail: number
  attackCounts: Record<string, number>
}
```

---

## IPC Handlers

| Channel | Direction | Args | Returns |
|---------|-----------|------|---------|
| `select-folder` | main | - | `string \| null` |
| `select-file` | main | - | `string \| null` |
| `get-config` | main | - | `{ dolphinPath, replayFolder }` |
| `set-config` | main | `key, value` | `boolean` |
| `scan-replays` | main | `folderPath` | `{ replays, total, cancelled? }` |
| `cancel-scan` | main | - | `boolean` |
| `index-combos` | main | `daysBack?` | `{ indexed, skipped, total }` |
| `get-replay-winner` | main | `replayPath` | `{ winnerPort }` |
| `open-replay` | main | `replayPath, startFrame?` | `{ success, error?, frameSeek? }` |
| `get-training-mods` | main | - | `{ available, error?, codes? }` |
| `set-training-mod` | main | `codeId, enabled` | `{ success }` |
| `get-bookmarks` | main | - | `Bookmark[]` |
| `add-bookmark` | main | `bookmark` | `{ success, bookmark? }` |
| `remove-bookmark` | main | `id` | `{ success }` |
| `clear-bookmarks` | main | - | `{ success }` |
| `play-bookmark-queue` | main | - | `{ success, error? }` |
| `scan-progress` | main→renderer | `{ current, total }` | - |

---

## Key Technical Decisions

1. **Two-phase scan**: Fast header-only scan for library display, separate `index-combos` pass for heavy `getStats()` analysis. This keeps the UI responsive.

2. **Cache versioning**: `CACHE_VERSION` incremented when data shape changes. Old caches are automatically re-indexed.

3. **Frame seeking via `-i` JSON**: Uses Slippi's official comm spec to pass `startFrame` to Dolphin. Falls back to `open` if playback Dolphin not found.

4. **Direct binary execution on macOS**: `Slippi Dolphin.app/Contents/MacOS/Slippi Dolphin -i file.json` avoids the `open` wrapper's menu issues.

5. **Category heuristics**: Edgeguards detected by aerial kill moves. Punishes by `openingType === 'counter-attack'`.

---

## Files

| File | Role |
|------|------|
| `src/main/index.ts` | Electron main: scan, cache, index, Dolphin launch, bookmarks, training mods |
| `src/preload/index.ts` | IPC bridge |
| `src/renderer/src/App.tsx` | Root component: tabs, navigation, state |
| `src/renderer/src/ComboSearch.tsx` | Combos tab: filters, game cards, bookmark stars |
| `src/renderer/src/StatsDashboard.tsx` | Stats tab: aggregated stats, L-cancel tracker |
| `src/renderer/src/WeaknessAnalysis.tsx` | Weakness tab: per-character loss analysis |
| `src/renderer/src/Bookmarks.tsx` | Bookmarks tab: saved conversions, queue playback |
| `src/renderer/src/Coach.tsx` | Coach tab: rule-based insights + Gemini integration |
| `src/renderer/src/constants.ts` | Character names, stage names, colors |
| `src/renderer/src/moves.ts` | Move ID → name mapping |
| `src/renderer/src/index.css` | Global styles, component classes |
| `src/renderer/src/vite-env.d.ts` | Window.electron type declarations |

# 20GX Coach — CLAUDE.md

Electron desktop app for analyzing Super Smash Bros. Melee Slippi replays. Parses `.slp` files, surfaces combos/stats/weaknesses, and launches Dolphin for frame-accurate playback. macOS-first.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop shell | Electron 28 |
| Build tooling | electron-vite 2 + Vite 5 |
| UI | React 18 + TypeScript 5 + Tailwind CSS 3 |
| Replay parsing | `@slippi/slippi-js` 6.7 |
| Persistence | `electron-store` (config + bookmarks) |
| Icons | `lucide-react` |

## Project Structure

```
src/
  main/index.ts          # Electron main process — all file I/O, parsing, Dolphin launch
  preload/index.ts       # IPC bridge (contextBridge)
  renderer/
    index.html
    src/
      main.tsx           # React entry
      App.tsx            # Root: tab navigation, top-level state
      ComboSearch.tsx    # Combos tab
      StatsDashboard.tsx # Stats tab
      WeaknessAnalysis.tsx # Weakness tab
      Bookmarks.tsx      # Bookmarks tab
      Coach.tsx          # Coach tab (rule-based + Gemini AI)
      constants.ts       # Character names, stage names, color maps
      moves.ts           # Move ID → human-readable name
      index.css          # Global styles + Tailwind component classes
      vite-env.d.ts      # window.electron type declarations
Tools/
  ConsoleTiming/         # Gecko codes, GALE01.ini, netplay.json reference files
```

## Development Commands

```bash
npm install       # install dependencies
npm run dev       # start in dev mode (hot reload)
npm run build     # production build → out/
npm run preview   # preview production build
```

## Architecture

### Two-Phase Scan
1. **Fast scan** (`scan-replays`): reads only `.slp` file headers (settings + metadata). Populates the Library tab instantly.
2. **Deep index** (`index-combos`): calls `getStats()` on each file to extract conversions, L-cancel data, and winner. Expensive — runs on demand with a time-range filter (today / week / month / all).

### Cache
- Location: `~/Library/Application Support/ssbm-coach/replay-cache-v2.json`
- Versioned via `CACHE_VERSION` constant — increment when the data shape changes, old caches auto-invalidate.

### Dolphin Launch
- Writes a Slippi comm JSON (`mode: "normal"` or `mode: "queue"`) with `startFrame` for frame-seeking.
- Launches the Dolphin binary directly: `Slippi Dolphin.app/Contents/MacOS/Slippi Dolphin -i <comm.json>`
- Falls back to `open` if the playback binary isn't found.

### Training Mods
- Reads/writes `GALE01.ini` inside the user's Dolphin `GameSettings/` directory.
- Creates a `.bak` backup before every modification.
- Four Gecko codes toggled: green-when-actionable, red-on-L-cancel-fail, yellow-IASA, cyan-fastfall.

## IPC Channels

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `select-folder` | renderer → main | Native folder picker |
| `select-file` | renderer → main | Native file picker |
| `get-config` | renderer → main | Read `{ dolphinPath, replayFolder }` |
| `set-config` | renderer → main | Write a single config key |
| `scan-replays` | renderer → main | Fast header scan of a folder |
| `cancel-scan` | renderer → main | Abort an in-progress scan |
| `index-combos` | renderer → main | Deep stat index (optional `daysBack`) |
| `get-replay-winner` | renderer → main | Compute winner for one replay |
| `open-replay` | renderer → main | Launch Dolphin (optional `startFrame`) |
| `get-training-mods` | renderer → main | Read GALE01.ini toggle state |
| `set-training-mod` | renderer → main | Toggle a Gecko code on/off |
| `get-bookmarks` | renderer → main | Load saved bookmarks |
| `add-bookmark` | renderer → main | Save a conversion as bookmark |
| `remove-bookmark` | renderer → main | Delete bookmark by id |
| `clear-bookmarks` | renderer → main | Delete all bookmarks |
| `play-bookmark-queue` | renderer → main | Launch Dolphin queue of all bookmarks |
| `scan-progress` | main → renderer | Progress events during scan |

## Core Data Models

```typescript
// Replay (after fast scan)
{ path, fileName, date, lastFrame, stageId, isTeams, winnerPort, month, players, combos, lCancelStats }

// Conversion (from getStats)
{ startFrame, endFrame, playerIndex, playerCharacter, opponentCharacter, opponentPort,
  startPercent, endPercent, damage, didKill, openingType,
  category: 'edgeguard' | 'kill' | 'punish-kill' | 'punish' | 'opening' | 'combo' | 'trade',
  moves: { frame, moveId, hitCount, damage }[], stageId, date, path }

// LCancelStat
{ playerIndex, port, characterId, success, fail, attackCounts: Record<string, number> }
```

## Tabs

1. **Library** — browse/search replay files. Filters: character, stage, month. Search: filename, connect code, display name, nametag.
2. **Combos** — combo/conversion explorer. Filters: character, opponent, stage, category, move sequence, min damage, kills-only, player tag. Bookmark star → saves to Bookmarks. Play button → Dolphin at `startFrame - 120f`.
3. **Stats** — aggregate dashboard: game count, kill rate, games-by-character/stage bar charts, opening type breakdown, top kill moves, activity timeline (30 days), L-cancel accuracy per character.
4. **Weakness** — per-character loss analysis: win rate, how you die (edgeguard/punish %), worst matchup, worst stage. Auto-generates coaching tips based on thresholds.
5. **Bookmarks** — saved conversions. Play all as a Dolphin queue (`mode: "queue"`).
6. **Coach** — rule-based auto-insights + optional Gemini 2.0 Flash integration (API key entered per session, not persisted).
7. **Setup** — Dolphin path, replay folder, training mod toggles.

## Key Constants / Files to Know

- `src/renderer/src/constants.ts` — character IDs → names, stage IDs → names, character colors.
- `src/renderer/src/moves.ts` — move IDs → human-readable names (e.g. `0x15` → "Falcon Punch").
- Category heuristics live in `src/main/index.ts`: edgeguards = aerial kill move; punish = `openingType === 'counter-attack'`.

## What's NOT Implemented (intentionally)

- **Video export to MP4**: requires ffmpeg + headless Dolphin frame dumps — out of scope for a standard Electron app.
- **ASM-level in-game overlays** (hitboxes, input display): require Dolphin plugins or ISO mods.
- **TrainingMode-CE savestate/CPU AI features**: require Uncle Punch mod ISO.

See `REPO_FEATURE_MATRIX.md` for the full comparison against reference repos.

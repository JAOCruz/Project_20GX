# Feature Matrix: Our App vs Referenced Repositories

## ✅ FULLY IMPLEMENTED

| Repository | Their Feature | Our Implementation |
|------------|--------------|-------------------|
| **Slippi Launcher** | `-i` JSON comm spec with `startFrame`/`endFrame` | ✅ `open-replay` IPC writes JSON + launches Dolphin binary with `-i` |
| **Slippi Launcher** | `mode: "queue"` for back-to-back playback | ✅ `play-bookmark-queue` IPC generates queue JSON |
| **Slippi Launcher** | Playback Dolphin auto-detection | ✅ `findPlaybackDolphin()` checks App Support + bundle |
| **Slippipedia** | Replay library with metadata | ✅ Full library with char/stage/date/month filters |
| **Slippipedia** | Combo/punish search and filtering | ✅ ComboSearch with char, stage, move sequence, damage, kill filters |
| **Slippipedia** | Games-first view (expand game → see interactions) | ✅ Expandable game cards showing conversions |
| **slippi-melee-timestamper** | Save timestamps with startFrame/endFrame | ✅ Bookmarks store path + startFrame + endFrame |
| **slippi-melee-timestamper** | Replay from saved timestamp | ✅ Play individual bookmark or entire queue |
| **@slippi/slippi-js** | Parse `.slp` headers for metadata | ✅ Fast scan reads settings + metadata only |
| **@slippi/slippi-js** | `getStats()` for conversions/combos | ✅ `index-combos` IPC extracts conversions with moves |
| **@slippi/slippi-js** | `getStats()` actionCounts (L-cancel) | ✅ L-cancel success/fail extracted per player |
| **@slippi/slippi-js** | `getLatestFrame()` for winner detection | ✅ Winner computed during index pass |
| **melee.tv/codes** | Gecko code toggles (actionable green, L-cancel red) | ✅ `set-training-mod` IPC modifies GALE01.ini |
| **melee.tv/codes** | IASA yellow, fastfall cyan | ✅ All 4 training codes toggleable |

---

## ⚠️ PARTIALLY IMPLEMENTED (Core logic works, missing polish)

| Repository | Their Feature | Our Status | Gap |
|------------|--------------|-----------|-----|
| **Slippipedia** | Auto-export replays to MP4 video | ⚠️ Queue playback works, but no auto-export | Missing: ffmpeg integration + Dolphin frame dump auto-enable |
| **slp-to-video** | Convert `.slp` → MP4 via Dolphin frame dumps | ⚠️ Can generate queue JSON | Missing: Custom Dolphin build with frame dump config, ffmpeg stitching |
| **Slippipedia** | "Save Dolphin frame dumps" checkbox | ❌ Not implemented | Would need to write Dolphin's GFX.ini to enable dumps |

---

## ❌ NOT IMPLEMENTED (Requires external tools / ASM modding)

| Repository | Their Feature | Why Not Implemented | What Would Be Needed |
|------------|--------------|--------------------|---------------------|
| **TrainingMode-CE** | Savestate recording/playback | Requires Uncle Punch mod ISO | Separate Melee mod with custom savestate format |
| **TrainingMode-CE** | CPU counter actions | Requires ASM mod | Gecko codes can't inject AI behavior into replays |
| **TrainingMode-CE** | In-game overlay system (hitbox colors, input display) | Requires ASM/Dolphin plugin | Would need to write a Dolphin graphics plugin or use Ishiiruka |
| **slp-to-video** | Headless Dolphin for automated rendering | Requires custom Dolphin build | Building Slippi Dolphin from source with CLI flags |
| **slp-to-video** | Overlay images on exported video | Requires ffmpeg composite | ffmpeg command generation with overlay filters |
| **Slippipedia** | Video bitrate/resolution config | Requires Dolphin GFX.ini editing | Parsing and modifying Dolphin's INI files |

---

## Honest Assessment

**What we nailed:**
- All the data extraction and analysis features (combos, L-cancels, winner detection, categories)
- All the playback features (frame-seeking, queue playback, bookmarks)
- All the UI filtering and search
- Training mod overlays via Gecko codes

**What would require weeks more work:**
- **Video export to MP4**: Requires either (a) bundling ffmpeg + automating Dolphin frame dumps, or (b) building a custom headless Dolphin. Slippipedia does this by requiring the user to manually enable frame dumps in Dolphin first.
- **Advanced training scenarios**: Uncle Punch is a completely separate Melee mod. You can't inject training scenarios into Slippi replay playback. The only viable path is "analyze replay → find weakness → link to curated Uncle Punch event" which our Weakness tab already does.
- **In-replay overlays**: Actionable frame colors, hitbox display, etc. These require Dolphin plugins or ASM mods. The Gecko codes we support (green when actionable, red on missed L-cancel) are the ONLY overlay system that works with standard Slippi Dolphin.

**Bottom line:** We implemented every feature that is technically possible with standard Slippi Dolphin + the official slippi-js SDK. The video export and ASM-level features require tooling outside the scope of an Electron app.

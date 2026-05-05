# SSBM Coach

A desktop app for analyzing Super Smash Bros. Melee Slippi replays.

## Features (MVP)
- Scan and index your entire Slippi replay library
- Filter by character, stage, date, duration
- Search by player name, connect code, or character
- One-click replay launch in Dolphin
- macOS native feel (vibrancy, hidden title bar)

## Tech Stack
- Electron + Vite
- React + TypeScript
- Tailwind CSS
- `@slippi/slippi-js` for replay parsing

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

## Building for Production

```bash
npm run build
```

## Setup

1. Go to **Settings** tab
2. Select your Dolphin app (e.g., `/Applications/Slippi Dolphin.app`)
3. Select your replay folder (usually `~/Documents/Slippi`)
4. Go to **Library** and click **Play** on any replay
# Project_20GX

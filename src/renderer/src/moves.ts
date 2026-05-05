// Universal melee move IDs (approximate — covers most characters)
const UNIVERSAL_MOVES: Record<number, string> = {
  2: 'Jab 1',
  3: 'Jab 2',
  4: 'Jab 3',
  5: 'Rapid Jab',
  6: 'Dash Attack',
  7: 'Forward Tilt',
  8: 'Up Tilt',
  9: 'Down Tilt',
  10: 'Forward Smash',
  11: 'Up Smash',
  12: 'Down Smash',
  13: 'Neutral Air',
  14: 'Forward Air',
  15: 'Back Air',
  16: 'Up Air',
  17: 'Down Air',
  18: 'Neutral B',
  19: 'Side B',
  20: 'Up B',
  21: 'Down B',
  50: 'Grab',
  51: 'Dash Grab',
  52: 'Forward Throw',
  53: 'Back Throw',
  54: 'Up Throw',
  55: 'Down Throw',
}

// Character-specific special move names
const CHARACTER_SPECIALS: Record<number, Record<number, string>> = {
  0: { // Captain Falcon
    18: 'Falcon Punch',
    19: 'Raptor Boost',
    20: 'Falcon Dive',
    21: 'Falcon Kick',
  },
  2: { // Fox
    18: 'Blaster',
    19: 'Fox Illusion',
    20: 'Fire Fox',
    21: 'Reflector (Shine)',
  },
  7: { // Luigi
    18: 'Fireball',
    19: 'Green Missile',
    20: 'Super Jump Punch',
    21: 'Luigi Cyclone',
  },
  8: { // Mario
    18: 'Fireball',
    19: 'Cape',
    20: 'Super Jump Punch',
    21: 'Mario Tornado',
  },
  9: { // Marth
    18: 'Shield Breaker',
    19: 'Dancing Blade',
    20: 'Dolphin Slash',
    21: 'Counter',
  },
  12: { // Peach
    18: 'Toad',
    19: 'Peach Bomber',
    20: 'Parasol',
    21: 'Vegetable',
  },
  15: { // Jigglypuff
    18: 'Rollout',
    19: 'Pound',
    20: 'Sing',
    21: 'Rest',
  },
  16: { // Samus
    18: 'Charge Shot',
    19: 'Missile',
    20: 'Screw Attack',
    21: 'Bomb',
  },
  17: { // Yoshi
    18: 'Egg Lay',
    19: 'Egg Roll',
    20: 'Egg Throw',
    21: 'Yoshi Bomb',
  },
  19: { // Sheik
    18: 'Needle Storm',
    19: 'Chain',
    20: 'Vanish',
    21: 'Transform (Zelda)',
  },
  20: { // Falco
    18: 'Blaster',
    19: 'Falco Phantasm',
    20: 'Fire Bird',
    21: 'Reflector (Shine)',
  },
  23: { // Roy
    18: 'Flare Blade',
    19: 'Double-Edge Dance',
    20: 'Blazer',
    21: 'Counter',
  },
  25: { // Ganondorf
    18: 'Warlock Punch',
    19: 'Gerudo Dragon',
    20: 'Dark Dive',
    21: 'Wizard\'s Foot',
  },
}

export function getMoveName(characterId: number | undefined, moveId: number): string {
  if (characterId !== undefined && CHARACTER_SPECIALS[characterId]?.[moveId]) {
    return CHARACTER_SPECIALS[characterId][moveId]
  }
  return UNIVERSAL_MOVES[moveId] || `Move ${moveId}`
}

// List of searchable moves for dropdowns (universal + common character moves)
export function getSearchableMoves(characterId?: number): { value: number; label: string }[] {
  const moves = new Map<number, string>()

  // Add universal moves
  Object.entries(UNIVERSAL_MOVES).forEach(([id, name]) => {
    moves.set(Number(id), name)
  })

  // Add character-specific specials
  if (characterId !== undefined && CHARACTER_SPECIALS[characterId]) {
    Object.entries(CHARACTER_SPECIALS[characterId]).forEach(([id, name]) => {
      moves.set(Number(id), name)
    })
  }

  return Array.from(moves.entries())
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.value - b.value)
}

// Format a combo as a readable string
export function formatComboString(characterId: number, moves: { moveId: number }[]): string {
  if (moves.length === 0) return 'No moves'
  return moves
    .map((m) => getMoveName(characterId, m.moveId))
    .join(' → ')
}

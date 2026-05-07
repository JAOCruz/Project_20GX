import { useState } from 'react'
import { CHARACTERS } from '../constants'

const CHARACTER_COLORS: Record<number, string> = {
  0: '#8B1A1A',   // Captain Falcon - dark red
  1: '#8B4513',   // Donkey Kong - brown
  2: '#CC6600',   // Fox - orange
  3: '#111111',   // Mr. Game & Watch - black
  4: '#FF69B4',   // Kirby - pink
  5: '#228B22',   // Bowser - green
  6: '#2E8B57',   // Link - sea green
  7: '#32CD32',   // Luigi - lime green
  8: '#DC143C',   // Mario - red
  9: '#4169E1',   // Marth - blue
  10: '#9370DB',  // Mewtwo - purple
  11: '#FF4500',  // Ness - orange-red
  12: '#FF69B4',  // Peach - pink
  13: '#FFD700',  // Pikachu - yellow
  14: '#4682B4',  // Ice Climbers - steel blue
  15: '#FF69B4',  // Jigglypuff - pink
  16: '#FF6347',  // Samus - tomato
  17: '#9ACD32',  // Yoshi - yellow-green
  18: '#DDA0DD',  // Zelda - plum
  19: '#556B2F',  // Sheik - dark olive
  20: '#0000CD',  // Falco - medium blue
  21: '#32CD32',  // Young Link - lime
  22: '#DC143C',  // Dr. Mario - red
  23: '#B22222',  // Roy - firebrick
  24: '#FFD700',  // Pichu - gold
  25: '#4B0082',  // Ganondorf - indigo
}

interface Props {
  characterId: number
  size?: number
  className?: string
}

export function StockIcon({ characterId, size = 20, className = '' }: Props) {
  const [error, setError] = useState(false)
  const color = CHARACTER_COLORS[characterId] ?? '#64748b'
  const shortName = CHARACTERS[characterId] || 'Unknown'
  const initial = shortName?.[0]?.toUpperCase() ?? '?'

  if (!error) {
    return (
      <img
        src={`/stocks/${characterId}.png`}
        alt={shortName}
        width={size}
        height={size}
        className={`inline-block object-contain shrink-0 ${className}`}
        onError={() => setError(true)}
        style={{ imageRendering: 'pixelated' }}
      />
    )
  }

  return (
    <span
      className={`inline-flex items-center justify-center rounded-sm shrink-0 font-bold text-white text-[10px] leading-none ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: color,
        fontSize: Math.max(8, size * 0.5),
      }}
      title={shortName}
    >
      {initial}
    </span>
  )
}

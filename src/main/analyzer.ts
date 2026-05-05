import { SlippiGame, State, isDown, isInControl } from '@slippi/slippi-js'

export interface MissedOpportunity {
  frame: number
  type: 'missed-tech' | 'missed-tech-chase' | 'wrong-read-tech-chase'
  description: string
  suggestion: string
  unclePunchEvent: string
}

/**
 * Analyze a replay segment (combo/conversion) for missed opportunities.
 *
 * @param game       SlippiGame instance
 * @param startFrame First frame of the segment
 * @param endFrame   Last frame of the segment
 * @param playerIndex  Player index of the aggressor (the one we're coaching)
 * @returns Array of missed opportunities
 */
export function analyzeMissedOpportunities(
  game: SlippiGame,
  startFrame: number,
  endFrame: number,
  playerIndex: number
): MissedOpportunity[] {
  const frames = game.getFrames()
  const settings = game.getSettings()
  if (!settings) return []

  const opponent = settings.players.find((p: any) => p.playerIndex !== playerIndex)
  if (!opponent) return []

  const opIdx = opponent.playerIndex
  const opportunities: MissedOpportunity[] = []
  const reportedFrames = new Set<number>()

  for (let f = startFrame; f <= endFrame; f++) {
    if (reportedFrames.has(f)) continue

    const frame = frames[f]
    if (!frame) continue

    const victim = frame.players[opIdx]
    const aggressor = frame.players[playerIndex]
    if (!victim?.post || !aggressor?.post) continue

    const vState = victim.post.actionStateId

    // ── 1. Missed tech by victim (defensive error) ──
    if (vState === State.TECH_MISS_UP || vState === State.TECH_MISS_DOWN) {
      let techStart = f
      while (
        techStart > startFrame &&
        frames[techStart - 1]?.players[opIdx]?.post?.actionStateId === vState
      ) {
        techStart--
      }

      opportunities.push({
        frame: techStart,
        type: 'missed-tech',
        description: `Opponent missed a tech`,
        suggestion: `They missed a tech — a well-timed grab or smash would have punished this. Practice reacting to missed techs in Uncle Punch.`,
        unclePunchEvent: 'DI / Tech Chase'
      })

      for (let i = techStart; i <= f + 15 && i <= endFrame; i++) {
        reportedFrames.add(i)
      }
      continue
    }

    // ── 2. Tech chase analysis ──
    const isTechState = vState >= State.TECH_START && vState <= State.TECH_END
    const isDownState = isDown(vState)

    if (isTechState || isDownState) {
      // Find start of tech/down animation
      let techStart = f
      while (techStart > startFrame) {
        const prevState = frames[techStart - 1]?.players[opIdx]?.post?.actionStateId
        if (prevState === undefined) break
        const prevIsTech = prevState >= State.TECH_START && prevState <= State.TECH_END
        const prevIsDown = isDown(prevState)
        if ((isTechState && prevIsTech) || (isDownState && prevIsDown)) {
          techStart--
        } else {
          break
        }
      }

      // Look at aggressor response over next 30 frames
      let grabAttempted = false
      let grabWhiffed = false
      let attackCommitted = false
      let attackFrame = -1

      for (let look = 0; look < 30 && techStart + look <= endFrame; look++) {
        const lf = frames[techStart + look]
        if (!lf) continue
        const aPost = lf.players[playerIndex]?.post
        if (!aPost) continue

        const aState = aPost.actionStateId

        // Detect grab attempt
        if (!grabAttempted && (aState === State.GRAB || aState === State.DASH_GRAB)) {
          grabAttempted = true
          // Check if whiffed in next 8 frames
          for (let g = 1; g <= 8 && techStart + look + g <= endFrame; g++) {
            const gf = frames[techStart + look + g]?.players[playerIndex]?.post
            if (!gf) continue
            const gs = gf.actionStateId
            // Success: grab wait or throw
            if (gs === State.GRAB_WAIT || (gs >= 217 && gs <= 222)) {
              grabWhiffed = false
              break
            }
            // Whiff: back to idle/run/dash
            if (isInControl(gs) && gs !== State.GRAB && gs !== State.DASH_GRAB) {
              grabWhiffed = true
              break
            }
          }
        }

        // Detect committed attack within first 8 frames of tech
        if (!attackCommitted && look < 8 && !isInControl(aState) && aState !== State.GRAB && aState !== State.DASH_GRAB) {
          // Ground attacks (44-64), aerials (65-74), smashes (341-345)
          if ((aState >= 44 && aState <= 74) || (aState >= 341 && aState <= 345)) {
            attackCommitted = true
            attackFrame = techStart + look
          }
        }
      }

      // Distance check at tech start
      const aStart = frames[techStart]?.players[playerIndex]?.post
      const vStart = frames[techStart]?.players[opIdx]?.post
      const distance = aStart && vStart ? Math.abs(aStart.positionX - vStart.positionX) : 999

      // Only report if aggressor was realistically in range
      if (distance < 50) {
        const techDir =
          vState === State.FORWARD_TECH ? 'forward' :
          vState === State.BACKWARD_TECH ? 'backward' :
          vState === State.NEUTRAL_TECH ? 'in place' :
          'down'

        if (grabAttempted && grabWhiffed) {
          opportunities.push({
            frame: techStart,
            type: 'wrong-read-tech-chase',
            description: `Grab whiffed — opponent tech ${techDir}`,
            suggestion: `You went for a grab but they tech ${techDir}. Wait and react to their tech option instead of reading. Practice reaction tech chasing in Uncle Punch.`,
            unclePunchEvent: 'DI / Tech Chase'
          })
        } else if (attackCommitted && attackFrame > 0 && attackFrame <= techStart + 5) {
          opportunities.push({
            frame: techStart,
            type: 'wrong-read-tech-chase',
            description: `Attacked before seeing tech direction`,
            suggestion: `You committed to an attack before their tech direction was visible. Try waiting slightly longer and reacting. Practice in Uncle Punch Tech Chase.`,
            unclePunchEvent: 'DI / Tech Chase'
          })
        } else if (!grabAttempted && !attackCommitted) {
          opportunities.push({
            frame: techStart,
            type: 'missed-tech-chase',
            description: `Missed tech chase opportunity`,
            suggestion: `You had a tech chase opportunity but didn't follow up. Practice capitalizing on tech options in Uncle Punch.`,
            unclePunchEvent: 'DI / Tech Chase'
          })
        }
      }

      for (let i = techStart; i <= techStart + 30 && i <= endFrame; i++) {
        reportedFrames.add(i)
      }
    }
  }

  return opportunities
}

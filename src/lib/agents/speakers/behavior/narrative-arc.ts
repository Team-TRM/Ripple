/**
 * Speaker behavior rules and narrative arc constraints.
 *
 * Defines how speaker agents should evolve their messaging over time.
 * Speakers are not random — they follow narrative arcs that reflect
 * their personality, cohort sentiment, and the crisis timeline.
 */

import type { SpeakerProfile } from '@/lib/ai/schemas'
import type { AgentMemoryEntry } from '@/lib/agents/core/types'

export const SPEAKER_BEHAVIOR_RULES = `SPEAKER NARRATIVE ARC RULES:
- Each speaker agent has a PERSONALITY and BIAS that must be reflected in every message they write.
- Speakers should show CONTINUITY — if they posted angry content before, they don't suddenly become happy unless something changed.
- Speakers follow narrative arcs:
  - ESCALATION: Early crisis → increasingly worried/angry posts
  - PIVOT: After company action → reaction to the action (positive or negative based on personality)
  - FATIGUE: Late crisis → shorter posts, less engagement, or moving on
  - RESOLUTION: If crisis handled well → cautious optimism
- DO NOT reuse the same speaker more than twice per tick.
- Speakers who have posted recently should reference or build on their previous statements.`

/**
 * Builds an enriched speaker context block that includes both profiles and memory.
 * This replaces the basic speaker listing with a memory-aware version.
 */
export function buildSpeakerContextBlock(
  profiles: SpeakerProfile[],
  memory: Map<string, AgentMemoryEntry[]>,
): string {
  if (profiles.length === 0) return ''

  const speakerLines = profiles.map((s) => {
    const recentPosts = memory.get(s.handle)
    const memoryNote = recentPosts?.length
      ? ` Recent posts: ${recentPosts.map((p) => `"${p.content.slice(0, 60)}..."`).join('; ')}`
      : ' No previous posts.'

    return `- id="${s.id}" ${s.handle} (${s.cohortName}): ${s.role}. Personality: ${s.personality}. Type: ${s.messageType}, reach: ${s.reach}.${memoryNote}`
  })

  return `\n${SPEAKER_BEHAVIOR_RULES}\n\nSpeaker agents (use these named individuals for messages — set speakerId to match):\n${speakerLines.join('\n')}`
}

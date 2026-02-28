/**
 * Speaker memory retrieval — provides per-agent message history.
 *
 * Queries the database for recent messages authored by each speaker agent,
 * enabling narrative continuity. Speakers remember what they've said and
 * can build on their own storyline across ticks.
 */

import { prisma } from '@/lib/db/prisma'
import type { AgentMemoryEntry } from '@/lib/agents/core/types'
import type { SpeakerProfile } from '@/lib/ai/schemas'

/**
 * Retrieves recent message history for each speaker agent.
 * Returns a Map keyed by speaker handle → last N messages they authored.
 */
export async function getSpeakerMemory(
  projectId: string,
  speakerProfiles: SpeakerProfile[],
  windowSize: number = 3,
): Promise<Map<string, AgentMemoryEntry[]>> {
  const memory = new Map<string, AgentMemoryEntry[]>()

  if (speakerProfiles.length === 0) return memory

  // Fetch recent messages from DB (across all ticks)
  const recentMessages = await prisma.message.findMany({
    where: { tick: { projectId } },
    orderBy: { id: 'desc' },
    take: 100,
    include: {
      tick: { select: { dayNumber: true, tickIndex: true } },
    },
  })

  // Build lookup: normalize author strings to match speaker handles
  // Message authors can be "@handle (Cohort)" or just "handle"
  for (const speaker of speakerProfiles) {
    const handle = speaker.handle
    const matchingMessages = recentMessages.filter((m) => {
      const authorLower = m.author.toLowerCase()
      const handleLower = handle.toLowerCase()
      return (
        authorLower === handleLower ||
        authorLower.startsWith(handleLower + ' ') ||
        authorLower.includes(handleLower)
      )
    })

    const entries: AgentMemoryEntry[] = matchingMessages
      .slice(0, windowSize)
      .map((m) => ({
        content: m.content,
        sentiment: m.sentiment,
        reach: m.reach,
        dayNumber: m.tick.dayNumber,
        tickIndex: m.tick.tickIndex,
      }))

    if (entries.length > 0) {
      memory.set(handle, entries)
    }
  }

  return memory
}

/**
 * Formats speaker memory into a context block for the LLM prompt.
 */
export function formatSpeakerMemoryBlock(
  memory: Map<string, AgentMemoryEntry[]>,
): string {
  if (memory.size === 0) return ''

  const lines: string[] = []
  for (const [handle, entries] of memory) {
    const posts = entries
      .map((e) => `  Day ${e.dayNumber} ${['AM', 'PM', 'EVE'][e.tickIndex]}: "${e.content.slice(0, 80)}..." (sentiment: ${e.sentiment.toFixed(2)})`)
      .join('\n')
    lines.push(`${handle}:\n${posts}`)
  }

  return `\nSPEAKER MEMORY (each speaker's recent posts — they should continue their narrative arc):\n${lines.join('\n')}`
}

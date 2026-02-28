/**
 * Context builder — assembles the world state context for agent prompts.
 *
 * The orchestrator calls this to construct the full situational awareness
 * block that gets injected into the LLM prompt. This includes cohort states,
 * health scores, recent messages, speaker memory, population stats, and
 * any breaking developments.
 */

import type { SpeakerProfile, PopulationStats } from '@/lib/ai/schemas'
import type { AgentMemoryEntry } from '@/lib/agents/core/types'
import { buildSpeakerContextBlock } from '@/lib/agents/speakers/behavior/narrative-arc'

const TICK_PERIOD_LABELS = ['Morning', 'Afternoon', 'Evening'] as const

export type TickContextInput = {
  crisisContext: string
  dayNumber: number
  tickIndex: number
  cohorts: { name: string; description: string }[]
  previousStates?: { cohortName: string; mood: string; dominantNarrative: string; sentiment: number; activation: number }[]
  recentMessages?: string[]
  lastDecision?: string
  healthScores?: { overall: number; publicSentiment: number; mediaHeat: number; regulatoryPressure: number; internalStability: number; fraudRisk: number; publicAwareness: number }
  userEvent?: string
  speakerProfiles?: SpeakerProfile[]
  speakerMemory?: Map<string, AgentMemoryEntry[]>
  nodeLabels?: string[]
  breakingDevelopments?: string[]
  populationStats?: PopulationStats[]
}

export type TickContextBlocks = {
  period: string
  cohortBlock: string
  stateBlock: string
  recentBlock: string
  decisionBlock: string
  healthBlock: string
  speakerBlock: string
  nodeLabelsBlock: string
  userEventBlock: string
  breakingBlock: string
  populationBlock: string
}

/**
 * Assembles all context blocks for a tick generation prompt.
 */
export function buildTickContext(input: TickContextInput): TickContextBlocks {
  const period = TICK_PERIOD_LABELS[input.tickIndex] || 'Morning'

  const cohortBlock = input.cohorts
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n')

  const stateBlock = input.previousStates
    ? input.previousStates
        .map((s) => `- ${s.cohortName}: mood=${s.mood}, sentiment=${s.sentiment.toFixed(2)}, activation=${s.activation.toFixed(2)}, narrative="${s.dominantNarrative}"`)
        .join('\n')
    : 'None (simulation start)'

  const recentBlock = input.recentMessages?.length
    ? input.recentMessages.slice(0, 5).map((m) => `- ${m}`).join('\n')
    : 'None'

  const decisionBlock = input.lastDecision
    ? `Last decision: ${input.lastDecision}`
    : ''

  const healthBlock = input.healthScores
    ? `Current health scores (0-100): overall=${input.healthScores.overall}, publicAwareness=${input.healthScores.publicAwareness}, publicSentiment=${input.healthScores.publicSentiment}, mediaHeat=${input.healthScores.mediaHeat}, regulatoryPressure=${input.healthScores.regulatoryPressure}, internalStability=${input.healthScores.internalStability}, fraudRisk=${input.healthScores.fraudRisk}`
    : ''

  // Use memory-enriched speaker block if memory is available
  const speakerBlock = input.speakerProfiles?.length
    ? buildSpeakerContextBlock(input.speakerProfiles, input.speakerMemory || new Map())
    : ''

  const nodeLabelsBlock = input.nodeLabels?.length
    ? `\nExisting graph nodes (use these labels for connectTo): ${input.nodeLabels.join(', ')}`
    : ''

  const userEventBlock = input.userEvent
    ? `\n**BREAKING DEVELOPMENT** (injected by user): ${input.userEvent}
This is a MAJOR breaking event. Your response MUST follow this structure:
1. The FIRST message MUST be type "news" — a dramatic breaking news alert headline about this event (e.g. "BREAKING: [headline]"). High reach (0.7-0.9), strong negative sentiment.
2. The remaining messages should be reactions from different cohorts — social media outrage, expert analysis, insider panic, etc.
3. Do NOT include a "decisionPrompt" — decisions are only made at the end of the day.
4. Cohort sentimentDelta and activationDelta should be LARGE (±0.10 to ±0.25) to reflect the crisis escalation.
5. healthDeltas should reflect the severity — overallDelta should be negative (-3 to -5), mediaHeatDelta strongly positive (+3 to +5).`
    : ''

  const breakingBlock = input.breakingDevelopments?.length
    ? `\n**\u26A0\uFE0F TODAY'S BREAKING DEVELOPMENTS** (these are the most critical events that happened today — the evening decision MUST address these):
${input.breakingDevelopments.map((d) => `- ${d}`).join('\n')}
The decisionPrompt MUST be directly about responding to these breaking developments. Do NOT generate a generic daily summary — the CEO needs to decide how to handle THIS specific crisis escalation.`
    : ''

  const populationBlock = input.populationStats?.length
    ? `\nPOPULATION ENGAGEMENT (calibrate message intensity based on these):
${input.populationStats.map((p) => `- ${p.cohortName}: ${p.population} total, ${p.activeSpeakers} active, sentiment=${p.aggregateSentiment.toFixed(2)}, trend=${p.trendDirection}`).join('\n')}`
    : ''

  return {
    period,
    cohortBlock,
    stateBlock,
    recentBlock,
    decisionBlock,
    healthBlock,
    speakerBlock,
    nodeLabelsBlock,
    userEventBlock,
    breakingBlock,
    populationBlock,
  }
}

/**
 * Composes the full user prompt from context blocks.
 */
export function composeTickPrompt(ctx: TickContextBlocks, crisisContext: string): string {
  return `Crisis: ${crisisContext}

Day ${ctx.period} tick

Cohorts:
${ctx.cohortBlock}

Current cohort states:
${ctx.stateBlock}

Recent messages:
${ctx.recentBlock}
${ctx.decisionBlock}
${ctx.healthBlock}
${ctx.speakerBlock}
${ctx.nodeLabelsBlock}
${ctx.userEventBlock}
${ctx.breakingBlock}
${ctx.populationBlock}

Generate media content and cohort updates for this ${ctx.period.toLowerCase()} tick.`
}

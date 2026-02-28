import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@/generated/prisma/client'
import { generateEnhancedTick } from '@/lib/agents/orchestrator/tick-orchestrator'
import { runAutonomousAgentLoop } from '@/lib/agents/orchestrator/autonomous-agent-loop'
import { generateExecutiveAdvice } from '@/lib/agents/executives/advisory/generate-advice'
import {
  getProjectGraph,
  processTickUpdates,
  saveStateSnapshots,
  calculateHealthScores,
  calculateHealthScoresFromNodes,
} from '@/lib/simulation/engine/graph-engine'
import { calculatePopulationStats } from '@/lib/agents/cohorts/population/population-dynamics'
import { getSpeakerMemory } from '@/lib/agents/speakers/memory/recall'
import type { AgentActionLog } from '@/lib/agents/tools/simulation-tools'
import type { GraphNode, GraphEdge } from '@/lib/types'
import type { SpeakerProfile, ExecutiveRecommendation, PopulationStats } from '@/lib/ai/schemas'

export type TickResult = {
  tick: {
    id: string
    dayNumber: number
    tickIndex: number
    subTickIndex: number
  }
  messages: {
    id: string
    type: string
    author: string
    content: string
    reach: number
    sentiment: number
    speakerId?: string
  }[]
  nodes: GraphNode[]
  edges?: GraphEdge[]
  healthScores: {
    overall: number
    publicSentiment: number
    mediaHeat: number
    regulatoryPressure: number
    internalStability: number
    fraudRisk: number
    publicAwareness: number
  }
  decisionPrompt?: {
    prompt: string
    options: string[]
  }
  agentActions?: AgentActionLog[]
  executiveRecommendations?: ExecutiveRecommendation[]
  populationStats?: PopulationStats[]
}

type TickHealthDeltas = {
  overallDelta: number
  publicSentimentDelta: number
  mediaHeatDelta: number
  regulatoryPressureDelta: number
  internalStabilityDelta: number
  fraudRiskDelta: number
  publicAwarenessDelta: number
}

function getNextTickIndex(currentTickIndex: number, currentDay: number) {
  if (currentTickIndex < 2) {
    return { dayNumber: currentDay, tickIndex: currentTickIndex + 1 }
  }
  return { dayNumber: currentDay + 1, tickIndex: 0 }
}

function mergeTickHealthDeltas(
  base: Partial<TickHealthDeltas> | undefined,
  extra: TickHealthDeltas
): TickHealthDeltas | undefined {
  const merged: TickHealthDeltas = {
    overallDelta: (base?.overallDelta ?? 0) + extra.overallDelta,
    publicSentimentDelta: (base?.publicSentimentDelta ?? 0) + extra.publicSentimentDelta,
    mediaHeatDelta: (base?.mediaHeatDelta ?? 0) + extra.mediaHeatDelta,
    regulatoryPressureDelta: (base?.regulatoryPressureDelta ?? 0) + extra.regulatoryPressureDelta,
    internalStabilityDelta: (base?.internalStabilityDelta ?? 0) + extra.internalStabilityDelta,
    fraudRiskDelta: (base?.fraudRiskDelta ?? 0) + extra.fraudRiskDelta,
    publicAwarenessDelta: (base?.publicAwarenessDelta ?? 0) + extra.publicAwarenessDelta,
  }

  const hasAnyDelta = Object.values(merged).some((v) => v !== 0)
  if (!base && !hasAnyDelta) return undefined
  return merged
}

/**
 * generateAndStoreTick — generates one full tick (LLM + observe + update) and stores in DB.
 */
async function generateAndStoreTick(
  projectId: string,
  dayNumber: number,
  tickIndex: number,
  decision?: string,
  userEvent?: string,
): Promise<TickResult> {
  const tickT0 = Date.now()
  const TICKS = ['morning', 'afternoon', 'evening']
  console.log(`[tick-engine] Generating day=${dayNumber} ${TICKS[tickIndex]}`)

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      cohorts: true,
      ticks: {
        orderBy: [{ dayNumber: 'desc' }, { tickIndex: 'desc' }, { subTickIndex: 'desc' }],
        take: 1,
        include: {
          summaries: { include: { cohort: { select: { name: true } } } },
          messages: { take: 5, orderBy: { id: 'desc' } },
        },
      },
    },
  })

  if (!project) throw new Error('Project not found')

  // Load speaker profiles and retrieve per-speaker memory
  const speakerProfiles = (project.speakerProfiles as unknown as SpeakerProfile[]) || []
  const speakerMemory = speakerProfiles.length > 0
    ? await getSpeakerMemory(projectId, speakerProfiles)
    : new Map()

  // Load previous population stats for feedback loop
  const previousPopulation = (project.populationStats as unknown as PopulationStats[]) || []

  const lastTick = project.ticks[0]
  const graphData = await getProjectGraph(projectId)

  const previousStates = graphData.nodes.map((n) => {
    const summary = lastTick?.summaries.find((s) => s.cohort.name === n.label)
    return {
      cohortName: n.label,
      mood: (summary?.mood || 'Calm') as string,
      dominantNarrative: summary?.dominantNarrative || '',
      sentiment: n.sentiment,
      activation: n.activation,
    }
  })

  // Phase 1: GENERATE (LLM call)
  // For evening ticks, load ALL messages from today so the decision reflects any crisis injected earlier
  let recentMessages: string[]
  let breakingDevelopments: string[] | undefined
  if (tickIndex === 2) {
    const todaysMessages = await prisma.message.findMany({
      where: { tick: { projectId, dayNumber } },
      orderBy: { id: 'asc' },
      take: 20,
    })
    recentMessages = todaysMessages.map((m) => `[${m.type}] ${m.author}: ${m.content.slice(0, 100)}`)

    // Identify high-impact crisis messages (high reach + negative sentiment = breaking news)
    const crisisMessages = todaysMessages.filter(
      (m) => (m.reach >= 0.6 && m.sentiment <= -0.3) || m.content.toUpperCase().includes('BREAKING')
    )
    if (crisisMessages.length > 0) {
      breakingDevelopments = crisisMessages.map((m) => `${m.author}: ${m.content.slice(0, 150)}`)
    }

    // Also load user-injected crises from today
    const injectedCrises = await prisma.timelineEvent.findMany({
      where: { projectId, dayNumber, isUserInjected: true },
      orderBy: { id: 'asc' },
    })
    if (injectedCrises.length > 0) {
      const crisisTexts = injectedCrises.map((e) => `INJECTED CRISIS: ${e.description}`)
      breakingDevelopments = [...(breakingDevelopments || []), ...crisisTexts]
    }
  } else {
    recentMessages = lastTick?.messages.map((m) => `[${m.type}] ${m.author}: ${m.content.slice(0, 100)}`) || []
  }

  // Read last STORED health scores (LLM-driven), fallback to node-based calculation
  const lastHealthRecord = await prisma.healthScore.findFirst({
    where: { tick: { projectId } },
    orderBy: { tick: { id: 'desc' } },
  })
  const currentHealth = lastHealthRecord
    ? {
        overall: lastHealthRecord.overall,
        publicSentiment: lastHealthRecord.publicSentiment,
        mediaHeat: lastHealthRecord.mediaHeat,
        regulatoryPressure: lastHealthRecord.regulatoryPressure,
        internalStability: lastHealthRecord.internalStability,
        fraudRisk: lastHealthRecord.fraudRisk,
        publicAwareness: lastHealthRecord.publicAwareness ?? 10,
      }
    : await calculateHealthScores(projectId)

  // Find the most recent resolved decision to feed into the LLM context
  const resolvedDecision = decision || (await prisma.decisionPoint.findFirst({
    where: { projectId, chosenOption: { not: null } },
    orderBy: { id: 'desc' },
    select: { chosenOption: true, prompt: true, tick: { select: { dayNumber: true } } },
  }))

  const lastDecisionText = typeof resolvedDecision === 'string'
    ? resolvedDecision
    : resolvedDecision?.chosenOption
      ? `In response to "${resolvedDecision.prompt}", the company decided: "${resolvedDecision.chosenOption}"`
      : undefined

  const tickData = await generateEnhancedTick({
    crisisContext: project.context,
    dayNumber,
    tickIndex,
    cohorts: project.cohorts.map((c) => ({ name: c.name, description: c.description })),
    previousStates,
    recentMessages,
    lastDecision: lastDecisionText,
    healthScores: currentHealth,
    userEvent,
    speakerProfiles: speakerProfiles.length > 0 ? speakerProfiles : undefined,
    speakerMemory: speakerMemory.size > 0 ? speakerMemory : undefined,
    nodeLabels: graphData.nodes.map((n) => n.label),
    breakingDevelopments,
    populationStats: previousPopulation.length > 0 ? previousPopulation : undefined,
  })

  // Autonomous per-agent planning loop (safe additive layer).
  // If anything fails, simulation continues on the standard orchestrator path.
  const autonomousResult = await runAutonomousAgentLoop({
    crisisContext: project.context,
    dayNumber,
    tickIndex,
    nodes: graphData.nodes,
    edges: graphData.edges,
    healthScores: currentHealth,
    recentMessages,
    lastDecision: lastDecisionText,
    maxAgents: 4,
  }).catch((err) => {
    console.error('[tick-engine] Autonomous loop failed (fallback to base pipeline):', err)
    return {
      nodeUpdates: [],
      healthDeltas: {
        overallDelta: 0,
        publicSentimentDelta: 0,
        mediaHeatDelta: 0,
        regulatoryPressureDelta: 0,
        internalStabilityDelta: 0,
        fraudRiskDelta: 0,
        publicAwarenessDelta: 0,
      },
      messages: [],
      agentActions: [],
    }
  })

  const mergedCohortUpdates = [
    ...tickData.cohortUpdates.map((u) => ({
      cohortName: u.cohortName,
      sentimentDelta: u.sentimentDelta,
      activationDelta: u.activationDelta,
      trustDelta: u.trustDelta,
      dominantNarrative: u.dominantNarrative,
      behaviours: u.behaviours,
    })),
    ...autonomousResult.nodeUpdates.map((u) => ({
      nodeId: u.nodeId,
      sentimentDelta: u.sentimentDelta,
      activationDelta: u.activationDelta,
      trustDelta: u.trustDelta,
      dominantNarrative: u.dominantNarrative,
      behaviours: u.behaviours,
    })),
  ]

  const combinedMessages = [...tickData.messages, ...autonomousResult.messages]

  // Apply all graph mutations in one read-modify-write cycle
  const { nodes: updatedNodes, edges: updatedEdges } = await processTickUpdates(
    projectId,
    mergedCohortUpdates,
    tickData.newNodes,
  )

  // Compute health scores: LLM deltas applied to current scores (primary driver)
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))
  const hd = mergeTickHealthDeltas(tickData.healthDeltas as Partial<TickHealthDeltas> | undefined, autonomousResult.healthDeltas)

  const healthScores = hd
    ? {
        overall: clamp(currentHealth.overall + hd.overallDelta),
        publicSentiment: clamp(currentHealth.publicSentiment + hd.publicSentimentDelta),
        mediaHeat: clamp(currentHealth.mediaHeat + hd.mediaHeatDelta),
        regulatoryPressure: clamp(currentHealth.regulatoryPressure + hd.regulatoryPressureDelta),
        internalStability: clamp(currentHealth.internalStability + hd.internalStabilityDelta),
        fraudRisk: clamp(currentHealth.fraudRisk + hd.fraudRiskDelta),
        publicAwareness: clamp((currentHealth.publicAwareness ?? 10) + (hd.publicAwarenessDelta ?? 0)),
      }
    : calculateHealthScoresFromNodes(updatedNodes)

  const hotNodes = updatedNodes.filter((n) => n.activation > 0.85)
  if (hotNodes.length > 0) {
    console.log(`[tick-engine] ${hotNodes.length} hot nodes (activation > 0.85)`)
  }

  console.log(`[tick-engine] Generated in ${((Date.now() - tickT0) / 1000).toFixed(1)}s`)

  const dayEvent = await prisma.timelineEvent.findFirst({
    where: { projectId, dayNumber },
  })
  const dateLabel = dayEvent?.dateLabel || `Day ${dayNumber}`

  // Guard against duplicates
  const existing = await prisma.tick.findUnique({
    where: {
      projectId_dayNumber_tickIndex_subTickIndex: {
        projectId, dayNumber, tickIndex, subTickIndex: 0,
      },
    },
    include: { messages: true },
  })

  if (existing) {
    // Check for actual DB decision point (not the raw LLM output)
    const existingDp = await prisma.decisionPoint.findFirst({
      where: { tickId: existing.id, chosenOption: null },
    })
    return {
      tick: { id: existing.id, dayNumber, tickIndex, subTickIndex: 2 },
      messages: existing.messages.map((m) => ({
        id: m.id, type: m.type, author: m.author,
        content: m.content, reach: m.reach, sentiment: m.sentiment,
      })),
      nodes: updatedNodes,
      healthScores,
      decisionPrompt: existingDp ? { prompt: existingDp.prompt, options: existingDp.options as string[] } : undefined,
      agentActions: [],
    }
  }

  // Store tick with messages and summaries
  let generateTick
  try {
    generateTick = await prisma.tick.create({
      data: {
        projectId, dayNumber, tickIndex, subTickIndex: 0, dateLabel,
        messages: combinedMessages.length > 0
          ? {
              create: combinedMessages.map((m) => ({
                type: m.type, author: m.author, content: m.content,
                reach: m.reach, sentiment: m.sentiment,
              })),
            }
          : undefined,
        summaries: {
          create: project.cohorts
            .map((c) => {
              const node = updatedNodes.find((n) => n.label === c.name)
              if (!node) return null
              return {
                cohortId: c.id,
                mood: node.dominantNarrative ? 'Concerned' : 'Calm',
                dominantNarrative: node.dominantNarrative || '',
                behaviours: node.behaviours || [],
              }
            })
            .filter(Boolean) as { cohortId: string; mood: string; dominantNarrative: string; behaviours: string[] }[],
        },
      },
      include: { messages: true },
    })
  } catch (err: unknown) {
    // Unique constraint violation — tick already exists
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      console.log(`[tick-engine] Tick already exists, returning existing`)
      const fallback = await prisma.tick.findUnique({
        where: {
          projectId_dayNumber_tickIndex_subTickIndex: { projectId, dayNumber, tickIndex, subTickIndex: 0 },
        },
        include: { messages: true },
      })
      if (fallback) {
        return {
          tick: { id: fallback.id, dayNumber, tickIndex, subTickIndex: 2 },
          messages: fallback.messages.map((m) => ({
            id: m.id, type: m.type, author: m.author,
            content: m.content, reach: m.reach, sentiment: m.sentiment,
          })),
          nodes: updatedNodes,
          healthScores,
          decisionPrompt: tickData.decisionPrompt,
          agentActions: [],
        }
      }
    }
    throw err
  }

  // Store observe + update sub-ticks
  await prisma.tick.createMany({
    data: [
      { projectId, dayNumber, tickIndex, subTickIndex: 1, dateLabel },
      { projectId, dayNumber, tickIndex, subTickIndex: 2, dateLabel },
    ],
    skipDuplicates: true,
  })

  // Store health scores on update tick
  const updateTick = await prisma.tick.findUnique({
    where: {
      projectId_dayNumber_tickIndex_subTickIndex: {
        projectId, dayNumber, tickIndex, subTickIndex: 2,
      },
    },
  })
  if (updateTick) {
    await prisma.healthScore.upsert({
      where: { tickId: updateTick.id },
      update: {
        overall: healthScores.overall,
        publicSentiment: healthScores.publicSentiment,
        mediaHeat: healthScores.mediaHeat,
        regulatoryPressure: healthScores.regulatoryPressure,
        internalStability: healthScores.internalStability,
        fraudRisk: healthScores.fraudRisk,
        publicAwareness: healthScores.publicAwareness,
      },
      create: {
        tickId: updateTick.id,
        overall: healthScores.overall,
        publicSentiment: healthScores.publicSentiment,
        mediaHeat: healthScores.mediaHeat,
        regulatoryPressure: healthScores.regulatoryPressure,
        internalStability: healthScores.internalStability,
        fraudRisk: healthScores.fraudRisk,
        publicAwareness: healthScores.publicAwareness,
      },
    })
  }

  await saveStateSnapshots(projectId, generateTick.id, dayNumber, tickIndex)

  // Enforce: decisions ONLY on evening ticks (tickIndex === 2)
  if (tickIndex !== 2) {
    tickData.decisionPrompt = undefined
  }

  // If this is an evening tick, skip the EOD decision if user already made a decision today
  // (e.g., from an injected event earlier in the day)
  if (tickIndex === 2 && tickData.decisionPrompt) {
    const todaysDecision = await prisma.decisionPoint.findFirst({
      where: {
        projectId,
        chosenOption: { not: null },
        tick: { dayNumber },
      },
    })
    if (todaysDecision) {
      console.log(`[tick-engine] Skipping EOD decision — user already decided today (day ${dayNumber})`)
      tickData.decisionPrompt = undefined
    }
  }

  // Generate executive recommendations if there's a decision prompt
  let executiveRecommendations: ExecutiveRecommendation[] | undefined
  if (tickData.decisionPrompt) {
    try {
      // Use breaking developments if available, otherwise fall back to recent messages
      const recentContext = breakingDevelopments?.length
        ? `TODAY'S BREAKING DEVELOPMENTS:\n${breakingDevelopments.join('\n')}`
        : recentMessages.slice(0, 8).join('; ')
      const execAdvice = await generateExecutiveAdvice({
        crisisContext: project.context,
        decisionPrompt: tickData.decisionPrompt.prompt,
        options: tickData.decisionPrompt.options,
        healthScores,
        recentContext,
      })
      executiveRecommendations = execAdvice.recommendations
    } catch (err) {
      console.error('[tick-engine] Executive advice generation failed (non-fatal):', err)
    }

    await prisma.decisionPoint.create({
      data: {
        projectId,
        tickId: generateTick.id,
        prompt: tickData.decisionPrompt.prompt,
        options: tickData.decisionPrompt.options,
        executiveRecommendations: executiveRecommendations
          ? (executiveRecommendations as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    })
  }

  // Compute population stats using the population loaded earlier
  let populationStats: PopulationStats[] | undefined
  if (previousPopulation.length > 0) {
    populationStats = calculatePopulationStats(previousPopulation, updatedNodes)
    await prisma.project.update({
      where: { id: projectId },
      data: { populationStats: populationStats as unknown as Prisma.InputJsonValue },
    })
  }

  return {
    tick: { id: generateTick.id, dayNumber, tickIndex, subTickIndex: 2 },
    messages: generateTick.messages.map((m) => ({
      id: m.id, type: m.type, author: m.author,
      content: m.content, reach: m.reach, sentiment: m.sentiment,
    })),
    nodes: updatedNodes,
    edges: updatedEdges,
    healthScores,
    decisionPrompt: tickData.decisionPrompt,
    agentActions: autonomousResult.agentActions,
    executiveRecommendations,
    populationStats,
  }
}

/**
 * runTick — generates the next tick on-demand. Strictly linear: every tick
 * is freshly generated, no caching or pre-generation.
 */
export async function runTick(
  projectId: string,
  decision?: string,
  userEvent?: string,
  fromDay?: number,
  fromTickIndex?: number,
): Promise<TickResult> {
  let next: { dayNumber: number; tickIndex: number }

  if (fromDay !== undefined && fromTickIndex !== undefined) {
    // Use client-provided playback cursor
    next = getNextTickIndex(fromTickIndex, fromDay)
  } else {
    // Fallback: find absolute last tick in DB
    const lastTick = await prisma.tick.findFirst({
      where: { projectId },
      orderBy: [{ dayNumber: 'desc' }, { tickIndex: 'desc' }, { subTickIndex: 'desc' }],
    })
    if (!lastTick) throw new Error('No ticks found')
    next = getNextTickIndex(lastTick.tickIndex, lastTick.dayNumber)
  }

  console.log(`[step] Generating day=${next.dayNumber} tick=${next.tickIndex}${userEvent ? ' (USER EVENT)' : ''}`)
  const result = await generateAndStoreTick(projectId, next.dayNumber, next.tickIndex, decision, userEvent)

  // Update project cursor
  await prisma.project.update({
    where: { id: projectId },
    data: { currentDay: next.dayNumber },
  })

  return result
}

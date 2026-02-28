import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@/generated/prisma/client'
import { generateEnhancedTick } from '@/lib/ai/generate-enhanced-tick'
import { generateExecutiveAdvice } from '@/lib/ai/generate-executive-advice'
import {
  getProjectGraph,
  processTickUpdates,
  saveStateSnapshots,
  calculateHealthScores,
  calculateHealthScoresFromNodes,
} from './neo4j-graph'
import { calculatePopulationStats } from './population-engine'
import type { GraphNode, GraphEdge } from './neo4j-graph'
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
  executiveRecommendations?: ExecutiveRecommendation[]
  populationStats?: PopulationStats[]
}

// Track in-flight generation per project to prevent duplicates
const generatingProjects = new Set<string>()

function getNextTickIndex(currentTickIndex: number, currentDay: number) {
  if (currentTickIndex < 2) {
    return { dayNumber: currentDay, tickIndex: currentTickIndex + 1 }
  }
  return { dayNumber: currentDay + 1, tickIndex: 0 }
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

  // Load speaker profiles from project
  const speakerProfiles = (project.speakerProfiles as unknown as SpeakerProfile[]) || []

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
    nodeLabels: graphData.nodes.map((n) => n.label),
    breakingDevelopments,
  })

  // Apply all graph mutations in one read-modify-write cycle
  const { nodes: updatedNodes, edges: updatedEdges } = await processTickUpdates(
    projectId,
    tickData.cohortUpdates.map((u) => ({
      cohortName: u.cohortName,
      sentimentDelta: u.sentimentDelta,
      activationDelta: u.activationDelta,
      trustDelta: u.trustDelta,
      dominantNarrative: u.dominantNarrative,
      behaviours: u.behaviours,
    })),
    tickData.newNodes,
  )

  // Compute health scores: LLM deltas applied to current scores (primary driver)
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)))
  const hd = tickData.healthDeltas

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
    }
  }

  // Store generate tick with messages and summaries
  // Wrap in try-catch to handle race condition with pre-gen creating the same tick
  let generateTick
  try {
    generateTick = await prisma.tick.create({
      data: {
        projectId, dayNumber, tickIndex, subTickIndex: 0, dateLabel,
        messages: tickData.messages.length > 0
          ? {
              create: tickData.messages.map((m) => ({
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
    // Unique constraint violation — pre-gen created this tick concurrently
    if (err && typeof err === 'object' && 'code' in err && err.code === 'P2002') {
      console.log(`[tick-engine] Tick already exists (concurrent pre-gen), returning existing`)
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
        }
      }
    }
    throw err
  }

  // Store observe + update sub-ticks (skipDuplicates for race condition with pre-gen)
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

  // Compute population stats
  let populationStats: PopulationStats[] | undefined
  const previousPopulation = (project.populationStats as unknown as PopulationStats[]) || []
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
    executiveRecommendations,
    populationStats,
  }
}

/**
 * Pre-generate ticks ahead of the current playback position.
 * Runs in background. Generates up to `count` ticks ahead.
 */
export async function preGenerateTicks(projectId: string, count: number = 6): Promise<void> {
  if (generatingProjects.has(projectId)) {
    console.log(`[pre-gen] Already generating for ${projectId}, skipping`)
    return
  }
  generatingProjects.add(projectId)

  try {
    for (let i = 0; i < count; i++) {
      // Stop if pending decision
      const pendingDecision = await prisma.decisionPoint.findFirst({
        where: { projectId, chosenOption: null },
      })
      if (pendingDecision) {
        console.log(`[pre-gen] Stopping — pending decision`)
        break
      }

      // Find last generated tick
      const lastTick = await prisma.tick.findFirst({
        where: { projectId },
        orderBy: [{ dayNumber: 'desc' }, { tickIndex: 'desc' }, { subTickIndex: 'desc' }],
      })
      if (!lastTick) break

      const next = getNextTickIndex(lastTick.tickIndex, lastTick.dayNumber)

      // Skip if already generated
      const exists = await prisma.tick.findUnique({
        where: {
          projectId_dayNumber_tickIndex_subTickIndex: {
            projectId, dayNumber: next.dayNumber, tickIndex: next.tickIndex, subTickIndex: 0,
          },
        },
      })
      if (exists) continue

      console.log(`[pre-gen] Generating ahead: day=${next.dayNumber} tick=${next.tickIndex}`)
      await generateAndStoreTick(projectId, next.dayNumber, next.tickIndex)
    }
  } catch (err) {
    console.error('[pre-gen] Error:', err)
  } finally {
    generatingProjects.delete(projectId)
  }
}

/**
 * Invalidate pre-generated ticks at and beyond a given position.
 * Called when user injects an event to clear stale future content.
 */
async function invalidateFutureTicks(
  projectId: string,
  fromDay: number,
  fromTickIndex: number,
): Promise<void> {
  // Find all ticks beyond the current playback position
  const ticksToDelete = await prisma.tick.findMany({
    where: {
      projectId,
      OR: [
        { dayNumber: { gt: fromDay } },
        { dayNumber: fromDay, tickIndex: { gte: fromTickIndex } },
      ],
    },
    select: { id: true },
  })

  if (ticksToDelete.length === 0) return

  // Cascade deletes messages, summaries, health scores, decision points
  await prisma.tick.deleteMany({
    where: { id: { in: ticksToDelete.map((t) => t.id) } },
  })

  console.log(`[tick-engine] Invalidated ${ticksToDelete.length} future ticks for user event injection`)
}

/**
 * runTick — consumes the next tick. Uses client-provided playback position to
 * compute next tick. Returns from cache if pre-generated (instant),
 * otherwise generates on-demand. Triggers background pre-generation after.
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

  // If user event, invalidate all pre-generated ticks at and beyond this position
  if (userEvent) {
    await invalidateFutureTicks(projectId, next.dayNumber, next.tickIndex)
  }

  // Check if already pre-generated (and no user event to inject)
  if (!userEvent) {
    const cachedTick = await prisma.tick.findUnique({
      where: {
        projectId_dayNumber_tickIndex_subTickIndex: {
          projectId, dayNumber: next.dayNumber, tickIndex: next.tickIndex, subTickIndex: 0,
        },
      },
      include: { messages: true },
    })

    if (cachedTick) {
      console.log(`[step] Cache HIT: day=${next.dayNumber} tick=${next.tickIndex}`)

      // Read graph + health + decision + project in parallel, update cursor
      const [graphData, updateTick, dp, proj] = await Promise.all([
        getProjectGraph(projectId),
        prisma.tick.findUnique({
          where: {
            projectId_dayNumber_tickIndex_subTickIndex: {
              projectId, dayNumber: next.dayNumber, tickIndex: next.tickIndex, subTickIndex: 2,
            },
          },
          include: { healthScore: true },
        }),
        prisma.decisionPoint.findFirst({
          where: { tickId: cachedTick.id, chosenOption: null },
        }),
        prisma.project.update({
          where: { id: projectId },
          data: { currentDay: next.dayNumber },
        }),
      ])

      const storedHealth = updateTick?.healthScore
      const healthScores = storedHealth
        ? {
            overall: storedHealth.overall,
            publicSentiment: storedHealth.publicSentiment,
            mediaHeat: storedHealth.mediaHeat,
            regulatoryPressure: storedHealth.regulatoryPressure,
            internalStability: storedHealth.internalStability,
            fraudRisk: storedHealth.fraudRisk,
            publicAwareness: storedHealth.publicAwareness ?? 10,
          }
        : calculateHealthScoresFromNodes(graphData.nodes)

      // If a decision was already made today, skip the cached EOD decision
      let effectiveDp = dp
      if (dp) {
        const todaysDecision = await prisma.decisionPoint.findFirst({
          where: {
            projectId,
            chosenOption: { not: null },
            tick: { dayNumber: next.dayNumber },
          },
        })
        if (todaysDecision) {
          console.log(`[step] Skipping cached EOD decision — already decided today (day ${next.dayNumber})`)
          effectiveDp = null
        }
      }

      // Trigger background pre-generation
      setTimeout(() => {
        preGenerateTicks(projectId, 6).catch(console.error)
      }, 50)

      return {
        tick: { id: cachedTick.id, dayNumber: next.dayNumber, tickIndex: next.tickIndex, subTickIndex: 2 },
        messages: cachedTick.messages.map((m) => ({
          id: m.id, type: m.type, author: m.author,
          content: m.content, reach: m.reach, sentiment: m.sentiment,
        })),
        nodes: graphData.nodes,
        edges: graphData.edges,
        healthScores,
        decisionPrompt: effectiveDp ? { prompt: effectiveDp.prompt, options: effectiveDp.options as string[] } : undefined,
        executiveRecommendations: effectiveDp?.executiveRecommendations
          ? (effectiveDp.executiveRecommendations as unknown as ExecutiveRecommendation[])
          : undefined,
        populationStats: proj.populationStats
          ? (proj.populationStats as unknown as PopulationStats[])
          : undefined,
      }
    }
  }

  // Cache miss or user event — generate on-demand
  console.log(`[step] ${userEvent ? 'USER EVENT' : 'Cache MISS'}: generating day=${next.dayNumber} tick=${next.tickIndex}`)
  const result = await generateAndStoreTick(projectId, next.dayNumber, next.tickIndex, decision, userEvent)

  // Update project cursor
  await prisma.project.update({
    where: { id: projectId },
    data: { currentDay: next.dayNumber },
  })

  // Trigger background pre-generation
  setTimeout(() => {
    preGenerateTicks(projectId, 6).catch(console.error)
  }, 50)

  return result
}

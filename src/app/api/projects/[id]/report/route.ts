import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { generateSimulationReport } from '@/lib/ai/generate-report'

// POST /api/projects/[id]/report — generate end-of-simulation report
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      events: { orderBy: { dayNumber: 'asc' } },
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  // Get all decisions
  const decisions = await prisma.decisionPoint.findMany({
    where: { projectId: id, chosenOption: { not: null } },
    include: { tick: { select: { dayNumber: true } } },
    orderBy: { id: 'asc' },
  })

  // Get first and last health scores
  const firstHealth = await prisma.healthScore.findFirst({
    where: { tick: { projectId: id } },
    orderBy: { tick: { id: 'asc' } },
  })
  const lastHealth = await prisma.healthScore.findFirst({
    where: { tick: { projectId: id } },
    orderBy: { tick: { id: 'desc' } },
  })

  // Get notable messages (high reach or strong sentiment)
  const notableMessages = await prisma.message.findMany({
    where: {
      tick: { projectId: id },
      OR: [
        { reach: { gte: 0.7 } },
        { sentiment: { lte: -0.5 } },
        { sentiment: { gte: 0.5 } },
      ],
    },
    orderBy: { tick: { dayNumber: 'asc' } },
    take: 20,
    include: { tick: { select: { dayNumber: true, tickIndex: true } } },
  })

  const defaultHealth = {
    overall: 75,
    publicSentiment: 70,
    mediaHeat: 15,
    regulatoryPressure: 10,
    internalStability: 80,
    fraudRisk: 10,
    publicAwareness: 5,
  }

  try {
    const report = await generateSimulationReport({
      crisisContext: project.context,
      simulationDays: project.simulationDays || 14,
      healthStart: firstHealth
        ? {
            overall: firstHealth.overall,
            publicSentiment: firstHealth.publicSentiment,
            mediaHeat: firstHealth.mediaHeat,
            regulatoryPressure: firstHealth.regulatoryPressure,
            internalStability: firstHealth.internalStability,
            fraudRisk: firstHealth.fraudRisk,
            publicAwareness: firstHealth.publicAwareness,
          }
        : defaultHealth,
      healthEnd: lastHealth
        ? {
            overall: lastHealth.overall,
            publicSentiment: lastHealth.publicSentiment,
            mediaHeat: lastHealth.mediaHeat,
            regulatoryPressure: lastHealth.regulatoryPressure,
            internalStability: lastHealth.internalStability,
            fraudRisk: lastHealth.fraudRisk,
            publicAwareness: lastHealth.publicAwareness,
          }
        : defaultHealth,
      decisions: decisions.map((d) => ({
        day: d.tick.dayNumber,
        prompt: d.prompt,
        chosen: d.chosenOption!,
      })),
      keyEvents: project.events.map((e) => ({
        day: e.dayNumber,
        title: e.title,
        description: e.description,
        isUserInjected: false,
      })),
      messageHighlights: notableMessages.map(
        (m) => `[Day ${m.tick.dayNumber + 1}] ${m.author}: ${m.content.slice(0, 120)}`
      ),
    })

    return NextResponse.json(report)
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Failed to generate report:', msg)
    return NextResponse.json(
      { error: `Failed to generate report: ${msg.slice(0, 200)}` },
      { status: 500 }
    )
  }
}

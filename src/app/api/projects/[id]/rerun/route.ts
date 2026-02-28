import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@/generated/prisma/client'
import { restoreGraphFromSnapshot } from '@/lib/simulation/engine/graph-engine'

// POST /api/projects/[id]/rerun — branch from a decision point and rerun
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { decisionPointId, newChoice, currentReport } = body as {
    decisionPointId: string
    newChoice: string
    currentReport: unknown
  }

  if (!decisionPointId || !newChoice) {
    return NextResponse.json({ error: 'decisionPointId and newChoice are required' }, { status: 400 })
  }

  // 1. Find the decision point and its tick
  const dp = await prisma.decisionPoint.findUnique({
    where: { id: decisionPointId },
    include: { tick: true },
  })

  if (!dp) {
    return NextResponse.json({ error: 'Decision point not found' }, { status: 404 })
  }

  const branchDay = dp.tick.dayNumber

  // 2. Save current report as previousReport
  await prisma.project.update({
    where: { id },
    data: {
      previousReport: currentReport as Prisma.InputJsonValue,
      rerunFromDay: branchDay,
    },
  })

  // 3. Find the generate tick (subTickIndex=0) for graph snapshot
  const snapshotTick = await prisma.tick.findUnique({
    where: {
      projectId_dayNumber_tickIndex_subTickIndex: {
        projectId: id,
        dayNumber: branchDay,
        tickIndex: dp.tick.tickIndex,
        subTickIndex: 0,
      },
    },
  })

  // 4. Delete decision points for ticks after branch day
  await prisma.decisionPoint.deleteMany({
    where: {
      projectId: id,
      tick: { dayNumber: { gt: branchDay } },
    },
  })
  // Delete the original decision point being re-branched
  await prisma.decisionPoint.delete({ where: { id: decisionPointId } })

  // 5. Delete all ticks after the branch day (cascade cleans messages/health/summaries)
  await prisma.tick.deleteMany({
    where: {
      projectId: id,
      dayNumber: { gt: branchDay },
    },
  })

  // 6. Delete user-injected timeline events after branch day
  await prisma.timelineEvent.deleteMany({
    where: {
      projectId: id,
      dayNumber: { gt: branchDay },
      isUserInjected: true,
    },
  })

  // 7. Restore graph state from snapshot
  let graphData
  try {
    graphData = await restoreGraphFromSnapshot(id, snapshotTick!.id)
  } catch {
    return NextResponse.json(
      { error: 'No graph snapshot available for this decision point. Run a new simulation first.' },
      { status: 400 }
    )
  }

  // 8. Create new decision point with the new choice
  await prisma.decisionPoint.create({
    data: {
      projectId: id,
      tickId: dp.tickId,
      prompt: dp.prompt,
      options: dp.options as Prisma.InputJsonValue ?? undefined,
      chosenOption: newChoice,
      executiveRecommendations: dp.executiveRecommendations as Prisma.InputJsonValue ?? undefined,
    },
  })

  // 9. Reset project state
  await prisma.project.update({
    where: { id },
    data: {
      currentDay: branchDay,
      status: 'running',
    },
  })

  // 10. Get health scores at branch point
  const healthAtBranch = await prisma.healthScore.findFirst({
    where: { tick: { projectId: id, dayNumber: branchDay } },
    orderBy: { tick: { subTickIndex: 'desc' } },
  })

  const defaultHealth = {
    overall: 75, publicSentiment: 70, mediaHeat: 15,
    regulatoryPressure: 10, internalStability: 80, fraudRisk: 10, publicAwareness: 5,
  }

  const healthScores = healthAtBranch
    ? {
        overall: healthAtBranch.overall,
        publicSentiment: healthAtBranch.publicSentiment,
        mediaHeat: healthAtBranch.mediaHeat,
        regulatoryPressure: healthAtBranch.regulatoryPressure,
        internalStability: healthAtBranch.internalStability,
        fraudRisk: healthAtBranch.fraudRisk,
        publicAwareness: healthAtBranch.publicAwareness,
      }
    : defaultHealth

  console.log(`[rerun] Branching from day ${branchDay} with new choice: "${newChoice}"`)

  return NextResponse.json({
    branchDay,
    nodes: graphData.nodes,
    edges: graphData.edges,
    healthScores,
  })
}

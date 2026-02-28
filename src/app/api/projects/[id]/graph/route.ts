import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getProjectGraph, calculateHealthScores } from '@/lib/simulation/engine/graph-engine'

// GET /api/projects/[id]/graph — returns full graph state for dashboard
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  try {
    const graphData = await getProjectGraph(id)

    // Prefer stored health scores (LLM-driven) over node-derived
    const lastHealthRecord = await prisma.healthScore.findFirst({
      where: { tick: { projectId: id } },
      orderBy: { tick: { id: 'desc' } },
    })
    const healthScores = lastHealthRecord
      ? {
          overall: lastHealthRecord.overall,
          publicSentiment: lastHealthRecord.publicSentiment,
          mediaHeat: lastHealthRecord.mediaHeat,
          regulatoryPressure: lastHealthRecord.regulatoryPressure,
          internalStability: lastHealthRecord.internalStability,
          fraudRisk: lastHealthRecord.fraudRisk,
          publicAwareness: lastHealthRecord.publicAwareness ?? 10,
        }
      : await calculateHealthScores(id)

    return NextResponse.json({
      nodes: graphData.nodes,
      edges: graphData.edges,
      healthScores,
    })
  } catch (error) {
    console.error('Failed to get graph:', error)
    return NextResponse.json(
      { error: 'Failed to load graph data' },
      { status: 500 }
    )
  }
}

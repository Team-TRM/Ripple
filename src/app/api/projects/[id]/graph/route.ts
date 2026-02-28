import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { getProjectGraph, calculateHealthScores } from '@/lib/simulation/neo4j-graph'

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
    const healthScores = await calculateHealthScores(id)

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

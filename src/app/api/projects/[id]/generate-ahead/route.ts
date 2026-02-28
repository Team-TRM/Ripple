import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { preGenerateTicks } from '@/lib/simulation/tick-engine'

// POST /api/projects/[id]/generate-ahead — trigger background pre-generation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const project = await prisma.project.findUnique({ where: { id } })

  if (!project || project.status !== 'running') {
    return NextResponse.json({ error: 'Project not running' }, { status: 400 })
  }

  // Fire-and-forget background generation
  preGenerateTicks(id, 6).catch((err) =>
    console.error('[generate-ahead] Error:', err)
  )

  return NextResponse.json({ status: 'generating' })
}

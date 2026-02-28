import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { runTick } from '@/lib/simulation/tick-engine'

// POST /api/projects/[id]/step — advance one sub-tick
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { decision, userEvent, fromDay, fromTickIndex } = body as {
    decision?: string; userEvent?: string; fromDay?: number; fromTickIndex?: number
  }

  const project = await prisma.project.findUnique({ where: { id } })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if (project.status !== 'running') {
    return NextResponse.json({ error: 'Project is not running' }, { status: 400 })
  }

  // Check for pending decisions
  if (!decision) {
    const pendingDecision = await prisma.decisionPoint.findFirst({
      where: { projectId: id, chosenOption: null },
    })
    if (pendingDecision) {
      return NextResponse.json(
        { error: 'Pending decision must be resolved first', decision: pendingDecision },
        { status: 400 }
      )
    }
  }

  try {
    // If user injected an event, store it as a timeline event
    let injectedEvent = null
    if (userEvent) {
      injectedEvent = {
        id: `user-${Date.now()}`,
        dayNumber: fromDay ?? project.currentDay,
        title: 'Crisis Update',
        description: userEvent,
        isUserInjected: true,
      }
    }

    const result = await runTick(id, decision, userEvent, fromDay, fromTickIndex)
    return NextResponse.json({ ...result, injectedEvent })
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error('Failed to advance tick:', msg, error)
    return NextResponse.json(
      { error: `Failed to advance simulation: ${msg.slice(0, 200)}` },
      { status: 500 }
    )
  }
}

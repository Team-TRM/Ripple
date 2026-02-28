import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// POST /api/projects/[id]/decide — submit a decision
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { chosenOption, userEvent } = body as { chosenOption: string; userEvent?: string }

  if (!chosenOption) {
    return NextResponse.json({ error: 'chosenOption is required' }, { status: 400 })
  }

  // Find the pending decision
  const pending = await prisma.decisionPoint.findFirst({
    where: { projectId: id, chosenOption: null },
  })

  if (!pending) {
    return NextResponse.json({ error: 'No pending decision found' }, { status: 400 })
  }

  // Update the decision
  const updated = await prisma.decisionPoint.update({
    where: { id: pending.id },
    data: {
      chosenOption,
      userEvent: userEvent || null,
    },
  })

  // Invalidate all pre-generated ticks AFTER this decision's tick
  // so the next day regenerates with the decision context
  const decisionTick = await prisma.tick.findUnique({
    where: { id: pending.tickId },
    select: { dayNumber: true, tickIndex: true },
  })

  if (decisionTick) {
    const futureTicks = await prisma.tick.findMany({
      where: {
        projectId: id,
        OR: [
          { dayNumber: { gt: decisionTick.dayNumber } },
          { dayNumber: decisionTick.dayNumber, tickIndex: { gt: decisionTick.tickIndex } },
        ],
      },
      select: { id: true },
    })

    if (futureTicks.length > 0) {
      await prisma.tick.deleteMany({
        where: { id: { in: futureTicks.map((t) => t.id) } },
      })
      console.log(`[decide] Invalidated ${futureTicks.length} pre-generated ticks after decision`)
    }
  }

  return NextResponse.json(updated)
}

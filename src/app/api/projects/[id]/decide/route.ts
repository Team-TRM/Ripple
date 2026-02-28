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

  return NextResponse.json(updated)
}

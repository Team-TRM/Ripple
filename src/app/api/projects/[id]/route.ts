import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'

// GET /api/projects/[id] — get full project with all related data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      questions: true,
      cohorts: true,
      events: { orderBy: { dayNumber: 'asc' } },
      ticks: {
        orderBy: [{ dayNumber: 'asc' }, { tickIndex: 'asc' }, { subTickIndex: 'asc' }],
        include: {
          messages: true,
          summaries: {
            include: { cohort: { select: { name: true } } },
          },
        },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  return NextResponse.json(project)
}

// DELETE /api/projects/[id] — delete project and all related data
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const project = await prisma.project.findUnique({ where: { id } })
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  await prisma.project.delete({ where: { id } })
  return NextResponse.json({ success: true })
}

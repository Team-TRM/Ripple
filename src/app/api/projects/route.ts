import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { generateQuestions } from '@/lib/ai/generate-questions'

// GET /api/projects — list all projects
export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      events: {
        orderBy: { dayNumber: 'asc' },
        select: { id: true, dayNumber: true, dateLabel: true, title: true },
      },
      ticks: {
        select: { id: true, dayNumber: true, tickIndex: true, subTickIndex: true },
      },
    },
  })

  return NextResponse.json(projects)
}

// POST /api/projects — create project + generate questions
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { context } = body as { context: string }

  if (!context || typeof context !== 'string' || context.trim().length === 0) {
    return NextResponse.json({ error: 'Crisis context is required' }, { status: 400 })
  }

  try {
    const { questions } = await generateQuestions(context.trim())

    const project = await prisma.project.create({
      data: {
        name: 'New Simulation',
        context: context.trim(),
        status: 'questions',
        questions: {
          create: questions.map((q) => ({ question: q })),
        },
      },
      include: {
        questions: true,
      },
    })

    return NextResponse.json(project, { status: 201 })
  } catch (error) {
    console.error('Failed to create project:', error)
    return NextResponse.json(
      { error: 'Failed to generate questions. Please try again.' },
      { status: 500 }
    )
  }
}

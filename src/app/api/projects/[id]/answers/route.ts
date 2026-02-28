import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { generateSummary } from '@/lib/ai/generate-summary'
import { generateSetup } from '@/lib/ai/generate-setup'

// POST /api/projects/[id]/answers — submit answers, generate summary + setup, status → "ready"
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { answers } = body as { answers: Record<string, string> }

  const project = await prisma.project.findUnique({
    where: { id },
    include: { questions: true },
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  if (project.status !== 'questions') {
    return NextResponse.json({ error: 'Project is not in questions stage' }, { status: 400 })
  }

  try {
    // Update answers in DB
    for (const [questionId, answer] of Object.entries(answers)) {
      await prisma.projectQuestion.update({
        where: { id: questionId },
        data: { answer },
      })
    }

    // Build Q&A pairs
    const answeredQuestions = project.questions.map((q) => ({
      question: q.question,
      answer: answers[q.id] || '',
    }))

    // Generate summary from context + Q&A
    const summary = await generateSummary(project.context, answeredQuestions)

    // Generate setup (name, cohorts, timeline)
    const setup = await generateSetup(project.context, answeredQuestions)

    // Store cohorts
    await Promise.all(
      setup.cohorts.map((c) =>
        prisma.cohort.create({
          data: {
            projectId: id,
            name: c.name,
            description: c.description,
            attentionWeights: c.attentionWeights,
            sensitivityTags: c.sensitivityTags,
          },
        })
      )
    )

    // Store timeline events
    await prisma.timelineEvent.createMany({
      data: setup.events.map((e) => ({
        projectId: id,
        dayNumber: e.dayNumber,
        dateLabel: e.dateLabel,
        title: e.title,
        description: e.description,
      })),
    })

    // Update project with name, summary, and status "ready" (user reviews before confirming)
    await prisma.project.update({
      where: { id },
      data: {
        name: setup.projectName,
        summary,
        status: 'ready',
      },
    })

    // Return full project
    const updatedProject = await prisma.project.findUnique({
      where: { id },
      include: {
        questions: true,
        cohorts: true,
        events: { orderBy: { dayNumber: 'asc' } },
      },
    })

    return NextResponse.json(updatedProject)
  } catch (error) {
    console.error('Failed to process answers:', error)
    return NextResponse.json(
      { error: 'Failed to generate simulation. Please try again.' },
      { status: 500 }
    )
  }
}

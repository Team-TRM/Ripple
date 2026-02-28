import { NextRequest } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import { generateTick } from '@/lib/ai/generate-tick'
import { generateGraph } from '@/lib/ai/generate-graph'
import { createProjectGraph, deleteProjectGraph } from '@/lib/simulation/neo4j-graph'

type EditedCohort = { id: string; name: string; description: string }
type EditedEvent = { id: string; title: string; description: string }

// POST /api/projects/[id]/confirm — persist edits, generate tick 0, create graph, status → "running"
// Streams progress events via SSE
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json()
  const { simulationDays, cohorts: editedCohorts, events: editedEvents } = body as {
    simulationDays: number
    cohorts?: EditedCohort[]
    events?: EditedEvent[]
  }

  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      cohorts: true,
      events: { orderBy: { dayNumber: 'asc' } },
    },
  })

  if (!project) {
    return new Response(JSON.stringify({ error: 'Project not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (project.status !== 'ready') {
    return new Response(JSON.stringify({ error: 'Project is not ready for confirmation' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Stream response
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (step: string, status: 'running' | 'done' | 'error' = 'running') => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ step, status })}\n\n`))
      }

      try {
        // Step 1: Apply edits
        send('Saving your edits...')
        if (editedCohorts) {
          const editedIds = new Set(editedCohorts.map((c) => c.id))
          const removedIds = project.cohorts
            .filter((c) => !editedIds.has(c.id))
            .map((c) => c.id)
          if (removedIds.length > 0) {
            await prisma.cohort.deleteMany({ where: { id: { in: removedIds } } })
          }
          for (const c of editedCohorts) {
            await prisma.cohort.update({
              where: { id: c.id },
              data: { name: c.name, description: c.description },
            })
          }
        }
        if (editedEvents) {
          const editedIds = new Set(editedEvents.map((e) => e.id))
          const removedIds = project.events
            .filter((e) => !editedIds.has(e.id))
            .map((e) => e.id)
          if (removedIds.length > 0) {
            await prisma.timelineEvent.deleteMany({ where: { id: { in: removedIds } } })
          }
          for (const e of editedEvents) {
            await prisma.timelineEvent.update({
              where: { id: e.id },
              data: { title: e.title, description: e.description },
            })
          }
        }
        send('Saving your edits...', 'done')

        // Re-fetch after edits
        const updated = await prisma.project.findUnique({
          where: { id },
          include: {
            cohorts: true,
            events: { orderBy: { dayNumber: 'asc' } },
          },
        })

        if (!updated) {
          send('Project not found after update', 'error')
          controller.close()
          return
        }

        const firstEvent = updated.events[0]

        // Step 2: Clean up previous data
        send('Cleaning up previous data...')
        await prisma.tick.deleteMany({ where: { projectId: id } })
        await deleteProjectGraph(id)
        send('Cleaning up previous data...', 'done')

        // Step 3: Generate initial media content
        send('Generating initial media content...')
        const tickData = await generateTick({
          crisisContext: project.context,
          tickNumber: 0,
          dayEvent: {
            dateLabel: firstEvent.dateLabel,
            title: firstEvent.title,
            description: firstEvent.description,
          },
          cohorts: updated.cohorts.map((c) => ({
            name: c.name,
            description: c.description,
            sensitivityTags: c.sensitivityTags as string[],
          })),
        })
        send('Generating initial media content...', 'done')

        // Step 4: Store tick 0
        send('Storing initial tick data...')
        const tick = await prisma.tick.create({
          data: {
            projectId: id,
            dayNumber: 0,
            tickIndex: 0,
            subTickIndex: 0,
            dateLabel: firstEvent.dateLabel,
            messages: {
              create: tickData.messages.map((m) => ({
                type: m.type,
                author: m.author,
                content: m.content,
                parentId: m.parentIndex !== undefined
                  ? `parent-${m.parentIndex}`
                  : undefined,
              })),
            },
            summaries: {
              create: tickData.cohortSummaries.map((s) => {
                const cohort = updated.cohorts.find((c) => c.name === s.cohortName)
                return {
                  cohortId: cohort!.id,
                  mood: s.mood,
                  dominantNarrative: s.dominantNarrative,
                  behaviours: s.behaviours,
                }
              }),
            },
          },
        })
        send('Storing initial tick data...', 'done')

        // Step 5: Generate influence graph
        send('Building influence graph...')
        const graphSetup = await generateGraph(
          project.context,
          updated.cohorts.map((c) => ({ name: c.name, description: c.description }))
        )
        send('Building influence graph...', 'done')

        // Step 6: Store graph
        send('Creating graph nodes and edges...')
        const cohortMap = new Map<string, string>()
        for (const c of updated.cohorts) {
          cohortMap.set(c.name, c.id)
        }
        await createProjectGraph(id, graphSetup, cohortMap)
        send('Creating graph nodes and edges...', 'done')

        // Step 7: Store health scores
        send('Calculating health scores...')
        await prisma.healthScore.create({
          data: {
            tickId: tick.id,
            overall: graphSetup.healthScores.overall,
            publicSentiment: graphSetup.healthScores.publicSentiment,
            mediaHeat: graphSetup.healthScores.mediaHeat,
            regulatoryPressure: graphSetup.healthScores.regulatoryPressure,
            internalStability: graphSetup.healthScores.internalStability,
            fraudRisk: graphSetup.healthScores.fraudRisk,
          },
        })
        send('Calculating health scores...', 'done')

        // Step 8: Activate
        send('Launching simulation...')
        await prisma.project.update({
          where: { id },
          data: {
            simulationDays,
            status: 'running',
          },
        })
        send('Launching simulation...', 'done')

        // Final: send complete event with project data
        const finalProject = await prisma.project.findUnique({
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
                healthScore: true,
              },
            },
          },
        })

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ step: 'complete', status: 'done', project: finalProject })}\n\n`)
        )
      } catch (error) {
        console.error('Failed to confirm simulation:', error)
        send(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}

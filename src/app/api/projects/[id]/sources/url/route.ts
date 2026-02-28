import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/db/prisma'
import {
  appendExternalSourceToContext,
  extractExternalSourcesFromContext,
  ingestExternalSourceFromUrl,
} from '@/lib/sources/url-source-tool'

// POST /api/projects/[id]/sources/url — ingest external URL content into project context
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await request.json().catch(() => ({}))
  const { url } = body as { url?: string }

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id },
    select: { id: true, context: true, status: true },
  })

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  try {
    console.log(`[source-tool] Ingesting external URL for project=${id}: ${url}`)
    const source = await ingestExternalSourceFromUrl(url, project.context)
    const updated = appendExternalSourceToContext(project.context, source)

    if (!updated.skipped) {
      await prisma.project.update({
        where: { id },
        data: { context: updated.context },
      })
    }

    const allSources = extractExternalSourcesFromContext(updated.context)

    return NextResponse.json({
      source,
      skipped: updated.skipped,
      sourceCount: updated.sourceCount,
      sources: allSources,
      context: updated.context,
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Failed to ingest source'
    console.error('[source-tool] URL ingestion failed:', msg)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}


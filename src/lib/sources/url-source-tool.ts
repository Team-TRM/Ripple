import { mistral } from '@/lib/ai/client'
import { z } from 'zod'
import dns from 'node:dns/promises'
import net from 'node:net'

const EXTERNAL_SOURCE_START = '[EXTERNAL_SOURCE]'
const EXTERNAL_SOURCE_END = '[/EXTERNAL_SOURCE]'
const MAX_SOURCES = 8

const SourceDigestSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  keyFacts: z.array(z.string()).min(2).max(5),
  stakeholders: z.array(z.string()).min(1).max(6),
  riskSignals: z.array(z.string()).min(1).max(6),
})

export type ExternalSourceRecord = {
  url: string
  title: string
  summary: string
  keyFacts: string[]
  stakeholders: string[]
  riskSignals: string[]
  fetchedAt: string
  extractedChars: number
}

function normalizeUrl(raw: string): string {
  const url = new URL(raw.trim())
  url.hash = ''
  if (url.pathname.endsWith('/') && url.pathname !== '/') {
    url.pathname = url.pathname.slice(0, -1)
  }
  return url.toString()
}

function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number)
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    return false
  }

  // Basic IPv6 local checks.
  const lower = ip.toLowerCase()
  return lower === '::1' || lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80')
}

async function assertSafeSourceUrl(raw: string): Promise<string> {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new Error('Invalid URL format')
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Only http/https URLs are supported')
  }

  const host = url.hostname.toLowerCase()
  if (host === 'localhost' || host.endsWith('.local') || host === '0.0.0.0') {
    throw new Error('Local/internal hosts are not allowed')
  }

  const ipVersion = net.isIP(host)
  if (ipVersion && isPrivateIp(host)) {
    throw new Error('Private network hosts are not allowed')
  }

  try {
    const resolved = await dns.lookup(host, { all: true })
    for (const addr of resolved) {
      if (isPrivateIp(addr.address)) {
        throw new Error('Resolved to a private/internal address')
      }
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('private/internal')) throw err
    // DNS resolution can fail for some public hosts; allow fetch layer to decide.
  }

  return normalizeUrl(url.toString())
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

function extractTextFromHtml(html: string): string {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, ' ')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|h6|li|section|article|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')

  return decodeHtmlEntities(stripped)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function pickTitleFromHtml(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!match?.[1]) return null
  return decodeHtmlEntities(match[1]).trim().slice(0, 180)
}

async function fetchSourceContent(url: string): Promise<{ title: string; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'RippleBot/1.0 (+https://ripple.local)',
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch URL (${response.status})`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('html') && !contentType.includes('text')) {
      throw new Error('Unsupported content type for ingestion')
    }

    const raw = (await response.text()).slice(0, 300_000)
    const title = pickTitleFromHtml(raw) || new URL(url).hostname
    const text = extractTextFromHtml(raw).slice(0, 16_000)

    if (text.length < 280) {
      throw new Error('Could not extract enough readable content from URL')
    }

    return { title, text }
  } finally {
    clearTimeout(timer)
  }
}

function fallbackDigest(title: string, text: string): ExternalSourceRecord {
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const summary = sentences.slice(0, 3).join(' ').slice(0, 500) || text.slice(0, 500)
  const keyFacts = sentences.slice(0, 4).map((s) => s.slice(0, 140))

  return {
    url: '',
    title,
    summary,
    keyFacts: keyFacts.length > 0 ? keyFacts : [summary],
    stakeholders: ['Public', 'Media'],
    riskSignals: ['Potential reputational impact'],
    fetchedAt: new Date().toISOString(),
    extractedChars: text.length,
  }
}

async function summarizeForSimulation(url: string, title: string, text: string, crisisContext: string): Promise<ExternalSourceRecord> {
  const prompt = `You are extracting simulation-grounding facts from an external source.

Return JSON with this shape only:
{
  "title": "clean title",
  "summary": "2-3 sentence summary focused on crisis-relevant facts",
  "keyFacts": ["fact 1", "fact 2", "fact 3"],
  "stakeholders": ["stakeholder group 1", "stakeholder group 2"],
  "riskSignals": ["risk signal 1", "risk signal 2"]
}

Rules:
- Be factual and concise.
- Focus on facts that can affect media/public/regulator/employee dynamics.
- No markdown.

Current simulation context:
${crisisContext.slice(0, 1200)}

Source URL: ${url}
Source title: ${title}
Source text:
${text.slice(0, 9000)}`

  try {
    const result = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        {
          role: 'system',
          content: 'You extract structured facts for simulation grounding.',
        },
        { role: 'user', content: prompt },
      ],
      responseFormat: { type: 'json_object' },
      temperature: 0.2,
    })

    const content = result.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') throw new Error('No digest content')

    const parsed = SourceDigestSchema.parse(JSON.parse(content))
    return {
      url,
      title: parsed.title.slice(0, 180),
      summary: parsed.summary.slice(0, 900),
      keyFacts: parsed.keyFacts.map((f) => f.slice(0, 200)),
      stakeholders: parsed.stakeholders.map((s) => s.slice(0, 80)),
      riskSignals: parsed.riskSignals.map((r) => r.slice(0, 120)),
      fetchedAt: new Date().toISOString(),
      extractedChars: text.length,
    }
  } catch {
    const fb = fallbackDigest(title, text)
    return {
      ...fb,
      url,
    }
  }
}

export async function ingestExternalSourceFromUrl(rawUrl: string, crisisContext: string): Promise<ExternalSourceRecord> {
  const safeUrl = await assertSafeSourceUrl(rawUrl)
  const { title, text } = await fetchSourceContent(safeUrl)
  return summarizeForSimulation(safeUrl, title, text, crisisContext)
}

export function extractExternalSourcesFromContext(context: string): ExternalSourceRecord[] {
  const entries: ExternalSourceRecord[] = []
  const re = new RegExp(`${EXTERNAL_SOURCE_START}\\s*([\\s\\S]*?)\\s*${EXTERNAL_SOURCE_END}`, 'g')
  let match: RegExpExecArray | null

  while ((match = re.exec(context)) !== null) {
    const jsonText = match[1]?.trim()
    if (!jsonText) continue
    try {
      const parsed = JSON.parse(jsonText)
      const validated = z.object({
        url: z.string().url(),
        title: z.string(),
        summary: z.string(),
        keyFacts: z.array(z.string()),
        stakeholders: z.array(z.string()),
        riskSignals: z.array(z.string()),
        fetchedAt: z.string(),
        extractedChars: z.number(),
      }).parse(parsed)
      entries.push(validated)
    } catch {
      continue
    }
  }

  return entries
}

export function appendExternalSourceToContext(
  context: string,
  source: ExternalSourceRecord
): { context: string; skipped: boolean; sourceCount: number } {
  const existing = extractExternalSourcesFromContext(context)
  const sameUrl = existing.some((s) => normalizeUrl(s.url) === normalizeUrl(source.url))
  if (sameUrl) {
    return { context, skipped: true, sourceCount: existing.length }
  }

  if (existing.length >= MAX_SOURCES) {
    throw new Error(`Source limit reached (${MAX_SOURCES})`)
  }

  const header = context.includes('EXTERNAL SOURCES FOR SIMULATION')
    ? ''
    : '\n\nEXTERNAL SOURCES FOR SIMULATION:\nUse these grounded facts when simulating stakeholders and narratives.\n'
  const block = `${EXTERNAL_SOURCE_START}\n${JSON.stringify(source)}\n${EXTERNAL_SOURCE_END}`
  const next = `${context.trim()}${header}\n${block}\n`

  return { context: next, skipped: false, sourceCount: existing.length + 1 }
}


'use client'

import { useEffect, useState, useMemo, type ReactNode } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import SimulationDashboard from '@/components/simulation/SimulationDashboard'

type Cohort = {
  id: string
  name: string
  description: string
  sensitivityTags: string[]
}

type TimelineEvent = {
  id: string
  dayNumber: number
  dateLabel: string
  title: string
  description: string
}

type Project = {
  id: string
  name: string
  context: string
  summary: string | null
  status: string
  simulationDays: number | null
  currentDay: number
  isPaused: boolean
  createdAt: string
  cohorts: Cohort[]
  events: TimelineEvent[]
}

type ExternalSource = {
  url: string
  title: string
  summary: string
  keyFacts: string[]
  stakeholders: string[]
  riskSignals: string[]
  fetchedAt: string
  extractedChars: number
}

const MIN_SIM_DAYS = 3
const DEFAULT_SIM_DAYS = 7
const MAX_SIM_DAYS = 60
const SOURCE_BLOCK_RE = /\[EXTERNAL_SOURCE\]\s*([\s\S]*?)\s*\[\/EXTERNAL_SOURCE\]/g

function clampSimulationDays(days: number) {
  return Math.max(MIN_SIM_DAYS, Math.min(MAX_SIM_DAYS, Math.round(days)))
}

function parseExternalSourcesFromContext(context: string): ExternalSource[] {
  const items: ExternalSource[] = []
  SOURCE_BLOCK_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = SOURCE_BLOCK_RE.exec(context)) !== null) {
    const payload = match[1]?.trim()
    if (!payload) continue
    try {
      const parsed = JSON.parse(payload) as ExternalSource
      if (!parsed.url || !parsed.title || !parsed.summary) continue
      items.push(parsed)
    } catch {
      continue
    }
  }
  return items.reverse()
}

function ConfidenceBadge({ days }: { days: number }) {
  const { label, dot } = useMemo(() => {
    if (days <= 14) return { label: 'High', dot: 'bg-green-400' }
    if (days <= 30) return { label: 'Medium', dot: 'bg-yellow-400' }
    return { label: 'Low', dot: 'bg-red-400' }
  }, [days])

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label} confidence
    </span>
  )
}

function SourcePlaceholderCard({
  icon,
  title,
  description,
  cta,
  hint,
  onAction,
  actionBusy,
}: {
  icon: ReactNode
  title: string
  description: string
  cta: string
  hint: string
  onAction?: () => void
  actionBusy?: boolean
}) {
  return (
    <div className="bg-gray-900/80 border border-gray-800 rounded-xl p-4 flex flex-col">
      <div className="w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-blue-300 mb-3">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-white mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed flex-1">{description}</p>
      <button
        type="button"
        onClick={onAction}
        disabled={actionBusy}
        className="mt-3 h-9 px-3 rounded-lg border border-blue-500/40 bg-blue-500/15 hover:bg-blue-500/20 text-blue-200 text-xs font-medium text-left inline-flex items-center justify-between transition-colors"
      >
        <span>{cta}</span>
        <span aria-hidden="true">&rarr;</span>
      </button>
      <p className="text-[11px] text-gray-600 mt-2">{hint}</p>
    </div>
  )
}

function getCohortVisual(name: string): { label: string; icon: ReactNode; tone: string } {
  const n = name.toLowerCase()

  if (n.includes('customer') || n.includes('consumer') || n.includes('client')) {
    return {
      label: 'Customers',
      tone: 'bg-rose-500/15 border-rose-400/30 text-rose-300',
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 19.2V18a3.5 3.5 0 0 1 3.5-3.5h7A3.5 3.5 0 0 1 19 18v1.2" />
          <circle cx="12" cy="8.5" r="3.2" />
        </svg>
      ),
    }
  }

  if (n.includes('employee') || n.includes('staff') || n.includes('team')) {
    return {
      label: 'Employees',
      tone: 'bg-emerald-500/15 border-emerald-400/30 text-emerald-300',
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 19.2V18a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v1.2" />
          <circle cx="12" cy="8.2" r="3" />
          <path d="M7 6.5h2M15 6.5h2" />
        </svg>
      ),
    }
  }

  if (n.includes('public') || n.includes('community') || n.includes('society')) {
    return {
      label: 'Public',
      tone: 'bg-blue-500/15 border-blue-400/30 text-blue-300',
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="9" r="2.6" />
          <circle cx="16" cy="9" r="2.6" />
          <path d="M3.8 18a4.2 4.2 0 0 1 8.4 0M11.8 18a4.2 4.2 0 0 1 8.4 0" />
        </svg>
      ),
    }
  }

  if (n.includes('analyst') || n.includes('investor') || n.includes('market')) {
    return {
      label: 'Market',
      tone: 'bg-violet-500/15 border-violet-400/30 text-violet-300',
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 19h16" />
          <path d="M6.5 16V11M11.5 16V8M16.5 16V6" />
          <path d="m5.5 9.5 5-3 4 1.8 4-2.3" />
        </svg>
      ),
    }
  }

  if (n.includes('regulator') || n.includes('government') || n.includes('policy')) {
    return {
      label: 'Government',
      tone: 'bg-indigo-500/15 border-indigo-400/30 text-indigo-300',
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 10h16" />
          <path d="M6 10v7M10 10v7M14 10v7M18 10v7" />
          <path d="M3 17h18M12 4l8 4H4l8-4z" />
        </svg>
      ),
    }
  }

  if (n.includes('media') || n.includes('press') || n.includes('journal')) {
    return {
      label: 'Media',
      tone: 'bg-amber-500/15 border-amber-400/30 text-amber-300',
      icon: (
        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="4" y="6" width="16" height="12" rx="2" />
          <path d="M8 10h8M8 14h5" />
        </svg>
      ),
    }
  }

  return {
    label: 'Stakeholder',
    tone: 'bg-cyan-500/15 border-cyan-400/30 text-cyan-300',
    icon: (
      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="8.5" r="3.1" />
        <path d="M5 19a7 7 0 0 1 14 0" />
      </svg>
    ),
  }
}

function EditableText({
  value,
  onChange,
  className = '',
  as = 'span',
}: {
  value: string
  onChange: (val: string) => void
  className?: string
  as?: 'span' | 'p'
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)

  if (editing) {
    return (
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          onChange(draft)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            onChange(draft)
            setEditing(false)
          }
          if (e.key === 'Escape') {
            setDraft(value)
            setEditing(false)
          }
        }}
        className={`bg-gray-800 border border-gray-600 rounded px-2 py-1 text-white w-full resize-none focus:outline-none focus:border-blue-500 ${className}`}
        rows={Math.max(1, Math.ceil(draft.length / 60))}
        autoFocus
      />
    )
  }

  const Tag = as
  return (
    <Tag
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
      className={`cursor-pointer hover:bg-gray-800/50 rounded px-1 -mx-1 transition-colors ${className}`}
      title="Click to edit"
    >
      {value}
    </Tag>
  )
}

export default function ProjectPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = Array.isArray(params.id) ? params.id[0] : params.id
  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [simulationDays, setSimulationDays] = useState(DEFAULT_SIM_DAYS)
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmSteps, setConfirmSteps] = useState<{ step: string; status: string }[]>([])
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  // Editable local state
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [externalSources, setExternalSources] = useState<ExternalSource[]>([])
  const [showSourceInput, setShowSourceInput] = useState(false)
  const [sourceUrlInput, setSourceUrlInput] = useState('')
  const [isIngestingSource, setIsIngestingSource] = useState(false)
  const [sourceError, setSourceError] = useState('')
  const [sourceNotice, setSourceNotice] = useState('')

  useEffect(() => {
    const fetchProject = async () => {
      const res = await fetch(`/api/projects/${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setProject(data)
        setCohorts(data.cohorts || [])
        setEvents(data.events || [])
        setExternalSources(parseExternalSourcesFromContext(data.context || ''))
        if (data.simulationDays) {
          setSimulationDays(clampSimulationDays(data.simulationDays))
        } else if (data.events?.length) {
          setSimulationDays(clampSimulationDays(Math.max(DEFAULT_SIM_DAYS, data.events.length)))
        }
      }
      setIsLoading(false)
    }
    fetchProject()
  }, [projectId])

  const handleDelete = async () => {
    if (!confirm('Delete this simulation?')) return
    const res = await fetch(`/api/projects/${projectId}`, { method: 'DELETE' })
    if (res.ok) router.push('/')
  }

  const handleConfirm = async () => {
    setIsConfirming(true)
    setConfirmSteps([])
    try {
      const res = await fetch(`/api/projects/${projectId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulationDays,
          cohorts: cohorts.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
          })),
          events: events.map((e) => ({
            id: e.id,
            title: e.title,
            description: e.description,
          })),
        }),
      })

      if (!res.ok || !res.body) {
        console.error('Confirm failed')
        setIsConfirming(false)
        return
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.step === 'complete' && data.project) {
              setProject(data.project)
            } else if (data.status === 'error') {
              setConfirmSteps((prev) => [...prev, { step: data.step, status: 'error' }])
            } else {
              setConfirmSteps((prev) => {
                // If same step text with status 'done', update existing
                const existing = prev.findIndex((s) => s.step === data.step)
                if (existing >= 0) {
                  const updated = [...prev]
                  updated[existing] = data
                  return updated
                }
                return [...prev, data]
              })
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      console.error('Failed to confirm:', err)
    } finally {
      setIsConfirming(false)
    }
  }

  // Cohort editing helpers
  const updateCohort = (id: string, field: keyof Cohort, value: string) => {
    setCohorts((prev) =>
      prev.map((c) => (c.id === id ? { ...c, [field]: value } : c))
    )
  }

  const removeCohort = (id: string) => {
    setCohorts((prev) => prev.filter((c) => c.id !== id))
  }

  // Event editing helpers
  const updateEvent = (id: string, field: keyof TimelineEvent, value: string) => {
    setEvents((prev) =>
      prev.map((e) => (e.id === id ? { ...e, [field]: value } : e))
    )
  }

  const removeEvent = (id: string) => {
    setEvents((prev) => prev.filter((e) => e.id !== id))
  }

  const showTransientNotice = (message: string) => {
    setSourceNotice(message)
    window.setTimeout(() => setSourceNotice(''), 2600)
  }

  const handleIngestSource = async () => {
    const raw = sourceUrlInput.trim()
    if (!raw) {
      setSourceError('Enter a URL to ingest.')
      return
    }
    if (!raw.startsWith('http://') && !raw.startsWith('https://')) {
      setSourceError('URL must start with http:// or https://')
      return
    }

    setSourceError('')
    setIsIngestingSource(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/sources/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: raw }),
      })
      const data = await res.json()
      if (!res.ok) {
        setSourceError(data.error || 'Failed to ingest source')
        return
      }

      if (typeof data.context === 'string') {
        setProject((prev) => (prev ? { ...prev, context: data.context } : prev))
        setExternalSources(parseExternalSourcesFromContext(data.context))
      } else if (Array.isArray(data.sources)) {
        setExternalSources(data.sources)
      }
      setSourceUrlInput('')
      setShowSourceInput(false)
      showTransientNotice(data.skipped ? 'Source already exists in context.' : 'External source ingested and added to simulation context.')
    } catch {
      setSourceError('Network error while ingesting source')
    } finally {
      setIsIngestingSource(false)
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-400">Project not found.</p>
      </div>
    )
  }

  const summaryPreview = project.summary && project.summary.length > 150
    ? project.summary.slice(0, 150) + '...'
    : project.summary

  return (
    <main className="min-h-screen">
      {/* Header */}
      <div className="border-b border-gray-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-gray-400 hover:text-white transition-colors">
              &larr; Back
            </Link>
            <h1 className="text-xl font-bold">{project.name}</h1>
          </div>
          <button
            onClick={handleDelete}
            className="text-gray-500 hover:text-red-400 transition-colors text-sm"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {project.status === 'ready' ? (
          <div className="space-y-6">

            {/* Summary — collapsible */}
            {project.summary && (
              <div
                className="bg-gray-900 border border-gray-800 rounded-xl px-5 py-4 cursor-pointer group"
                onClick={() => setSummaryExpanded(!summaryExpanded)}
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Summary</h2>
                  <span className="text-gray-600 group-hover:text-gray-400 transition-colors text-xs">
                    {summaryExpanded ? 'Collapse' : 'Expand'}
                  </span>
                </div>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {summaryExpanded ? project.summary : summaryPreview}
                </p>
              </div>
            )}

            {/* Cohorts — editable */}
            {cohorts.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Audience Cohorts
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {cohorts.map((cohort) => (
                    <div
                      key={cohort.id}
                      className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col group/card relative"
                    >
                      {(() => {
                        const visual = getCohortVisual(cohort.name)
                        return (
                          <div className="flex items-start gap-2 mb-1.5 pr-6">
                            <span
                              className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md border ${visual.tone}`}
                            >
                              {visual.icon}
                            </span>
                            <div className="min-w-0">
                              <EditableText
                                value={cohort.name}
                                onChange={(val) => updateCohort(cohort.id, 'name', val)}
                                className="font-semibold text-white text-sm block"
                              />
                              <span className="text-[10px] uppercase tracking-wider text-gray-500">
                                {visual.label}
                              </span>
                            </div>
                          </div>
                        )
                      })()}
                      {/* Remove button */}
                      <button
                        onClick={() => removeCohort(cohort.id)}
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-800 text-gray-500 hover:text-red-400 hover:bg-gray-700 flex items-center justify-center text-xs opacity-0 group-hover/card:opacity-100 transition-opacity"
                      >
                        &times;
                      </button>
                      <EditableText
                        value={cohort.description}
                        onChange={(val) => updateCohort(cohort.id, 'description', val)}
                        className="text-gray-500 text-xs leading-relaxed flex-1"
                        as="p"
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Timeline — editable */}
            {events.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  Projected Timeline
                </h2>
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[7px] top-2 bottom-2 w-px bg-gray-700" />

                    <div className="space-y-4">
                      {events.map((event, i) => (
                        <div key={event.id} className="flex gap-4 relative group/event">
                          {/* Dot */}
                          <div className="flex-shrink-0 relative z-10">
                            <div className={`w-[15px] h-[15px] rounded-full border-2 mt-0.5 ${
                              i === 0
                                ? 'bg-blue-500 border-blue-500'
                                : 'bg-gray-900 border-gray-600'
                            }`} />
                          </div>
                          {/* Content */}
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex items-baseline gap-2">
                              <span className="text-xs font-mono text-gray-500">
                                Day {event.dayNumber}
                              </span>
                            </div>
                            <EditableText
                              value={event.title}
                              onChange={(val) => updateEvent(event.id, 'title', val)}
                              className="text-sm text-white font-medium mt-0.5 block"
                              as="p"
                            />
                            <EditableText
                              value={event.description}
                              onChange={(val) => updateEvent(event.id, 'description', val)}
                              className="text-xs text-gray-500 mt-1 block leading-relaxed"
                              as="p"
                            />
                          </div>
                          {/* Remove button */}
                          <button
                            onClick={() => removeEvent(event.id)}
                            className="flex-shrink-0 w-5 h-5 rounded-full bg-gray-800 text-gray-500 hover:text-red-400 hover:bg-gray-700 flex items-center justify-center text-xs opacity-0 group-hover/event:opacity-100 transition-opacity self-start mt-0.5"
                          >
                            &times;
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Context Sources */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Context Sources
              </h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <p className="text-xs text-gray-500 mb-4">
                  Bring internal and external context into Ripple to ground actors with company data, documents, and live signals.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <SourcePlaceholderCard
                    icon={(
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <ellipse cx="12" cy="6" rx="6.5" ry="3" />
                        <path d="M5.5 6v6c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3V6" />
                        <path d="M5.5 12v6c0 1.7 2.9 3 6.5 3s6.5-1.3 6.5-3v-6" />
                      </svg>
                    )}
                    title="Connect Database"
                    description="Attach company systems (employees, CRM, incidents, policy docs) as structured context for simulation world-building."
                    cta="Connect data source"
                    hint="Supports SQL warehouses and internal APIs."
                    onAction={() => showTransientNotice('Database connector linked to this simulation context.')}
                  />
                  <SourcePlaceholderCard
                    icon={(
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 16V5" />
                        <path d="m8 9 4-4 4 4" />
                        <rect x="4" y="15.5" width="16" height="4.5" rx="1.5" />
                      </svg>
                    )}
                    title="Upload Documents"
                    description="Add reports, PDFs, briefs, and internal memos so agents can reason with richer evidence and constraints."
                    cta="Upload files"
                    hint="Accepted: PDF, DOCX, CSV, TXT."
                    onAction={() => showTransientNotice('Document library attached to this simulation context.')}
                  />
                  <SourcePlaceholderCard
                    icon={(
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M9 15 15 9" />
                        <path d="M8.5 9a3 3 0 0 1 0-4.2l1.6-1.6a3 3 0 1 1 4.2 4.2L13 8.9" />
                        <path d="M15.5 15a3 3 0 0 1 0 4.2l-1.6 1.6a3 3 0 1 1-4.2-4.2L11 15.1" />
                      </svg>
                    )}
                    title="Add Article Links"
                    description="Import relevant news URLs to ground media dynamics and benchmark likely public/regulatory reactions."
                    cta="Add URLs"
                    hint="News pages are parsed into simulation context."
                    onAction={() => setShowSourceInput((prev) => !prev)}
                    actionBusy={isIngestingSource}
                  />
                </div>
                <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-950/10 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] text-blue-200 font-medium uppercase tracking-wider">External URL Ingestion Tool</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">Scrape, summarize, and ground this simulation with external sources.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowSourceInput((prev) => !prev)}
                      className="h-8 px-3 rounded-md border border-blue-500/40 bg-blue-500/15 text-blue-200 text-xs font-medium whitespace-nowrap"
                    >
                      {showSourceInput ? 'Hide' : 'Add source URL'}
                    </button>
                  </div>

                  {showSourceInput && (
                    <div className="mt-3 flex flex-col sm:flex-row gap-2">
                      <input
                        type="url"
                        value={sourceUrlInput}
                        onChange={(e) => setSourceUrlInput(e.target.value)}
                        placeholder="https://news-site.com/article"
                        className="flex-1 h-10 rounded-lg border border-gray-700 bg-gray-900 px-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={handleIngestSource}
                        disabled={isIngestingSource || !sourceUrlInput.trim()}
                        className="h-10 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white text-sm font-medium"
                      >
                        {isIngestingSource ? 'Ingesting...' : 'Ingest URL'}
                      </button>
                    </div>
                  )}

                  {sourceError && <p className="text-[11px] text-red-400 mt-2">{sourceError}</p>}
                  {!sourceError && sourceNotice && <p className="text-[11px] text-emerald-300 mt-2">{sourceNotice}</p>}
                </div>

                {externalSources.length > 0 && (
                  <div className="mt-4">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">
                      Ingested Sources ({externalSources.length})
                    </p>
                    <div className="space-y-2">
                      {externalSources.map((source) => (
                        <div key={`${source.url}-${source.fetchedAt}`} className="rounded-lg border border-gray-800 bg-gray-950/50 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-xs text-white font-medium truncate">{source.title}</p>
                            <span className="text-[10px] text-gray-600 whitespace-nowrap">
                              {new Date(source.fetchedAt).toLocaleDateString()}
                            </span>
                          </div>
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-blue-300 hover:text-blue-200 truncate block mt-0.5"
                          >
                            {source.url}
                          </a>
                          <p className="text-[11px] text-gray-400 mt-1.5 line-clamp-2">{source.summary}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* Duration Slider */}
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                Simulation Duration
              </h2>
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-white tabular-nums">{simulationDays}</span>
                    <span className="text-gray-500 text-sm">
                      {simulationDays === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                  <ConfidenceBadge days={simulationDays} />
                </div>

                <input
                  type="range"
                  min={MIN_SIM_DAYS}
                  max={MAX_SIM_DAYS}
                  value={simulationDays}
                  onChange={(e) => setSimulationDays(clampSimulationDays(Number(e.target.value)))}
                  className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                />

                <div className="flex justify-between mt-1.5 text-[10px] text-gray-600">
                  <span>3 days</span>
                  <span>2 months</span>
                </div>

                <p className="text-gray-600 text-[11px] mt-3">
                  Longer timelines produce less reliable predictions.
                </p>
              </div>
            </section>

            {/* Confirm */}
            <div className="pt-2">
              <div className="flex justify-end">
                <button
                  onClick={handleConfirm}
                  disabled={isConfirming}
                  className="bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white px-8 py-3 rounded-xl font-semibold transition-colors"
                >
                  Start Simulation
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ===== RUNNING MODE — Full screen dashboard ===== */
          null
        )}
      </div>

      {/* Full-screen generation progress overlay */}
      {isConfirming && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center">
          <div className="max-w-md w-full mx-4">
            <div className="mb-8 text-center">
              <div className="w-12 h-12 border-3 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mx-auto mb-4" />
              <h2 className="text-xl font-bold text-white mb-1">Building Simulation</h2>
              <p className="text-sm text-gray-500">Setting up your crisis scenario...</p>
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              {(() => {
                const activeStep = confirmSteps.find((s) => s.status !== 'done' && s.status !== 'error')
                const doneCount = confirmSteps.filter((s) => s.status === 'done').length
                return (
                  <div className="space-y-4">
                    {activeStep ? (
                      <div className="flex items-center gap-3">
                        {activeStep.status === 'error' ? (
                          <span className="text-red-400 text-sm flex-shrink-0">&#10007;</span>
                        ) : (
                          <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
                        )}
                        <span className={`text-sm ${activeStep.status === 'error' ? 'text-red-400' : 'text-white'}`}>
                          {activeStep.step}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className="text-green-400 text-sm flex-shrink-0">&#10003;</span>
                        <span className="text-sm text-gray-400">Complete</span>
                      </div>
                    )}
                    {confirmSteps.length > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-500"
                            style={{ width: `${(doneCount / 10) * 100}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-gray-500 tabular-nums">{doneCount}/10</span>
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Full-screen dashboard overlay for running mode */}
      {project.status === 'running' && (
        <div className="fixed inset-0 z-50">
          <SimulationDashboard
            project={project}
            initialTimelineEvents={events.map((e) => ({
              id: e.id,
              dayNumber: e.dayNumber,
              title: e.title,
              description: e.description,
            }))}
          />
        </div>
      )}
    </main>
  )
}

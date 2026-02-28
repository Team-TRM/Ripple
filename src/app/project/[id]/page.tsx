'use client'

import { useEffect, useState, useMemo } from 'react'
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
  const [project, setProject] = useState<Project | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [simulationDays, setSimulationDays] = useState(14)
  const [isConfirming, setIsConfirming] = useState(false)
  const [confirmSteps, setConfirmSteps] = useState<{ step: string; status: string }[]>([])
  const [summaryExpanded, setSummaryExpanded] = useState(false)

  // Editable local state
  const [cohorts, setCohorts] = useState<Cohort[]>([])
  const [events, setEvents] = useState<TimelineEvent[]>([])

  useEffect(() => {
    const fetchProject = async () => {
      const res = await fetch(`/api/projects/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setProject(data)
        setCohorts(data.cohorts || [])
        setEvents(data.events || [])
        if (data.simulationDays) {
          setSimulationDays(data.simulationDays)
        } else if (data.events?.length) {
          setSimulationDays(Math.max(7, data.events.length))
        }
      }
      setIsLoading(false)
    }
    fetchProject()
  }, [params.id])

  const handleDelete = async () => {
    if (!confirm('Delete this simulation?')) return
    const res = await fetch(`/api/projects/${params.id}`, { method: 'DELETE' })
    if (res.ok) router.push('/')
  }

  const handleConfirm = async () => {
    setIsConfirming(true)
    setConfirmSteps([])
    try {
      const res = await fetch(`/api/projects/${params.id}/confirm`, {
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
                      {/* Remove button */}
                      <button
                        onClick={() => removeCohort(cohort.id)}
                        className="absolute top-2 right-2 w-5 h-5 rounded-full bg-gray-800 text-gray-500 hover:text-red-400 hover:bg-gray-700 flex items-center justify-center text-xs opacity-0 group-hover/card:opacity-100 transition-opacity"
                      >
                        &times;
                      </button>

                      <EditableText
                        value={cohort.name}
                        onChange={(val) => updateCohort(cohort.id, 'name', val)}
                        className="font-semibold text-white text-sm mb-1.5"
                      />
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
                  min={7}
                  max={60}
                  value={simulationDays}
                  onChange={(e) => setSimulationDays(Number(e.target.value))}
                  className="w-full h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer accent-blue-500"
                />

                <div className="flex justify-between mt-1.5 text-[10px] text-gray-600">
                  <span>1 week</span>
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

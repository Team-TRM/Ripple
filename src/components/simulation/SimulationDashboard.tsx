'use client'

import { useEffect, useCallback, useRef, useState } from 'react'
import {
  SimulationProvider,
  useSimulation,
  useSimulationDispatch,
  type GraphNode,
  type GraphEdge,
  type HealthScores,
  type TimelineEvent,
  type SimMessage,
  type ExecutiveRecommendation,
} from './SimulationContext'
import TopBar from './TopBar'
import MetricsSidebar from './MetricsSidebar'
import LiveEventsSidebar from './LiveEventsSidebar'
import TimelineBar from './TimelineBar'
import GraphVisualization from './GraphVisualization'
import DecisionDialog from './DecisionDialog'
import NodeDetailDialog from './NodeDetailDialog'
import SimulationReport from './SimulationReport'

type Project = {
  id: string
  name: string
  simulationDays: number | null
  currentDay: number
  isPaused: boolean
}

// Tick interval in ms — how long each tick stays on screen
const TICK_DISPLAY_INTERVAL = 1500

const SIMULATING_TIPS = [
  'Scanning media channels',
  'Analyzing stakeholder reactions',
  'Modeling public sentiment',
  'Evaluating regulatory signals',
  'Processing social media activity',
  'Assessing crisis trajectory',
  'Computing reputational impact',
  'Monitoring internal communications',
]

function SimulatingOverlay() {
  const [tipIdx, setTipIdx] = useState(() => Math.floor(Math.random() * SIMULATING_TIPS.length))
  const [fade, setFade] = useState(true)

  useEffect(() => {
    const interval = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setTipIdx((i) => (i + 1) % SIMULATING_TIPS.length)
        setFade(true)
      }, 400)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="absolute inset-0 z-30 bg-black/30 pointer-events-none flex items-end justify-center pb-8">
      <div className="flex items-center gap-3 px-5 py-2.5 rounded-full bg-black/60 backdrop-blur-sm border border-gray-700/40">
        <span className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.6)] animate-pulse" />
        <span
          className="text-xs text-gray-400 font-medium tracking-wide transition-opacity duration-400"
          style={{ opacity: fade ? 1 : 0 }}
        >
          {SIMULATING_TIPS[tipIdx]}
        </span>
      </div>
    </div>
  )
}

function DashboardInner({ projectId }: { projectId: string }) {
  const { isPlaying, pendingUserEvent, currentDay, currentTickIndex, isGenerating, simulationDays, edges, rerunFromDay } = useSimulation()
  const dispatch = useSimulationDispatch()
  const playingRef = useRef(false)
  const steppingRef = useRef(false)
  const positionRef = useRef({ day: currentDay, tickIndex: currentTickIndex })
  const abortRef = useRef<AbortController | null>(null)

  // Server-side position — tracks where the server is, independent of displayed state
  const fetchPositionRef = useRef({ day: currentDay, tickIndex: currentTickIndex })

  // Deferred tick advance — dispatched by the play loop after messages drain
  const pendingTickRef = useRef<{
    dayNumber: number
    tickIndex: number
    subTickIndex: number
  } | null>(null)

  // Message queue — decoupled from fetch so messages keep flowing during LLM calls
  const messageQueueRef = useRef<SimMessage[]>([])
  const drainTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Accumulated user events — survives fetch aborts
  const pendingEventsRef = useRef<string[]>([])

  // Wake function to interrupt the play loop sleep for immediate retry
  const wakeRef = useRef<(() => void) | null>(null)

  // Decision deferred until messages drain — stored here by stepOnce, shown by play loop
  const pendingDecisionRef = useRef<{
    prompt: string
    options: string[]
    executiveRecommendations?: ExecutiveRecommendation[]
  } | null>(null)

  const simulationDaysRef = useRef(simulationDays)
  playingRef.current = isPlaying
  positionRef.current = { day: currentDay, tickIndex: currentTickIndex }
  simulationDaysRef.current = simulationDays

  // Accumulate user events into ref (survives fetch aborts).
  // Abort in-flight fetch, flush old messages, and wake the play loop for immediate retry.
  useEffect(() => {
    if (!pendingUserEvent) return
    pendingEventsRef.current.push(pendingUserEvent)
    dispatch({ type: 'SET_PENDING_USER_EVENT', event: null })

    // Abort in-flight fetch so we can immediately retry with the new event
    if (abortRef.current) {
      console.log('[step] Aborting in-flight step for user input')
      abortRef.current.abort()
    }
    steppingRef.current = false

    // Clear old message queue so new breaking news isn't stuck behind stale messages
    if (drainTimerRef.current) {
      clearTimeout(drainTimerRef.current)
      drainTimerRef.current = null
    }
    messageQueueRef.current.length = 0

    // Wake the play loop sleep to trigger immediate step
    if (wakeRef.current) {
      wakeRef.current()
      wakeRef.current = null
    }
  }, [pendingUserEvent, dispatch])

  // Reset position when a rerun starts — play loop resumes from branch point
  useEffect(() => {
    if (rerunFromDay !== null) {
      fetchPositionRef.current = { day: rerunFromDay, tickIndex: 2 }
      messageQueueRef.current.length = 0
      if (drainTimerRef.current) {
        clearTimeout(drainTimerRef.current)
        drainTimerRef.current = null
      }
      pendingTickRef.current = null
      pendingDecisionRef.current = null
    }
  }, [rerunFromDay])

  // Drain message queue one by one with staggered timing (runs independently of fetches)
  const drainMessages = useCallback(() => {
    if (drainTimerRef.current) return // already draining

    const drainNext = () => {
      if (messageQueueRef.current.length === 0 || !playingRef.current) {
        drainTimerRef.current = null
        return
      }
      const msg = messageQueueRef.current.shift()!
      dispatch({ type: 'ADD_MESSAGES', messages: [msg] })
      const delay = 800 + Math.random() * 700
      drainTimerRef.current = setTimeout(drainNext, delay)
    }
    drainNext()
  }, [dispatch])

  // Load initial graph data + auto-play on mount
  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/graph`)
        if (!res.ok) return
        const data = await res.json()
        dispatch({ type: 'SET_GRAPH', nodes: data.nodes, edges: data.edges })
        if (data.healthScores) {
          dispatch({ type: 'SET_HEALTH', scores: data.healthScores })
        }
      } catch (err) {
        console.error('Failed to load graph:', err)
      }

      // Auto-play after graph loads
      dispatch({ type: 'SET_PLAYING', isPlaying: true })
    }
    init()
  }, [projectId, dispatch])

  // Fetch next tick — non-blocking (messages pushed to queue, not staggered inline)
  const stepOnce = useCallback(async () => {
    if (steppingRef.current) return
    steppingRef.current = true

    const controller = new AbortController()
    abortRef.current = controller

    dispatch({ type: 'SET_GENERATING', isGenerating: true })

    // Snapshot events but DON'T clear yet — if fetch aborts, events survive for retry
    const eventSnapshot = [...pendingEventsRef.current]
    const combinedEvent = eventSnapshot.length > 0 ? eventSnapshot.join('\n\nALSO: ') : undefined

    try {
      const bodyPayload: Record<string, string | number> = {
        fromDay: fetchPositionRef.current.day,
        fromTickIndex: fetchPositionRef.current.tickIndex,
      }
      if (combinedEvent) {
        bodyPayload.userEvent = combinedEvent
      }

      const res = await fetch(`/api/projects/${projectId}/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
        signal: controller.signal,
      })

      const data = await res.json()

      if (!res.ok) {
        // Don't clear events on error — they weren't processed by the server
        if (data.decision) {
          dispatch({
            type: 'SHOW_DECISION',
            prompt: data.decision.prompt,
            options: data.decision.options,
            executiveRecommendations: data.decision.executiveRecommendations
              ? (Array.isArray(data.decision.executiveRecommendations) ? data.decision.executiveRecommendations : undefined)
              : undefined,
          })
        } else {
          console.error(`[step] Error: ${data.error}`)
        }
        dispatch({ type: 'SET_PLAYING', isPlaying: false })
        return
      }

      // Success — clear the events we just sent (new events added since snapshot stay)
      if (eventSnapshot.length > 0) {
        pendingEventsRef.current.splice(0, eventSnapshot.length)
      }

      // Update server-side position immediately so next fetch knows where to continue
      if (data.tick) {
        fetchPositionRef.current = { day: data.tick.dayNumber, tickIndex: data.tick.tickIndex }
      }

      // If paused during fetch, advance display position immediately and skip visual updates
      if (!playingRef.current) {
        if (data.tick) {
          dispatch({
            type: 'ADVANCE_TICK',
            dayNumber: data.tick.dayNumber,
            tickIndex: data.tick.tickIndex,
            subTickIndex: data.tick.subTickIndex,
          })
        }
        return
      }

      // API responded — hide simulating overlay immediately
      dispatch({ type: 'SET_GENERATING', isGenerating: false })

      // Update graph + health immediately
      if (data.nodes) {
        dispatch({ type: 'UPDATE_NODES', nodes: data.nodes, edges: data.edges })
      }
      if (data.healthScores) {
        dispatch({ type: 'SET_HEALTH', scores: data.healthScores })
      }
      dispatch({
        type: 'SET_AGENT_ACTIONS',
        actions: Array.isArray(data.agentActions) ? data.agentActions : [],
      })

      // Push messages to queue — drain loop displays them one by one independently
      // Truncate old undisplayed messages to max 3 so events stay in sync with the day counter
      if (data.messages?.length) {
        if (messageQueueRef.current.length > 3) {
          messageQueueRef.current.length = 3
        }
        const TICK_LABELS = ['Morning', 'Afternoon', 'Evening']
        const enrichedMessages = data.messages.map((m: Record<string, unknown>) => ({
          ...m,
          dayNumber: data.tick?.dayNumber ?? 0,
          tickIndex: data.tick?.tickIndex ?? 0,
          timestamp: `Day ${(data.tick?.dayNumber ?? 0) + 1} · ${TICK_LABELS[data.tick?.tickIndex ?? 0] || 'Morning'}`,
        }))
        messageQueueRef.current.push(...enrichedMessages)
        drainMessages()
      }

      // Defer tick advance — play loop will dispatch after messages drain
      if (data.tick) {
        pendingTickRef.current = {
          dayNumber: data.tick.dayNumber,
          tickIndex: data.tick.tickIndex,
          subTickIndex: data.tick.subTickIndex,
        }
      }
      if (data.populationStats) {
        dispatch({ type: 'SET_POPULATION_STATS', stats: data.populationStats })
      }
      // Defer decision until message queue drains — play loop will show it
      if (data.decisionPrompt) {
        pendingDecisionRef.current = {
          prompt: data.decisionPrompt.prompt,
          options: data.decisionPrompt.options,
          executiveRecommendations: data.executiveRecommendations,
        }
      }
      if (data.injectedEvent) {
        dispatch({ type: 'ADD_TIMELINE_EVENT', event: data.injectedEvent })
      }
    } catch (err) {
      // AbortError = user input interrupted — events stay in ref for automatic retry
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.log('[step] Aborted — will retry with accumulated events')
        return
      }
      console.error('[step] Failed:', err)
      dispatch({ type: 'SET_PLAYING', isPlaying: false })
    } finally {
      steppingRef.current = false
      abortRef.current = null
      dispatch({ type: 'SET_GENERATING', isGenerating: false })
    }
  }, [projectId, dispatch, drainMessages])

  // Trigger end-of-simulation report
  const triggerReport = useCallback(async () => {
    dispatch({ type: 'SET_PLAYING', isPlaying: false })
    dispatch({ type: 'SET_LOADING_REPORT', loading: true })
    try {
      const res = await fetch(`/api/projects/${projectId}/report`, { method: 'POST' })
      if (res.ok) {
        const report = await res.json()
        dispatch({ type: 'SHOW_REPORT', report })
      }
    } catch (err) {
      console.error('Failed to generate report:', err)
    } finally {
      dispatch({ type: 'SET_LOADING_REPORT', loading: false })
    }
  }, [projectId, dispatch])

  // Play loop — steady-pace with interruptible sleep
  // stepOnce is non-blocking (messages drain independently), so the loop is fast
  useEffect(() => {
    if (!isPlaying) return
    let cancelled = false

    const interruptibleSleep = (ms: number): Promise<void> => {
      return new Promise(resolve => {
        const timer = setTimeout(() => {
          wakeRef.current = null
          resolve()
        }, ms)
        wakeRef.current = () => {
          clearTimeout(timer)
          wakeRef.current = null
          resolve()
        }
      })
    }

    const loop = async () => {
      while (playingRef.current && !cancelled) {
        const t0 = Date.now()
        await stepOnce()

        // Wait for message queue to mostly drain before advancing the displayed day
        while (messageQueueRef.current.length > 2 && playingRef.current && !cancelled) {
          if (pendingEventsRef.current.length > 0) break // user input takes priority
          await new Promise(r => setTimeout(r, 200))
        }

        // Advance displayed tick AFTER messages drain — keeps TopBar in sync with events
        if (pendingTickRef.current && !cancelled) {
          const tick = pendingTickRef.current
          pendingTickRef.current = null
          dispatch({
            type: 'ADVANCE_TICK',
            dayNumber: tick.dayNumber,
            tickIndex: tick.tickIndex,
            subTickIndex: tick.subTickIndex,
          })
        }

        // Check if simulation is complete (past last day)
        const simDays = simulationDaysRef.current
        const fetchPos = fetchPositionRef.current
        if (fetchPos.day >= simDays && !cancelled) {
          // Wait for ALL messages to drain, then show report
          while (messageQueueRef.current.length > 0 && !cancelled) {
            await new Promise(r => setTimeout(r, 200))
          }
          if (!cancelled) {
            triggerReport()
          }
          break
        }

        // If a decision came in, wait for queue to FULLY drain, then show it
        if (pendingDecisionRef.current) {
          while (messageQueueRef.current.length > 0 && !cancelled) {
            await new Promise(r => setTimeout(r, 200))
          }
          if (!cancelled) {
            const dec = pendingDecisionRef.current
            pendingDecisionRef.current = null
            dispatch({ type: 'SET_PLAYING', isPlaying: false })
            dispatch({
              type: 'SHOW_DECISION',
              prompt: dec.prompt,
              options: dec.options,
              executiveRecommendations: dec.executiveRecommendations,
            })
          }
          break // exit loop — play was stopped
        }

        const elapsed = Date.now() - t0
        const remaining = Math.max(200, TICK_DISPLAY_INTERVAL - elapsed)
        // Skip sleep if pending events need immediate processing
        if (playingRef.current && !cancelled && pendingEventsRef.current.length === 0) {
          await interruptibleSleep(remaining)
        }
      }
    }
    loop()

    return () => {
      cancelled = true
      if (wakeRef.current) {
        wakeRef.current()
        wakeRef.current = null
      }
    }
  }, [isPlaying, stepOnce, triggerReport, dispatch])

  // Clean up drain timer on unmount
  useEffect(() => {
    return () => {
      if (drainTimerRef.current) {
        clearTimeout(drainTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="h-screen w-screen flex flex-col bg-black text-white overflow-hidden">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        <LiveEventsSidebar />
        <div className="flex-1 relative">
          {edges.length > 0 ? (
            <>
              <GraphVisualization />
              <NodeDetailDialog />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <span className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
                <span className="text-sm text-gray-500">Initializing simulation...</span>
              </div>
            </div>
          )}
          {isGenerating && edges.length > 0 && <SimulatingOverlay />}
        </div>
        <MetricsSidebar />
      </div>
      <TimelineBar />
      <DecisionDialog projectId={projectId} />
      <SimulationReport />
    </div>
  )
}

export default function SimulationDashboard({
  project,
  initialNodes,
  initialEdges,
  initialHealth,
  initialTimelineEvents,
}: {
  project: Project
  initialNodes?: GraphNode[]
  initialEdges?: GraphEdge[]
  initialHealth?: HealthScores
  initialTimelineEvents?: TimelineEvent[]
}) {
  return (
    <SimulationProvider
      initialState={{
        projectId: project.id,
        projectName: project.name,
        simulationDays: project.simulationDays || 14,
        currentDay: project.currentDay,
        currentTickIndex: 0,
        currentSubTickIndex: 0,
        isPaused: project.isPaused,
        nodes: initialNodes || [],
        edges: initialEdges || [],
        healthScores: initialHealth || {
          overall: 75,
          publicSentiment: 70,
          mediaHeat: 15,
          regulatoryPressure: 10,
          internalStability: 80,
          fraudRisk: 10,
          publicAwareness: 5,
        },
      }}
      initialTimelineEvents={initialTimelineEvents}
    >
      <DashboardInner projectId={project.id} />
    </SimulationProvider>
  )
}

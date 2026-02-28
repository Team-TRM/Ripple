'use client'

import { useEffect, useCallback, useRef } from 'react'
import {
  SimulationProvider,
  useSimulation,
  useSimulationDispatch,
  type GraphNode,
  type GraphEdge,
  type HealthScores,
  type TimelineEvent,
} from './SimulationContext'
import TopBar from './TopBar'
import MetricsSidebar from './MetricsSidebar'
import LiveEventsSidebar from './LiveEventsSidebar'
import TimelineBar from './TimelineBar'
import GraphVisualization from './GraphVisualization'
import DecisionDialog from './DecisionDialog'
import NodeDetailDialog from './NodeDetailDialog'

type Project = {
  id: string
  name: string
  simulationDays: number | null
  currentDay: number
  isPaused: boolean
}

// Tick interval in ms — how long each tick stays on screen
const TICK_DISPLAY_INTERVAL = 4000

function DashboardInner({ projectId }: { projectId: string }) {
  const { isPlaying, pendingUserEvent, currentDay, currentTickIndex } = useSimulation()
  const dispatch = useSimulationDispatch()
  const playingRef = useRef(false)
  const steppingRef = useRef(false)
  const positionRef = useRef({ day: currentDay, tickIndex: currentTickIndex })

  playingRef.current = isPlaying
  positionRef.current = { day: currentDay, tickIndex: currentTickIndex }

  // Load initial graph data + trigger pre-generation on mount
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

      // Kick off pre-generation in background
      fetch(`/api/projects/${projectId}/generate-ahead`, { method: 'POST' }).catch(() => {})
    }
    init()
  }, [projectId, dispatch])

  // Consume next tick from server (returns from cache if pre-generated = instant)
  const stepOnce = useCallback(async () => {
    if (steppingRef.current) return
    steppingRef.current = true
    try {
      const bodyPayload: Record<string, string | number> = {
        fromDay: positionRef.current.day,
        fromTickIndex: positionRef.current.tickIndex,
      }
      if (pendingUserEvent) {
        bodyPayload.userEvent = pendingUserEvent
        dispatch({ type: 'SET_PENDING_USER_EVENT', event: null })
      }

      const res = await fetch(`/api/projects/${projectId}/step`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      })

      const data = await res.json()

      if (!res.ok) {
        if (data.decision) {
          dispatch({
            type: 'SHOW_DECISION',
            prompt: data.decision.prompt,
            options: data.decision.options,
          })
        } else {
          console.error(`[step] Error: ${data.error}`)
          dispatch({ type: 'SET_PLAYING', isPlaying: false })
        }
        return
      }

      // If paused during fetch, silently update position but skip visual updates
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

      // Update graph + health immediately
      if (data.nodes) {
        dispatch({ type: 'UPDATE_NODES', nodes: data.nodes })
      }
      if (data.healthScores) {
        dispatch({ type: 'SET_HEALTH', scores: data.healthScores })
      }

      // Stagger messages one-by-one for smooth reveal
      if (data.messages?.length) {
        const TICK_LABELS = ['Morning', 'Afternoon', 'Evening']
        const enrichedMessages = data.messages.map((m: Record<string, unknown>) => ({
          ...m,
          dayNumber: data.tick?.dayNumber ?? 0,
          tickIndex: data.tick?.tickIndex ?? 0,
          timestamp: `Day ${data.tick?.dayNumber ?? 0} · ${TICK_LABELS[data.tick?.tickIndex ?? 0] || 'Morning'}`,
        }))
        // Reveal messages one at a time with random 3-5s delay
        for (let i = 0; i < enrichedMessages.length; i++) {
          if (i > 0) {
            const delay = 3000 + Math.random() * 2000
            await new Promise((r) => setTimeout(r, delay))
          }
          if (!playingRef.current) break
          dispatch({ type: 'ADD_MESSAGES', messages: [enrichedMessages[i]] })
        }
      }

      if (data.tick) {
        dispatch({
          type: 'ADVANCE_TICK',
          dayNumber: data.tick.dayNumber,
          tickIndex: data.tick.tickIndex,
          subTickIndex: data.tick.subTickIndex,
        })
      }
      if (data.decisionPrompt) {
        dispatch({
          type: 'SHOW_DECISION',
          prompt: data.decisionPrompt.prompt,
          options: data.decisionPrompt.options,
        })
      }
      if (data.injectedEvent) {
        dispatch({ type: 'ADD_TIMELINE_EVENT', event: data.injectedEvent })
      }
    } catch (err) {
      console.error('[step] Failed:', err)
      dispatch({ type: 'SET_PLAYING', isPlaying: false })
    } finally {
      steppingRef.current = false
    }
  }, [projectId, dispatch, pendingUserEvent])

  // Play loop — steady-pace interval for game-like feel
  useEffect(() => {
    if (!isPlaying) return
    let cancelled = false

    const loop = async () => {
      while (playingRef.current && !cancelled) {
        const t0 = Date.now()
        await stepOnce()
        // Maintain steady tick rhythm regardless of server response time
        const elapsed = Date.now() - t0
        const remaining = Math.max(200, TICK_DISPLAY_INTERVAL - elapsed)
        if (playingRef.current && !cancelled) {
          await new Promise((r) => setTimeout(r, remaining))
        }
      }
    }
    loop()

    return () => {
      cancelled = true
    }
  }, [isPlaying, stepOnce])

  return (
    <div className="h-screen w-screen flex flex-col bg-black text-white overflow-hidden">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        <LiveEventsSidebar />
        <div className="flex-1 relative">
          <GraphVisualization />
          <NodeDetailDialog />
        </div>
        <MetricsSidebar />
      </div>
      <TimelineBar />
      <DecisionDialog projectId={projectId} />
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
          overall: 50,
          publicSentiment: 50,
          mediaHeat: 30,
          regulatoryPressure: 20,
          internalStability: 70,
          fraudRisk: 15,
        },
      }}
      initialTimelineEvents={initialTimelineEvents}
    >
      <DashboardInner projectId={project.id} />
    </SimulationProvider>
  )
}

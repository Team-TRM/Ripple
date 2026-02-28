'use client'

import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react'

export type GraphNode = {
  nodeId: string
  label: string
  type: string
  color: string
  cohortId?: string
  sentiment: number
  activation: number
  trustInCompany: number
  dominantNarrative?: string
  behaviours?: string[]
}

export type GraphEdge = {
  source: string
  target: string
  weight: number
  type: string
}

export type HealthScores = {
  overall: number
  publicSentiment: number
  mediaHeat: number
  regulatoryPressure: number
  internalStability: number
  fraudRisk: number
}

export type SimMessage = {
  id: string
  type: string
  author: string
  content: string
  reach: number
  sentiment: number
  dayNumber?: number
  tickIndex?: number
  timestamp?: string
}

export type TimelineEvent = {
  id: string
  dayNumber: number
  title: string
  description: string
  isUserInjected?: boolean
}

export type SimState = {
  projectId: string
  projectName: string
  simulationDays: number
  currentDay: number
  currentTickIndex: number
  currentSubTickIndex: number
  isPlaying: boolean
  isPaused: boolean
  nodes: GraphNode[]
  edges: GraphEdge[]
  healthScores: HealthScores
  messages: SimMessage[]
  timelineEvents: TimelineEvent[]
  selectedNodeId: string | null
  showDecisionDialog: boolean
  decisionPrompt: { prompt: string; options: string[] } | null
  isGenerating: boolean
  eventInputOpen: boolean
  pendingUserEvent: string | null
}

type SimAction =
  | { type: 'SET_GRAPH'; nodes: GraphNode[]; edges: GraphEdge[] }
  | { type: 'SET_HEALTH'; scores: HealthScores }
  | { type: 'ADD_MESSAGES'; messages: SimMessage[] }
  | { type: 'ADVANCE_TICK'; dayNumber: number; tickIndex: number; subTickIndex: number }
  | { type: 'SET_PLAYING'; isPlaying: boolean }
  | { type: 'SET_PAUSED'; isPaused: boolean }
  | { type: 'SELECT_NODE'; nodeId: string | null }
  | { type: 'SHOW_DECISION'; prompt: string; options: string[] }
  | { type: 'DISMISS_DECISION' }
  | { type: 'UPDATE_NODES'; nodes: GraphNode[] }
  | { type: 'SET_GENERATING'; isGenerating: boolean }
  | { type: 'ADD_TIMELINE_EVENT'; event: TimelineEvent }
  | { type: 'SET_TIMELINE_EVENTS'; events: TimelineEvent[] }
  | { type: 'SET_EVENT_INPUT_OPEN'; open: boolean }
  | { type: 'SET_PENDING_USER_EVENT'; event: string | null }

function simReducer(state: SimState, action: SimAction): SimState {
  switch (action.type) {
    case 'SET_GRAPH':
      return { ...state, nodes: action.nodes, edges: action.edges }
    case 'SET_HEALTH':
      return { ...state, healthScores: action.scores }
    case 'ADD_MESSAGES':
      return { ...state, messages: [...action.messages, ...state.messages].slice(0, 50) }
    case 'ADVANCE_TICK':
      return {
        ...state,
        currentDay: action.dayNumber,
        currentTickIndex: action.tickIndex,
        currentSubTickIndex: action.subTickIndex,
      }
    case 'SET_PLAYING':
      return { ...state, isPlaying: action.isPlaying }
    case 'SET_PAUSED':
      return { ...state, isPaused: action.isPaused }
    case 'SELECT_NODE':
      return { ...state, selectedNodeId: action.nodeId }
    case 'SHOW_DECISION':
      return {
        ...state,
        showDecisionDialog: true,
        decisionPrompt: { prompt: action.prompt, options: action.options },
        isPlaying: false,
      }
    case 'DISMISS_DECISION':
      return { ...state, showDecisionDialog: false, decisionPrompt: null, isPlaying: true }
    case 'UPDATE_NODES':
      return { ...state, nodes: action.nodes }
    case 'SET_GENERATING':
      return { ...state, isGenerating: action.isGenerating }
    case 'ADD_TIMELINE_EVENT':
      return { ...state, timelineEvents: [...state.timelineEvents, action.event] }
    case 'SET_TIMELINE_EVENTS':
      return { ...state, timelineEvents: action.events }
    case 'SET_EVENT_INPUT_OPEN':
      return { ...state, eventInputOpen: action.open, isPlaying: action.open ? false : state.isPlaying }
    case 'SET_PENDING_USER_EVENT':
      return { ...state, pendingUserEvent: action.event }
    default:
      return state
  }
}

const SimulationContext = createContext<SimState | null>(null)
const SimulationDispatchContext = createContext<Dispatch<SimAction> | null>(null)

export function SimulationProvider({
  children,
  initialState,
  initialTimelineEvents,
}: {
  children: ReactNode
  initialState: Omit<SimState, 'messages' | 'selectedNodeId' | 'showDecisionDialog' | 'decisionPrompt' | 'isPlaying' | 'isGenerating' | 'eventInputOpen' | 'pendingUserEvent' | 'timelineEvents'>
  initialTimelineEvents?: TimelineEvent[]
}) {
  const [state, dispatch] = useReducer(simReducer, {
    ...initialState,
    messages: [],
    timelineEvents: initialTimelineEvents || [],
    selectedNodeId: null,
    showDecisionDialog: false,
    decisionPrompt: null,
    isPlaying: false,
    isGenerating: false,
    eventInputOpen: false,
    pendingUserEvent: null,
  })

  return (
    <SimulationContext.Provider value={state}>
      <SimulationDispatchContext.Provider value={dispatch}>
        {children}
      </SimulationDispatchContext.Provider>
    </SimulationContext.Provider>
  )
}

export function useSimulation() {
  const ctx = useContext(SimulationContext)
  if (!ctx) throw new Error('useSimulation must be used within SimulationProvider')
  return ctx
}

export function useSimulationDispatch() {
  const ctx = useContext(SimulationDispatchContext)
  if (!ctx) throw new Error('useSimulationDispatch must be used within SimulationProvider')
  return ctx
}

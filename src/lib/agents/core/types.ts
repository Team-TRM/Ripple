/**
 * Agent type system — defines the core abstractions for all agent types
 * in the multi-agent simulation framework.
 *
 * Three agent archetypes operate within the simulation:
 * - Speaker agents: Individual personas that generate social media / news content
 * - Executive agents: C-suite advisors that provide strategic recommendations
 * - Cohort agents: Aggregate population segments that track group sentiment
 */

export interface AgentProfile {
  id: string
  name: string
  type: 'speaker' | 'executive' | 'cohort'
  cohort?: string
  personality: string
  bias?: string
}

export interface AgentMemoryEntry {
  content: string
  sentiment: number
  reach: number
  dayNumber: number
  tickIndex: number
}

export interface AgentState {
  profile: AgentProfile
  memory: AgentMemoryEntry[]
  currentSentiment: number
  currentActivation: number
  messageCount: number
}

export interface ExecutiveProfile {
  role: string
  name: string
  perspective: string
  bias: string
}

export interface SpeakerAgentState extends AgentState {
  handle: string
  messageType: string
  recentPosts: AgentMemoryEntry[]
}

export interface CohortAgentState {
  cohortName: string
  population: number
  activeSpeakers: number
  aggregateSentiment: number
  trendDirection: 'improving' | 'stable' | 'declining'
  dominantNarrative: string
  behaviours: string[]
}

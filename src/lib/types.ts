/**
 * Shared type definitions used across server (simulation engine) and client (dashboard).
 * Single source of truth — all modules import from here.
 */

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

export type GraphData = {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export type HealthScores = {
  overall: number
  publicSentiment: number
  mediaHeat: number
  regulatoryPressure: number
  internalStability: number
  fraudRisk: number
  publicAwareness: number
}

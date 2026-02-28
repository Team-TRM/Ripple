import type { GraphEdge, GraphNode, HealthScores } from '@/lib/types'
import { planAgentAction } from '@/lib/agents/orchestrator/agent-planner'
import {
  combineToolHealthDeltas,
  executeAgentPlan,
  type AgentActionLog,
  type ToolHealthDeltas,
  type ToolNodeUpdate,
} from '@/lib/agents/tools/simulation-tools'

type AutonomousLoopInput = {
  crisisContext: string
  dayNumber: number
  tickIndex: number
  nodes: GraphNode[]
  edges: GraphEdge[]
  healthScores: HealthScores
  recentMessages: string[]
  lastDecision?: string
  maxAgents?: number
}

type AutonomousLoopResult = {
  nodeUpdates: ToolNodeUpdate[]
  healthDeltas: ToolHealthDeltas
  messages: {
    type: string
    author: string
    content: string
    reach: number
    sentiment: number
  }[]
  agentActions: AgentActionLog[]
}

function emptyHealthDeltas(): ToolHealthDeltas {
  return {
    overallDelta: 0,
    publicSentimentDelta: 0,
    mediaHeatDelta: 0,
    regulatoryPressureDelta: 0,
    internalStabilityDelta: 0,
    fraudRiskDelta: 0,
    publicAwarenessDelta: 0,
  }
}

function selectTopAutonomousNodes(nodes: GraphNode[], edges: GraphEdge[], maxAgents: number): GraphNode[] {
  const connectivity = new Map<string, number>()
  for (const edge of edges) {
    connectivity.set(edge.source, (connectivity.get(edge.source) || 0) + edge.weight)
    connectivity.set(edge.target, (connectivity.get(edge.target) || 0) + edge.weight)
  }

  return [...nodes]
    .map((node) => ({
      node,
      score: node.activation * (0.7 + (connectivity.get(node.nodeId) || 0)),
    }))
    .filter(({ node }) => node.activation >= 0.25)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxAgents)
    .map((x) => x.node)
}

function neighborsForNode(nodeId: string, nodes: GraphNode[], edges: GraphEdge[]) {
  return edges
    .filter((e) => e.source === nodeId || e.target === nodeId)
    .map((e) => {
      const neighborId = e.source === nodeId ? e.target : e.source
      const neighbor = nodes.find((n) => n.nodeId === neighborId)
      if (!neighbor) return null
      return {
        label: neighbor.label,
        type: neighbor.type,
        weight: e.weight,
        activation: neighbor.activation,
        sentiment: neighbor.sentiment,
      }
    })
    .filter(Boolean) as { label: string; type: string; weight: number; activation: number; sentiment: number }[]
}

async function planWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  return Promise.race<T | null>([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ])
}

export async function runAutonomousAgentLoop(input: AutonomousLoopInput): Promise<AutonomousLoopResult> {
  const maxAgents = input.maxAgents ?? 4
  const selectedNodes = selectTopAutonomousNodes(input.nodes, input.edges, maxAgents)

  if (selectedNodes.length === 0) {
    return {
      nodeUpdates: [],
      healthDeltas: emptyHealthDeltas(),
      messages: [],
      agentActions: [],
    }
  }

  const planned = await Promise.allSettled(
    selectedNodes.map(async (node) => {
      const plan = await planWithTimeout(
        planAgentAction({
          crisisContext: input.crisisContext,
          dayNumber: input.dayNumber,
          tickIndex: input.tickIndex,
          agentNode: node,
          neighbors: neighborsForNode(node.nodeId, input.nodes, input.edges),
          healthScores: input.healthScores,
          recentMessages: input.recentMessages,
          lastDecision: input.lastDecision,
        }),
        3200
      )
      if (!plan) return null
      return { node, plan }
    })
  )

  const nodeUpdates: ToolNodeUpdate[] = []
  const healthDeltasList: ToolHealthDeltas[] = []
  const messages: {
    type: string
    author: string
    content: string
    reach: number
    sentiment: number
  }[] = []
  const agentActions: AgentActionLog[] = []

  for (const result of planned) {
    if (result.status !== 'fulfilled' || !result.value) continue
    const executed = executeAgentPlan({
      plan: result.value.plan,
      node: result.value.node,
    })
    nodeUpdates.push(executed.nodeUpdate)
    healthDeltasList.push(executed.healthDeltas)
    messages.push(executed.message)
    agentActions.push(executed.action)
  }

  return {
    nodeUpdates,
    healthDeltas: combineToolHealthDeltas(healthDeltasList),
    messages,
    agentActions,
  }
}

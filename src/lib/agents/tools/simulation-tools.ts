import type { AgentPlan, AgentTool } from '@/lib/ai/schemas'
import type { GraphNode } from '@/lib/types'

export type ToolNodeUpdate = {
  nodeId: string
  sentimentDelta: number
  activationDelta: number
  trustDelta: number
  dominantNarrative?: string
  behaviours?: string[]
}

export type ToolHealthDeltas = {
  overallDelta: number
  publicSentimentDelta: number
  mediaHeatDelta: number
  regulatoryPressureDelta: number
  internalStabilityDelta: number
  fraudRiskDelta: number
  publicAwarenessDelta: number
}

export type AgentActionLog = {
  id: string
  agentNodeId: string
  agentLabel: string
  tool: AgentTool
  goal: string
  impact: string
  healthImpact: Partial<ToolHealthDeltas>
  nodeImpact: {
    sentimentDelta: number
    activationDelta: number
    trustDelta: number
  }
}

export type ToolExecutionResult = {
  nodeUpdate: ToolNodeUpdate
  healthDeltas: ToolHealthDeltas
  message: {
    type: string
    author: string
    content: string
    reach: number
    sentiment: number
  }
  action: AgentActionLog
}

type ExecutePlanInput = {
  plan: AgentPlan
  node: GraphNode
}

const TOOL_LABELS: Record<AgentTool, string> = {
  publish_message: 'Publish Message',
  amplify_signal: 'Amplify Signal',
  deescalate_narrative: 'De-escalate Narrative',
  trigger_regulatory_attention: 'Trigger Regulatory Attention',
  stabilize_internal_comms: 'Stabilize Internal Comms',
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function clampNodeDelta(value: number) {
  return clamp(value, -0.25, 0.25)
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

function boundedHealthDeltas(d: ToolHealthDeltas): ToolHealthDeltas {
  return {
    overallDelta: Math.round(clamp(d.overallDelta, -5, 8)),
    publicSentimentDelta: Math.round(clamp(d.publicSentimentDelta, -5, 8)),
    mediaHeatDelta: Math.round(clamp(d.mediaHeatDelta, -6, 5)),
    regulatoryPressureDelta: Math.round(clamp(d.regulatoryPressureDelta, -6, 5)),
    internalStabilityDelta: Math.round(clamp(d.internalStabilityDelta, -5, 8)),
    fraudRiskDelta: Math.round(clamp(d.fraudRiskDelta, -6, 5)),
    publicAwarenessDelta: Math.round(clamp(d.publicAwarenessDelta, 0, 8)),
  }
}

function nonZeroHealthImpact(d: ToolHealthDeltas): Partial<ToolHealthDeltas> {
  return Object.fromEntries(Object.entries(d).filter(([, v]) => v !== 0)) as Partial<ToolHealthDeltas>
}

export function combineToolHealthDeltas(list: ToolHealthDeltas[]): ToolHealthDeltas {
  return boundedHealthDeltas(
    list.reduce<ToolHealthDeltas>((acc, next) => ({
      overallDelta: acc.overallDelta + next.overallDelta,
      publicSentimentDelta: acc.publicSentimentDelta + next.publicSentimentDelta,
      mediaHeatDelta: acc.mediaHeatDelta + next.mediaHeatDelta,
      regulatoryPressureDelta: acc.regulatoryPressureDelta + next.regulatoryPressureDelta,
      internalStabilityDelta: acc.internalStabilityDelta + next.internalStabilityDelta,
      fraudRiskDelta: acc.fraudRiskDelta + next.fraudRiskDelta,
      publicAwarenessDelta: acc.publicAwarenessDelta + next.publicAwarenessDelta,
    }), emptyHealthDeltas())
  )
}

export function executeAgentPlan(input: ExecutePlanInput): ToolExecutionResult {
  const { plan, node } = input
  const intensity = clamp(plan.args?.intensity ?? 0.6, 0, 1)
  const base = 0.03 + intensity * 0.09
  const nodeUpdate: ToolNodeUpdate = {
    nodeId: node.nodeId,
    sentimentDelta: 0,
    activationDelta: 0,
    trustDelta: 0,
    dominantNarrative: plan.args?.narrative || plan.goal,
    behaviours: [TOOL_LABELS[plan.tool].toLowerCase()],
  }
  const health = emptyHealthDeltas()
  let impact = ''

  switch (plan.tool) {
    case 'publish_message': {
      nodeUpdate.activationDelta = clampNodeDelta(base * 0.45)
      nodeUpdate.sentimentDelta = clampNodeDelta((node.sentiment >= 0 ? 1 : -1) * base * 0.2)
      nodeUpdate.trustDelta = clampNodeDelta((node.type === 'company' || node.type === 'employees' ? 1 : -0.5) * base * 0.22)

      health.publicAwarenessDelta += 1 + Math.round(intensity)
      health.publicSentimentDelta += node.sentiment >= 0 ? 1 : -1
      health.internalStabilityDelta += node.type === 'employees' ? 1 : 0
      health.overallDelta += node.sentiment >= 0 ? 1 : -1
      impact = 'pushes a coordinated narrative into the system'
      break
    }
    case 'amplify_signal': {
      nodeUpdate.activationDelta = clampNodeDelta(base * 0.8)
      nodeUpdate.sentimentDelta = clampNodeDelta((node.sentiment < 0 ? -1 : 1) * base * 0.25)
      nodeUpdate.trustDelta = clampNodeDelta((node.sentiment < 0 ? -1 : -0.3) * base * 0.2)

      health.publicAwarenessDelta += 1 + Math.round(intensity * 2)
      health.mediaHeatDelta += 1 + Math.round(intensity * 2)
      health.publicSentimentDelta += node.sentiment < 0 ? -1 : 0
      health.fraudRiskDelta += node.type === 'public' || node.type === 'influencer' ? 1 : 0
      health.overallDelta += node.sentiment < 0 ? -2 : -1
      impact = 'accelerates signal propagation and crowd attention'
      break
    }
    case 'deescalate_narrative': {
      nodeUpdate.activationDelta = clampNodeDelta(-base * 0.72)
      nodeUpdate.sentimentDelta = clampNodeDelta(base * 0.26)
      nodeUpdate.trustDelta = clampNodeDelta((node.type === 'company' || node.type === 'employees' ? 1 : 0.6) * base * 0.32)

      health.mediaHeatDelta -= 1 + Math.round(intensity * 2)
      health.publicSentimentDelta += 1
      health.regulatoryPressureDelta += node.type === 'regulator' || node.type === 'government' ? -1 : 0
      health.internalStabilityDelta += node.type === 'employees' ? 1 : 0
      health.overallDelta += 1 + Math.round(intensity)
      impact = 'reduces escalation pressure and cools narratives'
      break
    }
    case 'trigger_regulatory_attention': {
      nodeUpdate.activationDelta = clampNodeDelta(base * 0.75)
      nodeUpdate.sentimentDelta = clampNodeDelta(-base * 0.3)
      nodeUpdate.trustDelta = clampNodeDelta(-base * 0.24)

      health.regulatoryPressureDelta += 2 + Math.round(intensity * 2)
      health.mediaHeatDelta += 1 + Math.round(intensity)
      health.publicAwarenessDelta += 1
      health.fraudRiskDelta += 1
      health.overallDelta -= 2 + Math.round(intensity)
      impact = 'escalates formal scrutiny and compliance pressure'
      break
    }
    case 'stabilize_internal_comms': {
      nodeUpdate.activationDelta = clampNodeDelta(base * 0.2)
      nodeUpdate.sentimentDelta = clampNodeDelta(base * 0.28)
      nodeUpdate.trustDelta = clampNodeDelta(base * 0.46)

      health.internalStabilityDelta += 2 + Math.round(intensity * 2)
      health.publicSentimentDelta += 1
      health.mediaHeatDelta -= 1
      health.fraudRiskDelta -= 1
      health.overallDelta += 1 + Math.round(intensity * 2)
      impact = 'improves cohesion and reduces internal leak risk'
      break
    }
  }

  const boundedHealth = boundedHealthDeltas(health)
  const messageSentiment = clamp(node.sentiment + nodeUpdate.sentimentDelta * 2, -1, 1)
  const action: AgentActionLog = {
    id: `act-${node.nodeId}-${Date.now()}-${plan.tool}`,
    agentNodeId: node.nodeId,
    agentLabel: node.label,
    tool: plan.tool,
    goal: plan.goal,
    impact,
    healthImpact: nonZeroHealthImpact(boundedHealth),
    nodeImpact: {
      sentimentDelta: nodeUpdate.sentimentDelta,
      activationDelta: nodeUpdate.activationDelta,
      trustDelta: nodeUpdate.trustDelta,
    },
  }

  return {
    nodeUpdate,
    healthDeltas: boundedHealth,
    message: {
      type: 'agent_action',
      author: node.label,
      content: `${TOOL_LABELS[plan.tool]} executed. ${plan.goal}`,
      reach: clamp(0.2 + node.activation * 0.6, 0, 1),
      sentiment: messageSentiment,
    },
    action,
  }
}

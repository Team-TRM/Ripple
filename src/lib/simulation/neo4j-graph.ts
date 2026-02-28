import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@/generated/prisma/client'
import type { GraphSetup } from '@/lib/ai/schemas'

const NODE_COLORS: Record<string, string> = {
  public: '#DC2626',
  government: '#7C3AED',
  media: '#F59E0B',
  employees: '#059669',
  company: '#6366F1',
  influencer: '#EC4899',
  regulator: '#7C3AED',
}

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

function generateId() {
  return Math.random().toString(36).substring(2, 15)
}

export async function createProjectGraph(
  projectId: string,
  setup: GraphSetup,
  cohortMap: Map<string, string>
): Promise<GraphData> {
  const nodes: GraphNode[] = setup.nodes.map((node) => ({
    nodeId: generateId(),
    label: node.label,
    type: node.type,
    color: NODE_COLORS[node.type] || '#6B7280',
    cohortId: node.cohortName ? cohortMap.get(node.cohortName) : undefined,
    sentiment: node.sentiment,
    activation: node.activation,
    trustInCompany: node.trustInCompany,
  }))

  const edges: GraphEdge[] = setup.edges
    .map((edge) => {
      const sourceNode = nodes.find((n) => n.label === edge.sourceLabel)
      const targetNode = nodes.find((n) => n.label === edge.targetLabel)
      if (!sourceNode || !targetNode) return null
      return {
        source: sourceNode.nodeId,
        target: targetNode.nodeId,
        weight: edge.weight,
        type: edge.type,
      }
    })
    .filter(Boolean) as GraphEdge[]

  await prisma.project.update({
    where: { id: projectId },
    data: {
      graphNodes: nodes as unknown as Prisma.InputJsonValue,
      graphEdges: edges as unknown as Prisma.InputJsonValue,
    },
  })

  return { nodes, edges }
}

export async function getProjectGraph(projectId: string): Promise<GraphData> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { graphNodes: true, graphEdges: true },
  })

  if (!project?.graphNodes) {
    return { nodes: [], edges: [] }
  }

  return {
    nodes: project.graphNodes as unknown as GraphNode[],
    edges: (project.graphEdges || []) as unknown as GraphEdge[],
  }
}

// Pure in-memory functions (no DB calls)

function applyNodeUpdates(
  nodes: GraphNode[],
  updates: { nodeId?: string; cohortName?: string; sentimentDelta: number; activationDelta: number; trustDelta: number; dominantNarrative?: string; behaviours?: string[] }[]
): void {
  for (const update of updates) {
    const matchingNodes = update.nodeId
      ? nodes.filter((n) => n.nodeId === update.nodeId)
      : nodes.filter((n) => n.label === update.cohortName)

    const sd = Math.max(-0.15, Math.min(0.15, update.sentimentDelta))
    const ad = Math.max(-0.15, Math.min(0.15, update.activationDelta))
    const td = Math.max(-0.15, Math.min(0.15, update.trustDelta))

    for (const node of matchingNodes) {
      node.sentiment = Math.max(-1, Math.min(1, node.sentiment + sd))
      node.activation = Math.max(0, Math.min(1, node.activation + ad))
      node.trustInCompany = Math.max(0, Math.min(1, node.trustInCompany + td))
      if (update.dominantNarrative) node.dominantNarrative = update.dominantNarrative
      if (update.behaviours) node.behaviours = update.behaviours
    }
  }
}

function applyInfluencePropagation(nodes: GraphNode[], edges: GraphEdge[]): void {
  const incoming = new Map<string, { source: GraphNode; weight: number }[]>()
  for (const edge of edges) {
    const sourceNode = nodes.find((n) => n.nodeId === edge.source)
    if (!sourceNode || sourceNode.activation <= 0.2) continue
    if (!incoming.has(edge.target)) incoming.set(edge.target, [])
    incoming.get(edge.target)!.push({ source: sourceNode, weight: edge.weight })
  }

  for (const node of nodes) {
    const influences = incoming.get(node.nodeId)
    if (!influences || influences.length === 0) continue

    let sentWeightedSum = 0
    let actWeightedSum = 0
    let totalWeight = 0

    for (const { source, weight } of influences) {
      sentWeightedSum += source.sentiment * weight * source.activation
      actWeightedSum += source.activation * weight
      totalWeight += weight
    }

    if (totalWeight === 0) continue

    const influencedSentiment = sentWeightedSum / totalWeight
    const influencedActivation = actWeightedSum / totalWeight

    const sentDelta = Math.max(-0.15, Math.min(0.15, influencedSentiment - node.sentiment))
    const actDelta = Math.max(-0.1, Math.min(0.1, influencedActivation - node.activation))

    node.sentiment = Math.max(-1, Math.min(1, node.sentiment + sentDelta))
    node.activation = Math.max(0, Math.min(1, node.activation + actDelta))
  }
}

function applyActivationDecay(nodes: GraphNode[]): void {
  for (const node of nodes) {
    node.activation = node.activation * 0.92
  }
}

export function calculateHealthScoresFromNodes(nodes: GraphNode[]): {
  overall: number
  publicSentiment: number
  mediaHeat: number
  regulatoryPressure: number
  internalStability: number
  fraudRisk: number
} {
  if (nodes.length === 0) {
    return { overall: 50, publicSentiment: 50, mediaHeat: 30, regulatoryPressure: 20, internalStability: 70, fraudRisk: 15 }
  }

  const avg = (filtered: number[]) => filtered.length > 0 ? filtered.reduce((a, b) => a + b, 0) / filtered.length : null

  const pubSent = avg(nodes.filter((n) => n.type === 'public').map((n) => (n.sentiment + 1) * 50))
  const medHeat = avg(nodes.filter((n) => n.type === 'media').map((n) => n.activation * 100))
  const regPress = avg(nodes.filter((n) => n.type === 'regulator' || n.type === 'government').map((n) => n.activation * 100))
  const intStab = avg(nodes.filter((n) => n.type === 'employees').map((n) => n.trustInCompany * 100))
  const fraudR = avg(nodes.filter((n) => n.type === 'public' || n.type === 'influencer').map((n) => (1 - n.trustInCompany) * n.activation * 100))

  const publicSentiment = Math.round(pubSent ?? 50)
  const mediaHeat = Math.round(medHeat ?? 30)
  const regulatoryPressure = Math.round(regPress ?? 20)
  const internalStability = Math.round(intStab ?? 70)
  const fraudRisk = Math.round(fraudR ?? 15)

  const overall = Math.round(
    0.3 * publicSentiment +
    0.25 * (100 - mediaHeat) +
    0.2 * (100 - regulatoryPressure) +
    0.15 * internalStability +
    0.1 * (100 - fraudRisk)
  )

  return {
    overall: Math.max(0, Math.min(100, overall)),
    publicSentiment: Math.max(0, Math.min(100, publicSentiment)),
    mediaHeat: Math.max(0, Math.min(100, mediaHeat)),
    regulatoryPressure: Math.max(0, Math.min(100, regulatoryPressure)),
    internalStability: Math.max(0, Math.min(100, internalStability)),
    fraudRisk: Math.max(0, Math.min(100, fraudRisk)),
  }
}

/**
 * processTickUpdates — single read-modify-write for all graph mutations in a tick.
 * Applies: cohort deltas → influence propagation → decay, then writes once.
 * Returns updated nodes + health scores.
 */
export async function processTickUpdates(
  projectId: string,
  cohortUpdates: { nodeId?: string; cohortName?: string; sentimentDelta: number; activationDelta: number; trustDelta: number; dominantNarrative?: string; behaviours?: string[] }[]
): Promise<{ nodes: GraphNode[]; healthScores: ReturnType<typeof calculateHealthScoresFromNodes> }> {
  const { nodes, edges } = await getProjectGraph(projectId)
  if (nodes.length === 0) {
    return { nodes: [], healthScores: calculateHealthScoresFromNodes([]) }
  }

  // Phase 1: Apply LLM-generated deltas
  applyNodeUpdates(nodes, cohortUpdates)

  // Phase 2: Propagate influence
  applyInfluencePropagation(nodes, edges)

  // Phase 3: Decay
  applyActivationDecay(nodes)

  // Single write
  await prisma.project.update({
    where: { id: projectId },
    data: { graphNodes: nodes as unknown as Prisma.InputJsonValue },
  })

  const healthScores = calculateHealthScoresFromNodes(nodes)
  return { nodes, healthScores }
}

// Legacy wrappers (kept for confirm route / graph route compatibility)

export async function updateNodeStates(
  projectId: string,
  updates: { nodeId?: string; cohortName?: string; sentimentDelta: number; activationDelta: number; trustDelta: number; dominantNarrative?: string; behaviours?: string[] }[]
): Promise<void> {
  const { nodes } = await getProjectGraph(projectId)
  if (nodes.length === 0) return
  applyNodeUpdates(nodes, updates)
  await prisma.project.update({
    where: { id: projectId },
    data: { graphNodes: nodes as unknown as Prisma.InputJsonValue },
  })
}

export async function saveStateSnapshots(
  _projectId: string, _tickId: string, _dayNumber: number, _tickIndex: number
): Promise<void> {}

export async function propagateInfluence(projectId: string): Promise<void> {
  const { nodes, edges } = await getProjectGraph(projectId)
  if (nodes.length === 0) return
  applyInfluencePropagation(nodes, edges)
  await prisma.project.update({
    where: { id: projectId },
    data: { graphNodes: nodes as unknown as Prisma.InputJsonValue },
  })
}

export async function applyDecay(projectId: string): Promise<void> {
  const { nodes } = await getProjectGraph(projectId)
  if (nodes.length === 0) return
  applyActivationDecay(nodes)
  await prisma.project.update({
    where: { id: projectId },
    data: { graphNodes: nodes as unknown as Prisma.InputJsonValue },
  })
}

export async function getNodesByThreshold(
  projectId: string, field: string, threshold: number
): Promise<GraphNode[]> {
  const { nodes } = await getProjectGraph(projectId)
  return nodes.filter((n) => {
    const value = n[field as keyof GraphNode]
    return typeof value === 'number' && value > threshold
  })
}

export async function deleteProjectGraph(projectId: string): Promise<void> {
  await prisma.project.update({
    where: { id: projectId },
    data: { graphNodes: Prisma.JsonNull, graphEdges: Prisma.JsonNull },
  })
}

export async function calculateHealthScores(projectId: string) {
  const { nodes } = await getProjectGraph(projectId)
  return calculateHealthScoresFromNodes(nodes)
}

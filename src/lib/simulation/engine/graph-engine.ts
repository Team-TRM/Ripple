import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@/generated/prisma/client'
import type { GraphSetup } from '@/lib/ai/schemas'
import type { GraphNode, GraphEdge, GraphData } from '@/lib/types'
import { applyInfluencePropagation, applyActivationDecay } from '@/lib/agents/cohorts/influence/propagation'
import { calculateHealthScoresFromNodes } from '@/lib/simulation/health/health-calculator'

// Re-export shared types for backward compatibility
export type { GraphNode, GraphEdge, GraphData }

export const NODE_COLORS: Record<string, string> = {
  public: '#DC2626',
  government: '#7C3AED',
  media: '#F59E0B',
  employees: '#059669',
  company: '#6366F1',
  influencer: '#EC4899',
  regulator: '#7C3AED',
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

    const sd = Math.max(-0.25, Math.min(0.25, update.sentimentDelta))
    const ad = Math.max(-0.25, Math.min(0.25, update.activationDelta))
    const td = Math.max(-0.25, Math.min(0.25, update.trustDelta))

    for (const node of matchingNodes) {
      node.sentiment = Math.max(-1, Math.min(1, node.sentiment + sd))
      node.activation = Math.max(0, Math.min(1, node.activation + ad))
      node.trustInCompany = Math.max(0, Math.min(1, node.trustInCompany + td))
      if (update.dominantNarrative) node.dominantNarrative = update.dominantNarrative
      if (update.behaviours) node.behaviours = update.behaviours
    }
  }
}

// Re-export extracted modules for backward compatibility
export { applyInfluencePropagation, applyActivationDecay }
export { calculateHealthScoresFromNodes }

/**
 * processTickUpdates — single read-modify-write for all graph mutations in a tick.
 * Applies: cohort deltas → influence propagation → decay, then writes once.
 * Returns updated nodes + health scores.
 */
export async function processTickUpdates(
  projectId: string,
  cohortUpdates: { nodeId?: string; cohortName?: string; sentimentDelta: number; activationDelta: number; trustDelta: number; dominantNarrative?: string; behaviours?: string[] }[],
  newNodes?: { label: string; type: string; sentiment: number; activation: number; trustInCompany: number; connectTo: string[] }[]
): Promise<{ nodes: GraphNode[]; edges: GraphEdge[]; healthScores: ReturnType<typeof calculateHealthScoresFromNodes> }> {
  const { nodes, edges } = await getProjectGraph(projectId)
  if (nodes.length === 0) {
    return { nodes: [], edges: [], healthScores: calculateHealthScoresFromNodes([]) }
  }

  // Phase 0: Add new nodes from LLM
  if (newNodes?.length) {
    for (const nn of newNodes) {
      // Skip if a node with this label already exists
      if (nodes.some((n) => n.label === nn.label)) continue
      const newNode: GraphNode = {
        nodeId: generateId(),
        label: nn.label,
        type: nn.type,
        color: NODE_COLORS[nn.type] || '#6B7280',
        sentiment: nn.sentiment,
        activation: nn.activation,
        trustInCompany: nn.trustInCompany,
      }
      nodes.push(newNode)
      // Create edges to connected nodes
      for (const targetLabel of nn.connectTo) {
        const target = nodes.find((n) => n.label === targetLabel)
        if (target) {
          edges.push({
            source: newNode.nodeId,
            target: target.nodeId,
            weight: 0.5,
            type: 'influence',
          })
        }
      }
    }
  }

  // Phase 1: Apply LLM-generated deltas
  applyNodeUpdates(nodes, cohortUpdates)

  // Phase 2: Propagate influence
  applyInfluencePropagation(nodes, edges)

  // Phase 3: Decay
  applyActivationDecay(nodes)

  // Single write (nodes + edges since new nodes may have been added)
  await prisma.project.update({
    where: { id: projectId },
    data: {
      graphNodes: nodes as unknown as Prisma.InputJsonValue,
      graphEdges: edges as unknown as Prisma.InputJsonValue,
    },
  })

  const healthScores = calculateHealthScoresFromNodes(nodes)
  return { nodes, edges, healthScores }
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
  projectId: string, tickId: string, _dayNumber: number, _tickIndex: number
): Promise<void> {
  const { nodes, edges } = await getProjectGraph(projectId)
  await prisma.tick.update({
    where: { id: tickId },
    data: {
      graphSnapshot: { nodes, edges } as unknown as Prisma.InputJsonValue,
    },
  })
}

/**
 * Restores graph state from a tick's snapshot. Used for rerun branching.
 */
export async function restoreGraphFromSnapshot(
  projectId: string, tickId: string
): Promise<GraphData> {
  const tick = await prisma.tick.findUnique({
    where: { id: tickId },
    select: { graphSnapshot: true },
  })
  if (!tick?.graphSnapshot) {
    throw new Error('No graph snapshot found for tick')
  }
  const snapshot = tick.graphSnapshot as unknown as GraphData
  await prisma.project.update({
    where: { id: projectId },
    data: {
      graphNodes: snapshot.nodes as unknown as Prisma.InputJsonValue,
      graphEdges: snapshot.edges as unknown as Prisma.InputJsonValue,
    },
  })
  return snapshot
}

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

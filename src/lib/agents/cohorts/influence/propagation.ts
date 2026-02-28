/**
 * Influence propagation algorithm for inter-cohort dynamics.
 *
 * Models how sentiment and activation spread through the stakeholder
 * network via weighted edges. Only active nodes (activation > 0.2)
 * propagate influence, preventing noise from dormant actors.
 *
 * Uses bounded deltas (±0.15 sentiment, ±0.1 activation) to prevent
 * runaway cascades while allowing realistic contagion effects.
 */

import type { GraphNode, GraphEdge } from '@/lib/types'

/**
 * Propagate influence along graph edges in a single pass.
 * Active source nodes influence target node sentiment and activation
 * based on edge weights and source activation levels.
 */
export function applyInfluencePropagation(nodes: GraphNode[], edges: GraphEdge[]): void {
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

/**
 * Apply natural activation decay across all nodes.
 * Models attention fatigue — nodes lose ~3% activation per tick
 * unless re-energized by new events or influence.
 */
export function applyActivationDecay(nodes: GraphNode[]): void {
  for (const node of nodes) {
    node.activation = node.activation * 0.97
  }
}

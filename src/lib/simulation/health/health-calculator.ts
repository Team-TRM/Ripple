/**
 * Health score computation engine.
 *
 * Derives company health metrics from the current state of all graph nodes.
 * Each metric is computed from a specific subset of node types:
 *
 * - publicSentiment: average sentiment of public nodes
 * - mediaHeat: average activation of media nodes
 * - regulatoryPressure: average activation of regulator/government nodes
 * - internalStability: average trust of employee nodes
 * - fraudRisk: distrust × activation of public/influencer nodes
 * - publicAwareness: weighted blend of media heat + public activation
 * - overall: weighted composite of all metrics
 */

import type { GraphNode, HealthScores } from '@/lib/types'

export function calculateHealthScoresFromNodes(nodes: GraphNode[]): HealthScores {
  if (nodes.length === 0) {
    return { overall: 50, publicSentiment: 50, mediaHeat: 30, regulatoryPressure: 20, internalStability: 70, fraudRisk: 15, publicAwareness: 10 }
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

  // Awareness derived from media + public activation
  const awarenessFromMedia = medHeat ?? 10
  const awarenessFromPublic = avg(nodes.filter((n) => n.type === 'public').map((n) => n.activation * 100))
  const publicAwareness = Math.round((awarenessFromMedia * 0.6 + (awarenessFromPublic ?? 10) * 0.4))

  return {
    overall: Math.max(0, Math.min(100, overall)),
    publicSentiment: Math.max(0, Math.min(100, publicSentiment)),
    mediaHeat: Math.max(0, Math.min(100, mediaHeat)),
    regulatoryPressure: Math.max(0, Math.min(100, regulatoryPressure)),
    internalStability: Math.max(0, Math.min(100, internalStability)),
    fraudRisk: Math.max(0, Math.min(100, fraudRisk)),
    publicAwareness: Math.max(0, Math.min(100, publicAwareness)),
  }
}

import type { GraphNode } from './neo4j-graph'
import type { PopulationStats } from '@/lib/ai/schemas'

const POPULATION_RANGES: Record<string, [number, number]> = {
  public: [300, 500],
  media: [50, 100],
  employees: [100, 200],
  influencer: [50, 100],
  government: [30, 60],
  regulator: [30, 60],
  company: [20, 40],
}

/**
 * Initialize population stats for all cohorts at simulation start.
 * Called once during confirm.
 */
export function initializePopulationStats(
  cohorts: { name: string; description: string }[],
  nodes: GraphNode[]
): PopulationStats[] {
  return cohorts.map((cohort) => {
    const cohortNodes = nodes.filter((n) => n.label === cohort.name)
    const nodeType = cohortNodes[0]?.type || 'public'
    const range = POPULATION_RANGES[nodeType] || [200, 400]
    const population = range[0] + Math.floor(Math.random() * (range[1] - range[0]))

    const avgActivation = cohortNodes.length > 0
      ? cohortNodes.reduce((sum, n) => sum + n.activation, 0) / cohortNodes.length
      : 0.3

    const avgSentiment = cohortNodes.length > 0
      ? cohortNodes.reduce((sum, n) => sum + n.sentiment, 0) / cohortNodes.length
      : 0

    return {
      cohortName: cohort.name,
      population,
      activeSpeakers: Math.round(population * avgActivation),
      aggregateSentiment: Math.max(-1, Math.min(1, avgSentiment)),
      trendDirection: 'stable' as const,
    }
  })
}

/**
 * Recalculate population stats from current node states.
 * Called each tick — pure function, no LLM calls.
 */
export function calculatePopulationStats(
  previousStats: PopulationStats[],
  nodes: GraphNode[]
): PopulationStats[] {
  return previousStats.map((prev) => {
    const cohortNodes = nodes.filter((n) => n.label === prev.cohortName)

    if (cohortNodes.length === 0) return prev

    const avgActivation = cohortNodes.reduce((sum, n) => sum + n.activation, 0) / cohortNodes.length
    const avgSentiment = cohortNodes.reduce((sum, n) => sum + n.sentiment, 0) / cohortNodes.length

    const activeSpeakers = Math.round(prev.population * Math.max(0.05, avgActivation))
    const aggregateSentiment = Math.max(-1, Math.min(1, avgSentiment))

    const sentimentDelta = aggregateSentiment - prev.aggregateSentiment
    let trendDirection: 'improving' | 'stable' | 'declining'
    if (sentimentDelta > 0.03) {
      trendDirection = 'improving'
    } else if (sentimentDelta < -0.03) {
      trendDirection = 'declining'
    } else {
      trendDirection = 'stable'
    }

    return {
      cohortName: prev.cohortName,
      population: prev.population,
      activeSpeakers,
      aggregateSentiment,
      trendDirection,
    }
  })
}

/**
 * Central agent registry — single source of truth for all agent configurations.
 *
 * Consolidates executive role definitions, speaker behavior parameters,
 * and cohort configuration into one registry for the orchestrator to query.
 */

import { EXECUTIVE_ROLES } from '@/lib/agents/executives/roles/role-definitions'
import { SPEAKER_BEHAVIOR_RULES } from '@/lib/agents/speakers/behavior/narrative-arc'
import type { ExecutiveProfile } from '@/lib/agents/core/types'

export interface AgentRegistryConfig {
  executives: readonly ExecutiveProfile[]
  speakerBehaviorRules: string
  maxSpeakersPerTick: number
  memoryWindowSize: number
  activationThreshold: number
}

const AGENT_CONFIG: AgentRegistryConfig = {
  executives: EXECUTIVE_ROLES,
  speakerBehaviorRules: SPEAKER_BEHAVIOR_RULES,
  maxSpeakersPerTick: 8,
  memoryWindowSize: 3,
  activationThreshold: 0.2,
}

export function getAgentConfig(): AgentRegistryConfig {
  return AGENT_CONFIG
}

export function getExecutiveProfiles(): readonly ExecutiveProfile[] {
  return EXECUTIVE_ROLES
}

export function getSpeakerConfig() {
  return {
    maxPerTick: AGENT_CONFIG.maxSpeakersPerTick,
    memoryWindow: AGENT_CONFIG.memoryWindowSize,
    behaviorRules: AGENT_CONFIG.speakerBehaviorRules,
  }
}

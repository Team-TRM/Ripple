/**
 * Executive role definitions — configures the C-suite advisory panel.
 *
 * Each executive has a distinct perspective and bias that shapes their
 * crisis recommendations. The orchestrator uses these to generate
 * conflicting advice that forces the CEO (user) to make trade-offs.
 */

import type { ExecutiveProfile } from '@/lib/agents/core/types'

export const EXECUTIVE_ROLES: readonly ExecutiveProfile[] = [
  {
    role: 'CTO',
    name: 'Sarah Chen',
    perspective: 'Technical risk, security, engineering capacity',
    bias: 'Risk-averse on security, prefers defensible solutions',
  },
  {
    role: 'Head of PR',
    name: 'James Morrison',
    perspective: 'Public perception, media narrative, brand',
    bias: 'Prefers transparency, worried about viral moments',
  },
  {
    role: 'Legal Counsel',
    name: 'Priya Kapoor',
    perspective: 'Legal liability, regulatory compliance',
    bias: 'Conservative, minimal admission of fault',
  },
  {
    role: 'Head of Operations',
    name: 'David Okafor',
    perspective: 'Business continuity, employee morale, cost',
    bias: 'Pragmatic, actionable plans, internal stability',
  },
] as const

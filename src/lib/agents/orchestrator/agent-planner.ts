import { mistral } from '@/lib/ai/client'
import { AgentPlanSchema, type AgentPlan } from '@/lib/ai/schemas'
import type { GraphNode, HealthScores } from '@/lib/types'

type PlannerNeighbor = {
  label: string
  type: string
  weight: number
  activation: number
  sentiment: number
}

type PlanAgentActionInput = {
  crisisContext: string
  dayNumber: number
  tickIndex: number
  agentNode: GraphNode
  neighbors: PlannerNeighbor[]
  healthScores: HealthScores
  recentMessages: string[]
  lastDecision?: string
}

const SYSTEM_PROMPT = `You are an autonomous stakeholder-agent planner in a crisis simulation.
Return ONLY valid JSON:
{
  "agentNodeId": "node id",
  "goal": "one-sentence immediate objective",
  "tool": "publish_message | amplify_signal | deescalate_narrative | trigger_regulatory_attention | stabilize_internal_comms",
  "args": {
    "intensity": 0.65,
    "targetNodeLabel": "optional nearby node label",
    "narrative": "optional short message angle"
  },
  "confidence": 0.73
}

Rules:
- Pick exactly one tool.
- Intensity must be between 0 and 1.
- Be role-consistent:
  - media/influencer/public often amplify or publish
  - company/employees often stabilize or de-escalate
  - regulator/government may trigger regulatory attention
- Focus on immediate next-step behavior, not long-term strategy.
- Use nearby nodes and current health context to decide.
- Return JSON only.`

const PERIOD_LABELS = ['Morning', 'Afternoon', 'Evening']

export async function planAgentAction(input: PlanAgentActionInput): Promise<AgentPlan | null> {
  const period = PERIOD_LABELS[input.tickIndex] || 'Morning'
  const neighborsBlock = input.neighbors.length > 0
    ? input.neighbors
      .slice(0, 8)
      .map((n) => `- ${n.label} (${n.type}) weight=${n.weight.toFixed(2)} activation=${n.activation.toFixed(2)} sentiment=${n.sentiment.toFixed(2)}`)
      .join('\n')
    : '- none'
  const recentBlock = input.recentMessages.length > 0
    ? input.recentMessages.slice(0, 5).map((m) => `- ${m}`).join('\n')
    : '- none'

  const userPrompt = `Crisis context:
${input.crisisContext}

Time: Day ${input.dayNumber}, ${period}

Actor:
- nodeId: ${input.agentNode.nodeId}
- label: ${input.agentNode.label}
- type: ${input.agentNode.type}
- sentiment: ${input.agentNode.sentiment.toFixed(2)}
- activation: ${input.agentNode.activation.toFixed(2)}
- trustInCompany: ${input.agentNode.trustInCompany.toFixed(2)}

Connected neighbors:
${neighborsBlock}

Health (0-100):
- overall=${input.healthScores.overall}
- publicSentiment=${input.healthScores.publicSentiment}
- mediaHeat=${input.healthScores.mediaHeat}
- regulatoryPressure=${input.healthScores.regulatoryPressure}
- internalStability=${input.healthScores.internalStability}
- fraudRisk=${input.healthScores.fraudRisk}
- publicAwareness=${input.healthScores.publicAwareness}

Recent developments:
${recentBlock}

Last decision:
${input.lastDecision || 'none'}

Plan this actor's single best next action now.`

  try {
    const result = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      responseFormat: { type: 'json_object' },
      temperature: 0.35,
    })

    const content = result.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') return null

    const parsed = JSON.parse(content)
    const plan = AgentPlanSchema.parse(parsed)
    return {
      ...plan,
      agentNodeId: input.agentNode.nodeId,
    }
  } catch (err) {
    console.error(`[agent-planner] Failed for ${input.agentNode.label}:`, err)
    return null
  }
}

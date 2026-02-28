import { mistral } from './client'
import { z } from 'zod'

const ReportKeyMomentSchema = z.object({
  day: z.number(),
  title: z.string(),
  description: z.string(),
  impact: z.enum(['positive', 'negative', 'neutral']),
  healthImpact: z.number(), // estimated delta to overall health
})

const ReportDecisionSchema = z.object({
  day: z.number(),
  decision: z.string(),
  effectiveness: z.enum(['excellent', 'good', 'neutral', 'poor', 'harmful']),
  explanation: z.string(),
})

const ReportRecommendationSchema = z.object({
  title: z.string(),
  description: z.string(),
  priority: z.enum(['critical', 'high', 'medium']),
})

export const SimulationReportSchema = z.object({
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  headline: z.string(),
  summary: z.string(),
  keyMoments: z.array(ReportKeyMomentSchema),
  decisionAnalysis: z.array(ReportDecisionSchema),
  whatWentWell: z.array(z.string()),
  whatWentWrong: z.array(z.string()),
  recommendations: z.array(ReportRecommendationSchema),
  rootCauseAnalysis: z.string(),
})

export type SimulationReport = z.infer<typeof SimulationReportSchema>

type ReportInput = {
  crisisContext: string
  simulationDays: number
  healthStart: {
    overall: number
    publicSentiment: number
    mediaHeat: number
    regulatoryPressure: number
    internalStability: number
    fraudRisk: number
    publicAwareness: number
  }
  healthEnd: {
    overall: number
    publicSentiment: number
    mediaHeat: number
    regulatoryPressure: number
    internalStability: number
    fraudRisk: number
    publicAwareness: number
  }
  decisions: { day: number; prompt: string; chosen: string }[]
  keyEvents: { day: number; title: string; description: string; isUserInjected: boolean }[]
  messageHighlights: string[]
}

const SYSTEM_PROMPT = `You are a crisis management consultant writing a post-mortem analysis of a crisis simulation.

Return ONLY valid JSON:
{
  "grade": "A" | "B" | "C" | "D" | "F",
  "headline": "One-line verdict on how the CEO handled the crisis",
  "summary": "2-3 sentence executive summary of the simulation outcome",
  "keyMoments": [
    { "day": 1, "title": "Crisis breaks", "description": "What happened and why it mattered", "impact": "negative", "healthImpact": -5 }
  ],
  "decisionAnalysis": [
    { "day": 2, "decision": "What they chose", "effectiveness": "good", "explanation": "Why this worked or didn't" }
  ],
  "whatWentWell": ["Specific thing the CEO did right"],
  "whatWentWrong": ["Specific mistake or missed opportunity"],
  "recommendations": [
    { "title": "Immediate action", "description": "What should be done first and why", "priority": "critical" }
  ],
  "rootCauseAnalysis": "2-3 sentences explaining WHY the crisis unfolded the way it did — systemic factors, not just events"
}

Rules:
- Grade based on final health vs starting health: A = maintained/improved, B = minor damage, C = moderate damage, D = severe damage, F = catastrophic
- keyMoments: 3-6 turning points. Include BOTH crises and good decisions.
- decisionAnalysis: One entry per CEO decision. Be honest about effectiveness.
- whatWentWell / whatWentWrong: 2-4 items each. Specific, not generic.
- recommendations: 3-5 actionable items. Focus on WHAT TO CHANGE in real crisis plans.
- rootCauseAnalysis: Go beyond "bad things happened" — explain underlying systemic issues.
- Be direct and analytical, not fluffy. This is a learning tool.
- Return ONLY JSON. No markdown.`

export async function generateSimulationReport(input: ReportInput): Promise<SimulationReport> {
  const decisionsBlock = input.decisions.length > 0
    ? input.decisions.map(d => `- Day ${d.day + 1}: Prompt: "${d.prompt}" → CEO chose: "${d.chosen}"`).join('\n')
    : 'No decisions were made.'

  const eventsBlock = input.keyEvents.length > 0
    ? input.keyEvents.map(e => `- Day ${e.day + 1}: ${e.title} — ${e.description}${e.isUserInjected ? ' [USER INJECTED]' : ''}`).join('\n')
    : 'No notable events.'

  const messagesBlock = input.messageHighlights.length > 0
    ? input.messageHighlights.slice(0, 15).map(m => `- ${m}`).join('\n')
    : ''

  const userPrompt = `Crisis scenario: ${input.crisisContext}

Simulation duration: ${input.simulationDays} days

Health scores at START:
- Overall: ${input.healthStart.overall}
- Public Sentiment: ${input.healthStart.publicSentiment}
- Media Heat: ${input.healthStart.mediaHeat}
- Regulatory Pressure: ${input.healthStart.regulatoryPressure}
- Internal Stability: ${input.healthStart.internalStability}
- Fraud Risk: ${input.healthStart.fraudRisk}
- Public Awareness: ${input.healthStart.publicAwareness}

Health scores at END:
- Overall: ${input.healthEnd.overall}
- Public Sentiment: ${input.healthEnd.publicSentiment}
- Media Heat: ${input.healthEnd.mediaHeat}
- Regulatory Pressure: ${input.healthEnd.regulatoryPressure}
- Internal Stability: ${input.healthEnd.internalStability}
- Fraud Risk: ${input.healthEnd.fraudRisk}
- Public Awareness: ${input.healthEnd.publicAwareness}

CEO Decisions:
${decisionsBlock}

Key Events:
${eventsBlock}

Notable messages during simulation:
${messagesBlock}

Generate a comprehensive post-mortem analysis.`

  const t0 = Date.now()
  console.log('[LLM] Generating simulation report...')

  const result = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    responseFormat: { type: 'json_object' },
    temperature: 0.4,
  })

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
  console.log(`[LLM] Report generated in ${elapsed}s`)

  const content = result.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('No content in report response')
  }

  const parsed = JSON.parse(content)
  return SimulationReportSchema.parse(parsed)
}

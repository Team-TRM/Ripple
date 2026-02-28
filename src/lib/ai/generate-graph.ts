import { mistral } from './client'
import { GraphSetupSchema, type GraphSetup } from './schemas'

const SYSTEM_PROMPT = `You are a crisis simulation graph architect. Given a crisis context and audience cohorts, generate an influence graph that models how different actors interact during this crisis.

Return ONLY valid JSON:
{
  "nodes": [
    {
      "label": "General Public",
      "type": "public",
      "cohortName": "General Public",
      "sentiment": -0.2,
      "activation": 0.4,
      "trustInCompany": 0.5
    }
  ],
  "edges": [
    {
      "sourceLabel": "Media Outlets",
      "targetLabel": "General Public",
      "weight": 0.8,
      "type": "information"
    }
  ],
  "healthScores": {
    "overall": 65,
    "publicSentiment": 60,
    "mediaHeat": 40,
    "regulatoryPressure": 30,
    "internalStability": 75,
    "fraudRisk": 20
  }
}

Rules:
- Create one node per cohort provided, plus 2-3 additional environment nodes (e.g., "Media Ecosystem", "Regulatory Bodies", "Company Leadership")
- Node types: public, government, media, employees, company, influencer, regulator
- If a node maps to a cohort, set cohortName to match exactly
- sentiment: -1 (very negative) to 1 (very positive). At crisis start, most actors are mildly negative
- activation: 0 (disengaged) to 1 (highly active). Start moderate (0.3-0.6)
- trustInCompany: 0 (no trust) to 1 (full trust). Varies by actor type
- Edges define influence flows. weight 0-1 determines strength
- Edge types: "influence" (general), "trust" (trust-based), "information" (info channels)
- Create realistic edge patterns — media influences public, public influences regulators, etc.
- Health scores: 0-100, higher = better for the company. At crisis start, scores should reflect initial damage
- Return ONLY JSON. No markdown, no extra text.`

export async function generateGraph(
  crisisContext: string,
  cohorts: { name: string; description: string }[]
): Promise<GraphSetup> {
  const cohortBlock = cohorts
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n')

  const userPrompt = `Crisis: ${crisisContext}

Cohorts:
${cohortBlock}

Generate the initial influence graph for this crisis simulation.`

  const result = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    responseFormat: { type: 'json_object' },
    temperature: 0.3,
  })

  const content = result.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('No content in Mistral response')
  }

  const parsed = JSON.parse(content)
  return GraphSetupSchema.parse(parsed)
}

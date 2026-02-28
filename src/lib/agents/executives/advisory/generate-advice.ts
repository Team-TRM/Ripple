import { mistral } from '@/lib/ai/client'
import { ExecutiveAdvisorySchema, type ExecutiveAdvisory } from '@/lib/ai/schemas'
import { EXECUTIVE_ROLES } from '@/lib/agents/executives/roles/role-definitions'

// Re-export for backward compatibility
export const EXECUTIVES = EXECUTIVE_ROLES

const SYSTEM_PROMPT = `You are generating executive team recommendations for a crisis simulation. Read the FULL crisis context and decision prompt carefully, then generate advice that DIRECTLY addresses the specific situation.

Return ONLY valid JSON:
{
  "recommendations": [
    { "role": "CTO", "name": "Sarah Chen", "recommendation": "...", "reasoning": "..." },
    { "role": "Head of PR", "name": "James Morrison", "recommendation": "...", "reasoning": "..." },
    { "role": "Legal Counsel", "name": "Priya Kapoor", "recommendation": "...", "reasoning": "..." },
    { "role": "Head of Operations", "name": "David Okafor", "recommendation": "...", "reasoning": "..." }
  ]
}

Rules:
- EXACTLY 4 recommendations, one per executive
- CRITICAL: Each recommendation MUST directly address the SPECIFIC decision prompt and crisis situation described. Do NOT give generic advice. READ the decision prompt and respond to THAT situation.
  - If the decision is about a ransom demand: address the ransom specifically (pay/don't pay/negotiate/involve law enforcement)
  - If the decision is about a data breach: address disclosure, notification, remediation
  - If the decision is about public backlash: address specific communication strategies
- "recommendation" is 4-12 words — a direct action phrase. No "I recommend..." or "We should..."
- "reasoning" is 1-2 sentences referencing SPECIFIC details from the decision prompt, crisis context, and health scores.
- Each recommendation must be CLEARLY DIFFERENT — different strategies from different professional angles:
  - CTO: technical/engineering response to this specific situation
  - Head of PR: public communication strategy for this specific situation
  - Legal Counsel: legal/regulatory approach to this specific situation
  - Head of Operations: internal operations response to this specific situation
- They should DISAGREE — real executives have conflicting priorities
- Return ONLY JSON. No markdown.`

type ExecAdviceInput = {
  crisisContext: string
  decisionPrompt: string
  options: string[]
  healthScores: {
    overall: number
    publicSentiment: number
    mediaHeat: number
    regulatoryPressure: number
    internalStability: number
    fraudRisk: number
    publicAwareness: number
  }
  recentContext?: string
}

export async function generateExecutiveAdvice(input: ExecAdviceInput): Promise<ExecutiveAdvisory> {
  const execBlock = EXECUTIVES
    .map((e) => `- ${e.role} (${e.name}): ${e.perspective}. Bias: ${e.bias}`)
    .join('\n')

  const optionsBlock = input.options
    .map((o, i) => `  ${String.fromCharCode(65 + i)}. ${o}`)
    .join('\n')

  const userPrompt = `CRISIS BACKGROUND: ${input.crisisContext}

${input.recentContext ? `WHAT JUST HAPPENED: ${input.recentContext}\n` : ''}
THE DECISION THE CEO MUST MAKE RIGHT NOW:
"${input.decisionPrompt}"

The options being considered:
${optionsBlock}

Current health scores (0-100):
- Overall: ${input.healthScores.overall}
- Public Awareness: ${input.healthScores.publicAwareness}
- Public Sentiment: ${input.healthScores.publicSentiment}
- Media Heat: ${input.healthScores.mediaHeat}
- Regulatory Pressure: ${input.healthScores.regulatoryPressure}
- Internal Stability: ${input.healthScores.internalStability}
- Fraud Risk: ${input.healthScores.fraudRisk}

Executive team:
${execBlock}

Each executive must give their recommendation about THIS SPECIFIC decision: "${input.decisionPrompt}"
Their advice must DIRECTLY address this situation. Do NOT give generic crisis advice — respond to the specific question being asked.`

  console.log(`[LLM] Generating executive advice for decision...`)
  const t0 = Date.now()

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await mistral.chat.complete({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        responseFormat: { type: 'json_object' },
        temperature: 0.6 + attempt * 0.1,
      })

      const content = result.choices?.[0]?.message?.content
      if (!content || typeof content !== 'string') {
        throw new Error('No content in Mistral response')
      }

      const parsed = JSON.parse(content)
      const validated = ExecutiveAdvisorySchema.parse(parsed)

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      console.log(`[LLM] Executive advice generated in ${elapsed}s`)

      return validated
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error(`[LLM] Executive advice attempt ${attempt + 1} failed:`, lastError.message)
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }

  throw lastError || new Error('Executive advice generation failed after retries')
}

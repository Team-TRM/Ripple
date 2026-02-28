import { mistral } from './client'
import { EnhancedTickResponseSchema, type EnhancedTickResponse } from './schemas'

const TICK_PERIOD_LABELS = ['Morning', 'Afternoon', 'Evening'] as const

const SYSTEM_PROMPT = `You are a crisis simulation engine. Generate realistic media content, audience perception updates, and optionally crisis decision points.

Return ONLY valid JSON:
{
  "messages": [
    { "type": "news", "author": "News Outlet Name", "content": "Article text...", "reach": 0.7, "sentiment": -0.4 },
    { "type": "influencer", "author": "@TechBlogger", "content": "Social media post...", "reach": 0.5, "sentiment": -0.3 },
    { "type": "forum", "author": "Affected Customer (General Public)", "content": "Forum post from this cohort's perspective...", "reach": 0.3, "sentiment": -0.6 },
    { "type": "influencer", "author": "Industry Analyst (Business Partners)", "content": "Different perspective...", "reach": 0.4, "sentiment": 0.1 }
  ],
  "cohortUpdates": [
    {
      "cohortName": "General Public",
      "mood": "Concerned",
      "dominantNarrative": "One sentence.",
      "behaviours": ["checking news", "sharing on social media"],
      "sentimentDelta": -0.05,
      "activationDelta": 0.08,
      "trustDelta": -0.03
    }
  ],
  "decisionPrompt": {
    "prompt": "Media is demanding a response. How should the company react?",
    "options": ["Issue formal apology", "Release technical explanation", "No comment"]
  },
  "secondaryEvents": [
    { "title": "Viral Spike", "description": "A leaked memo goes viral...", "type": "viral_spike" }
  ]
}

Rules:
- Message types: news, influencer, official, forum, secondary
- Generate 4-8 messages per tick, varying by time of day
- CRITICAL: Social media and forum messages MUST represent DIFFERENT cohorts with DIFFERENT viewpoints:
  - Some messages should be supportive ("Good on them for disclosing quickly")
  - Some should be angry ("Absolutely unacceptable, I'm switching providers")
  - Some should be analytical ("Let's wait for the full picture before reacting")
  - Include the cohort name in parentheses in the author field: "@username (Cohort Name)"
  - Each cohort has its own bias — affected customers are angrier, industry analysts are more measured, employees defend or leak
- reach: 0-1, how widely this spreads
- sentiment: -1 to 1. Vary this across messages — NOT everything is negative. Some voices defend, some attack, some are neutral.
- Morning: breaking news, overnight developments, early social reactions. Afternoon: social media eruption, forum debates, influencer takes. Evening: official responses, analysis, wrap-up.
- If "Last decision" context is provided: generate messages reacting TO that decision. Some approve, some criticize. Include an "official" type message announcing the decision.
- cohortUpdates: one per cohort. Deltas bounded to ±0.15
- mood: Calm, Concerned, Angry, Confused, Fatigued
- behaviours: 2-4 realistic actions
- decisionPrompt: include ONLY at significant turning points (maybe 1 in 4 ticks). Provide 2-3 options.
- secondaryEvents: rare (maybe 1 in 5 ticks). Types: viral_spike, misinformation_wave, scam_wave, whistleblower_leak, regulatory_action
- Content evolves: early ticks = uncertainty/breaking news, mid = anger/investigation, late = fatigue/resolution
- Return ONLY JSON. No markdown.`

type EnhancedTickInput = {
  crisisContext: string
  dayNumber: number
  tickIndex: number
  cohorts: { name: string; description: string }[]
  previousStates?: { cohortName: string; mood: string; dominantNarrative: string; sentiment: number; activation: number }[]
  recentMessages?: string[]
  lastDecision?: string
  healthScores?: { overall: number; publicSentiment: number; mediaHeat: number }
  userEvent?: string
}

export async function generateEnhancedTick(input: EnhancedTickInput): Promise<EnhancedTickResponse> {
  const period = TICK_PERIOD_LABELS[input.tickIndex] || 'Morning'

  const cohortBlock = input.cohorts
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n')

  const stateBlock = input.previousStates
    ? input.previousStates
        .map((s) => `- ${s.cohortName}: mood=${s.mood}, sentiment=${s.sentiment.toFixed(2)}, activation=${s.activation.toFixed(2)}, narrative="${s.dominantNarrative}"`)
        .join('\n')
    : 'None (simulation start)'

  const recentBlock = input.recentMessages?.length
    ? input.recentMessages.slice(0, 5).map((m) => `- ${m}`).join('\n')
    : 'None'

  const decisionBlock = input.lastDecision
    ? `Last decision: ${input.lastDecision}`
    : ''

  const healthBlock = input.healthScores
    ? `Current health: overall=${input.healthScores.overall}, publicSentiment=${input.healthScores.publicSentiment}, mediaHeat=${input.healthScores.mediaHeat}`
    : ''

  const userEventBlock = input.userEvent
    ? `\n**BREAKING DEVELOPMENT** (injected by user): ${input.userEvent}\nThis new development MUST significantly impact the generated content and cohort updates. React to this event realistically.\nIMPORTANT: Because this is a major breaking development, you MUST include a "decisionPrompt" in your response with 2-3 options for the company to respond to this development. The cohort sentimentDelta and activationDelta should be large (±0.10 to ±0.15) to reflect the crisis escalation.`
    : ''

  const userPrompt = `Crisis: ${input.crisisContext}

Day ${input.dayNumber}, ${period} tick (tickIndex=${input.tickIndex})

Cohorts:
${cohortBlock}

Current cohort states:
${stateBlock}

Recent messages:
${recentBlock}
${decisionBlock}
${healthBlock}
${userEventBlock}

Generate media content and cohort updates for this ${period.toLowerCase()} tick.`

  const t0 = Date.now()
  console.log(`[LLM] Enhanced tick: day=${input.dayNumber} ${period} — calling Mistral...`)

  // Retry up to 2 times on failure (LLM can return malformed JSON)
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
        temperature: 0.5 + attempt * 0.1,
      })

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      console.log(`[LLM] Enhanced tick: done in ${elapsed}s (attempt ${attempt + 1})`)

      const content = result.choices?.[0]?.message?.content
      if (!content || typeof content !== 'string') {
        throw new Error('No content in Mistral response')
      }

      const parsed = JSON.parse(content)
      return EnhancedTickResponseSchema.parse(parsed)
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error(`[LLM] Enhanced tick attempt ${attempt + 1} failed:`, lastError.message)
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }

  throw lastError || new Error('LLM generation failed after retries')
}

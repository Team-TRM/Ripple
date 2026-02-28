import { mistral } from './client'
import { TickResponseSchema, type TickResponse } from './schemas'

const SYSTEM_PROMPT = `You are a crisis simulation engine. Generate realistic media content and audience perception summaries for a specific day of a crisis.

Return ONLY valid JSON:
{
  "messages": [
    { "type": "news", "author": "News Outlet Name", "content": "News headline and brief article summary..." },
    { "type": "influencer", "author": "@handle", "content": "Social media post about the crisis..." },
    { "type": "comment", "author": "@commenter1", "content": "Reply to influencer post...", "parentIndex": 1 },
    { "type": "comment", "author": "@commenter2", "content": "Another reply...", "parentIndex": 1 },
    { "type": "comment", "author": "@commenter3", "content": "Third reply...", "parentIndex": 1 },
    { "type": "official", "author": "Organisation Name", "content": "Official statement or update..." }
  ],
  "cohortSummaries": [
    {
      "cohortName": "Cohort Name",
      "mood": "Concerned",
      "dominantNarrative": "One sentence describing what this cohort believes is happening.",
      "behaviours": ["checking news frequently", "discussing on social media", "considering action"]
    }
  ]
}

Rules:
- Generate exactly: 1 news article, 1 influencer post, 3 comments on the influencer post, 1 official update
- parentIndex for comments should reference the influencer post's index in the messages array (usually 1)
- Mood must be one of: Calm, Concerned, Angry, Confused, Fatigued
- Generate a cohortSummary for EVERY cohort provided
- behaviours: 2-4 realistic actions this cohort is likely taking
- Content should feel realistic and grounded in the specific crisis context
- Tone and framing should evolve across ticks (early: uncertainty, mid: anger/concern, late: fatigue/resolution)
- Return ONLY JSON. No markdown, no extra text.`

type TickInput = {
  crisisContext: string
  tickNumber: number
  dayEvent: { dateLabel: string; title: string; description: string }
  cohorts: { name: string; description: string; sensitivityTags: string[] }[]
  previousSummaries?: { cohortName: string; mood: string; dominantNarrative: string }[]
}

export async function generateTick(input: TickInput): Promise<TickResponse> {
  const cohortBlock = input.cohorts
    .map(c => `- ${c.name}: ${c.description} (cares about: ${c.sensitivityTags.join(', ')})`)
    .join('\n')

  const prevBlock = input.previousSummaries
    ? input.previousSummaries
        .map(s => `- ${s.cohortName}: mood=${s.mood}, narrative="${s.dominantNarrative}"`)
        .join('\n')
    : 'None (this is the first tick)'

  const userPrompt = `Crisis: ${input.crisisContext}

Tick ${input.tickNumber} — ${input.dayEvent.dateLabel}
Event: ${input.dayEvent.title}
Details: ${input.dayEvent.description}

Cohorts:
${cohortBlock}

Previous tick summaries:
${prevBlock}

Generate media content and cohort perception summaries for this tick.`

  const result = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    responseFormat: { type: 'json_object' },
    temperature: 0.5,
  })

  const content = result.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('No content in Mistral response')
  }

  const parsed = JSON.parse(content)
  return TickResponseSchema.parse(parsed)
}

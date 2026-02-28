import { mistral } from '@/lib/ai/client'
import { SetupResponseSchema, type SetupResponse } from '@/lib/ai/schemas'

const SYSTEM_PROMPT = `You are a crisis simulation analyst. Given an initial crisis situation and answered clarifying questions, generate:

1. A short project name for this crisis scenario
2. Four audience cohorts that would perceive this crisis differently
3. A timeline based ONLY on what the user has told you

CRITICAL TIMELINE RULES:
- The timeline must ONLY contain events the user has described or directly implied.
- Do NOT invent, predict, or fabricate events beyond what the user provided.
- Do NOT draw from real-world knowledge of how similar crises actually played out.
- If the user only described one thing happening, the timeline is just Day 0 with that one event.
- If the user described multiple things happening over several days, include each as a separate day entry.
- The timeline is a STARTING POINT. The simulation will generate what happens next. Your job is just to capture the initial situation faithfully.

Return ONLY valid JSON:
{
  "projectName": "Short Crisis Name",
  "cohorts": [
    {
      "name": "Cohort Name",
      "description": "Who this cohort represents and why they care",
      "attentionWeights": { "news": 0.8, "social": 0.6, "official": 0.9 },
      "sensitivityTags": ["privacy", "financial"]
    }
  ],
  "events": [
    {
      "dayNumber": 0,
      "dateLabel": "Sep 15, 2022",
      "title": "Short event title",
      "description": "What the user described happening on this day."
    },
    {
      "dayNumber": 7,
      "dateLabel": "Sep 22, 2022",
      "title": "Second event title",
      "description": "Event a week later — dayNumber reflects the actual gap."
    }
  ]
}

Rules:
- Generate exactly 4 cohorts with diverse perspectives
- attentionWeights: how much each cohort pays attention to news (0-1), social media (0-1), official channels (0-1)
- sensitivityTags: what issues this cohort cares most about
- Timeline: ONLY include days the user mentioned. Could be 1 event or many.
- dayNumber: preserve the actual time gaps between events. If one event happens a week after another, use dayNumber 0 and dayNumber 7, NOT 0 and 1. Calculate gaps from any dates/timeframes the user provides.
- dateLabel: use the real date if the user provided one (e.g. "Sep 22, 2022"), otherwise use "Day 0", "Day 7", etc.
- Return ONLY JSON. No markdown, no extra text.`

export async function generateSetup(
  crisisContext: string,
  answeredQuestions: { question: string; answer: string }[]
): Promise<SetupResponse> {
  const qaBlock = answeredQuestions
    .map((q, i) => `Q${i + 1}: ${q.question}\nA${i + 1}: ${q.answer}`)
    .join('\n\n')

  const userPrompt = `Crisis Description:
${crisisContext}

Clarifying Q&A:
${qaBlock}`

  const result = await mistral.chat.complete({
    model: 'mistral-large-latest',
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
  return SetupResponseSchema.parse(parsed)
}

import { mistral } from './client'
import { QuestionsResponseSchema, type QuestionsResponse } from './schemas'

const SYSTEM_PROMPT = `You are a crisis simulation analyst. The user has described a crisis they want to simulate. You need to gather enough context to build a realistic simulation.

There are 4 key areas of information you need. ONLY ask about ones the user has NOT already provided:

1. **What has happened so far** — Can you provide more context about the situation? What events have occurred up to this point?
2. **The company/environment** — Can you describe how your company or environment is operating? What is the organisation, its size, and industry?
3. **Key actors** — Who are the key actors involved? (affected parties, regulators, media, etc.)

IMPORTANT:
- Read the user's input carefully. If they already covered an area, do NOT ask about it again.
- Only generate questions for missing information.
- Generate between 1 and 3 questions maximum.
- Keep questions conversational and natural.
- Do NOT ask about decisions, consequences, or response strategy — those will be simulated.
- Do NOT ask about timeline — that will be handled separately.

Return ONLY valid JSON:
{
  "questions": [
    "Question 1?",
    "Question 2?"
  ]
}

Return ONLY the JSON. No markdown, no extra text.`

export async function generateQuestions(crisisContext: string): Promise<QuestionsResponse> {
  const result = await mistral.chat.complete({
    model: 'mistral-large-latest',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: crisisContext },
    ],
    responseFormat: { type: 'json_object' },
    temperature: 0.4,
  })

  const content = result.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('No content in Mistral response')
  }

  const parsed = JSON.parse(content)
  const questions = QuestionsResponseSchema.parse(parsed)

  // Always include the timeline question as the last question
  questions.questions.push(
    'Do you have a brief timeline of when this occurred and where things are up to now?'
  )

  return questions
}

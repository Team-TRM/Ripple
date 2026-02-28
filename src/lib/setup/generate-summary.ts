import { mistral } from '@/lib/ai/client'

const SYSTEM_PROMPT = `You are a crisis simulation analyst. Given a crisis description and the user's answers to clarifying questions, write a concise factual summary of the crisis situation.

The summary should capture:
- What happened
- Who is involved (organisation, affected parties, key actors)
- The timeline of events so far
- The current state of the situation

Write in third person, factual tone. 2-4 paragraphs maximum.
Do NOT speculate about future outcomes or decisions — only summarise what is known.
Return ONLY the summary text. No JSON, no markdown formatting.`

export async function generateSummary(
  crisisContext: string,
  answeredQuestions: { question: string; answer: string }[]
): Promise<string> {
  const qaBlock = answeredQuestions
    .map((q, i) => `Q${i + 1}: ${q.question}\nA${i + 1}: ${q.answer}`)
    .join('\n\n')

  const userPrompt = `Crisis Description:
${crisisContext}

Additional Details:
${qaBlock}`

  const result = await mistral.chat.complete({
    model: 'mistral-large-latest',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.3,
  })

  const content = result.choices?.[0]?.message?.content
  if (!content || typeof content !== 'string') {
    throw new Error('No content in Mistral response')
  }

  return content.trim()
}

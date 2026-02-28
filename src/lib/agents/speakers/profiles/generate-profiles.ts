import { mistral } from '@/lib/ai/client'
import { SpeakerProfilesResponseSchema, type SpeakerProfilesResponse } from '@/lib/ai/schemas'

const SYSTEM_PROMPT = `You are generating speaker profiles for a crisis simulation. Create realistic named individuals who will post content during the simulation.

Return ONLY valid JSON:
{
  "speakers": [
    {
      "id": "sp1",
      "name": "Marcus Webb",
      "handle": "@marcuswebb",
      "cohortName": "Tech Community",
      "role": "Software Engineer at mid-size startup",
      "personality": "skeptical, data-driven, shares technical analysis",
      "messageType": "forum",
      "reach": 0.6
    }
  ]
}

Rules:
- Generate 15-25 speakers spread across ALL cohorts
- Each cohort should have 3-5 speakers
- messageType must match the cohort's natural channel:
  - "news" for journalists and media outlets
  - "influencer" for social media personalities, bloggers, YouTubers
  - "official" for company/government spokespersons
  - "forum" for regular people, community members, employees
- reach: 0.1-0.3 for regular people, 0.4-0.7 for professionals, 0.8-1.0 for major outlets/influencers
- Handles should feel realistic: @firstname_lastname, @RealName, @OutletName
- Personalities should be diverse: some angry, some calm, some analytical, some emotional
- Roles should be specific: "Senior Reporter at TechCrunch", not just "journalist"
- Names should be diverse and realistic
- Return ONLY JSON. No markdown.`

export async function generateSpeakerProfiles(
  crisisContext: string,
  cohorts: { name: string; description: string }[]
): Promise<SpeakerProfilesResponse> {
  const cohortBlock = cohorts
    .map((c) => `- ${c.name}: ${c.description}`)
    .join('\n')

  const userPrompt = `Crisis context: ${crisisContext}

Cohorts:
${cohortBlock}

Generate 15-25 diverse speaker profiles across all cohorts. Each speaker should have a distinct personality and perspective relevant to this crisis.`

  console.log(`[LLM] Generating speaker profiles for ${cohorts.length} cohorts...`)
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
        temperature: 0.7 + attempt * 0.1,
      })

      const content = result.choices?.[0]?.message?.content
      if (!content || typeof content !== 'string') {
        throw new Error('No content in Mistral response')
      }

      const parsed = JSON.parse(content)
      const validated = SpeakerProfilesResponseSchema.parse(parsed)

      const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
      console.log(`[LLM] Generated ${validated.speakers.length} speaker profiles in ${elapsed}s`)

      return validated
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
      console.error(`[LLM] Speaker generation attempt ${attempt + 1} failed:`, lastError.message)
      if (attempt < 1) {
        await new Promise((r) => setTimeout(r, 500))
      }
    }
  }

  throw lastError || new Error('Speaker profile generation failed after retries')
}

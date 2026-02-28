import { mistral } from './client'
import { EnhancedTickResponseSchema, type EnhancedTickResponse, type SpeakerProfile } from './schemas'

const TICK_PERIOD_LABELS = ['Morning', 'Afternoon', 'Evening'] as const

const SYSTEM_PROMPT = `You are a crisis simulation engine. Generate realistic media content, audience perception updates, health score changes, and optionally crisis decision points.

Return ONLY valid JSON:
{
  "messages": [
    { "type": "news", "author": "News Outlet Name", "content": "Article text...", "reach": 0.7, "sentiment": -0.4, "speakerId": "sp3" },
    { "type": "influencer", "author": "@TechBlogger (Tech Community)", "content": "Social media post...", "reach": 0.5, "sentiment": -0.3, "speakerId": "sp7" },
    { "type": "forum", "author": "Affected Customer (General Public)", "content": "Forum post...", "reach": 0.3, "sentiment": -0.6, "speakerId": "sp12" }
  ],
  "cohortUpdates": [
    {
      "cohortName": "General Public",
      "mood": "Concerned",
      "dominantNarrative": "One sentence.",
      "behaviours": ["checking news", "sharing on social media"],
      "sentimentDelta": -0.10,
      "activationDelta": 0.15,
      "trustDelta": -0.08
    }
  ],
  "healthDeltas": {
    "overallDelta": -3,
    "publicAwarenessDelta": 5,
    "publicSentimentDelta": -4,
    "mediaHeatDelta": 3,
    "regulatoryPressureDelta": 2,
    "internalStabilityDelta": -2,
    "fraudRiskDelta": 1
  },
  "decisionPrompt": {
    "prompt": "Media is demanding a response. How should the company react?",
    "options": ["Issue formal apology", "Release technical explanation", "No comment"]
  }
}

Rules:
- Message types: news, influencer, official, forum, secondary
- Generate 4-8 messages per tick, varying by time of day
- CRITICAL: Social media and forum messages MUST represent DIFFERENT cohorts with DIFFERENT viewpoints:
  - Some supportive, some angry, some analytical
  - Each cohort has its own bias
- SPEAKER AGENTS: If speaker profiles are provided, use their names, handles, and personalities to write messages IN CHARACTER.
  - Set "author" to the speaker's handle or name
  - Set "speakerId" to match the speaker's id
  - Write content that matches the speaker's personality and role
  - You don't have to use every speaker each tick — pick 4-8 relevant ones
  - If no speaker profiles are provided, generate generic authors as before
- reach: 0-1. sentiment: -1 to 1. Vary across messages.
- Morning: breaking news, early reactions. Afternoon: social media eruption, debates. Evening: official responses, analysis, end-of-day summary.
- AWARENESS DYNAMICS: When publicAwareness is LOW (< 30), most people don't know about the crisis yet:
  - Morning Day 1-2: Only insider leaks, niche media. Low reach messages.
  - As awareness grows: mainstream media picks up, hashtags emerge, trending topics.
  - After company announcements: rapid awareness spike, broader public reaction.
- If "Last decision" context is provided: generate messages reacting TO it. Some approve, some criticize. Include an "official" type announcing it.

COHORT UPDATES:
- One per cohort. Deltas bounded to ±0.25
- Use LARGE deltas (±0.10 to ±0.25) for major events. Small deltas (±0.03 to ±0.08) for routine ticks.
- mood: Calm, Concerned, Angry, Confused, Fatigued
- behaviours: 2-4 realistic actions
- If a good decision was made: sentimentDelta and trustDelta should be POSITIVE for cohorts that approve.

HEALTH DELTAS (REQUIRED — always include this):
- These directly adjust the company's health dashboard. They are INTEGER changes applied to current scores (0-100 scale).
- CRITICAL: Changes must be VERY GRADUAL. The simulation runs 14 days (42 ticks). If scores drop 5 per tick, health reaches 0 in 10 ticks (3 days). That is TOO FAST.
- overallDelta: Net company health change. Negative = crisis worsening, positive = recovery. Range: -5 to +8.
  - MOST ticks: -1 to -2 (slow decline from ongoing crisis). This is the DEFAULT.
  - Bad news breaks: -3 to -4
  - Major crisis escalation: -5 (RARE — only once or twice in 14 days)
  - Company makes a GOOD decision: +3 to +6. IMPORTANT: good decisions MUST improve health.
  - Company makes a GREAT decision: +6 to +8
- publicAwarenessDelta: How much MORE the public learns this tick. ALWAYS POSITIVE or zero — never shrinks. Range: 0 to +8.
  - Day 0-2: Very slow growth (+1 to +2 per tick). Almost nobody knows yet. Only insiders.
  - Day 3-4: Slow growth (+2 to +4) as first reporters pick it up.
  - Day 5+: After company announcements or viral moments (+4 to +8).
  - Most ticks should be +1 to +2. Only major public events warrant +5 or more.
- publicSentimentDelta: Public opinion shift. Range: -5 to +8.
  - When publicAwareness < 30: sentiment changes MUST be tiny (-1 to +1) because few people know.
  - Good company decision: MUST be positive (+2 to +5). The public rewards responsiveness.
  - Bad decision or cover-up: -3 to -5.
- mediaHeatDelta: Media scrutiny. POSITIVE = more heat (bad). Range: -6 to +5.
- regulatoryPressureDelta: Regulatory attention. POSITIVE = more pressure (bad). Range: -6 to +5.
- internalStabilityDelta: Employee morale. NEGATIVE = destabilizing (bad). Range: -5 to +8.
  - Good company decision: +2 to +5 (employees feel reassured).
- fraudRiskDelta: Fraud/scam risk. POSITIVE = more risk (bad). Range: -6 to +5.
- REWARD GOOD DECISIONS: When the company makes a smart, proactive decision:
  - overallDelta MUST be positive (+3 to +8)
  - publicSentimentDelta MUST be positive (+2 to +5)
  - internalStabilityDelta MUST be positive (+2 to +5)
  - mediaHeatDelta should be negative (-2 to -4) as the story cools
  - This is critical — the user should see their good decisions reflected in improving scores.

DECISION PROMPT — END OF DAY ONLY:
- ONLY include "decisionPrompt" when tickIndex=2 (Evening tick). This is the END OF DAY briefing.
- Do NOT include decisionPrompt on Morning (tickIndex=0) or Afternoon (tickIndex=1) ticks.
- Every Evening tick MUST include a decisionPrompt — this is the CEO's daily decision point.
- The prompt should be a DAILY BRIEF: summarize what happened today, then present the key decision.
- CRITICAL: If a BREAKING DEVELOPMENT or crisis escalation occurred today (look for breaking news in recent messages), the decision MUST be about responding to THAT crisis — not a generic daily summary. The CEO needs to decide how to handle the most urgent issue.
- Include 2-3 options for the CEO to choose from.
- secondaryEvents: rare. Types: viral_spike, misinformation_wave, scam_wave, whistleblower_leak, regulatory_action

NEW NODES (optional — include 0-1 per tick to expand the stakeholder graph):
- Add "newNodes" array when new stakeholders emerge (e.g., a regulator enters, a new media outlet picks up the story, a whistleblower group forms).
- Each new node: { "label": "SEC Investigation", "type": "regulator", "sentiment": -0.3, "activation": 0.8, "trustInCompany": 0.2, "connectTo": ["existing node label 1", "existing node label 2"] }
- "connectTo" lists labels of existing nodes this new node should connect to (1-3 connections).
- Types: public, government, media, employees, company, influencer, regulator
- Only add new nodes when narratively justified (new actors entering the crisis). Most ticks should NOT add nodes.
- Maximum 1 new node per tick.

- Content evolves: early = uncertainty, mid = anger/investigation, late = fatigue/resolution
- Return ONLY JSON. No markdown.`

type EnhancedTickInput = {
  crisisContext: string
  dayNumber: number
  tickIndex: number
  cohorts: { name: string; description: string }[]
  previousStates?: { cohortName: string; mood: string; dominantNarrative: string; sentiment: number; activation: number }[]
  recentMessages?: string[]
  lastDecision?: string
  healthScores?: { overall: number; publicSentiment: number; mediaHeat: number; regulatoryPressure: number; internalStability: number; fraudRisk: number; publicAwareness: number }
  userEvent?: string
  speakerProfiles?: SpeakerProfile[]
  nodeLabels?: string[]
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
    ? `Current health scores (0-100): overall=${input.healthScores.overall}, publicAwareness=${input.healthScores.publicAwareness}, publicSentiment=${input.healthScores.publicSentiment}, mediaHeat=${input.healthScores.mediaHeat}, regulatoryPressure=${input.healthScores.regulatoryPressure}, internalStability=${input.healthScores.internalStability}, fraudRisk=${input.healthScores.fraudRisk}`
    : ''

  const userEventBlock = input.userEvent
    ? `\n**BREAKING DEVELOPMENT** (injected by user): ${input.userEvent}
This is a MAJOR breaking event. Your response MUST follow this structure:
1. The FIRST message MUST be type "news" — a dramatic breaking news alert headline about this event (e.g. "BREAKING: [headline]"). High reach (0.7-0.9), strong negative sentiment.
2. The remaining messages should be reactions from different cohorts — social media outrage, expert analysis, insider panic, etc.
3. Do NOT include a "decisionPrompt" — decisions are only made at the end of the day.
4. Cohort sentimentDelta and activationDelta should be LARGE (±0.10 to ±0.25) to reflect the crisis escalation.
5. healthDeltas should reflect the severity — overallDelta should be negative (-3 to -5), mediaHeatDelta strongly positive (+3 to +5).`
    : ''

  const speakerBlock = input.speakerProfiles?.length
    ? `\nSpeaker agents (use these named individuals for messages — set speakerId to match):\n${input.speakerProfiles.map((s) => `- id="${s.id}" ${s.handle} (${s.cohortName}): ${s.role}. Personality: ${s.personality}. Type: ${s.messageType}, reach: ${s.reach}`).join('\n')}`
    : ''

  const nodeLabelsBlock = input.nodeLabels?.length
    ? `\nExisting graph nodes (use these labels for connectTo): ${input.nodeLabels.join(', ')}`
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
${speakerBlock}
${nodeLabelsBlock}
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

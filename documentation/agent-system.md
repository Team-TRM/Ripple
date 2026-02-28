# Multi-Agent System

The simulation uses a multi-agent architecture where different types of agents produce distinct behaviors.

## Agent Types

```
┌─────────────────────────────────────────────────┐
│                  Orchestrator                    │
│            tick-orchestrator.ts                  │
│    Coordinates all agents per tick               │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Speaker  │  │ Cohort   │  │ Executive    │  │
│  │ Agents   │  │ Agents   │  │ Agents       │  │
│  │ (15-25)  │  │ (4)      │  │ (4)          │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
└─────────────────────────────────────────────────┘
```

## Orchestrator (`src/lib/agents/orchestrator/`)

### `tick-orchestrator.ts` — `generateEnhancedTick(input)`

The main LLM call for tick generation. Assembles a comprehensive prompt from all agent states and returns structured output.

**System prompt rules:**

- Generate 4-8 messages per tick, varying by time of day
  - Morning: overnight news, early reports, breaking stories
  - Afternoon: social media eruption, influencer reactions, forum threads
  - Evening: official responses, evening news wrap, expert analysis
- Use speaker profiles to write "in character" (voice, personality, reach)
- Generate cohort updates with bounded deltas
- Health deltas follow strict pacing rules:
  - `overall` typically changes -1 to -2 per tick (gradual decline)
  - Critical escalations: -3 to -5 (rare, must be justified)
  - Good decisions: +3 to +8 (recovery takes time)
- Public awareness starts LOW (~10), grows as media covers the crisis
- Decision prompts only appear in evening ticks
- New nodes are rare — only when new stakeholders emerge

**Retry logic:** If JSON parsing fails, retry once at higher temperature (0.5 → 0.6). Max 2 attempts.

### `context-builder.ts` — Prompt Assembly

Builds the user prompt from:

- Crisis context and current day/tick
- Timeline events for this day
- Cohort states (mood, sentiment, activation)
- Recent messages (last 5 for continuity)
- Speaker profiles with memory (recent posts per speaker)
- Current health scores
- Last decision context
- Breaking developments (evening ticks: high-impact crisis messages)
- User-injected crises

### `initial-tick.ts` — `generateTick(input)`

Simpler tick generation used for Tick 0 (before speaker profiles exist). Fixed pattern: 1 news + 1 influencer post + 3 comments + 1 official update. Uses `mistral-small-latest`.

## Speaker Agents (`src/lib/agents/speakers/`)

Speaker agents are named individuals who produce consistent, personality-driven content across the simulation.

### Profile Generation (`profiles/generate-profiles.ts`)

**`generateSpeakerProfiles(context, cohorts)`**

Creates 15-25 named speakers at simulation start:

- 3-5 speakers per cohort
- Each has: `id`, `name`, `handle`, `cohort`, `role`, `personality`, `messageType`, `reach`
- Personalities drive tone: e.g., "confrontational tech journalist" vs "cautious privacy researcher"
- Message types: `news`, `influencer`, `official`, `forum`
- Stored as JSON on the Project model

### Memory System (`memory/recall.ts`)

**`getRecentSpeakerPosts(messages, speakerProfiles)`**

Retrieves per-speaker message history from stored messages:

- Matches message `author` to speaker `handle` or `name`
- Returns last N messages per speaker
- Enables speakers to reference their own previous statements
- Prevents "character whiplash" (an angry speaker suddenly turning cheerful)

### Narrative Arc (`behavior/narrative-arc.ts`)

Rules for speaker behavior evolution:

- **Escalation phase** (early days): Speakers become more activated, sentiment shifts
- **Pivot phase** (mid simulation): Official responses change tone
- **Fatigue phase** (late simulation): Activation decays, repetitive narratives
- **Resolution phase** (if decisions improve things): Gradual sentiment recovery
- No speaker used > 2× per tick (enforced in prompt)

## Executive Agents (`src/lib/agents/executives/`)

Executive agents provide strategic recommendations when decision points arise.

### Role Definitions (`roles/role-definitions.ts`)

4 fixed C-suite executives with distinct perspectives:

| Role               | Name           | Perspective                     | Bias                                   |
| ------------------ | -------------- | ------------------------------- | -------------------------------------- |
| CTO                | Sarah Chen     | Technical, engineering-focused  | Risk-averse, wants technical solutions |
| Head of PR         | James Morrison | Public perception, transparency | Proactive communication                |
| Legal Counsel      | Priya Kapoor   | Regulatory, liability           | Conservative, compliance-first         |
| Head of Operations | David Okafor   | Business continuity, pragmatic  | Cost-benefit focused                   |

### Advisory Generation (`advisory/generate-advice.ts`)

**`generateExecutiveAdvice(input)`**

Called when evening tick produces a decision prompt. Each executive:

- Receives the crisis context, decision prompt, current health scores
- Gives a context-specific recommendation (not generic advice)
- Includes risk assessment and reasoning
- May disagree with other executives

**Output:**

```typescript
type ExecutiveRecommendation = {
  role: string;
  name: string;
  recommendation: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
};
```

## Cohort Agents (`src/lib/agents/cohorts/`)

Cohort agents model aggregate behavior of stakeholder groups.

### Population Dynamics (`population/population-dynamics.ts`)

**`initializePopulationStats(cohorts, nodes)`**

Assigns realistic population sizes to each cohort based on type (ranges defined in `POPULATION_RANGES`). Sets initial active speakers count.

**`calculatePopulationStats(cohorts, nodes, existingStats?)`**

Per-tick recalculation:

- Active speakers: derived from node activation levels
- Aggregate sentiment: average of cohort's node sentiments
- Trend direction: `improving`, `stable`, or `declining` (comparing to previous)
- Dominant narrative: from latest cohort summary

### Influence Propagation (`influence/propagation.ts`)

**`applyInfluencePropagation(nodes, edges)`**

Single-pass influence spreading:

- Only nodes with activation > 0.2 propagate
- For each edge: weighted sentiment/activation pull toward source
- Bounded: ±0.15 sentiment, ±0.1 activation

**`applyActivationDecay(nodes, decayFactor = 0.97)`**

Multiplicative decay applied after propagation.

## Agent Core Types (`src/lib/agents/core/types.ts`)

```typescript
// Agent identity
interface AgentProfile {
  id: string;
  name: string;
  type: 'speaker' | 'executive' | 'cohort';
  cohort?: string;
  personality: string;
  bias?: string;
}

// Speaker agent runtime state
interface SpeakerAgentState {
  profile: AgentProfile;
  memory: AgentMemoryEntry[];
  currentSentiment: number;
  currentActivation: number;
  handle: string;
  messageType: string;
  recentPosts: string[];
}

// Cohort agent runtime state
interface CohortAgentState {
  cohortName: string;
  population: number;
  activeSpeakers: number;
  aggregateSentiment: number;
  trendDirection: 'improving' | 'stable' | 'declining';
  dominantNarrative: string;
  behaviours: string[];
}
```

## Agent Registry (`src/lib/agents/core/registry.ts`)

Central configuration for agent behavior parameters — temperature settings, max tokens, retry counts, and model selection per agent type.

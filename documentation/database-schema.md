# Database Schema

Ripple uses PostgreSQL via Prisma ORM. All data — including graph state — is stored in Postgres as JSON columns. There is no separate graph database.

## Entity Relationship Diagram

```
Project ──┬── ProjectQuestion[]
          ├── Cohort[] ──── CohortSummary[]
          ├── TimelineEvent[]
          ├── Tick[] ──┬── Message[]
          │            ├── CohortSummary[]
          │            ├── HealthScore (1:1)
          │            └── DecisionPoint[]
          └── DecisionPoint[]
```

## Models

### Project

The root entity for a simulation.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `name` | String | Project name (generated during setup) |
| `context` | Text | User-provided crisis description |
| `summary` | Text? | LLM-generated factual summary |
| `simulationDays` | Int? | Total days to simulate (default 14) |
| `currentDay` | Int (default 0) | Current simulation day |
| `status` | String (default "setup") | Lifecycle: `setup` → `questions` → `ready` → `running` |
| `graphNodes` | Json? | Current graph node state (GraphNode[]) |
| `graphEdges` | Json? | Current graph edge state (GraphEdge[]) |
| `speakerProfiles` | Json? | Named speaker agents (SpeakerProfile[]) |
| `populationStats` | Json? | Cohort population metrics (CohortAgentState[]) |
| `previousReport` | Json? | Saved report when starting a rerun |
| `rerunFromDay` | Int? | Which day the current rerun branched from |
| `createdAt` | DateTime | Creation timestamp |

**Relations:** questions[], cohorts[], events[], ticks[], decisions[]

---

### ProjectQuestion

Clarifying questions generated during setup.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `projectId` | String | FK → Project |
| `question` | Text | The question text |
| `answer` | Text? | User's answer |

---

### Cohort

Stakeholder groups in the simulation.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `projectId` | String | FK → Project |
| `name` | String | e.g., "Privacy Advocates", "Small Business Customers" |
| `description` | Text | Detailed description of the cohort |
| `attentionWeights` | Json | `{ news: 0.8, social: 0.6, official: 0.9 }` — how much this cohort pays attention to each channel |
| `sensitivityTags` | Json | `["data privacy", "regulatory compliance"]` — issue sensitivities |

**Relations:** project, summaries[]

---

### TimelineEvent

Events on the crisis timeline — either generated during setup or injected by the user during simulation.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `projectId` | String | FK → Project |
| `dayNumber` | Int | Which simulation day |
| `dateLabel` | String (default "") | Display label (e.g., "March 15") |
| `title` | String | Event title |
| `description` | Text | Full event description |
| `isUserInjected` | Boolean (default false) | Whether the user injected this crisis during simulation |

**Indexes:** `[projectId]`, `[projectId, dayNumber]`

---

### Tick

A discrete simulation timestep. 3 ticks per day × 3 sub-ticks per tick = 9 records per day.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `projectId` | String | FK → Project |
| `dayNumber` | Int | Simulation day (0-indexed) |
| `tickIndex` | Int (default 0) | 0=morning, 1=afternoon, 2=evening |
| `subTickIndex` | Int (default 0) | 0=generate, 1=observe, 2=update |
| `dateLabel` | String? | Display label for this time period |
| `graphSnapshot` | Json? | `{ nodes, edges }` — full graph state at this tick (for rerun branching) |

**Unique constraint:** `[projectId, dayNumber, tickIndex, subTickIndex]`

**Relations:** project, messages[], summaries[], healthScore?, decisions[]

---

### Message

Media content generated per tick — news articles, social posts, comments, official statements.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `tickId` | String | FK → Tick |
| `type` | String | `news`, `influencer`, `official`, `forum`, `secondary`, `comment` |
| `author` | String | Speaker name or handle (e.g., "@TechReporter", "Sky News") |
| `content` | Text | Message content |
| `parentId` | String? | FK → Message (for comment threads) |
| `reach` | Float (default 0) | How widely seen (0-1) |
| `sentiment` | Float (default 0) | Tone (-1 negative to 1 positive) |

**Relations:** tick, parent?, children[]

---

### CohortSummary

Per-tick snapshot of a cohort's state.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `tickId` | String | FK → Tick |
| `cohortId` | String | FK → Cohort |
| `mood` | String | `Calm`, `Concerned`, `Angry`, `Confused`, `Fatigued` |
| `dominantNarrative` | String | One sentence: what this cohort believes |
| `behaviours` | Json | `["checking news frequently", "discussing on social media"]` |

**Unique constraint:** `[tickId, cohortId]`

---

### HealthScore

7-dimension health metrics per update tick.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `tickId` | String (unique) | FK → Tick (1:1 relationship) |
| `overall` | Float | Composite score (0-100) |
| `publicSentiment` | Float | How the public feels (0-100) |
| `mediaHeat` | Float | Media attention intensity (0-100) |
| `regulatoryPressure` | Float | Government/regulator pressure (0-100) |
| `internalStability` | Float | Employee morale + trust (0-100) |
| `fraudRisk` | Float | Risk of fraud/scams exploiting crisis (0-100) |
| `publicAwareness` | Float | How widely known the crisis is (0-100) |

---

### DecisionPoint

CEO decision prompt with executive recommendations.

| Field | Type | Description |
|-------|------|-------------|
| `id` | String (cuid) | Primary key |
| `projectId` | String | FK → Project |
| `tickId` | String | FK → Tick |
| `prompt` | Text | Decision question text |
| `options` | Json? | String array of choices |
| `chosenOption` | String? | Which option the user selected |
| `userEvent` | Text? | Optional user-injected event text |
| `executiveRecommendations` | Json? | Array of `{ role, name, recommendation, riskLevel, reasoning }` |

**Relations:** project, tick

---

## JSON Column Schemas

### `Project.graphNodes` — `GraphNode[]`

```typescript
{
  nodeId: string       // cuid
  label: string        // "Privacy Advocates"
  type: string         // public|government|media|employees|company|influencer|regulator
  color: string        // hex color
  cohortId?: string    // FK to Cohort (null for environment nodes)
  sentiment: number    // -1 to 1
  activation: number   // 0 to 1
  trustInCompany: number // 0 to 1
  dominantNarrative?: string
  behaviours?: string[]
}
```

### `Project.graphEdges` — `GraphEdge[]`

```typescript
{
  source: string       // nodeId
  target: string       // nodeId
  weight: number       // 0 to 1
  type: string         // influence|trust|information
}
```

### `Project.speakerProfiles` — `SpeakerProfile[]`

```typescript
{
  id: string
  name: string         // "Emma Zhang"
  handle: string       // "@emmazhang_privacy"
  cohort: string       // cohort name
  role: string         // "Privacy researcher and activist"
  personality: string  // "Analytical, persistent, principled"
  messageType: string  // news|influencer|official|forum
  reach: number        // 0 to 1
}
```

### `DecisionPoint.executiveRecommendations` — `ExecutiveRecommendation[]`

```typescript
{
  role: string         // "CTO"
  name: string         // "Sarah Chen"
  recommendation: string
  riskLevel: string    // low|medium|high|critical
  reasoning: string
}
```

## Cascade Behavior

- Deleting a **Project** cascades to: questions, cohorts, events, ticks, decisions
- Deleting a **Tick** cascades to: messages, cohort summaries, health score
- Deleting a **Cohort** cascades to: cohort summaries
- Deleting a **Message** (parent) cascades to: child messages

## Indexes

| Model | Index | Purpose |
|-------|-------|---------|
| Tick | `[projectId, dayNumber, tickIndex, subTickIndex]` (unique) | Fast tick lookup by position |
| TimelineEvent | `[projectId]` | Project event listing |
| TimelineEvent | `[projectId, dayNumber]` | Events for a specific day |
| CohortSummary | `[tickId, cohortId]` (unique) | One summary per cohort per tick |
| HealthScore | `[tickId]` (unique) | One health record per tick |

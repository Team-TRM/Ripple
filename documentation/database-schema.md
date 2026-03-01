# Database Schema

Ripple persists simulation state in PostgreSQL via Prisma. Relational entities store lifecycle data, and JSON fields store evolving graph/agent state.

## ER Overview

```text
Project
  |- ProjectQuestion[]
  |- Cohort[]
  |   |- CohortSummary[]
  |- TimelineEvent[]
  |- Tick[]
  |   |- Message[]
  |   |- CohortSummary[]
  |   |- HealthScore (1:1)
  |   |- DecisionPoint[]
  |- DecisionPoint[]
```

## Core Models

### Project

Root simulation record.

Key fields:
- `id`: `String @id @default(cuid())`
- `name`: `String`
- `context`: `String @db.Text`
- `summary`: `String? @db.Text`
- `simulationDays`: `Int?`
- `currentDay`: `Int @default(0)`
- `isPaused`: `Boolean @default(true)`
- `status`: `String @default("setup")`
  - lifecycle values used in app: `setup`, `questions`, `ready`, `running`
- `graphNodes`: `Json?`
- `graphEdges`: `Json?`
- `speakerProfiles`: `Json?`
- `populationStats`: `Json?`
- `previousReport`: `Json?`
- `rerunFromDay`: `Int?`

Relations:
- `questions`, `cohorts`, `events`, `ticks`, `decisions`

### ProjectQuestion

Clarifying intake questions.

- `question`: text
- `answer`: nullable text
- indexed by `projectId`

### Cohort

Stakeholder groups generated during setup.

- `name`, `description`
- `attentionWeights`: JSON object (`news/social/official`)
- `sensitivityTags`: JSON string array

### TimelineEvent

Timeline entries from setup and user injections.

- `dayNumber`
- `dateLabel`
- `title`, `description`
- `isUserInjected`

Indexes:
- `[projectId]`
- `[projectId, dayNumber]`

### Tick

Discrete simulation point.

- `dayNumber`
- `tickIndex` (`0=morning,1=afternoon,2=evening`)
- `subTickIndex` (`0=generate,1=observe,2=update`)
- `dateLabel`
- `graphSnapshot` JSON for rerun branching

Constraint:
- unique `[projectId, dayNumber, tickIndex, subTickIndex]`

### Message

Generated media/public/official content.

- `type` (`news|influencer|official|comment|forum|secondary|agent_action|decision` at runtime layer)
- `author`
- `content`
- `parentId` optional
- `reach` float
- `sentiment` float

### CohortSummary

Per-tick cohort narrative snapshot.

- `mood`
- `dominantNarrative`
- `behaviours` JSON array

Constraint:
- unique `[tickId, cohortId]`

### HealthScore

Per-update health metrics.

All persisted as **Int** values (`0-100`):
- `overall`
- `publicSentiment`
- `mediaHeat`
- `regulatoryPressure`
- `internalStability`
- `fraudRisk`
- `publicAwareness`

Constraint:
- `tickId` unique (1:1 with tick update record)

### DecisionPoint

Decision prompts and selected options.

- `prompt`
- `options` JSON array
- `chosenOption` nullable
- `userEvent` nullable
- `executiveRecommendations` JSON nullable

`executiveRecommendations` shape:

```ts
{
  role: string
  name: string
  recommendation: string
  reasoning: string
}
```

## JSON Payload Shapes

### `Project.graphNodes`

```ts
{
  nodeId: string
  label: string
  type: string
  color: string
  cohortId?: string
  sentiment: number      // -1..1
  activation: number     // 0..1
  trustInCompany: number // 0..1
  dominantNarrative?: string
  behaviours?: string[]
}
```

### `Project.graphEdges`

```ts
{
  source: string
  target: string
  weight: number // 0..1
  type: string   // influence|trust|information
}
```

### `Project.speakerProfiles`

```ts
{
  id: string
  name: string
  handle: string
  cohortName: string
  role: string
  personality: string
  messageType: string
  reach: number
}
```

### `Project.populationStats`

```ts
{
  cohortName: string
  population: number
  activeSpeakers: number
  aggregateSentiment: number
  trendDirection: 'improving' | 'stable' | 'declining'
}
```

## Cascade and Cleanup Behavior

- Deleting `Project` cascades to questions/cohorts/events/ticks/decisions.
- Deleting `Tick` cascades to messages/summaries/health.
- Rerun API selectively removes future-branch ticks, decisions, and user-injected events, then restores graph snapshot.

## Why This Schema Works for Hackathon Velocity

- relational integrity for core lifecycle entities
- JSON flexibility for graph and agent payloads
- branch/rerun support without replaying full history
- simple query paths for live dashboard and report generation

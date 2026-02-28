# Crisis Simulator — Project Plan

## Overview

**Project Name:** Crisis Simulator  
**Goal:** Build a perception-driven crisis simulation platform that models how different audience segments perceive and react to a corporate data breach scenario.

This hackathon MVP demonstrates:

- Crisis → Information → Perception → Decision → Divergence
- Different cohorts see different narratives
- A key decision (e.g., pay vs refuse ransom) changes perception trajectories
- All state is persisted in a proper relational database

This is a perception and information dynamics engine — not a macroeconomic or legal system simulator.

---

# 1. System Architecture

## 1.1 High-Level Architecture

Frontend (Next.js)  
⬇  
API Layer (Next.js Route Handlers)  
⬇  
Simulation Engine (Server Logic)  
⬇  
Mistral AI (Narrative Generation)  
⬇  
Postgres Database (Prisma ORM)

---

## 1.2 Core System Components

### 1. Scenario Store (Database)

Stores:

- Fixed factual event stream (facts only)
- Cohorts (audience segments)
- Sources (news, influencer, official)
- Channels (News, Social, Official)
- Information graph (edges + weights)
- Action catalog (including ransom decision)

---

### 2. Simulation Engine

Responsible for:

- Tick progression
- Generating messages per tick (via Mistral)
- Routing messages to cohorts
- Producing cohort summaries
- Applying decision modifiers (pay vs refuse)

The engine is deterministic and authoritative.

The LLM generates structured content only.

---

### 3. Mistral AI Layer

Used for:

- News headline generation
- Influencer post generation
- Official update generation
- Cohort summaries (mood + narrative + behaviours)

Not used for:

- State mutation
- Routing logic
- Database updates
- Meter calculations

- State mutation
- Routing logic
- Database updates
- Meter calculations

All outputs must pass strict schema validation.

---

### 4. Mistral AI Layer

- Right panel (cohort feed + cohort summary)

---

# 2. Database Design (Postgres + Prisma)

## Core Tables

### Scenario

- id
- name
- description
- facts (JSON array)

### Cohort

- id
- scenarioId
- name
- attentionWeights (JSON)
- sensitivityTags (JSON)

### SourceNode

- id
- scenarioId
- type (news | influencer | official)

### ChannelNode

- id
- scenarioId
- type (news | social | official)

### GraphEdge

- id
- scenarioId
- fromNodeId
- toNodeId
- weight

---

### SimulationRun

- id
- scenarioId
- createdAt
- currentTick

### Decision

- id
- runId
- tickNumber
- type (ransom)
- value (pay | refuse)

### Tick

- id
- runId
- tickNumber
- dateLabel
- meters (JSON)
- log (JSON)

### Message

- id
- tickId
- type (news | influencer | official)
- sourceId
- channelId
- content
- tags (JSON)
- stance
- virality
- route (JSON)

### CohortVisibility

- id
- tickId
- cohortId
- messageId

### CohortSummary

- id
- tickId
- cohortId
- mood
- dominantNarrative
- behaviours (JSON)

---

# 3. Simulation Design (MVP Scope)

## 3.1 Scenario

Fixed scenario:
“Large Australian Telecom Data Breach”

6 ticks total:

1. Breach disclosed
2. ID documents exposed
3. Ransom demand appears (decision point)
4. Sample data posted
5. Investigation ongoing
6. Continued developments

Facts are fixed and do not change.

---

## 3.2 Cohorts (4 only)

- Influencer-following
- News-focused
- Small business customers
- Privacy advocates

Each cohort includes:

- Channel attention weights
- Trust bias per source
- Sensitivity tags

---

## 3.3 Messages per Tick

Each tick generates:

- 1 News headline
- 1 Influencer post (+ 3 comments)
- 1 Official update

---

## 3.4 Routing Model

For each message:

For each cohort:

- Check attention weight for channel
- If above threshold → visible
- Store in CohortVisibility

No rate simulation.  
No large network graph.

---

## 3.5 Cohort Summary

Each cohort produces:

- Mood (Calm / Concerned / Angry / Confused / Fatigued)
- Dominant narrative (1 sentence)
- Likely behaviours (3 tags)

Generated via Mistral with strict schema validation.

---

# 4. Decision Branch (Tick 3)

At Tick 3:

User chooses:

- Pay ransom
- Refuse ransom

This decision:

- Is stored in DB
- Modifies narrative generation prompts
- Alters influencer tone
- Alters news framing
- Changes cohort summaries

Branching affects ticks 4–6.

---

# 5. Mistral AI Integration

## 5.1 Model

Use:

- `mistral-large` (preferred)
  or
- `mistral-medium` (cost-efficient)

Only 1 LLM call per tick.

---

## 5.2 Prompt Design

System prompt:

- Return strict JSON
- No markdown
- No extra commentary
- Use realistic Australian tone

User prompt includes:

- Scenario context
- Current tick
- Factual event
- Decision (if any)
- Cohort definitions

---

## 5.3 Expected JSON Structure

```json
{
  "messages": [],
  "cohortSummaries": []
}
```

All responses must pass Zod validation.

If validation fails:  
Fallback to canned templates.

---

# 6. Staged Development Plan

## Stage 0 — Setup

- Create Next.js app
- Docker Postgres
- Prisma init + migrate
- Seed scenario

Deliverable: DB running and seeded.

---

## Stage 1 — Static UI

- Build layout
- Add cards, graph placeholder, feed placeholder
- Load static JSON

Deliverable: Screenshot-ready UI.

---

## Stage 2 — API + Run Lifecycle

- Create run endpoint
- Step endpoint
- Persist ticks in DB

Deliverable: Backend creates and advances runs.

---

## Stage 3 — Engine v0 (Canned)

- Hardcoded messages per tick
- Hardcoded summaries
- Routing logic
- Decision branch

Deliverable: Stable demo without LLM.

---

## Stage 4 — Mistral Integration

- Replace canned text with LLM
- Add schema validation
- Store prompt + response
- Add fallback safety

Deliverable: Dynamic narrative generation.

---

## Stage 5 — UI Wiring

- Connect UI to APIs
- Step button works
- Cohort picker filters feed
- Decision appears at tick 3

Deliverable: End-to-end working demo.

---

# 7. Folder Structure

```
/app
  /api
    /runs
    /runs/[runId]
    /runs/[runId]/step
  page.tsx

/components
  TopBar.tsx
  LeftPanel.tsx
  InfoGraphView.tsx
  RightPanel.tsx
  FeedList.tsx
  MessageCard.tsx
  CohortPicker.tsx

/lib
  prisma.ts
  llm/mistral.ts
  sim/
    engine.ts
    routing.ts
    schemas.ts

/prisma
  schema.prisma
  seed.ts

docker-compose.yml
```

---

# 8. Hackathon Demo Script

1. Start simulation.
2. Step to Tick 1 → show different cohort feeds.
3. Step to Tick 3 → ransom decision appears.
4. Choose “Pay” → show divergence.
5. Reset.
6. Choose “Refuse” → show different divergence.

Focus on:

- Same crisis, different perceptions.
- Decision alters perception trajectory.
- Structured simulation, not random storytelling.

---

# 9. Post-Hackathon Roadmap

- Add more cohorts
- Add more sources
- Add scenario editor
- Add Monte Carlo runs
- Add exportable report
- Add analytics dashboard
- Add reinforcement learning for strategy evaluation

---

# End Vision

A perception-driven simulation engine that:

- Is explainable
- Is decision-sensitive
- Uses structured data
- Persists state in a proper relational database
- Can evolve into enterprise crisis training software

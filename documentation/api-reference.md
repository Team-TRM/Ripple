# API Reference

All API routes are Next.js Route Handlers under `src/app/api/`.

## Project Lifecycle

### `GET /api/projects`

List all projects.

**Response:** `Project[]` — array of project objects with basic fields.

---

### `POST /api/projects`

Create a new project and generate initial clarifying questions.

**Body:**
```json
{
  "context": "A major Australian telecom has suffered a data breach..."
}
```

**Flow:**
1. Create project with status `"setup"`
2. Call `generateQuestions()` [LLM] — generates 1-3 clarifying questions
3. Set status to `"questions"`

**Response:** Full project object with `questions[]`.

---

### `GET /api/projects/[id]`

Fetch full project with all related data.

**Includes:** questions, cohorts, events, ticks (with messages, summaries, healthScore, decisions).

**Response:** Complete project object.

---

### `DELETE /api/projects/[id]`

Delete a project. Cascades to all related data (ticks, messages, cohorts, etc.).

---

## Simulation Setup

### `POST /api/projects/[id]/answers`

Submit answers to setup questions, triggering setup generation.

**Body:**
```json
{
  "answers": [
    { "questionId": "clx...", "answer": "The breach exposed 10M customer records..." }
  ]
}
```

**Flow:**
1. Store answers on `ProjectQuestion` records
2. Call `generateSummary()` [LLM] — 2-4 paragraph factual summary
3. Call `generateSetup()` [LLM] — generates:
   - **4 cohorts** with attention weights and sensitivity tags
   - **Timeline events** extracted from user answers (no fabrication)
4. Create `Cohort` and `TimelineEvent` records
5. Set status to `"ready"`

**Response:** Updated project with cohorts, events, and summary.

---

### `POST /api/projects/[id]/confirm`

Confirm setup and start the simulation. Uses Server-Sent Events (SSE) for progress streaming.

**Flow:**
1. Generate Tick 0 (Day 0, Morning) via `generateTick()` [LLM]
2. Generate influence graph via `generateGraph()` [LLM]
3. Generate speaker profiles via `generateSpeakerProfiles()` [LLM] — 15-25 named individuals
4. Initialize population stats via `initializePopulationStats()`
5. Set status to `"running"`

**SSE Events:**
```
data: {"step": "tick", "message": "Generating initial tick..."}
data: {"step": "graph", "message": "Building influence graph..."}
data: {"step": "speakers", "message": "Creating speaker agents..."}
data: {"step": "done", "project": {...}}
```

---

## Simulation Execution

### `POST /api/projects/[id]/step`

Advance the simulation by one tick. This is the main simulation endpoint called in a loop during play mode.

**Body:**
```json
{
  "decision": "optional — chosen option from last decision",
  "userEvent": "optional — user-injected crisis text",
  "fromDay": 0,
  "fromTickIndex": 2
}
```

**Flow:**
1. If `userEvent` provided, persist as `TimelineEvent` with `isUserInjected: true`
2. Call `runTick()` — generates content, mutates graph, scores health
3. Return full tick result

**Response:**
```json
{
  "dayNumber": 1,
  "tickIndex": 0,
  "nodes": [...],
  "edges": [...],
  "healthScores": { "overall": 72, "publicSentiment": 68, ... },
  "messages": [
    { "id": "...", "type": "news", "author": "Sky News", "content": "...", "reach": 0.8, "sentiment": -0.3 }
  ],
  "decisionPrompt": {
    "prompt": "A ransom demand has been received...",
    "options": ["Pay the ransom", "Refuse and go public", "Negotiate privately"]
  },
  "executiveRecommendations": [
    { "role": "CTO", "name": "Sarah Chen", "recommendation": "...", "riskLevel": "high" }
  ],
  "populationStats": [...]
}
```

---

### `POST /api/projects/[id]/decide`

Submit a CEO decision choice.

**Body:**
```json
{
  "decisionPointId": "clx...",
  "choice": "Refuse and go public"
}
```

**Flow:**
1. Update `DecisionPoint.chosenOption` with the chosen option
2. Return success

**Response:** `{ success: true }`

---

### `GET /api/projects/[id]/graph`

Fetch current graph state for initial dashboard load.

**Response:**
```json
{
  "nodes": [...],
  "edges": [...],
  "healthScores": { "overall": 72, ... }
}
```

---

## Analysis

### `POST /api/projects/[id]/report`

Generate post-simulation analysis report.

**Flow:**
1. Load all decisions, health scores (first + last), notable messages
2. Call `generateSimulationReport()` [LLM] — comprehensive analysis
3. Enrich with decision metadata (IDs, prompts, options) for rerun UI

**Response:**
```json
{
  "grade": "C",
  "headline": "Crisis Mismanagement Led to Significant Reputation Damage",
  "summary": "...",
  "healthDashboard": {
    "overall": { "start": 75, "end": 42, "delta": -33 },
    "publicSentiment": { "start": 70, "end": 35, "delta": -35 },
    ...
  },
  "keyMoments": [
    { "day": 3, "title": "Ransom Payment Leaked", "impact": "critical", "description": "..." }
  ],
  "decisionAnalysis": [
    {
      "day": 2, "decision": "Pay the ransom", "effectiveness": "poor",
      "explanation": "...",
      "decisionPointId": "clx...", "prompt": "...", "options": [...], "originalChoice": "Pay the ransom"
    }
  ],
  "whatWentWell": ["...", "..."],
  "whatWentWrong": ["...", "..."],
  "rootCauseAnalysis": "...",
  "recommendations": [
    { "priority": "critical", "title": "...", "description": "..." }
  ]
}
```

---

### `POST /api/projects/[id]/rerun`

Branch the simulation from a decision point with a different choice.

**Body:**
```json
{
  "decisionPointId": "clx...",
  "newChoice": "Refuse and go public",
  "currentReport": { ... }
}
```

**Flow:**
1. Look up DecisionPoint → determine `branchDay`
2. Save `currentReport` as `project.previousReport`, set `project.rerunFromDay`
3. Delete DecisionPoints for ticks after branch day
4. Delete all Ticks after branch day (cascades to messages, summaries, health scores)
5. Delete user-injected TimelineEvents after branch day
6. Restore graph from `tick.graphSnapshot` at branch point
7. Create new DecisionPoint with `chosenOption = newChoice`
8. Reset `project.currentDay = branchDay`, `project.status = 'running'`

**Response:**
```json
{
  "branchDay": 3,
  "nodes": [...],
  "edges": [...],
  "healthScores": { "overall": 68, ... }
}
```

---

## LLM Usage by Endpoint

| Endpoint | LLM Calls | Model |
|----------|-----------|-------|
| `POST /projects` | 1 (questions) | mistral-large-latest |
| `POST /answers` | 2 (summary + setup) | mistral-large-latest |
| `POST /confirm` | 3 (tick + graph + speakers) | mixed (small + large) |
| `POST /step` | 1-2 (tick + optional advice) | mistral-small-latest |
| `POST /report` | 1 (analysis) | mistral-large-latest |
| `POST /rerun` | 0 (deterministic) | — |

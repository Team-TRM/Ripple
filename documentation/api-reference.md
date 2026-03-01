# API Reference

All endpoints are Next.js Route Handlers under `src/app/api/`.

## Project Lifecycle

### `GET /api/projects`

Returns all projects, newest first.

Includes lightweight relations:
- `events`: `{ id, dayNumber, dateLabel, title }[]`
- `ticks`: `{ id, dayNumber, tickIndex, subTickIndex }[]`

### `POST /api/projects`

Create project and generate clarifying questions.

Body:

```json
{
  "context": "A telecom company suffers a major data breach..."
}
```

Behavior:
- validates context
- calls `generateQuestions(...)`
- creates project with `status: "questions"`
- persists generated questions

Response: created project with `questions[]`.

### `GET /api/projects/[id]`

Returns full project with:
- `questions`
- `cohorts`
- `events`
- `ticks` (with `messages` and `summaries`)

### `DELETE /api/projects/[id]`

Deletes project and cascades related records.

Response:

```json
{ "success": true }
```

## Setup Endpoints

### `POST /api/projects/[id]/answers`

Submit answers to clarifying questions and generate setup.

Body:

```json
{
  "answers": {
    "questionId1": "answer text",
    "questionId2": "answer text"
  }
}
```

Behavior:
- updates `ProjectQuestion.answer`
- generates `summary`
- generates setup (`projectName`, cohorts, events)
- creates cohorts and timeline events
- sets status to `ready`

Response: updated project including `cohorts` and `events`.

### `POST /api/projects/[id]/confirm`

Confirm setup and initialize simulation runtime.

Body:

```json
{
  "simulationDays": 7,
  "cohorts": [
    { "id": "...", "name": "General Public", "description": "..." }
  ],
  "events": [
    { "id": "...", "title": "Initial Incident", "description": "..." }
  ]
}
```

Notes:
- `simulationDays` is clamped to `[3, 60]`.
- Endpoint streams progress via SSE.

SSE payload shape:

```json
{ "step": "Building influence graph...", "status": "running" }
```

Final event:

```json
{ "step": "complete", "status": "done", "project": { "...": "..." } }
```

## Runtime Endpoints

### `POST /api/projects/[id]/step`

Advance simulation by one tick.

Body (all optional):

```json
{
  "decision": "optional",
  "userEvent": "optional",
  "fromDay": 1,
  "fromTickIndex": 2
}
```

Behavior:
- validates project is `running`
- blocks if pending unresolved decision exists (unless `decision` provided)
- persists user event (if provided)
- executes `runTick(...)`

Response:

```json
{
  "tick": { "id": "...", "dayNumber": 2, "tickIndex": 0, "subTickIndex": 2 },
  "messages": [
    {
      "id": "...",
      "type": "news",
      "author": "Outlet",
      "content": "...",
      "reach": 0.8,
      "sentiment": -0.4
    }
  ],
  "nodes": [],
  "edges": [],
  "healthScores": {
    "overall": 52,
    "publicSentiment": 41,
    "mediaHeat": 68,
    "regulatoryPressure": 55,
    "internalStability": 47,
    "fraudRisk": 61,
    "publicAwareness": 58,
    "overallMin": 49,
    "overallMax": 56
  },
  "decisionPrompt": {
    "prompt": "...",
    "options": ["...", "..."]
  },
  "executiveRecommendations": [
    {
      "role": "CTO",
      "name": "Sarah Chen",
      "recommendation": "...",
      "reasoning": "..."
    }
  ],
  "agentActions": [
    {
      "id": "...",
      "agentNodeId": "...",
      "agentLabel": "Media Ecosystem",
      "tool": "amplify_signal",
      "goal": "...",
      "impact": "..."
    }
  ],
  "populationStats": [],
  "injectedEvent": {
    "id": "...",
    "dayNumber": 2,
    "title": "Crisis Injection",
    "description": "..."
  }
}
```

### `POST /api/projects/[id]/decide`

Submit choice for the currently pending decision.

Body:

```json
{
  "chosenOption": "Issue transparent public statement",
  "userEvent": "optional"
}
```

Behavior:
- finds pending decision (`chosenOption == null`)
- sets `chosenOption` and optional `userEvent`

Response: updated `DecisionPoint` record.

### `GET /api/projects/[id]/graph`

Returns current graph and latest stored health scores.

Response:

```json
{
  "nodes": [],
  "edges": [],
  "healthScores": {
    "overall": 61,
    "publicSentiment": 55,
    "mediaHeat": 49,
    "regulatoryPressure": 36,
    "internalStability": 67,
    "fraudRisk": 31,
    "publicAwareness": 43
  }
}
```

## Analysis and Branching

### `POST /api/projects/[id]/report`

Generates simulation post-mortem report.

Response shape:

```json
{
  "grade": "C",
  "headline": "...",
  "summary": "...",
  "keyMoments": [
    {
      "day": 3,
      "title": "...",
      "description": "...",
      "impact": "negative",
      "healthImpact": -6
    }
  ],
  "decisionAnalysis": [
    {
      "day": 2,
      "decision": "...",
      "effectiveness": "poor",
      "explanation": "...",
      "decisionPointId": "...",
      "prompt": "...",
      "options": ["..."],
      "originalChoice": "..."
    }
  ],
  "whatWentWell": ["..."],
  "whatWentWrong": ["..."],
  "recommendations": [
    { "title": "...", "description": "...", "priority": "critical" }
  ],
  "rootCauseAnalysis": "..."
}
```

### `POST /api/projects/[id]/rerun`

Branch simulation from a decision point.

Body:

```json
{
  "decisionPointId": "...",
  "newChoice": "Alternate decision",
  "currentReport": { "...": "..." }
}
```

Behavior:
- stores current report in `project.previousReport`
- deletes future branch ticks/decisions/events
- restores graph from snapshot
- seeds new branch decision choice
- resets status to `running`

Response:

```json
{
  "branchDay": 3,
  "nodes": [],
  "edges": [],
  "healthScores": {
    "overall": 64,
    "publicSentiment": 58,
    "mediaHeat": 43,
    "regulatoryPressure": 39,
    "internalStability": 71,
    "fraudRisk": 29,
    "publicAwareness": 45
  }
}
```

## External Source Grounding

### `POST /api/projects/[id]/sources/url`

Ingest a URL into project context for grounding simulation behavior.

Body:

```json
{
  "url": "https://example.com/news-article"
}
```

Behavior:
- validates URL and blocks local/private hosts
- fetches and extracts page text
- uses Mistral to summarize structured crisis-relevant facts
- appends source block to `project.context`

Response:

```json
{
  "source": {
    "url": "https://example.com/news-article",
    "title": "...",
    "summary": "...",
    "keyFacts": ["..."],
    "stakeholders": ["..."],
    "riskSignals": ["..."],
    "fetchedAt": "...",
    "extractedChars": 10432
  },
  "skipped": false,
  "sourceCount": 2,
  "sources": [],
  "context": "updated project context"
}
```

## Model Usage by Endpoint

- `POST /api/projects`: `mistral-large-latest` (question generation)
- `POST /api/projects/[id]/answers`: `mistral-large-latest` (summary + setup)
- `POST /api/projects/[id]/confirm`:
  - `mistral-small-latest` (tick0, graph, speaker profiles)
- `POST /api/projects/[id]/step`:
  - `mistral-small-latest` (tick orchestration + per-agent planning + exec advice)
- `POST /api/projects/[id]/report`: `mistral-small-latest`
- `POST /api/projects/[id]/sources/url`: `mistral-small-latest`

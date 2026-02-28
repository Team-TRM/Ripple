# Simulation Dashboard & Tick Engine

## Context

After the user confirms the review page, the simulation starts. Currently the running state just shows a summary. We need a full interactive dashboard with a force-directed graph, live events feed, health metrics, timeline with decision points, and a reworked tick engine that does influence propagation, decay, and trigger detection.

## Architecture: Dual Database

- **Postgres (Prisma)** — projects, ticks, messages, questions, health scores, decisions (relational data)
- **Neo4j** — graph nodes, edges, state snapshots (graph data, traversals, influence propagation)
- **Frontend** — react-force-graph-2d for rendering (Neo4j Browser for dev/debug only)

### Neo4j Setup
- Docker: `neo4j:5-community` image, ports 7474 (browser) + 7687 (bolt)
- Driver: `neo4j-driver` package, singleton pattern in `src/lib/db/neo4j.ts`
- Env: `NEO4J_URI=neo4j://localhost:7687`, `NEO4J_USER=neo4j`, `NEO4J_PASSWORD=ripple`

## Visual Style: Plague Inc. Inspired

Dark, atmospheric UI with a sense of urgency. Key visual cues from Plague Inc.:

- **Color palette**: Pure black background (#000), deep red (#DC2626) for crisis spread, amber (#F59E0B) for warnings, muted grays for UI chrome. No bright blues — this is a crisis, not a dashboard.
- **Nodes**: Red/orange pulsing circles. Size = activation. Brighter = more active. Dim gray when calm. Expanding red ring animation when a node crosses threshold (like infection spreading).
- **Event feed**: "BREAKING NEWS" style notifications with red left border, slide in from left with urgency feel. News ticker aesthetic.
- **Health score**: Large number top-center, red when low, styled like Plague Inc.'s infection counter. Trend arrow showing direction.
- **Metrics sidebar**: Vertical bar meters (not horizontal), reminiscent of Plague Inc.'s DNA/severity meters. Red fill, dark background.
- **Timeline**: Dark bar at bottom with small red dots. Current position glows. Decision diamonds pulse amber.
- **Typography**: Monospace for numbers/stats (like a command center). Clean sans-serif for labels.
- **Background**: Subtle dark grid pattern or faint network lines behind the graph, like a war room display.
- **Animations**: Slow pulse on active nodes, ripple effect on state changes, smooth particle flow along edges when influence propagates.

## Dashboard Layout

```
+---------------------------------------------------+
| TopBar: Project Name  |  Health: 72  | Play/Pause  |
+--------+----------------------------+-------------+
|        |                            |  Overall: 72|
| Live   |   Force-Directed Graph     |  Sentiment  |
| Events |   (react-force-graph-2d)   |  Media Heat |
| Feed   |   Nodes = actors/cohorts   |  Reg. Press |
|        |   Size = activation        |  Stability  |
|        |   Color = type             |  Fraud Risk |
|        |                            |  ---------- |
|        |                            |  Legend     |
+--------+----------------------------+--+-------+--+
| Timeline (days) with decision dots    | [+][-] |
+----------------------------------------+---------+
```

## Schema Changes

### Prisma (Postgres) — `prisma/schema.prisma`

**New models:**

**HealthScore** — overall + sub-scores per tick
- id, tickId (unique), overall (0-100), publicSentiment, mediaHeat, regulatoryPressure, internalStability, fraudRisk
- Relation: tick

**DecisionPoint** — human-in-the-loop prompts
- id, projectId, tickId, prompt, options (Json), chosenOption?, userEvent?
- Relations: project, tick

**Modify existing:**

**Tick** — replace `tickNumber` with `dayNumber` + `tickIndex` + `subTickIndex`
- Remove tickNumber
- Add dayNumber (Int), tickIndex (Int, default 0), subTickIndex (Int, default 0)
- tickIndex: 0=morning, 1=afternoon, 2=evening
- subTickIndex: 0=generate, 1=observe, 2=update
- Add relations: healthScore?, decisions[]
- @@unique([projectId, dayNumber, tickIndex, subTickIndex])

**Project** — add currentDay (Int, default 0), isPaused (Boolean, default true), decisions[]

### Neo4j (Graph DB) — Cypher schema

**Node label: `:Actor`** — simulation actor nodes
```
Properties: nodeId (cuid), projectId, cohortId?, label, type, color,
            sentiment (-1 to 1), activation (0-1), trustInCompany (0-1),
            dominantNarrative?, behaviours (JSON string)
```

**Relationship: `[:INFLUENCES]`** — weighted influence edges
```
Properties: weight (0-1), type (influence/trust/information)
```

**Node label: `:StateSnapshot`** — per-actor state at each tick
```
Properties: snapshotId, tickId, dayNumber, tickIndex,
            sentiment, activation, trustInCompany,
            dominantNarrative?, behaviours?
Connected: (Actor)-[:HAS_SNAPSHOT]->(StateSnapshot)
```

## New AI Functions

### `src/lib/ai/generate-graph.ts`
Called during confirm. LLM generates initial graph structure from cohorts + context:
- Nodes: one per cohort + additional environment nodes (Media Ecosystem, Regulatory Body, Company Leadership)
- Edges: who influences whom, with weights
- Initial state values: sentiment, activation, trustInCompany
- Initial health scores

### `src/lib/ai/generate-enhanced-tick.ts`
Replaces current fixed 1/1/3/1 message pattern. Returns:
- Messages with `reach` (0-1) and `sentiment` (-1 to 1) — variable count and types including "forum" and "secondary"
- Per-cohort updates: sentimentDelta, activationDelta, trustDelta (bounded +/-0.15)
- Optional decisionPrompt: { prompt, options[] }
- Optional secondaryEvents: viral_spike, misinformation_wave, scam_wave, whistleblower_leak

## Tick Engine (`src/lib/simulation/`)

### Tick Structure: 3 ticks x 3 sub-ticks per day = 9 steps/day

Each day has 3 **ticks** (time periods), each tick has 3 **sub-ticks** (phases):

| Tick (tickIndex) | Period | Sub-tick 0: Generate | Sub-tick 1: Observe | Sub-tick 2: Update |
|------------------|--------|---------------------|--------------------|--------------------|
| 0 | **Morning** | LLM generates overnight news, early reports, breaking stories | Route info to nodes by channel prefs + attention | Apply sentiment/activation deltas, propagate influence |
| 1 | **Afternoon** | LLM generates social media reactions, influencer posts, forum threads | Route social content to socially-connected nodes | Propagate influence, check triggers (viral spike, misinfo) |
| 2 | **Evening** | LLM generates official responses, evening news wrap, analysis | Route official content through trust-based channels | Propagate, apply decay/fatigue, recalculate health, check decision points |

**Auto-pause** happens after the evening update sub-tick (dayNumber=X, tickIndex=2, subTickIndex=2). Play mode auto-advances through all 9 steps, pausing between days.

**LLM calls**: 3 per day (one per tick's generate phase). Observe + update phases are deterministic (no LLM).

### `tick-engine.ts` — orchestrator
Per tick (each sub-tick):
1. Load current state (nodes, edges, last snapshots, health scores)
2. Call enhanced LLM generation for this phase (generate sub-ticks only)
3. Run deterministic propagation (observe + update sub-ticks)
4. If tickIndex < 2: check triggers only (spawn secondary events)
5. If tickIndex === 2: apply decay/fatigue + recalculate health scores + check decision points
6. Store everything in DB (tick, messages, snapshots, health, decisions)

### `propagation.ts` — deterministic functions using Neo4j Cypher

**Influence propagation** — runs as a Cypher query:
```cypher
MATCH (target:Actor {projectId: $projectId})<-[r:INFLUENCES]-(source:Actor)
WHERE source.activation > 0.2
WITH target,
     sum(source.sentiment * r.weight * source.activation) / sum(r.weight) as influencedSentiment,
     sum(source.activation * r.weight) / sum(r.weight) as influencedActivation
SET target.sentiment = target.sentiment + CLAMP(influencedSentiment - target.sentiment, -0.15, 0.15),
    target.activation = target.activation + CLAMP(influencedActivation - target.activation, -0.1, 0.1)
```

**Decay** — Cypher query:
```cypher
MATCH (n:Actor {projectId: $projectId})
SET n.activation = n.activation * 0.9
```

**Trigger detection** — query for threshold breaches:
```cypher
MATCH (n:Actor {projectId: $projectId})
WHERE n.activation > 0.85
RETURN n.label, n.type, n.activation
```

**Health score calculation** — aggregate from Neo4j node states:
- publicSentiment: avg sentiment of type=public nodes -> 0-100
- mediaHeat: media node activation x 100
- regulatoryPressure: regulator node activation x 100
- internalStability: employee trust x 100
- fraudRisk: from fraud-related narrative weights
- overall: weighted average (0.3 pub + 0.25 media + 0.2 reg + 0.15 internal + 0.1 fraud)

### `neo4j-graph.ts` — Neo4j CRUD helpers
- `createProjectGraph(projectId, nodes, edges)` — bulk create Actor nodes + INFLUENCES relationships
- `getProjectGraph(projectId)` — returns all nodes + edges for dashboard rendering
- `updateNodeStates(projectId, updates[])` — batch update sentiment/activation/trust
- `saveStateSnapshots(projectId, tickId)` — copy current Actor state into StateSnapshot nodes
- `propagateInfluence(projectId)` — run Cypher propagation query
- `applyDecay(projectId)` — run Cypher decay query
- `getNodesByThreshold(projectId, field, threshold)` — for trigger detection
- `deleteProjectGraph(projectId)` — cleanup on project delete

## API Changes

### Modify: `POST /api/projects/[id]/confirm`
After generating tick 0, also call `generateGraph()` -> store Actor nodes + INFLUENCES edges + initial StateSnapshots + initial HealthScore in Neo4j.

### Rewrite: `POST /api/projects/[id]/step`
- Accept body: `{ decision?: string, userEvent?: string }`
- If pending decision not answered, reject
- Call `runTick()` from tick engine
- Return full tick result (graph state, health, messages, decision prompt if any)

### New: `POST /api/projects/[id]/decide`
Submit decision choice + optional user event text. Stores decision, optionally inserts timeline event.

### New: `GET /api/projects/[id]/graph`
Returns full current graph state for initial dashboard load (nodes with latest snapshots, edges, health scores).

## Dashboard Components (all under `src/components/simulation/`)

| Component | Purpose |
|-----------|---------|
| `SimulationDashboard.tsx` | Main container, CSS grid layout, data fetching, play/pause interval |
| `SimulationContext.tsx` | React context + useReducer for all dashboard state |
| `GraphVisualization.tsx` | react-force-graph-2d, dynamic node sizing/coloring, click -> detail |
| `LiveEventsSidebar.tsx` | Left panel, scrollable event cards with slide-in animation |
| `TimelineBar.tsx` | Bottom bar, day dots, decision diamonds, current position |
| `MetricsSidebar.tsx` | Right panel, health bars 0-100%, node type legend |
| `TopBar.tsx` | Project name, overall health, play/pause + account placeholder |
| `NodeDetailDialog.tsx` | Click node -> modal with sentiment/activation/trust/narrative |
| `DecisionDialog.tsx` | Auto-pause modal, option buttons + custom event textarea |
| `ZoomControls.tsx` | Bottom-right +/- buttons, controls ForceGraph zoom via ref |

### Graph visual details (Plague Inc. style)
- **Black canvas background** with faint grid lines
- Node radius proportional to activation (12px-50px)
- Node base color by type, intensity shifts red as sentiment goes negative:
  - public: `#DC2626` (red)
  - government: `#7C3AED` (purple)
  - media: `#F59E0B` (amber)
  - employees: `#059669` (emerald)
  - company: `#6366F1` (indigo)
  - influencer: `#EC4899` (pink)
- Activation > 0.7: expanding red ring animation
- Activation > 0.85: pulsing glow + particle burst
- Edges: thin dark red lines, opacity proportional to weight
- Node opacity: full when active, dims to 30% when calm

### Play/Pause flow
- Play -> sequentially calls `/step` for each of the 9 sub-ticks per day
- Order: morning-gen -> morning-observe -> morning-update -> afternoon-gen -> ... -> evening-update
- ~1.5s delay between sub-ticks for visual pacing
- Generate sub-ticks call LLM, observe/update sub-ticks are fast deterministic
- After evening-update: auto-pause
- If decisionPrompt in response: force pause + show DecisionDialog
- User submits decision -> calls `/decide` -> resumes

## Files Summary

**New (18):**
1. `src/lib/db/neo4j.ts` — Neo4j driver singleton
2. `src/lib/ai/generate-graph.ts` — LLM generates initial graph structure
3. `src/lib/ai/generate-enhanced-tick.ts` — enhanced tick with deltas
4. `src/lib/simulation/tick-engine.ts` — tick orchestrator
5. `src/lib/simulation/propagation.ts` — deterministic propagation/decay/triggers
6. `src/lib/simulation/neo4j-graph.ts` — Neo4j CRUD helpers
7. `src/app/api/projects/[id]/decide/route.ts` — decision submission
8. `src/app/api/projects/[id]/graph/route.ts` — GET graph state for dashboard
9. `src/components/simulation/SimulationDashboard.tsx` — main container
10. `src/components/simulation/SimulationContext.tsx` — React context + reducer
11. `src/components/simulation/GraphVisualization.tsx` — react-force-graph-2d
12. `src/components/simulation/LiveEventsSidebar.tsx` — left panel
13. `src/components/simulation/TimelineBar.tsx` — bottom timeline
14. `src/components/simulation/MetricsSidebar.tsx` — right panel
15. `src/components/simulation/TopBar.tsx` — top bar
16. `src/components/simulation/NodeDetailDialog.tsx` — node click dialog
17. `src/components/simulation/DecisionDialog.tsx` — decision modal
18. `src/components/simulation/ZoomControls.tsx` — zoom buttons

**Modify (8):**
1. `prisma/schema.prisma` — add HealthScore, DecisionPoint models; modify Tick, Project
2. `docker-compose.yml` — add Neo4j service
3. `package.json` — add `neo4j-driver`, `react-force-graph-2d`
4. `.env` / `.env.example` — add NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD
5. `src/lib/ai/schemas.ts` — new Zod schemas
6. `src/app/api/projects/[id]/step/route.ts` — rewrite with tick engine
7. `src/app/api/projects/[id]/confirm/route.ts` — add graph generation into Neo4j
8. `src/app/project/[id]/page.tsx` — render dashboard in running mode

# Simulation Engine

The simulation engine is the core of Ripple. It orchestrates tick progression, LLM content generation, graph mutations, health scoring, and decision points.

## Engine Components

```
┌─────────────────────────────────────────────┐
│              tick-engine.ts                  │
│  runTick() → generateAndStoreTick()         │
│         │                                    │
│         ├→ context-builder.ts (build prompt) │
│         ├→ tick-orchestrator.ts (LLM call)   │
│         ├→ graph-engine.ts (mutations)       │
│         ├→ health-calculator.ts (scoring)    │
│         └→ generate-advice.ts (decisions)    │
└─────────────────────────────────────────────┘
```

## Tick Engine (`src/lib/simulation/engine/tick-engine.ts`)

### `runTick(projectId, decision?, userEvent?, fromDay?, fromTickIndex?)`

Entry point for advancing the simulation by one tick. Returns a `TickResult` with graph state, health scores, messages, and optional decision prompt.

**Flow:**

1. **Determine next position** — calculates the next `{ dayNumber, tickIndex }` from either explicit cursor or last stored tick
2. **Call `generateAndStoreTick()`** — does all the work
3. **Update project cursor** — sets `project.currentDay`

### `generateAndStoreTick(projectId, dayNumber, tickIndex, decision?, userEvent?)`

The main orchestration function (~300 lines). Executes in this order:

**Phase 1: Load Context**
- Fetch project with cohorts
- Get current graph state (nodes + edges)
- Get speaker profiles and population stats
- Get last health scores from most recent tick
- Get previous cohort summaries (for narrative continuity)
- Get recent messages (last 5, for speaker memory)
- Get last user decision (for context)

**Phase 2: Build LLM Input**
- Crisis context + cohort descriptions + sensitivity tags
- Previous cohort states (mood, sentiment, activation per cohort)
- Timeline events for current day
- Speaker profiles with recent posts (memory)
- Current health scores
- Breaking developments (evening ticks: high-impact messages from today)
- User-injected crises from database

**Phase 3: LLM Generation**
- Call `generateEnhancedTick()` → returns messages, cohort updates, health deltas, optional decision prompt, optional new nodes

**Phase 4: Graph Mutations**
- Call `processTickUpdates()` with LLM cohort deltas
- Returns updated nodes + edges

**Phase 5: Health Scoring**
- Calculate health from node states via `calculateHealthScoresFromNodes()`
- Apply LLM health deltas (bounded, additive)
- Clamp all scores to [0, 100]

**Phase 6: Database Storage**
- Create 3 sub-tick records (generate=0, observe=1, update=2) in single transaction
- Store messages on generate sub-tick
- Store cohort summaries on observe sub-tick
- Store health scores on update sub-tick
- Save graph snapshot on generate sub-tick (for rerun branching)

**Phase 7: Decision Generation (Evening Only)**
- If LLM produced a decision prompt (tickIndex === 2)
- Call `generateExecutiveAdvice()` → 4 C-suite recommendations
- Create `DecisionPoint` record with prompt, options, and recommendations

**Phase 8: Population Stats**
- Recalculate active speakers and sentiment trends from node states

## Graph Engine (`src/lib/simulation/engine/graph-engine.ts`)

### `processTickUpdates(projectId, cohortUpdates, cohorts, existingEdges?)`

The atomic graph mutation pipeline. Loads graph once, applies all mutations in-memory, writes once.

**Phase 0: Add New Nodes**
- If LLM suggested new stakeholder nodes (rare), add them to the graph
- Connect with initial edges

**Phase 1: Apply Cohort Deltas**
- Match LLM cohort updates to graph nodes by `cohortId`
- Apply sentiment delta (bounded ±0.25, clamped to [-1, 1])
- Apply activation delta (bounded ±0.25, clamped to [0, 1])
- Apply trust delta (bounded ±0.25, clamped to [0, 1])
- Update dominant narrative and behaviours

**Phase 2: Influence Propagation**
- For each edge in the graph:
  - If source node activation > 0.2 (active enough to influence)
  - Calculate sentiment pull: `(source.sentiment - target.sentiment) × weight × 0.1`
  - Calculate activation pull: `(source.activation - target.activation) × weight × 0.05`
  - Apply bounded deltas (±0.15 sentiment, ±0.1 activation)

**Phase 3: Activation Decay**
- All nodes: `activation *= 0.97` (3% decay per tick)
- Over 14 days (42 ticks): ~25% total decay
- Prevents permanent high-activation states

**Phase 4: Write to DB**
- Single `prisma.project.update()` with final nodes + edges

### `saveStateSnapshots(projectId, tickId)`

Saves current graph state (`{ nodes, edges }`) to `tick.graphSnapshot`. Called every tick from the tick engine. Enables rerun branching.

### `restoreGraphFromSnapshot(projectId, tickId)`

Reads `tick.graphSnapshot` and writes it back to `project.graphNodes` / `project.graphEdges`. Used when branching from a decision point.

### `calculateHealthScoresFromNodes(nodes)`

Derives health metrics from node states. See [Architecture > Health Score Derivation](./architecture.md#health-score-derivation) for the full formula.

## Influence Propagation (`src/lib/agents/cohorts/influence/propagation.ts`)

Alternative propagation implementation used by the agent system:

### `applyInfluencePropagation(nodes, edges)`

Single-pass influence along edges. Only active nodes (activation > 0.2) propagate. Weighted sum of incoming influences with bounded deltas.

### `applyActivationDecay(nodes, decayFactor = 0.97)`

Applies multiplicative decay to all node activations.

## Health Calculator (`src/lib/simulation/health/health-calculator.ts`)

### `calculateHealthScoresFromNodes(nodes)`

Pure function that derives 7 health metrics from node array. Groups nodes by type, calculates averages, applies weights for overall score. All scores clamped [0, 100].

## Tick Result Shape

```typescript
type TickResult = {
  dayNumber: number
  tickIndex: number
  nodes: GraphNode[]
  edges: GraphEdge[]
  healthScores: HealthScores
  messages: Array<{
    id: string
    type: string
    author: string
    content: string
    parentId?: string
    reach: number
    sentiment: number
  }>
  decisionPrompt?: {
    prompt: string
    options: string[]
  }
  executiveRecommendations?: ExecutiveRecommendation[]
  populationStats?: CohortAgentState[]
  newNodes?: Array<{ label: string; type: string; cohortId?: string }>
}
```

## Key Invariants

| Property | Range | Bounded Per-Tick |
|----------|-------|-----------------|
| Node sentiment | [-1, 1] | ±0.25 from LLM, ±0.15 from propagation |
| Node activation | [0, 1] | ±0.25 from LLM, ±0.1 from propagation, ×0.97 decay |
| Node trust | [0, 1] | ±0.25 from LLM |
| Edge weight | [0, 1] | Immutable after creation |
| Health scores | [0, 100] | LLM deltas additive, clamped |
| Messages per tick | 4-8 | LLM generated, Zod validated |

# Simulation Engine

The simulation engine advances Ripple one tick at a time, combining structured LLM generation with deterministic graph mutation and health scoring.

## Engine Modules

- `src/lib/simulation/engine/tick-engine.ts`
- `src/lib/simulation/engine/graph-engine.ts`
- `src/lib/simulation/health/health-calculator.ts`
- `src/lib/agents/orchestrator/tick-orchestrator.ts`
- `src/lib/agents/orchestrator/autonomous-agent-loop.ts`
- `src/lib/agents/tools/simulation-tools.ts`

## Tick Model

- 3 ticks per simulation day:
  - `tickIndex=0` Morning
  - `tickIndex=1` Afternoon
  - `tickIndex=2` Evening
- Each tick is persisted with sub-ticks:
  - `subTickIndex=0` generate
  - `subTickIndex=1` observe
  - `subTickIndex=2` update

## `runTick()` Lifecycle

`runTick(projectId, decision?, userEvent?, fromDay?, fromTickIndex?)`

1. Resolve next `{ dayNumber, tickIndex }`.
2. Call `generateAndStoreTick(...)`.
3. Update project cursor (`currentDay`).
4. Return tick payload (messages, graph, health, decisions, agent actions).

## `generateAndStoreTick()` Pipeline

### Phase 1: Load Context

- Project, cohorts, last tick summaries/messages.
- Current graph (`nodes`, `edges`).
- Speaker profiles and speaker memory.
- Prior population stats.
- Latest stored health scores.
- Most recent resolved decision context.
- Evening-only breaking developments and injected events.

### Phase 2: Stochastic Orchestration

- Build `tickInput` and run `generateEnhancedTick(...)` **3 times in parallel**.
- Average cohort and health deltas across runs.
- Keep per-run overall range for confidence band (`overallMin`, `overallMax`).

### Phase 3: Independent Agent Planning + Tool Execution

- Select top active/connected nodes.
- Run per-node planner calls in parallel (`planAgentAction`).
- Execute deterministic tools (`executeAgentPlan`).
- Merge tool-driven node/health deltas and generated action messages.

### Phase 4: Graph Mutation

- Send merged cohort/node updates to `processTickUpdates(...)`.
- Apply bounded deltas to matching nodes.
- Apply influence propagation over edges.
- Apply activation decay.
- Persist updated graph in one write.
- Project updated node dynamics into cohort micro-agent swarms for population-level behavior continuity.

### Phase 5: Health Computation and Blending

Health is computed from component semantics:

- `publicSentiment` from public node sentiment.
- `mediaHeat` from media activation.
- `regulatoryPressure` from government/regulator activation.
- `internalStability` from employee trust.
- `fraudRisk` from distrust x activation in public/influencer nodes.
- `publicAwareness` from media/public activation blend.

Then:
- apply averaged LLM deltas + tool deltas
- blend delta-driven overall with derived overall
- step-limit overall changes per tick to avoid unrealistic jumps
- clamp all values to `[0,100]`

### Phase 6: Persistence

- Create generate tick with messages/summaries.
- Create observe/update sub-ticks.
- Upsert `HealthScore` on update tick.
- Save graph snapshot for rerun branching.

### Phase 7: Decision + Executive Advice (Evening)

If evening tick returns a decision prompt:
- generate 4 executive recommendations
- create `DecisionPoint` record
- pause until user submits `chosenOption`

### Phase 8: Population Stats Refresh

- Recompute active speaker stats from node state.
- Persist to `project.populationStats`.

## Graph Engine Details

`processTickUpdates(projectId, cohortUpdates, newNodes?)`

1. Optional new-node insertion (if narratively justified).
2. Apply node updates with strict bounds:
   - sentiment delta: `[-0.25, +0.25]`
   - activation delta: `[-0.25, +0.25]`
   - trust delta: `[-0.25, +0.25]`
3. Influence propagation across edges (`weight`-scaled).
4. Activation decay (`0.97` multiplier).
5. Persist graph once.

## Key Invariants

- Node sentiment is always in `[-1, 1]`.
- Activation and trust are always in `[0, 1]`.
- Health metrics are always in `[0, 100]`.
- Decision prompts are evening-only.
- Tick uniqueness is enforced by `(projectId, dayNumber, tickIndex, subTickIndex)`.

## Runtime Guarantees for Demo Stability

- Autonomous agent loop is additive and bounded.
- If autonomous planning fails/timeout occurs, engine falls back safely and continues.
- Tick writes are idempotency-aware (duplicate guard on unique key).
- Snapshot-based rerun avoids replay drift and keeps branching deterministic.

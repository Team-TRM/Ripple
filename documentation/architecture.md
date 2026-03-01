# System Architecture

## High-Level View

Ripple is a full-stack crisis time machine where LLMs propose narrative and behavioral changes, and a deterministic engine applies bounded state transitions over a stakeholder influence graph.

```text
UI (Next.js + React)
  - Setup workflow
  - Live simulation dashboard
  - Decision + report overlays

API layer (Route Handlers)
  - /projects lifecycle
  - /step runtime progression
  - /decide /report /rerun
  - /sources/url external grounding tool

Simulation core
  - Tick engine
  - Autonomous agent loop
  - Graph engine (influence + decay)
  - Health engine
  - Report generator

Persistence + model layer
  - PostgreSQL via Prisma
  - Mistral model calls (structured JSON IO)
```

## Core Design Principles

### 1) Controlled Hybrid Intelligence

- LLM output is treated as proposals.
- Deterministic code enforces bounds, clamps, and state invariants.
- This keeps behavior expressive without letting raw model output corrupt state.

### 2) Agentic Runtime, Not Just One Prompt

Per tick, Ripple runs:
- one orchestration generation pass (`generateEnhancedTick`)
- three stochastic parallel runs for robustness (then averaged)
- independent planner calls for top active nodes
- deterministic tool execution for each selected agent plan
- swarm projection where each cohort/actor node represents many individual micro-agents

### 3) Single Read-Modify-Write Graph Mutation

`processTickUpdates()` loads graph state once, applies all node updates and propagation in memory, then writes back once. This avoids partial writes and keeps each tick atomic.

### 4) Persisted Memory + Replayability

- Message history is persisted and used as speaker memory context.
- `graphSnapshot` is stored each tick for branch reruns.
- Rerun restores graph at a decision point, removes future branch data, and continues from that branch.

### 5) Human-in-the-Loop by Design

- Decision prompts are generated for evening ticks.
- Simulation pauses for explicit user choice.
- User can inject events during runtime.

## Runtime Flow

```text
Create project
  -> clarifying questions
  -> setup generation (summary + cohorts + timeline)
  -> confirm build (tick0 + graph + speakers + population)

Loop while running:
  -> /step
    -> build tick context from DB + memory
    -> 3x orchestrator stochastic runs
    -> autonomous top-node plan->tool execution
    -> merge deltas/messages
    -> mutate graph (bounded)
    -> compute/blend health
    -> persist tick + messages + health + snapshot
    -> optional decision prompt + executive advice

Complete:
  -> /report post-mortem
  -> optional /rerun branch from decision point
```

## Subsystems

### Frontend

- `SimulationContext` + reducer is the state backbone.
- Play loop decouples fetch from message drain for a live feed feel.
- Force graph keeps position stability and smooth activation interpolation.
- Zoom-level swarm rendering exposes individual micro-agent behavior within each cohort node.

### API

- Thin orchestration routes with explicit lifecycle stages.
- SSE streaming in `/confirm` for build-progress feedback.
- Runtime endpoints return full tick payloads with graph and health updates.

### Simulation Engine

- Tick progression with day/tick cursor logic.
- Context-aware generation using recent messages, prior decisions, and health.
- Autonomous agent layer with tool logs and bounded effects.

### Persistence

- Relational entities: projects, cohorts, events, ticks, messages, decisions.
- JSON fields for graph, speaker profiles, population, prior reports.
- Cascade deletion keeps lifecycle cleanup simple for hackathon iteration speed.

## Health Semantics

All health metrics are 0-100, but polarity differs:

- Higher is good: `overall`, `publicSentiment`, `internalStability`
- Higher is bad: `mediaHeat`, `regulatoryPressure`, `fraudRisk`
- Context metric: `publicAwareness` (exposure velocity)

Overall health is derived from weighted component semantics and blended with model-driven deltas, then step-limited to prevent unrealistic jumps.

## Why This Maps Well to Judging Criteria

- Technicality: modular architecture, bounded engine, persistent state, independent agent loops.
- Creativity: crisis "time machine" with social/institutional cascade modeling.
- Usefulness: direct decision support for comms, legal, ops, and leadership workflows.
- Demo strength: clear lifecycle from setup to live run to actionable report/rerun.

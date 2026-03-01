# Ripple - Crisis Time Machine

Ripple is a crisis time machine for war-room decision making.

When a company is in a PR nightmare (for example: a major data breach), leadership teams need to answer one question fast: what happens after the next decision? Ripple simulates that future before it becomes reality.

Given a scenario, Ripple builds a structured world model (stakeholders, timeline, influence graph), runs the simulation tick-by-tick, pauses for leadership decisions, and produces a post-mortem with mitigations and rerun strategies.

## Why This Is Technically Strong

- Multi-agent runtime, not one-shot prompting:
  - per-tick orchestrator generation
  - independent per-actor planning loop for top active nodes
  - deterministic tool execution with bounded deltas
- Memory and continuity:
  - speaker memory from persisted historical messages
  - graph snapshots per tick for branch-and-rerun from prior decisions
- Hybrid simulation model:
  - LLMs generate narrative proposals
  - deterministic graph and health engine governs state transitions
- Stochastic robustness:
  - 3 parallel tick generations per step
  - averaged deltas with confidence band (`overallMin`, `overallMax`)
- Swarm-scale social modeling:
  - each cohort/actor node represents a population of individual micro-agents
  - micro-agents carry distinct activation/sentiment weights and roll up to node state
  - zoomed swarm visualization exposes population-level dynamics in the UI
- Human-in-the-loop control:
  - end-of-day decision gating
  - event injection during runtime
  - rerun with adjusted decisions

## Core Product Flow

1. Create simulation from a crisis description.
2. Ripple asks targeted clarifying questions.
3. Setup is generated (summary, cohorts, timeline) and can be edited.
4. Confirm starts runtime build (initial tick, graph, speakers, population stats).
5. Simulation runs in Morning/Afternoon/Evening ticks.
6. Leadership decisions are requested on evening ticks.
7. End report explains outcomes, turning points, and recommendations.
8. Rerun from a prior decision branch to compare outcomes.

## Product Narrative

Every company eventually faces a crisis: a breach, failed launch, or government inquiry.  
What determines the outcome is rarely the first incident, but the next leadership decision under uncertainty.

Ripple gives teams a war-room simulation environment to test those decisions first. It models how public sentiment, media behavior, regulators, investors, employees, and leadership dynamics can interact and cascade across time before the decision is made in the real world.

## Architecture Snapshot

```text
Next.js Frontend (React + App Router)
  -> Route Handlers (/api/projects/*)
    -> Simulation Engine
       - Tick Engine (orchestration)
       - Autonomous Agent Loop (plan -> tool -> execute)
       - Graph Engine (influence propagation + decay)
       - Health Engine (derived + bounded blended scoring)
       - Report Generator
    -> PostgreSQL (Prisma)
    -> Mistral API (large for setup, small for runtime)
```

## Multi-Agent Topology

```text
┌─────────────────────────────────────────────────┐
│                  Orchestrator                   │
│             tick-orchestrator.ts                │
│    Coordinates all agent layers per tick        │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Speaker  │  │ Cohort   │  │ Executive    │  │
│  │ Agents   │  │ Agents   │  │ Agents       │  │
│  │ (15-25)  │  │ (4+)     │  │ (4)          │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│                                                 │
│  Swarm Layer: each cohort node aggregates many  │
│  individual micro-agents with distinct states.  │
└─────────────────────────────────────────────────┘
```

## Stack

- Next.js 16, React 19, TypeScript
- PostgreSQL + Prisma ORM
- Mistral AI (`mistral-large-latest`, `mistral-small-latest`)
- `react-force-graph-2d`
- Tailwind CSS
- Zod output schemas for structured LLM IO

## Quick Start

### 1) Configure environment

```bash
cp .env.example .env
```

Set:

```bash
MISTRAL_API_KEY=your_key_here
DATABASE_URL=postgresql://...
```

### 2) Start database

```bash
docker compose up -d
```

### 3) Install dependencies

```bash
npm install
```

### 4) Sync schema

```bash
npx prisma db push
```

### 5) Run app

```bash
npm run dev
```

App: `http://localhost:3000`

## Key Capabilities

- Graph-based stakeholder dynamics with influence edges.
- Autonomous actor tool actions each tick (`publish_message`, `amplify_signal`, etc.).
- Independent agent planning per active actor each tick.
- Smooth node growth/shrink driven by activation and timeline progression.
- Zoomed micro-agent swarm view for selected nodes.
- Parallel stochastic simulation per tick with averaged outcomes.
- URL grounding tool that ingests external article context into simulation state.
- Executive advisory layer for decision prompts.
- End-of-simulation report and rerun branching.

## Context Enrichment (RAG Grounding)

Ripple supports simulation grounding from internal and external context so world-building is more accurate and decision-relevant:

- connect company data stores (structured operational context)
- ingest external URLs/news sources (live external signals)
- attach documents and reports (policy, incident, and operational evidence)

These sources are used as RAG-style context to enrich agent reasoning, stakeholder modeling, and scenario calibration.

## Documentation

- [System Architecture](documentation/architecture.md)
- [Simulation Engine](documentation/simulation-engine.md)
- [Agent System](documentation/agent-system.md)
- [API Reference](documentation/api-reference.md)
- [Frontend Architecture](documentation/frontend.md)
- [Database Schema](documentation/database-schema.md)
- [Mistral Integration](documentation/mistral-ai-docs.md)

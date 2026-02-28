# System Architecture

## High-Level Overview

Ripple is a perception-driven crisis simulation platform. It models how a corporate crisis unfolds across media, public, and institutional actors using AI-powered graph-based influence propagation. A human player acts as the CEO, making strategic decisions at key moments while the simulation generates realistic media content, social reactions, and stakeholder dynamics.

```
┌─────────────────────────────────────────────────────────────┐
│                     Next.js Frontend                        │
│  SimulationDashboard ← SimulationContext (useReducer)       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────┐  │
│  │ Force    │ │ Live     │ │ Metrics  │ │ Decision /    │  │
│  │ Graph    │ │ Events   │ │ Sidebar  │ │ Report Dialog │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────┘  │
└───────────────────────┬─────────────────────────────────────┘
                        │ REST API (Next.js Route Handlers)
┌───────────────────────▼─────────────────────────────────────┐
│                    API Layer                                 │
│  /projects  /step  /decide  /confirm  /report  /rerun       │
└───────────────────────┬─────────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────────┐
│               Simulation Engine                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ Tick Engine  │  │ Graph Engine │  │ Health Calculator │  │
│  │ (orchestrate)│  │ (mutations)  │  │ (scoring)        │  │
│  └──────┬───────┘  └──────────────┘  └──────────────────┘  │
│         │                                                    │
│  ┌──────▼───────────────────────────────────────────────┐   │
│  │              Multi-Agent System                       │   │
│  │  ┌────────────┐ ┌───────────┐ ┌──────────────────┐  │   │
│  │  │ Speakers   │ │ Cohorts   │ │ Executives       │  │   │
│  │  │ (15-25     │ │ (4 groups │ │ (CTO, PR, Legal, │  │   │
│  │  │ named ppl) │ │ influence)│ │  Operations)     │  │   │
│  │  └────────────┘ └───────────┘ └──────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────────┘
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
┌──────────────┐ ┌────────────┐ ┌──────────────┐
│  Mistral AI  │ │ PostgreSQL │ │ Prisma ORM   │
│  (LLM calls) │ │ (all data) │ │ (type-safe)  │
└──────────────┘ └────────────┘ └──────────────┘
```

## Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 16, React 19, TypeScript | Full-stack web app with App Router |
| Database | PostgreSQL | All relational data, graph state as JSON |
| ORM | Prisma | Type-safe database access, migrations |
| AI | Mistral AI (small + large models) | Content generation, analysis, decisions |
| Graph Viz | react-force-graph-2d | Canvas-based force-directed graph |
| Styling | Tailwind CSS | Dark theme, Plague Inc. aesthetic |
| Validation | Zod | LLM output validation with resilient parsing |

## Core Design Principles

### 1. LLM Generates Content, Engine Controls State

The LLM produces narrative content (messages, cohort summaries, decision prompts) but never directly mutates simulation state. All state changes flow through the deterministic graph engine, which bounds deltas and enforces invariants.

### 2. Single Read-Modify-Write for Graph

`processTickUpdates()` loads the entire graph once, applies all mutations in-memory (cohort deltas → influence propagation → activation decay), then writes once. This prevents partial updates and race conditions.

### 3. Non-Blocking Fetch + Staggered Display

Tick fetches don't block the UI. Messages drain independently from background LLM calls, giving a real-time news feed feel. User events abort in-flight fetches and retry immediately.

### 4. Snapshot-Based Branching

Each tick stores a `graphSnapshot` (full graph state at that moment). Reruns restore from snapshot rather than replaying — enabling "what-if" scenarios without massive computation.

### 5. Gradual Health Dynamics

Health scores drop 1-2 per tick by default. Critical escalations trigger -3 to -5 (rare). Good decisions reward +3 to +8. This prevents runaway collapse and makes decisions impactful.

## Data Flow

```
User Creates Project
    ↓
POST /api/projects → generateQuestions() [LLM]
    ↓
User Answers Questions
    ↓
POST /api/projects/[id]/answers
    ├→ generateSummary() [LLM]
    └→ generateSetup() [LLM] → Cohorts + TimelineEvents
    ↓
User Confirms Setup
    ↓
POST /api/projects/[id]/confirm (SSE stream)
    ├→ generateTick() → Tick 0 + Messages
    ├→ generateGraph() [LLM] → Influence graph
    ├→ generateSpeakerProfiles() [LLM] → 15-25 named speakers
    └→ initializePopulationStats()
    ↓
Simulation Running (Play Loop)
    ↓
┌→ POST /api/projects/[id]/step
│   ├→ generateEnhancedTick() [LLM] → messages, deltas, decisions
│   ├→ processTickUpdates() → graph mutations
│   ├→ Store Tick + Messages + Health + Snapshots
│   └→ If evening: generateExecutiveAdvice() [LLM]
│
├→ User injects crisis → abort + retry with event
├→ User makes decision → POST /api/projects/[id]/decide
└→ Repeat until simulationDays reached
    ↓
POST /api/projects/[id]/report → generateSimulationReport() [LLM]
    ↓
Optional: POST /api/projects/[id]/rerun → Branch from decision point
```

## Tick Structure

Each simulation day has 3 ticks (time periods), each tick has 3 sub-ticks (processing phases):

| Tick (tickIndex) | Period | Sub-tick 0: Generate | Sub-tick 1: Observe | Sub-tick 2: Update |
|------------------|--------|---------------------|--------------------|--------------------|
| 0 | Morning | LLM generates overnight news, early reports | Route info to nodes by channel prefs | Apply deltas, propagate influence |
| 1 | Afternoon | LLM generates social media reactions, influencer posts | Route social content to connected nodes | Propagate influence, check triggers |
| 2 | Evening | LLM generates official responses, analysis | Route official content through trust channels | Propagate, decay, recalculate health, decision points |

- **3 LLM calls per day** (one per tick's generate phase)
- **Auto-pause** after evening update — user reviews and proceeds
- **Decision points** only appear in evening ticks
- **Crisis injections** are loaded for evening decision context

## Graph Model

The influence graph is stored as JSON on the Project model (not in a separate graph database):

**Nodes** represent stakeholder groups and environment actors:
- Types: `public`, `government`, `media`, `employees`, `company`, `influencer`, `regulator`
- Properties: `sentiment` (-1 to 1), `activation` (0 to 1), `trustInCompany` (0 to 1)

**Edges** represent influence relationships:
- Properties: `weight` (0 to 1), `type` (influence | trust | information)
- Influence flows along edges: active nodes shift connected nodes' sentiment

**Mutations per tick:**
1. Apply LLM cohort deltas to matching nodes (bounded ±0.25)
2. Propagate influence along edges (active nodes > 0.2 activation)
3. Apply activation decay (×0.97 per tick ≈ 25% over 14 days)

## Health Score Derivation

Health scores are derived from node states, not set arbitrarily:

| Metric | Source | Calculation |
|--------|--------|-------------|
| Public Sentiment | Public nodes avg sentiment | Mapped to 0-100 |
| Media Heat | Media nodes avg activation | × 100 |
| Regulatory Pressure | Regulator/govt nodes avg activation | × 100 |
| Internal Stability | Employee nodes avg trust | × 100 |
| Fraud Risk | Public/influencer (1 - trust) × activation | × 100 |
| Public Awareness | Media heat (60%) + public activation (40%) | Blend |
| Overall | Weighted composite | 0.3×sentiment + 0.25×(100-media) + 0.2×(100-reg) + 0.15×stability + 0.1×(100-fraud) |

## File Organization

```
src/
├── app/                          # Next.js App Router
│   ├── api/projects/             # REST API routes
│   ├── project/[id]/page.tsx     # Simulation view
│   └── page.tsx                  # Dashboard home
├── lib/
│   ├── ai/                       # Mistral client + Zod schemas
│   ├── agents/                   # Multi-agent system
│   │   ├── core/                 # Agent types + registry
│   │   ├── orchestrator/         # Tick generation (LLM)
│   │   ├── speakers/             # Named individual agents
│   │   ├── executives/           # C-suite advisory agents
│   │   └── cohorts/              # Cohort dynamics + influence
│   ├── simulation/
│   │   ├── engine/               # Tick engine + graph engine
│   │   └── health/               # Health score calculator
│   ├── analysis/                 # Post-simulation report
│   ├── setup/                    # Project setup pipeline
│   └── db/                       # Prisma client singleton
└── components/
    ├── simulation/               # Dashboard components
    └── project/                  # Project management UI
```

# Ripple — Crisis Simulator

Perception-driven crisis simulation platform. Simulate how a corporate crisis unfolds across media, public, and institutional actors using AI-powered graph-based influence propagation. Play as the CEO — make strategic decisions at key moments and see how your choices ripple through stakeholder networks.

## Prerequisites

- Node.js 18+
- Docker & Docker Compose
- Mistral AI API key

## Setup

### 1. Environment variables

```bash
cp .env.example .env
```

Edit `.env` and add your Mistral API key:

```
MISTRAL_API_KEY=your_key_here
```

### 2. Start database

```bash
docker compose up -d
```

This starts PostgreSQL on port 5432.

### 3. Install dependencies

```bash
npm install
```

### 4. Run database migrations

```bash
npx prisma db push
```

### 5. Start the dev server

```bash
npm run dev
```

App runs at http://localhost:3000

## Architecture

```
Frontend (React 19 + Next.js 16)
    ↕ REST API (Route Handlers)
Simulation Engine
    ├── Tick Engine (orchestration)
    ├── Graph Engine (influence propagation)
    ├── Multi-Agent System
    │   ├── 15-25 Speaker Agents (named individuals)
    │   ├── 4 Cohort Agents (stakeholder groups)
    │   └── 4 Executive Agents (C-suite advisors)
    └── Health Calculator (7-dimension scoring)
    ↕
Mistral AI (content generation + analysis)
    ↕
PostgreSQL + Prisma ORM (all state)
```

### Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Framework | Next.js 16, React 19, TypeScript | Full-stack App Router |
| Database | PostgreSQL + Prisma | All data including graph state as JSON |
| AI | Mistral AI (small + large models) | Content generation, analysis, decisions |
| Graph | react-force-graph-2d | Force-directed influence graph visualization |
| Styling | Tailwind CSS | Dark theme, Plague Inc. aesthetic |
| Validation | Zod | LLM output validation with resilient parsing |

### Simulation Model

Each day has 3 ticks (morning, afternoon, evening) with 3 processing phases each. The LLM generates media content and stakeholder reactions, then the deterministic graph engine propagates influence along edges, applies activation decay, and recalculates health scores. Decision points appear in evening ticks with recommendations from 4 C-suite executives.

### Key Features

- **Graph-based influence propagation** — stakeholder sentiment spreads along weighted edges
- **Multi-agent speaker system** — 15-25 named individuals with memory and personality consistency
- **Autonomous actor loop** — top active nodes independently plan and execute tool actions each tick
- **Executive advisory board** — CTO, PR, Legal, and Operations give context-specific recommendations
- **Crisis injection** — inject breaking crises mid-simulation and watch them propagate
- **Rerun from decision point** — branch from any decision, make a different choice, compare outcomes (grade comparison: "D → B")
- **7-dimension health scoring** — public sentiment, media heat, regulatory pressure, internal stability, fraud risk, public awareness, overall

## Documentation

Detailed documentation is in the [`documentation/`](documentation/) folder:

| Document | Description |
|----------|-------------|
| [Architecture](documentation/architecture.md) | System overview, data flow, design principles |
| [Simulation Engine](documentation/simulation-engine.md) | Tick engine, graph engine, propagation, health scoring |
| [API Reference](documentation/api-reference.md) | All REST endpoints with request/response shapes |
| [Agent System](documentation/agent-system.md) | Speaker, cohort, and executive agent architecture |
| [Frontend](documentation/frontend.md) | Dashboard components, state management, play loop |
| [Database Schema](documentation/database-schema.md) | All Prisma models, JSON column schemas, indexes |
| [Mistral AI Reference](documentation/mistral-ai-docs.md) | SDK usage, model selection, API parameters |

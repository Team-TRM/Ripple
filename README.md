# Ripple — Crisis Simulator

Perception-driven crisis simulation platform. Simulate how a crisis unfolds across media, public, and institutional actors using AI-powered graph-based modeling.

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

### 2. Start databases

```bash
docker compose up -d
```

This starts:
- **Postgres** on port 5432 (relational data)
- **Neo4j** on port 7687 (graph data), browser at http://localhost:7474

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

- **Next.js 16** — App Router, React 19, TypeScript
- **Prisma + Postgres** — projects, ticks, messages, health scores
- **Neo4j** — graph nodes, edges, influence propagation
- **Mistral AI** — crisis analysis, content generation, tick simulation
- **react-force-graph-2d** — graph visualization (Plague Inc. style)
- **Tailwind CSS** — styling

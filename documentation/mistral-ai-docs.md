# Mistral Integration in Ripple

This document describes how Ripple uses Mistral models in production paths.

## Model Allocation Strategy

Ripple uses two model tiers:

- `mistral-large-latest` for setup quality and schema-rich world building.
- `mistral-small-latest` (fine-tuned variant in Ripple pipeline) for high-frequency runtime generation and tool planning.

This keeps setup quality high while controlling tick-time latency.

## Where Each Model Is Used

### `mistral-large-latest`

- `src/lib/setup/generate-questions.ts`
  - 1-3 targeted clarifying questions + forced timeline question.
- `src/lib/setup/generate-summary.ts`
  - factual setup summary.
- `src/lib/setup/generate-setup.ts`
  - project name, cohorts, timeline extraction.

### `mistral-small-latest`

- `src/lib/setup/generate-graph.ts`
  - initial influence graph + initial health.
- `src/lib/agents/orchestrator/initial-tick.ts`
  - tick 0 content.
- `src/lib/agents/orchestrator/tick-orchestrator.ts`
  - per-tick content + cohort updates + health deltas + decision prompt.
- `src/lib/agents/orchestrator/agent-planner.ts`
  - per-actor plan selection for autonomous loop.
- `src/lib/agents/executives/advisory/generate-advice.ts`
  - executive recommendations.
- `src/lib/analysis/generate-report.ts`
  - post-simulation report synthesis.
- `src/lib/sources/url-source-tool.ts`
  - structured external source extraction.

## Structured Output Discipline

Ripple relies heavily on JSON-mode generation and schema validation:

- `responseFormat: { type: 'json_object' }`
- Zod schemas in `src/lib/ai/schemas.ts`
- strict parse + clamp logic in runtime layers

Benefits:
- predictable payload shapes
- safer state transitions
- easier debugging and replayability

## Runtime Guardrails

- Retry logic in orchestrator when malformed JSON appears.
- Numeric bounds applied by schema and deterministic engine.
- Tool execution is deterministic even when plan text is model-generated.
- Planner timeouts fallback safely to baseline pipeline.

## Stochastic Ensemble Pattern

At each runtime tick, Ripple calls `generateEnhancedTick(...)` three times in parallel, then:
- averages deltas for stable progression
- tracks per-run overall range
- surfaces confidence band in UI (`overallMin`, `overallMax`)

This gives variance-awareness without requiring full multi-run simulation replay during the demo loop.

## SDK Usage

Client singleton:

- `src/lib/ai/client.ts`

```ts
import { Mistral } from '@mistralai/mistralai'

export const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY ?? '',
})
```

Typical call shape:

```ts
const result = await mistral.chat.complete({
  model: 'mistral-small-latest',
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userPrompt },
  ],
  responseFormat: { type: 'json_object' },
  temperature: 0.4,
})
```

## Prompting Patterns Used

- strong system prompts with explicit schemas
- directional metric semantics (what increases/decreases health)
- tick-specific behavior constraints (morning/afternoon/evening)
- narrative continuity via recent messages and memory blocks
- decision-gating rules (evening-only prompts)

## Fine-Tuned Runtime Behavior Model

Ripple uses a fine-tuned Mistral Small runtime behavior model to improve per-agent response realism in crisis contexts.

Training signal composition:
- social-media style reaction corpora for authentic short-form stakeholder voice
- synthetic simulation traces for edge cases, policy constraints, and decision sensitivity

Practical impact in Ripple:
- stronger consistency of swarm member reactions within each cohort
- better role-faithful outputs for public, media, regulator, employee, investor, and leadership actors
- improved stability of tool-selection behavior in autonomous planning loops

## External Source Grounding

URL ingestion pipeline:
1. validate URL and block internal/private hosts
2. fetch + text extraction
3. summarize to structured facts with Mistral
4. append to project context in tagged blocks

This provides RAG-like grounding within the simulation context window, with low integration overhead.

## Extension Points

Natural next upgrades (already compatible with architecture):
- retrieval over dedicated vector store for larger corpora
- selective model routing by scenario complexity
- fine-tuned domain model for specific crisis verticals

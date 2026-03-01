# Multi-Agent System

Ripple uses a layered multi-agent architecture designed for realistic stakeholder dynamics while preserving runtime stability.

## Agent Layers

```text
Tick Orchestrator (scenario-level generation)
  +
Autonomous Actor Loop (independent top-node planning)
  +
Deterministic Tool Executor (bounded effects)
  +
Executive Advisory Layer (decision-time recommendations)
```

## 1) Tick Orchestrator

File: `src/lib/agents/orchestrator/tick-orchestrator.ts`

Responsibilities:
- Generate per-tick media and social content.
- Produce cohort updates (narrative + deltas).
- Propose health deltas.
- Produce evening decision prompts.

Inputs include:
- crisis context
- day/tick period
- previous cohort states
- recent messages
- latest health scores
- last decision text
- optional user-injected event
- speaker profiles + memory
- optional external source grounded context (embedded in project context)

Output is schema-validated JSON (`EnhancedTickResponseSchema`).

## 2) Autonomous Actor Loop

Files:
- `src/lib/agents/orchestrator/autonomous-agent-loop.ts`
- `src/lib/agents/orchestrator/agent-planner.ts`
- `src/lib/agents/tools/simulation-tools.ts`

Each tick:
1. Select top active/connected nodes.
2. Plan one action per selected node (parallel planner calls).
3. Execute chosen tool deterministically.
4. Merge bounded impacts into simulation state.

This is the core independent planning path that elevates runtime from a single monolithic prompt to explicit per-actor execution loops.

## Planner Contract

Planner output (`AgentPlanSchema`):
- `agentNodeId`
- `goal`
- `tool`
- `args` (`intensity`, optional target/narrative)
- `confidence`

Planner model: `mistral-small-latest` in JSON mode.

## Toolset

Implemented tools:
- `publish_message`
- `amplify_signal`
- `deescalate_narrative`
- `trigger_regulatory_attention`
- `stabilize_internal_comms`

Each tool returns:
- node deltas (sentiment/activation/trust)
- health deltas
- a live-event message
- structured action log for UI (`Agent Actions (This Tick)`)

All tool effects are bounded and clamped to keep simulation numerically stable.

## 3) Speaker Agents + Memory

Files:
- `src/lib/agents/speakers/profiles/generate-profiles.ts`
- `src/lib/agents/speakers/memory/recall.ts`

Runtime behavior:
- 15-25 speaker profiles generated at setup.
- Tick generation uses speaker personas and recent speaker posts.
- Message history is persisted and reloaded, enabling continuity in voice and stance.

## 4) Executive Agents

Files:
- `src/lib/agents/executives/roles/role-definitions.ts`
- `src/lib/agents/executives/advisory/generate-advice.ts`

At decision points, Ripple generates four role-specific recommendations:
- CTO
- Head of PR
- Legal Counsel
- Head of Operations

These recommendations provide tradeoff visibility before the user commits a decision.

## 5) Cohort and Population Dynamics

Files:
- `src/lib/agents/cohorts/population/population-dynamics.ts`
- `src/lib/agents/cohorts/influence/propagation.ts`

- Population stats track active voices per cohort and trend direction.
- Influence and decay create cascading reactions across stakeholder groups.
- UI renders macro node behavior and zoomed micro-agent swarm visualization.

## Operational Safety

- Schema-validated LLM outputs (Zod).
- Tool-level numeric bounds.
- Timeout-safe planning with graceful fallback.
- Deterministic state mutation pipeline in graph engine.

## What This Means for Demo Narrative

You can credibly show and explain:
- independent actor planning each tick
- explicit action tools and bounded execution
- persistent memory continuity
- leadership decision impact on downstream dynamics

# Frontend Architecture

Ripple frontend is a Next.js App Router application centered around a full-screen simulation dashboard.

## Routes

- `src/app/page.tsx`
  - project list
  - create simulation modal
- `src/app/project/[id]/page.tsx`
  - setup review/edit experience (`status=ready`)
  - simulation dashboard overlay (`status=running`)

## Setup Experience (Ready State)

`project/[id]/page.tsx` provides:
- editable summary
- editable audience cohorts
- editable projected timeline
- simulation duration slider (`min=3`, default `7`, max `60` days)
- context source panel:
  - connected database state card
  - document upload surface
  - URL ingestion tool wired to `/api/projects/[id]/sources/url`

Setup confirmation uses SSE progress updates from `/confirm`.

## Dashboard Composition

`src/components/simulation/SimulationDashboard.tsx`

Layout:
- `TopBar`
- `LiveEventsSidebar` (left)
- `GraphVisualization` + `NodeDetailDialog` (center)
- `MetricsSidebar` (right)
- `TimelineBar` (bottom)
- overlays: `DecisionDialog`, `SimulationReport`

## State Architecture

`SimulationContext.tsx` uses a single reducer-based state container.

Primary state domains:
- playback: day/tick/subtick, playing/paused
- graph: nodes, edges
- health scores
- messages/live feed
- decision prompt + executive recommendations
- population stats
- autonomous `agentActions`
- report/rerun state (`previousReport`, `rerunFromDay`)

This keeps UI surfaces synchronized without cross-component drift.

## Play Loop Design

`SimulationDashboard.tsx` implements an async loop with three key decouplings:

1. Tick fetch is non-blocking.
2. Messages are drained from a queue with staggered timing.
3. Decision prompts are deferred until queue drain completes.

Operational refs used for stability:
- `fetchPositionRef` (server tick cursor)
- `positionRef` (rendered tick cursor)
- `pendingEventsRef` (event injections surviving aborted fetches)
- `pendingDecisionRef` (decision gating)
- `abortRef` (cancellable in-flight step)

Result: smooth live-feed feel, immediate event injection interrupts, and deterministic pause-at-decision behavior.

## Graph Rendering

`GraphVisualization.tsx` (`react-force-graph-2d`)

Implemented behavior:
- stable node positions via `nodeMap` persistence
- force reheat only on topology change
- activation interpolation (`ACTIVATION_LERP`) for smooth size transitions
- continuous canvas refresh with `requestAnimationFrame`
- pulse/glow effects for high activation
- highlighted rings for nodes with active tool actions

Zoom behavior:
- zoom threshold unlocks synthetic micro-agent swarm view
- selected nodes render full swarm; non-selected render capped swarm
- swarm count is state-derived from cohort population/activation

This supports a macro-to-micro visual story in demo without changing backend graph schema.

## Timeline and Events UX

- `TimelineBar.tsx` renders day grid + progress marker.
- `LiveEventsSidebar.tsx` shows timestamped event cards, sentiment indicators, and upcoming timeline events.
- `agent_action` events are intentionally hidden from the main live feed and represented in Metrics sidebar under `Agent Actions (This Tick)`.

## Metrics and Health UX

`MetricsSidebar.tsx` includes:
- overall score with delta indicator
- confidence band when ensemble range is available
- per-metric bars:
  - public awareness
  - public sentiment
  - media heat
  - regulatory pressure
  - internal stability
  - fraud risk
- population activity trends
- node type legend

## Decision and Report UX

- `DecisionDialog.tsx` pauses runtime and requests explicit user decision.
- includes four executive recommendations and free-form override input.
- decision submission resumes simulation.

`SimulationReport.tsx` provides:
- grade + executive summary
- key moments
- decision analysis
- recommendations + root cause
- `Rerun with adjustments` flow
- branch comparison via stored previous report

## Home and Create Modal

- `CreateProjectModal.tsx` drives conversational setup intake.
- includes microphone icon placeholder for future STT/TTS mode.
- answers are submitted as question-id keyed map.

## Styling

- Tailwind-based dark atmospheric visual language.
- strong contrast for event severity and health shifts.
- UI supports desktop demo walkthrough with clear information hierarchy.

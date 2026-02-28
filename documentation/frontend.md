# Frontend Architecture

The frontend is a Next.js 16 App Router application with React 19. The simulation dashboard is the primary interface — a dark, atmospheric UI inspired by Plague Inc.

## Page Structure

```
src/app/
├── page.tsx                    # Dashboard home — project list + create modal
├── layout.tsx                  # Root layout with dark theme
└── project/[id]/page.tsx       # Simulation view — fetches project, renders dashboard
```

- **Home page** shows a grid of project cards with status badges
- **Project page** loads the full project and renders `SimulationDashboard` when status is `"running"`

## Dashboard Layout

```
+───────────────────────────────────────────────────────────+
│ TopBar: Project Name  │ Day X Morning/Afternoon/Evening   │
│                       │ Play/Pause  │  ⏩ Speed            │
+────────+──────────────────────────────────────+───────────+
│        │                                      │ Overall   │
│ Live   │    Force-Directed Graph              │ Sentiment │
│ Events │    (react-force-graph-2d)            │ Media     │
│ Feed   │    Nodes = stakeholder groups        │ Regulatory│
│        │    Size = activation                 │ Stability │
│        │    Color = type + sentiment          │ Fraud     │
│        │                                      │ Awareness │
│        │                                      │ --------- │
│        │                                      │ Legend    │
+────────+──────────────────────────────────────+───────────+
│ Timeline (day selector with health trend)     │ Zoom +/-  │
+───────────────────────────────────────────────+───────────+
```

## State Management (`SimulationContext.tsx`)

All dashboard state flows through a single React Context + `useReducer` pattern.

### State Shape

```typescript
interface SimState {
  // Identity
  projectId: string
  projectName: string
  simulationDays: number

  // Position
  currentDay: number
  currentTickIndex: number
  subTickIndex: number

  // Playback
  isPlaying: boolean
  isPaused: boolean

  // Graph
  nodes: GraphNode[]
  edges: GraphEdge[]

  // Metrics
  healthScores: HealthScores

  // Content
  messages: Message[]              // 50-item rolling buffer
  timelineEvents: TimelineEvent[]

  // Interaction
  selectedNodeId: string | null
  showDecisionDialog: boolean
  decisionPrompt: { prompt: string; options: string[] } | null
  executiveRecommendations: ExecutiveRecommendation[] | null

  // Agent state
  populationStats: CohortAgentState[] | null

  // UI state
  isGenerating: boolean
  eventInputOpen: boolean
  pendingUserEvent: string | null

  // Report
  showReport: boolean
  reportData: SimulationReportData | null
  isLoadingReport: boolean

  // Rerun
  previousReport: SimulationReportData | null
  rerunFromDay: number | null
  isRerunning: boolean
}
```

### Key Actions

| Action | Purpose |
|--------|---------|
| `SET_GRAPH` | Update nodes + edges |
| `SET_HEALTH` | Update health scores |
| `ADD_MESSAGES` | Append to rolling 50-message buffer |
| `ADVANCE_TICK` | Increment day/tick counters |
| `SHOW_DECISION` | Display decision dialog with prompt + recommendations |
| `UPDATE_NODES` | Partial node updates (preserves positions) |
| `START_RERUN` | Save report, dismiss dialog, set branching state |
| `RERUN_READY` | Restore graph/health from branch point |
| `CLEAR_RERUN` | Reset rerun state |

### Context Hooks

```typescript
useSimulation()          // Read state
useSimulationDispatch()  // Get dispatch function
```

## Play Loop (`SimulationDashboard.tsx`)

The play loop is the most complex piece of frontend logic. It manages non-blocking fetches, staggered message display, user interrupts, and decision gating.

### Architecture

```
┌─────────────────────────────────────────────┐
│ Play Loop (async while loop)                │
│                                             │
│  ┌─────────┐    ┌──────────┐               │
│  │ stepOnce│───→│ API /step │               │
│  │ (fetch) │    │ (LLM)    │               │
│  └────┬────┘    └──────────┘               │
│       │                                     │
│       ▼                                     │
│  ┌──────────┐   ┌───────────────┐          │
│  │ Update   │   │ Push messages │          │
│  │ graph +  │   │ to queue      │          │
│  │ health   │   └──────┬────────┘          │
│  └──────────┘          │                    │
│                        ▼                    │
│  ┌──────────────────────────────┐          │
│  │ Message Drain (independent)  │          │
│  │ 800-1500ms per message       │          │
│  │ Shows decision after drain   │          │
│  └──────────────────────────────┘          │
│                                             │
│  ┌──────────────────────────────┐          │
│  │ Interruptible Sleep          │          │
│  │ Wakes on user event / pause  │          │
│  └──────────────────────────────┘          │
└─────────────────────────────────────────────┘
```

### Key Refs

| Ref | Purpose |
|-----|---------|
| `playingRef` | Current play state (independent of React renders) |
| `fetchPositionRef` | Server-side tick position (where next `/step` starts from) |
| `positionRef` | UI display position (follows message drain) |
| `messageQueueRef` | Messages awaiting staggered display |
| `pendingEventsRef` | Accumulated user events (survives fetch aborts) |
| `pendingDecisionRef` | Decision deferred until message queue drains |
| `abortRef` | AbortController for in-flight fetch |

### Flow Details

1. **`stepOnce()`**: Non-blocking fetch to `/step`. Updates graph + health immediately. Pushes messages to queue. Defers decision display until queue drains.

2. **Message drain**: Independent timer. Pops messages from queue one-by-one with 800-1500ms delays. When queue empties and a pending decision exists, shows the decision dialog.

3. **User event handling**: User types crisis text → stored in `pendingEventsRef` → next `stepOnce()` sends it as `userEvent` parameter. If a fetch is in-flight, it's aborted and retried with the event.

4. **Interruptible sleep**: Custom `interruptibleSleep()` that resolves early if user pauses, injects an event, or simulation ends. Prevents blocking on `setTimeout`.

5. **Rerun support**: When `rerunFromDay` changes, resets `fetchPositionRef` to `{ day: branchDay, tickIndex: 2 }`, clears message queue, and the play loop resumes from the branch point.

## Components

### `GraphVisualization.tsx`

Canvas-based force-directed graph using `react-force-graph-2d`.

**Node rendering:**
- Size: `12 + activation × 24` pixels
- Color by type: public=red, media=amber, regulator=purple, employees=emerald, company=indigo, influencer=pink
- Border: green (positive sentiment), red (negative), gray (neutral)
- Pulse animation: activation > 0.6 gets an expanding ring
- Labels: hidden until activation > 0.35 or node is selected

**Edge rendering:**
- Width: `0.5 + weight × 2`
- Opacity: `0.1 + weight × 0.3`
- Directed arrowheads sized by weight

**Stability:**
- `nodeMap` ref preserves x/y positions across data updates
- D3 forces configured once on first render
- Animation at 50ms intervals (not requestAnimationFrame)

### `LiveEventsSidebar.tsx`

Left panel — scrollable feed of simulation messages.

- Messages displayed with author, type badge, content, and sentiment coloring
- Auto-scrolls to latest message
- Red left border for negative sentiment, green for positive
- "BREAKING" badge for high-reach messages

### `MetricsSidebar.tsx`

Right panel — health score gauges.

- 7 health metrics displayed as vertical bar gauges (0-100%)
- Color coding: green > 60, amber 30-60, red < 30
- Overall score prominently displayed
- Trend arrows showing direction of change
- Node type legend at bottom

### `TopBar.tsx`

- Project name
- Current time display: "Day X — Morning/Afternoon/Evening"
- Play/Pause button with keyboard shortcut (Space)
- Speed control

### `TimelineBar.tsx`

Bottom bar — day selector.

- Clickable day dots
- Health trend sparkline across days
- Current position highlighted
- Decision diamonds at decision days

### `DecisionDialog.tsx`

Modal overlay when a decision point triggers.

- Decision prompt text
- Option buttons (click to select)
- Executive recommendations panel (4 C-suite advisors)
- Custom event injection textarea
- Submit button sends to `/decide`

### `SimulationReport.tsx`

Full-screen report overlay at simulation end.

**Sections:**
- Grade (A-F) with color coding
- Executive summary + headline
- Health score dashboard (start → end with deltas)
- Key moments timeline
- Decision analysis cards with effectiveness ratings
- What went well / wrong lists
- Root cause analysis
- Prioritized recommendations

**Rerun features:**
- "Rerun from here" button on each decision card
- Sub-dialog showing original prompt + options
- Grade comparison header when `previousReport` exists (e.g., "D → B")
- Toggle between original and new report

### `NodeDetailDialog.tsx`

Popup when clicking a graph node.

- Node label and type
- Sentiment gauge (-1 to 1)
- Activation gauge (0 to 1)
- Trust in company gauge (0 to 1)
- Dominant narrative text
- Current behaviours

### `ZoomControls.tsx`

Bottom-right floating buttons for graph zoom (+/-). Controls `ForceGraph` zoom level via ref.

## Visual Style

Dark atmospheric UI inspired by Plague Inc.:
- Pure black background (#000)
- Deep red (#DC2626) for crisis spread
- Amber (#F59E0B) for warnings
- Muted grays for UI chrome
- Monospace font for numbers/stats
- Subtle grid pattern behind graph
- Slide-in animations for messages ("BREAKING NEWS" feel)

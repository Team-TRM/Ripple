'use client'

import { useCallback, useRef, useEffect, useState, useMemo } from 'react'
import dynamic from 'next/dynamic'
import { useSimulation, useSimulationDispatch } from './SimulationContext'

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false })

const NODE_COLORS: Record<string, string> = {
  public: '#DC2626',
  government: '#7C3AED',
  media: '#F59E0B',
  employees: '#059669',
  company: '#6366F1',
  influencer: '#EC4899',
  regulator: '#7C3AED',
}

const TYPE_LABELS: Record<string, string> = {
  public: 'PUB',
  government: 'GOV',
  media: 'MED',
  employees: 'EMP',
  company: 'CO',
  influencer: 'INF',
  regulator: 'REG',
}

const BASE_NODE_RADIUS = 12
const NODE_RADIUS_RANGE = 24
const ACTIVATION_LERP = 0.14
const SWARM_ZOOM_THRESHOLD = 1.22
const SWARM_MAX_AGENTS = 120
const UNSELECTED_SWARM_CAP = 40

type SwarmAgent = {
  id: string
  angle: number
  orbit: number
  phase: number
  sizeSeed: number
  activityBias: number
  sentimentBias: number
  displayWeight: number
}

type RenderGraphNode = {
  id: string
  label: string
  type: string
  color: string
  sentiment: number
  activation: number
  targetActivation: number
  displayActivation: number
  trustInCompany: number
  x?: number
  y?: number
}

type RenderGraphData = {
  nodes: RenderGraphNode[]
  links: { source: string; target: string; weight: number }[]
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

function withAlpha(hexColor: string, alpha: number): string {
  if (/^#[0-9A-Fa-f]{6}$/.test(hexColor)) {
    return `${hexColor}${Math.round(clamp(alpha, 0, 1) * 255).toString(16).padStart(2, '0')}`
  }
  return `rgba(255,255,255,${clamp(alpha, 0, 1)})`
}

function seededUnit(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return Math.abs(h % 10000) / 10000
}

export default function GraphVisualization() {
  const { nodes, edges, selectedNodeId, populationStats, agentActions } = useSimulation()
  const dispatch = useSimulationDispatch()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const containerRef = useRef<HTMLDivElement>(null)
  // Animation clock for pulse effects
  const tickRef = useRef(0)
  const zoomLevelRef = useRef(1)
  const topologyRef = useRef({ nodeCount: 0, edgeCount: 0 })
  // Stable node map — preserves x/y positions across updates
  const nodeMapRef = useRef<Map<string, RenderGraphNode>>(new Map())
  const swarmMapRef = useRef<Map<string, SwarmAgent[]>>(new Map())
  const [graphData, setGraphData] = useState<RenderGraphData>({ nodes: [], links: [] })
  const activeActionNodeIds = useMemo(
    () => new Set(agentActions.map((a) => a.agentNodeId)),
    [agentActions]
  )

  useEffect(() => {
    let rafId = 0
    const animate = () => {
      tickRef.current += 1
      graphRef.current?.refresh?.()
      rafId = requestAnimationFrame(animate)
    }
    rafId = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId)
  }, [])

  // Configure forces only once
  const forcesConfigured = useRef(false)
  useEffect(() => {
    if (!graphRef.current || forcesConfigured.current) return
    if (nodes.length === 0) return
    forcesConfigured.current = true
    const fg = graphRef.current
    if (fg.d3Force) {
      fg.d3Force('charge')?.strength(-380)?.distanceMax(520)
      fg.d3Force('link')?.distance(170)
      fg.d3Force('center')?.strength(0.02)
    }
  }, [nodes])

  // Let layout settle briefly on topology changes, then pin node positions to avoid jitter.
  useEffect(() => {
    if (!graphRef.current || nodes.length === 0) return

    const nodeCount = nodes.length
    const edgeCount = edges.length
    const topologyChanged =
      topologyRef.current.nodeCount !== nodeCount ||
      topologyRef.current.edgeCount !== edgeCount

    topologyRef.current = { nodeCount, edgeCount }
    if (!topologyChanged) return

    const fg = graphRef.current
    const data = fg.graphData?.()
    if (data?.nodes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const n of data.nodes as any[]) {
        n.fx = undefined
        n.fy = undefined
      }
    }

    fg.d3ReheatSimulation?.()

    const timer = window.setTimeout(() => {
      const latest = fg.graphData?.()
      if (!latest?.nodes) return
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const n of latest.nodes as any[]) {
        if (typeof n.x === 'number' && typeof n.y === 'number') {
          n.fx = n.x
          n.fy = n.y
        }
      }
    }, 900)

    return () => window.clearTimeout(timer)
  }, [nodes.length, edges.length])

  // Zoom to fit on initial load
  const hasZoomed = useRef(false)
  useEffect(() => {
    if (nodes.length > 0 && !hasZoomed.current && graphRef.current) {
      hasZoomed.current = true
      setTimeout(() => {
        graphRef.current?.zoomToFit(400, 80)
      }, 1200)
    }
  }, [nodes])

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // Build stable graphData — update properties in place, only add/remove nodes when needed
  useEffect(() => {
    const currentIds = new Set(nodes.map((n) => n.nodeId))
    const existingIds = new Set(nodeMapRef.current.keys())
    const populationByCohort = new Map(populationStats.map((p) => [p.cohortName, p]))

    // Update existing nodes in place (preserves x/y/vx/vy from force sim)
    for (const n of nodes) {
      const existing = nodeMapRef.current.get(n.nodeId)
      if (existing) {
        existing.label = n.label
        existing.type = n.type
        existing.color = NODE_COLORS[n.type] || n.color || '#6B7280'
        existing.sentiment = n.sentiment
        existing.activation = n.activation
        existing.targetActivation = n.activation
        if (!Number.isFinite(existing.displayActivation)) {
          existing.displayActivation = n.activation
        }
        existing.trustInCompany = n.trustInCompany
      } else {
        // New node — spread initial positions in a circle to avoid clustering
        const idx = nodeMapRef.current.size
        const angle = (idx / Math.max(nodes.length, 1)) * Math.PI * 2
        const seed = n.nodeId.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
        const spread = 250 + (seed % 150)
        nodeMapRef.current.set(n.nodeId, {
          id: n.nodeId,
          label: n.label,
          type: n.type,
          color: NODE_COLORS[n.type] || n.color || '#6B7280',
          sentiment: n.sentiment,
          activation: n.activation,
          targetActivation: n.activation,
          displayActivation: n.activation,
          trustInCompany: n.trustInCompany,
          x: Math.cos(angle) * spread,
          y: Math.sin(angle) * spread,
        })
      }

      // Keep a stable synthetic swarm per node for zoomed-in cohort view.
      const pop = populationByCohort.get(n.label)
      const activeRatio = pop && pop.population > 0
        ? pop.activeSpeakers / pop.population
        : n.activation
      const desiredCount = Math.round(clamp(18 + activeRatio * 96, 18, SWARM_MAX_AGENTS))
      const existingSwarm = swarmMapRef.current.get(n.nodeId) || []
      const nextSwarm: SwarmAgent[] = []
      for (let i = 0; i < desiredCount; i++) {
        const old = existingSwarm[i]
        if (old) {
          nextSwarm.push(old)
          continue
        }
        const seedBase = `${n.nodeId}-${i}`
        nextSwarm.push({
          id: seedBase,
          angle: seededUnit(`${seedBase}-angle`) * Math.PI * 2,
          orbit: seededUnit(`${seedBase}-orbit`),
          phase: seededUnit(`${seedBase}-phase`) * Math.PI * 2,
          sizeSeed: seededUnit(`${seedBase}-size`),
          activityBias: seededUnit(`${seedBase}-activity`),
          sentimentBias: seededUnit(`${seedBase}-sent`) * 2 - 1,
          displayWeight: seededUnit(`${seedBase}-weight`) * 0.6 + 0.2,
        })
      }
      swarmMapRef.current.set(n.nodeId, nextSwarm)
    }

    // Remove deleted nodes
    for (const id of existingIds) {
      if (!currentIds.has(id)) {
        nodeMapRef.current.delete(id)
        swarmMapRef.current.delete(id)
      }
    }

    setGraphData({
      nodes: Array.from(nodeMapRef.current.values()),
      links: edges.map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
      })),
    })
  }, [nodes, edges, populationStats])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
    const x = node.x || 0
    const y = node.y || 0
    const targetActivation = node.targetActivation ?? node.activation ?? 0.3
    const prevDisplayActivation = node.displayActivation ?? targetActivation
    const interpolatedActivation =
      prevDisplayActivation + (targetActivation - prevDisplayActivation) * ACTIVATION_LERP
    const activation = Math.abs(targetActivation - interpolatedActivation) < 0.001
      ? targetActivation
      : interpolatedActivation
    node.displayActivation = activation
    const sentiment = node.sentiment || 0
    const isSelected = selectedNodeId === node.id
    const color = node.color || '#6B7280'
    const isActing = activeActionNodeIds.has(node.id)

    const radius = BASE_NODE_RADIUS + activation * NODE_RADIUS_RANGE
    const t = tickRef.current

    if (isActing) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 0.12)
      ctx.beginPath()
      ctx.arc(x, y, radius + 8, 0, Math.PI * 2)
      ctx.strokeStyle = withAlpha('#22D3EE', 0.35 * pulse + 0.25)
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Pulse ring for high activation
    if (activation > 0.6) {
      const phase = ((t * 0.06 + (node.id?.charCodeAt(0) || 0)) % 60) / 60
      const ringR = radius + phase * radius
      const ringA = Math.max(0, 0.35 * (1 - phase))
      ctx.beginPath()
      ctx.arc(x, y, ringR, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(239, 68, 68, ${ringA})`
      ctx.lineWidth = 1.5
      ctx.stroke()
    }

    // Soft glow
    if (activation > 0.4) {
      const glowR = radius * 2
      const ga = 0.08 + activation * 0.12
      ctx.beginPath()
      ctx.arc(x, y, glowR, 0, Math.PI * 2)
      ctx.fillStyle = `${color}${Math.round(ga * 255).toString(16).padStart(2, '0')}`
      ctx.fill()
    }

    // Node body
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    const bodyAlpha = Math.max(0.5, 0.4 + activation * 0.6)
    ctx.fillStyle = `${color}${Math.round(bodyAlpha * 255).toString(16).padStart(2, '0')}`
    ctx.fill()

    // Sentiment border — green (positive), red (negative), gray (neutral)
    const borderColor = sentiment > 0.15 ? '#22C55E' : sentiment < -0.15 ? '#EF4444' : '#555555'
    ctx.beginPath()
    ctx.arc(x, y, radius, 0, Math.PI * 2)
    ctx.strokeStyle = borderColor
    ctx.lineWidth = isSelected ? 3 : 2
    ctx.stroke()

    // Selection dashed ring
    if (isSelected) {
      ctx.beginPath()
      ctx.arc(x, y, radius + 5, 0, Math.PI * 2)
      ctx.strokeStyle = '#ffffff55'
      ctx.lineWidth = 1
      ctx.setLineDash([3, 3])
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Zoomed-in synthetic micro-agent view for selected node.
    const zoom = zoomLevelRef.current
    const swarmProgress = clamp((zoom - SWARM_ZOOM_THRESHOLD) / 0.75, 0, 1)
    const showSwarm = swarmProgress > 0.01 && (isSelected || zoom > SWARM_ZOOM_THRESHOLD + 0.12)
    if (showSwarm) {
      const swarm = swarmMapRef.current.get(node.id) || []
      const renderMembers = isSelected ? swarm : swarm.slice(0, UNSELECTED_SWARM_CAP)
      const swirlSpeed = 0.004 + activation * 0.004
      ctx.beginPath()
      ctx.arc(x, y, radius + 10 + 18 * swarmProgress, 0, Math.PI * 2)
      ctx.strokeStyle = withAlpha(color, 0.22 + swarmProgress * 0.18)
      ctx.lineWidth = 1
      ctx.stroke()

      for (const member of renderMembers) {
        const targetWeight = clamp(
          0.15 + activation * 0.55 + member.activityBias * 0.2 + sentiment * member.sentimentBias * 0.12,
          0.05,
          1
        )
        member.displayWeight += (targetWeight - member.displayWeight) * 0.09

        const orbitBase = radius + 8 + member.orbit * (isSelected ? (22 + 52 * swarmProgress) : (12 + 26 * swarmProgress))
        const phase = member.angle + member.phase + t * swirlSpeed * (0.4 + member.activityBias)
        const sx = x + Math.cos(phase) * orbitBase
        const sy = y + Math.sin(phase) * orbitBase
        const dotSize = (0.9 + member.sizeSeed * 2.1 + member.displayWeight * 1.4) * (0.62 + swarmProgress)
        const dotAlpha = 0.28 + member.displayWeight * 0.5 * swarmProgress

        ctx.beginPath()
        ctx.arc(sx, sy, dotSize, 0, Math.PI * 2)
        ctx.fillStyle = withAlpha(color, dotAlpha)
        ctx.fill()
      }

      if (isSelected && swarm.length > 0) {
        ctx.font = '600 10px Inter, system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillStyle = 'rgba(148,163,184,0.9)'
        ctx.fillText(`${swarm.length} micro-agents`, x, y - radius - 10)
      }
    }

    // Type badge inside node
    const badge = TYPE_LABELS[node.type] || ''
    if (badge && radius > 14) {
      ctx.font = `bold ${Math.min(11, radius * 0.45)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillText(badge, x, y)
    }

    // Label below node — only show for active nodes or selected node
    if (activation > 0.35 || isSelected) {
      const labelAlpha = isSelected ? 1 : Math.min(1, (activation - 0.35) / 0.3)
      const fontSize = Math.max(9, 10 + activation * 2)
      ctx.font = `600 ${fontSize}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'top'
      const ly = y + radius + 6
      const label = node.label || ''
      const tw = ctx.measureText(label).width + 6

      // Label background pill
      ctx.fillStyle = `rgba(0,0,0,${0.75 * labelAlpha})`
      ctx.beginPath()
      const pillX = x - tw / 2
      const pillY = ly - 1
      const pillH = fontSize + 3
      const r = 3
      ctx.moveTo(pillX + r, pillY)
      ctx.lineTo(pillX + tw - r, pillY)
      ctx.arcTo(pillX + tw, pillY, pillX + tw, pillY + r, r)
      ctx.lineTo(pillX + tw, pillY + pillH - r)
      ctx.arcTo(pillX + tw, pillY + pillH, pillX + tw - r, pillY + pillH, r)
      ctx.lineTo(pillX + r, pillY + pillH)
      ctx.arcTo(pillX, pillY + pillH, pillX, pillY + pillH - r, r)
      ctx.lineTo(pillX, pillY + r)
      ctx.arcTo(pillX, pillY, pillX + r, pillY, r)
      ctx.closePath()
      ctx.fill()

      ctx.fillStyle = `rgba(255,255,255,${labelAlpha * Math.max(0.6, activation)})`
      ctx.fillText(label, x, ly)
    }
  }, [selectedNodeId, activeActionNodeIds])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodePointerAreaPaint = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const activation = node.displayActivation ?? node.targetActivation ?? node.activation ?? 0.3
    const r = BASE_NODE_RADIUS + activation * NODE_RADIUS_RANGE
    ctx.beginPath()
    ctx.arc(node.x || 0, node.y || 0, r + 6, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkCanvasObject = useCallback((link: any, ctx: CanvasRenderingContext2D) => {
    const s = link.source
    const t = link.target
    if (!s?.x || !t?.x) return

    const w = link.weight || 0.5
    const alpha = 0.1 + w * 0.3

    // Line
    ctx.beginPath()
    ctx.moveTo(s.x, s.y)
    ctx.lineTo(t.x, t.y)
    ctx.strokeStyle = `rgba(100, 40, 40, ${alpha})`
    ctx.lineWidth = 0.5 + w * 2
    ctx.stroke()

    // Arrowhead near target
    const dx = t.x - s.x
    const dy = t.y - s.y
    const len = Math.sqrt(dx * dx + dy * dy)
    if (len < 40) return

    const targetActivation = t.displayActivation ?? t.targetActivation ?? t.activation ?? 0.3
    const tRadius = BASE_NODE_RADIUS + targetActivation * NODE_RADIUS_RANGE
    const dist = tRadius + 6
    const ux = dx / len
    const uy = dy / len
    const ax = t.x - ux * dist
    const ay = t.y - uy * dist
    const angle = Math.atan2(dy, dx)
    const aSize = 4 + w * 3

    ctx.beginPath()
    ctx.moveTo(ax, ay)
    ctx.lineTo(ax - aSize * Math.cos(angle - 0.5), ay - aSize * Math.sin(angle - 0.5))
    ctx.lineTo(ax - aSize * Math.cos(angle + 0.5), ay - aSize * Math.sin(angle + 0.5))
    ctx.closePath()
    ctx.fillStyle = `rgba(100, 40, 40, ${alpha * 1.5})`
    ctx.fill()
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNodeClick = useCallback((node: any) => {
    dispatch({ type: 'SELECT_NODE', nodeId: node.id })
  }, [dispatch])

  const handleBackgroundClick = useCallback(() => {
    dispatch({ type: 'SELECT_NODE', nodeId: null })
  }, [dispatch])

  const handleZoom = useCallback((transform: { k: number }) => {
    zoomLevelRef.current = transform.k
  }, [])

  return (
    <div ref={containerRef} className="w-full h-full bg-black relative">
      {/* Grid */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />
      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{ background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%)' }}
      />

      {nodes.length > 0 ? (
        <ForceGraph2D
          ref={graphRef}
          graphData={graphData}
          nodeId="id"
          width={dimensions.width}
          height={dimensions.height}
          backgroundColor="rgba(0,0,0,0)"
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkCanvasObject={linkCanvasObject}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          onZoom={handleZoom}
          cooldownTicks={120}
          d3AlphaDecay={0.035}
          d3VelocityDecay={0.45}
          d3AlphaMin={0.001}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          minZoom={0.3}
          maxZoom={8}
          warmupTicks={0}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-gray-600 text-sm">Loading graph...</div>
        </div>
      )}

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-20 bg-black/80 backdrop-blur-sm rounded-lg px-3 py-2 border border-gray-800/50">
        <div className="text-[9px] text-gray-500 uppercase tracking-wider mb-1">Node Types</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5">
          {Object.entries(NODE_COLORS).map(([type, col]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: col }} />
              <span className="text-[10px] text-gray-400 capitalize">{type}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 pt-1 border-t border-gray-800/50 flex gap-3">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full border border-green-500" />
            <span className="text-[9px] text-gray-500">+Sent</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full border border-red-500" />
            <span className="text-[9px] text-gray-500">-Sent</span>
          </div>
        </div>
      </div>
    </div>
  )
}

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

export default function GraphVisualization() {
  const { nodes, edges, selectedNodeId } = useSimulation()
  const dispatch = useSimulationDispatch()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 })
  const containerRef = useRef<HTMLDivElement>(null)
  // Animation clock updated via setInterval (not RAF to avoid perf issues)
  const tickRef = useRef(0)
  // Stable node map — preserves x/y positions across updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeMapRef = useRef<Map<string, any>>(new Map())

  useEffect(() => {
    const id = setInterval(() => { tickRef.current++ }, 50)
    return () => clearInterval(id)
  }, [])

  // Configure forces only once
  const forcesConfigured = useRef(false)
  useEffect(() => {
    if (!graphRef.current || forcesConfigured.current) return
    if (nodes.length === 0) return
    forcesConfigured.current = true
    const fg = graphRef.current
    if (fg.d3Force) {
      fg.d3Force('charge')?.strength(-600)?.distanceMax(700)
      fg.d3Force('link')?.distance(200)
      fg.d3Force('center')?.strength(0.03)
    }
  }, [nodes])

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
  const graphData = useMemo(() => {
    const currentIds = new Set(nodes.map((n) => n.nodeId))
    const existingIds = new Set(nodeMapRef.current.keys())

    // Update existing nodes in place (preserves x/y/vx/vy from force sim)
    for (const n of nodes) {
      const existing = nodeMapRef.current.get(n.nodeId)
      if (existing) {
        existing.label = n.label
        existing.type = n.type
        existing.color = NODE_COLORS[n.type] || n.color || '#6B7280'
        existing.sentiment = n.sentiment
        existing.activation = n.activation
        existing.trustInCompany = n.trustInCompany
      } else {
        // New node — spread initial positions in a circle to avoid clustering
        const idx = nodeMapRef.current.size
        const angle = (idx / Math.max(nodes.length, 1)) * Math.PI * 2
        const spread = 250 + Math.random() * 150
        nodeMapRef.current.set(n.nodeId, {
          id: n.nodeId,
          label: n.label,
          type: n.type,
          color: NODE_COLORS[n.type] || n.color || '#6B7280',
          sentiment: n.sentiment,
          activation: n.activation,
          trustInCompany: n.trustInCompany,
          x: Math.cos(angle) * spread,
          y: Math.sin(angle) * spread,
        })
      }
    }

    // Remove deleted nodes
    for (const id of existingIds) {
      if (!currentIds.has(id)) {
        nodeMapRef.current.delete(id)
      }
    }

    return {
      nodes: Array.from(nodeMapRef.current.values()),
      links: edges.map((e) => ({
        source: e.source,
        target: e.target,
        weight: e.weight,
      })),
    }
  }, [nodes, edges])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodeCanvasObject = useCallback((node: any, ctx: CanvasRenderingContext2D) => {
    const x = node.x || 0
    const y = node.y || 0
    const activation = node.activation || 0.3
    const sentiment = node.sentiment || 0
    const isSelected = selectedNodeId === node.id
    const color = node.color || '#6B7280'

    const radius = 12 + activation * 24
    const t = tickRef.current

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
  }, [selectedNodeId])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodePointerAreaPaint = useCallback((node: any, color: string, ctx: CanvasRenderingContext2D) => {
    const r = 12 + (node.activation || 0.3) * 24
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

    const tRadius = 12 + (t.activation || 0.3) * 24
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
          cooldownTicks={200}
          d3AlphaDecay={0.015}
          d3VelocityDecay={0.25}
          d3AlphaMin={0.001}
          enableZoomInteraction={true}
          enablePanInteraction={true}
          minZoom={0.3}
          maxZoom={8}
          warmupTicks={100}
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

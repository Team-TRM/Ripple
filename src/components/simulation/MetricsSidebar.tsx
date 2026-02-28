'use client'

import { useRef, useEffect, useState } from 'react'
import { useSimulation } from './SimulationContext'

const NODE_TYPE_COLORS: Record<string, string> = {
  public: '#DC2626',
  government: '#7C3AED',
  media: '#F59E0B',
  employees: '#059669',
  company: '#6366F1',
  influencer: '#EC4899',
  regulator: '#7C3AED',
}

const NODE_TYPE_LABELS: Record<string, string> = {
  public: 'Public',
  government: 'Government',
  media: 'Media',
  employees: 'Employees',
  company: 'Company',
  influencer: 'Influencer',
  regulator: 'Regulator',
}

function MetricBar({ label, value, color, delta }: { label: string; value: number; color: string; delta: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
        <div className="flex items-center gap-1">
          <span className="text-xs font-mono text-gray-400">{value}</span>
          {delta !== 0 && (
            <span className={`text-[9px] font-mono font-semibold ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {delta > 0 ? '\u25B2' : '\u25BC'}
            </span>
          )}
        </div>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${value}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  )
}

const TREND_ICONS: Record<string, { icon: string; color: string }> = {
  improving: { icon: '▲', color: 'text-green-400' },
  stable: { icon: '—', color: 'text-gray-500' },
  declining: { icon: '▼', color: 'text-red-400' },
}

export default function MetricsSidebar() {
  const { healthScores, nodes, populationStats } = useSimulation()
  const prevScoresRef = useRef(healthScores)
  const initializedRef = useRef(false)
  const [deltas, setDeltas] = useState({
    overall: 0, publicAwareness: 0, publicSentiment: 0,
    mediaHeat: 0, regulatoryPressure: 0, internalStability: 0, fraudRisk: 0,
  })

  // Track score changes for arrows (skip initial load)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      prevScoresRef.current = healthScores
      return
    }
    const prev = prevScoresRef.current
    const d = {
      overall: healthScores.overall - prev.overall,
      publicAwareness: healthScores.publicAwareness - prev.publicAwareness,
      publicSentiment: healthScores.publicSentiment - prev.publicSentiment,
      mediaHeat: healthScores.mediaHeat - prev.mediaHeat,
      regulatoryPressure: healthScores.regulatoryPressure - prev.regulatoryPressure,
      internalStability: healthScores.internalStability - prev.internalStability,
      fraudRisk: healthScores.fraudRisk - prev.fraudRisk,
    }
    const hasChange = Object.values(d).some((v) => v !== 0)
    if (hasChange) {
      setDeltas(d)
      prevScoresRef.current = healthScores
      const t = setTimeout(() => setDeltas({
        overall: 0, publicAwareness: 0, publicSentiment: 0,
        mediaHeat: 0, regulatoryPressure: 0, internalStability: 0, fraudRisk: 0,
      }), 3000)
      return () => clearTimeout(t)
    }
  }, [healthScores])

  // Get unique node types present in the graph
  const nodeTypes = [...new Set(nodes.map((n) => n.type))]

  const totalPopulation = populationStats.reduce((sum, s) => sum + s.population, 0)
  const totalActive = populationStats.reduce((sum, s) => sum + s.activeSpeakers, 0)

  return (
    <div className="w-56 bg-black/60 border-l border-gray-800/50 flex flex-col overflow-y-auto backdrop-blur-sm">
      {/* Overall Score */}
      <div className="p-4 border-b border-gray-800/50">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Overall</div>
        <div className="flex items-center gap-1.5">
          <span
            className={`text-3xl font-bold font-mono ${
              healthScores.overall >= 60
                ? 'text-green-400'
                : healthScores.overall >= 35
                  ? 'text-yellow-400'
                  : 'text-red-400'
            }`}
          >
            {healthScores.overall}
          </span>
          <span className="text-xs text-gray-600">/100</span>
          {deltas.overall !== 0 && (
            <span className={`text-xs font-mono font-semibold ${deltas.overall > 0 ? 'text-green-400' : 'text-red-400'}`}>
              {deltas.overall > 0 ? '\u25B2' : '\u25BC'}{deltas.overall > 0 ? '+' : ''}{deltas.overall}
            </span>
          )}
        </div>
      </div>

      {/* Metric Bars */}
      <div className="p-4 space-y-3 border-b border-gray-800/50">
        <MetricBar label="Public Awareness" value={healthScores.publicAwareness} color="#F97316" delta={deltas.publicAwareness} />
        <MetricBar label="Public Sentiment" value={healthScores.publicSentiment} color="#3B82F6" delta={deltas.publicSentiment} />
        <MetricBar label="Media Heat" value={healthScores.mediaHeat} color="#F59E0B" delta={deltas.mediaHeat} />
        <MetricBar label="Regulatory Pressure" value={healthScores.regulatoryPressure} color="#7C3AED" delta={deltas.regulatoryPressure} />
        <MetricBar label="Internal Stability" value={healthScores.internalStability} color="#059669" delta={deltas.internalStability} />
        <MetricBar label="Fraud Risk" value={healthScores.fraudRisk} color="#DC2626" delta={deltas.fraudRisk} />
      </div>

      {/* Population Stats */}
      {populationStats.length > 0 && (
        <div className="p-4 border-b border-gray-800/50">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Population</div>
            <div className="text-[10px] text-gray-600 font-mono">
              {totalActive.toLocaleString()}/{totalPopulation.toLocaleString()}
            </div>
          </div>
          <div className="space-y-2">
            {populationStats.map((stat) => {
              const trend = TREND_ICONS[stat.trendDirection]
              const activePercent = stat.population > 0
                ? Math.round((stat.activeSpeakers / stat.population) * 100)
                : 0
              return (
                <div key={stat.cohortName}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-gray-400 truncate max-w-[100px]">
                      {stat.cohortName}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-gray-500">
                        {stat.activeSpeakers}
                      </span>
                      <span className={`text-[9px] ${trend.color}`}>
                        {trend.icon}
                      </span>
                    </div>
                  </div>
                  <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700 ease-out"
                      style={{
                        width: `${activePercent}%`,
                        backgroundColor: stat.aggregateSentiment > 0.2
                          ? '#059669'
                          : stat.aggregateSentiment < -0.2
                            ? '#DC2626'
                            : '#6B7280',
                      }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="p-4">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Legend</div>
        <div className="space-y-1.5">
          {nodeTypes.map((type) => (
            <div key={type} className="flex items-center gap-2">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: NODE_TYPE_COLORS[type] || '#6B7280' }}
              />
              <span className="text-xs text-gray-400">{NODE_TYPE_LABELS[type] || type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

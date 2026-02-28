'use client'

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

function MetricBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between items-baseline">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
        <span className="text-xs font-mono text-gray-400">{value}</span>
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

export default function MetricsSidebar() {
  const { healthScores, nodes } = useSimulation()

  // Get unique node types present in the graph
  const nodeTypes = [...new Set(nodes.map((n) => n.type))]

  return (
    <div className="w-56 bg-black/60 border-l border-gray-800/50 flex flex-col overflow-y-auto backdrop-blur-sm">
      {/* Overall Score */}
      <div className="p-4 border-b border-gray-800/50">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Overall</div>
        <div className="flex items-baseline gap-1">
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
        </div>
      </div>

      {/* Metric Bars */}
      <div className="p-4 space-y-3 border-b border-gray-800/50">
        <MetricBar label="Public Sentiment" value={healthScores.publicSentiment} color="#3B82F6" />
        <MetricBar label="Media Heat" value={healthScores.mediaHeat} color="#F59E0B" />
        <MetricBar label="Regulatory Pressure" value={healthScores.regulatoryPressure} color="#7C3AED" />
        <MetricBar label="Internal Stability" value={healthScores.internalStability} color="#059669" />
        <MetricBar label="Fraud Risk" value={healthScores.fraudRisk} color="#DC2626" />
      </div>

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

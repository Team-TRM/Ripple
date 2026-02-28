'use client'

import { useSimulation, useSimulationDispatch } from './SimulationContext'

const TYPE_LABELS: Record<string, string> = {
  public: 'Public',
  government: 'Government',
  media: 'Media',
  employees: 'Employees',
  company: 'Company',
  influencer: 'Influencer',
  regulator: 'Regulator',
}

function StatBar({ label, value, min, max, color }: { label: string; value: number; min: number; max: number; color: string }) {
  const normalized = ((value - min) / (max - min)) * 100
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="text-gray-400 font-mono">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(0, Math.min(100, normalized))}%`, backgroundColor: color }}
        />
      </div>
    </div>
  )
}

export default function NodeDetailDialog() {
  const { selectedNodeId, nodes } = useSimulation()
  const dispatch = useSimulationDispatch()

  const node = nodes.find((n) => n.nodeId === selectedNodeId)
  if (!node) return null

  return (
    <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-30 w-80">
      <div className="bg-gray-900/95 border border-gray-700 rounded-xl shadow-2xl backdrop-blur-sm overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: node.color }}
            />
            <h3 className="text-sm font-semibold text-white">{node.label}</h3>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500 uppercase tracking-wider">
              {TYPE_LABELS[node.type] || node.type}
            </span>
            <button
              onClick={() => dispatch({ type: 'SELECT_NODE', nodeId: null })}
              className="text-gray-500 hover:text-gray-300 transition-colors text-sm"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="px-4 py-3 space-y-2.5">
          <StatBar label="Sentiment" value={node.sentiment} min={-1} max={1} color="#3B82F6" />
          <StatBar label="Activation" value={node.activation} min={0} max={1} color="#F59E0B" />
          <StatBar label="Trust in Company" value={node.trustInCompany} min={0} max={1} color="#059669" />
          <p className="text-[10px] text-cyan-400/80 leading-relaxed">
            Zoom in on this node to inspect its micro-agent swarm.
          </p>
        </div>

        {/* Narrative */}
        {node.dominantNarrative && (
          <div className="px-4 py-3 border-t border-gray-800">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Narrative</div>
            <p className="text-xs text-gray-300 leading-relaxed">{node.dominantNarrative}</p>
          </div>
        )}

        {/* Behaviours */}
        {node.behaviours && node.behaviours.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-800">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Behaviours</div>
            <div className="flex flex-wrap gap-1">
              {node.behaviours.map((b, i) => (
                <span
                  key={i}
                  className="text-[10px] text-gray-400 bg-gray-800 rounded px-1.5 py-0.5"
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

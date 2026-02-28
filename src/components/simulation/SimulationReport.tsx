'use client'

import { useSimulation, useSimulationDispatch } from './SimulationContext'

const GRADE_COLORS: Record<string, string> = {
  A: 'text-green-400 border-green-500/40 bg-green-950/30',
  B: 'text-blue-400 border-blue-500/40 bg-blue-950/30',
  C: 'text-yellow-400 border-yellow-500/40 bg-yellow-950/30',
  D: 'text-orange-400 border-orange-500/40 bg-orange-950/30',
  F: 'text-red-400 border-red-500/40 bg-red-950/30',
}

const EFFECTIVENESS_COLORS: Record<string, string> = {
  excellent: 'text-green-400',
  good: 'text-blue-400',
  neutral: 'text-gray-400',
  poor: 'text-orange-400',
  harmful: 'text-red-400',
}

const PRIORITY_BADGES: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

const IMPACT_ICONS: Record<string, string> = {
  positive: '+',
  negative: '-',
  neutral: '~',
}

export default function SimulationReport() {
  const { showReport, reportData, isLoadingReport, healthScores } = useSimulation()
  const dispatch = useSimulationDispatch()

  if (!showReport && !isLoadingReport) return null

  if (isLoadingReport) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <span className="w-8 h-8 border-2 border-red-500/30 border-t-red-500 rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Generating post-mortem analysis...</span>
        </div>
      </div>
    )
  }

  if (!reportData) return null

  const gradeStyle = GRADE_COLORS[reportData.grade] || GRADE_COLORS.C

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center text-3xl font-bold ${gradeStyle}`}>
              {reportData.grade}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Simulation Complete</h2>
              <p className="text-sm text-gray-400 mt-0.5">{reportData.headline}</p>
            </div>
          </div>
          <button
            onClick={() => dispatch({ type: 'DISMISS_REPORT' })}
            className="text-gray-500 hover:text-white transition-colors text-xl px-2"
          >
            &times;
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">
          {/* Summary */}
          <div>
            <p className="text-sm text-gray-300 leading-relaxed">{reportData.summary}</p>
          </div>

          {/* Health Score Comparison */}
          <div>
            <h3 className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Final Health Scores</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Overall', value: healthScores.overall },
                { label: 'Public Sentiment', value: healthScores.publicSentiment },
                { label: 'Media Heat', value: healthScores.mediaHeat },
                { label: 'Regulatory', value: healthScores.regulatoryPressure },
                { label: 'Internal', value: healthScores.internalStability },
                { label: 'Fraud Risk', value: healthScores.fraudRisk },
              ].map((m) => (
                <div key={m.label} className="bg-gray-900 rounded-lg px-3 py-2 border border-gray-800/50">
                  <div className="text-[10px] text-gray-500">{m.label}</div>
                  <div className={`text-lg font-bold font-mono ${
                    m.label === 'Media Heat' || m.label === 'Regulatory' || m.label === 'Fraud Risk'
                      ? m.value > 60 ? 'text-red-400' : m.value > 30 ? 'text-yellow-400' : 'text-green-400'
                      : m.value > 60 ? 'text-green-400' : m.value > 30 ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Key Moments */}
          {reportData.keyMoments.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Key Moments</h3>
              <div className="space-y-2">
                {reportData.keyMoments.map((m, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold ${
                      m.impact === 'positive' ? 'bg-green-950/40 text-green-400' :
                      m.impact === 'negative' ? 'bg-red-950/40 text-red-400' :
                      'bg-gray-800 text-gray-400'
                    }`}>
                      {IMPACT_ICONS[m.impact] || '~'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-600 font-mono">Day {m.day}</span>
                        <span className="text-sm text-white font-medium">{m.title}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{m.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Decision Analysis */}
          {reportData.decisionAnalysis.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Your Decisions</h3>
              <div className="space-y-2">
                {reportData.decisionAnalysis.map((d, i) => (
                  <div key={i} className="bg-gray-900 rounded-lg px-4 py-3 border border-gray-800/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-gray-600 font-mono">Day {d.day + 1}</span>
                      <span className={`text-[10px] font-semibold uppercase ${EFFECTIVENESS_COLORS[d.effectiveness] || 'text-gray-400'}`}>
                        {d.effectiveness}
                      </span>
                    </div>
                    <p className="text-sm text-white font-medium">&ldquo;{d.decision}&rdquo;</p>
                    <p className="text-xs text-gray-400 mt-1">{d.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What went well / wrong */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs text-green-500/80 uppercase tracking-wider font-semibold mb-2">What Went Well</h3>
              <ul className="space-y-1.5">
                {reportData.whatWentWell.map((item, i) => (
                  <li key={i} className="text-xs text-gray-300 flex gap-2">
                    <span className="text-green-500 flex-shrink-0 mt-0.5">+</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs text-red-500/80 uppercase tracking-wider font-semibold mb-2">What Went Wrong</h3>
              <ul className="space-y-1.5">
                {reportData.whatWentWrong.map((item, i) => (
                  <li key={i} className="text-xs text-gray-300 flex gap-2">
                    <span className="text-red-500 flex-shrink-0 mt-0.5">-</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Root Cause Analysis */}
          <div className="bg-gray-900/50 rounded-lg px-4 py-3 border border-gray-800/50">
            <h3 className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2">Root Cause Analysis</h3>
            <p className="text-sm text-gray-300 leading-relaxed">{reportData.rootCauseAnalysis}</p>
          </div>

          {/* Recommendations */}
          {reportData.recommendations.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Recommendations</h3>
              <div className="space-y-2">
                {reportData.recommendations.map((r, i) => (
                  <div key={i} className="flex gap-3 items-start">
                    <span className={`flex-shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase ${PRIORITY_BADGES[r.priority] || PRIORITY_BADGES.medium}`}>
                      {r.priority}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium">{r.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{r.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-800 flex-shrink-0 flex justify-end">
          <button
            onClick={() => dispatch({ type: 'DISMISS_REPORT' })}
            className="px-5 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useState } from 'react'
import { useSimulation, useSimulationDispatch, type SimulationReportData } from './SimulationContext'

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

type RerunTarget = {
  day: number
  prompt: string
  options: string[]
  originalChoice: string
  decisionPointId: string
}

export default function SimulationReport() {
  const { showReport, reportData, isLoadingReport, healthScores, previousReport, rerunFromDay, projectId, isRerunning } = useSimulation()
  const dispatch = useSimulationDispatch()
  const [rerunTarget, setRerunTarget] = useState<RerunTarget | null>(null)
  const [rerunInput, setRerunInput] = useState('')
  const [showingPrevious, setShowingPrevious] = useState(false)

  if (!showReport && !isLoadingReport && !isRerunning) return null

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

  if (isRerunning) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <span className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          <span className="text-sm text-gray-400">Branching simulation...</span>
        </div>
      </div>
    )
  }

  if (!reportData) return null

  const displayReport = showingPrevious && previousReport ? previousReport : reportData
  const gradeStyle = GRADE_COLORS[displayReport.grade] || GRADE_COLORS.C

  const handleRerunFrom = (d: SimulationReportData['decisionAnalysis'][number]) => {
    if (!d.decisionPointId || !d.prompt || !d.options) return
    setRerunTarget({
      day: d.day,
      prompt: d.prompt,
      options: d.options,
      originalChoice: d.originalChoice || d.decision,
      decisionPointId: d.decisionPointId,
    })
    setRerunInput('')
  }

  const canRerunFromReport = displayReport.decisionAnalysis.some(
    (d) => Boolean(d.decisionPointId && d.prompt && d.options?.length)
  )

  const handleRerunWithAdjustments = () => {
    const target = displayReport.decisionAnalysis.find(
      (d) => Boolean(d.decisionPointId && d.prompt && d.options?.length)
    )
    if (!target || !target.decisionPointId || !target.prompt || !target.options?.length) return

    setRerunTarget({
      day: target.day,
      prompt: target.prompt,
      options: target.options,
      originalChoice: target.originalChoice || target.decision,
      decisionPointId: target.decisionPointId,
    })
    setRerunInput('')
  }

  const handleRerunSubmit = async () => {
    if (!rerunTarget || !rerunInput.trim()) return
    const currentReport = reportData

    dispatch({ type: 'START_RERUN', previousReport: currentReport })
    setRerunTarget(null)

    try {
      const res = await fetch(`/api/projects/${projectId}/rerun`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionPointId: rerunTarget.decisionPointId,
          newChoice: rerunInput.trim(),
          currentReport,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        console.error('[rerun] Failed:', err.error)
        dispatch({ type: 'SHOW_REPORT', report: currentReport })
        return
      }

      const data = await res.json()
      dispatch({
        type: 'RERUN_READY',
        branchDay: data.branchDay,
        nodes: data.nodes,
        edges: data.edges,
        healthScores: data.healthScores,
      })
    } catch (err) {
      console.error('[rerun] Error:', err)
      dispatch({ type: 'SHOW_REPORT', report: currentReport })
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4">
      <div className="bg-gray-950 border border-gray-800 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center text-3xl font-bold ${gradeStyle}`}>
              {displayReport.grade}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">
                {showingPrevious ? 'Original Report' : 'Simulation Complete'}
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">{displayReport.headline}</p>
              {/* Grade comparison for reruns */}
              {previousReport && !showingPrevious && (
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-sm font-bold ${GRADE_COLORS[previousReport.grade]?.split(' ')[0] || 'text-gray-400'}`}>
                    {previousReport.grade}
                  </span>
                  <span className="text-gray-600 text-xs">&rarr;</span>
                  <span className={`text-sm font-bold ${GRADE_COLORS[reportData.grade]?.split(' ')[0] || 'text-gray-400'}`}>
                    {reportData.grade}
                  </span>
                  <span className="text-[10px] text-gray-600 ml-1">
                    Branched from Day {(rerunFromDay ?? 0) + 1}
                  </span>
                </div>
              )}
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
            <p className="text-sm text-gray-300 leading-relaxed">{displayReport.summary}</p>
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
          {displayReport.keyMoments.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Key Moments</h3>
              <div className="space-y-2">
                {displayReport.keyMoments.map((m, i) => (
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
          {displayReport.decisionAnalysis.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Your Decisions</h3>
              <div className="space-y-2">
                {displayReport.decisionAnalysis.map((d, i) => (
                  <div key={i} className="bg-gray-900 rounded-lg px-4 py-3 border border-gray-800/50">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-gray-600 font-mono">Day {d.day + 1}</span>
                      <span className={`text-[10px] font-semibold uppercase ${EFFECTIVENESS_COLORS[d.effectiveness] || 'text-gray-400'}`}>
                        {d.effectiveness}
                      </span>
                    </div>
                    <p className="text-sm text-white font-medium">&ldquo;{d.decision}&rdquo;</p>
                    <p className="text-xs text-gray-400 mt-1">{d.explanation}</p>
                    {/* Rerun button — only on the current (non-previous) report with valid metadata */}
                    {!showingPrevious && d.decisionPointId && (
                      <button
                        onClick={() => handleRerunFrom(d)}
                        className="mt-2 text-[11px] text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
                      >
                        &#8634; Rerun from this decision
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Rerun sub-dialog */}
          {rerunTarget && (
            <div className="bg-blue-950/20 border border-blue-500/30 rounded-lg px-4 py-4 space-y-3">
              <h4 className="text-xs text-blue-400 uppercase tracking-wider font-semibold">
                Rerun from Day {rerunTarget.day + 1}
              </h4>
              <p className="text-sm text-gray-300">{rerunTarget.prompt}</p>
              <div className="text-xs text-gray-500">
                Original choice: <span className="line-through text-gray-600">{rerunTarget.originalChoice}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {rerunTarget.options
                  .filter((opt) => opt !== rerunTarget.originalChoice)
                  .map((opt) => (
                    <button
                      key={opt}
                      onClick={() => setRerunInput(opt)}
                      className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                        rerunInput === opt
                          ? 'border-blue-500 bg-blue-500/20 text-blue-300'
                          : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-600'
                      }`}
                    >
                      {opt}
                    </button>
                  ))}
              </div>
              <input
                value={rerunInput}
                onChange={(e) => setRerunInput(e.target.value)}
                placeholder="Or type a custom decision..."
                className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500"
                onKeyDown={(e) => e.key === 'Enter' && handleRerunSubmit()}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setRerunTarget(null)}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRerunSubmit}
                  disabled={!rerunInput.trim()}
                  className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors font-medium"
                >
                  Rerun Simulation
                </button>
              </div>
            </div>
          )}

          {/* What went well / wrong */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h3 className="text-xs text-green-500/80 uppercase tracking-wider font-semibold mb-2">What Went Well</h3>
              <ul className="space-y-1.5">
                {displayReport.whatWentWell.map((item, i) => (
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
                {displayReport.whatWentWrong.map((item, i) => (
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
            <p className="text-sm text-gray-300 leading-relaxed">{displayReport.rootCauseAnalysis}</p>
          </div>

          {/* Recommendations */}
          {displayReport.recommendations.length > 0 && (
            <div>
              <h3 className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">Recommendations</h3>
              <div className="space-y-2">
                {displayReport.recommendations.map((r, i) => (
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
        <div className="px-6 py-3 border-t border-gray-800 flex-shrink-0 flex justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={handleRerunWithAdjustments}
              disabled={!canRerunFromReport}
              className="px-4 py-2 text-xs bg-blue-600/20 border border-blue-500/40 text-blue-300 hover:bg-blue-600/30 disabled:bg-gray-800 disabled:text-gray-500 disabled:border-gray-700 disabled:cursor-not-allowed rounded-lg transition-colors font-medium"
            >
              Rerun with adjustments
            </button>
            {previousReport && (
              <button
                onClick={() => setShowingPrevious(!showingPrevious)}
                className="px-4 py-2 text-xs text-gray-400 hover:text-white transition-colors"
              >
                {showingPrevious ? 'View New Report' : 'View Original Report'}
              </button>
            )}
          </div>
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

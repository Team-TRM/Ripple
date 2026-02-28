'use client'

import { useState } from 'react'
import { useSimulation, useSimulationDispatch } from './SimulationContext'

const EXEC_ICONS: Record<string, string> = {
  CTO: '🔧',
  'Head of PR': '📢',
  'Legal Counsel': '⚖️',
  'Head of Operations': '📊',
}

const EXEC_COLORS: Record<string, string> = {
  CTO: 'border-blue-500/30 bg-blue-950/10',
  'Head of PR': 'border-amber-500/30 bg-amber-950/10',
  'Legal Counsel': 'border-purple-500/30 bg-purple-950/10',
  'Head of Operations': 'border-emerald-500/30 bg-emerald-950/10',
}

const EXEC_ACCENT: Record<string, string> = {
  CTO: 'text-blue-400',
  'Head of PR': 'text-amber-400',
  'Legal Counsel': 'text-purple-400',
  'Head of Operations': 'text-emerald-400',
}

export default function DecisionDialog({ projectId }: { projectId: string }) {
  const { showDecisionDialog, decisionPrompt, executiveRecommendations, currentDay, currentTickIndex } = useSimulation()
  const dispatch = useSimulationDispatch()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [input, setInput] = useState('')

  if (!showDecisionDialog || !decisionPrompt) return null

  const handleSubmit = async (choice: string) => {
    if (!choice.trim()) return
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chosenOption: choice }),
      })

      if (res.ok) {
        const TICK_LABELS = ['Morning', 'Afternoon', 'Evening']
        dispatch({
          type: 'ADD_MESSAGES',
          messages: [{
            id: `decision-${Date.now()}`,
            type: 'decision',
            author: 'Company Decision',
            content: choice,
            reach: 1,
            sentiment: 0,
            dayNumber: currentDay,
            tickIndex: currentTickIndex,
            timestamp: `Day ${currentDay + 1} · ${TICK_LABELS[currentTickIndex] || 'Morning'}`,
          }],
        })
        dispatch({ type: 'DISMISS_DECISION' })
        setInput('')
        // Resume play immediately — the decide endpoint already invalidated
        // future ticks, so the next step will generate a fresh tick reflecting the decision
        dispatch({ type: 'SET_PLAYING', isPlaying: true })
      }
    } catch (err) {
      console.error('Failed to submit decision:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasExecRecs = executiveRecommendations && executiveRecommendations.length > 0

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className={`bg-gray-900 border border-gray-700 rounded-2xl ${hasExecRecs ? 'max-w-2xl' : 'max-w-lg'} w-full mx-4 overflow-hidden shadow-2xl max-h-[90vh] flex flex-col`}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 bg-red-950/30 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-red-400 text-lg">&#9888;</span>
              <h2 className="text-sm font-semibold text-red-300 uppercase tracking-wider">
                End of Day {currentDay + 1} Brief
              </h2>
            </div>
            <span className="text-[10px] text-gray-500 font-mono">Decision Required</span>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Daily Brief */}
          <div className="px-6 py-4">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Situation Report</div>
            <p className="text-gray-200 text-sm leading-relaxed">
              {decisionPrompt.prompt}
            </p>
          </div>

          {/* Executive Recommendations (click to fill input) */}
          {hasExecRecs && (
            <div className="px-6 pb-3">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
                Executive Recommendations
              </div>
              <div className="grid grid-cols-2 gap-2">
                {executiveRecommendations.map((rec) => (
                  <button
                    key={rec.role}
                    type="button"
                    onClick={() => setInput(rec.recommendation)}
                    className={`text-left rounded-lg border p-2.5 transition-all cursor-pointer hover:brightness-125 ${EXEC_COLORS[rec.role] || 'border-gray-700/30 bg-gray-800/10'}`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm">{EXEC_ICONS[rec.role] || '👤'}</span>
                      <span className={`text-[11px] font-semibold ${EXEC_ACCENT[rec.role] || 'text-gray-300'}`}>
                        {rec.name}
                      </span>
                      <span className="text-[9px] text-gray-600">{rec.role}</span>
                    </div>
                    <p className="text-xs text-gray-200 font-medium leading-relaxed">
                      {rec.recommendation}
                    </p>
                    <p className="text-[10px] text-gray-500 leading-relaxed mt-0.5 italic">
                      {rec.reasoning}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* CEO Decision Input */}
          <div className="px-6 pb-4">
            {hasExecRecs && <div className="border-t border-gray-800 mb-3" />}
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">
              Your Decision, CEO
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={hasExecRecs ? 'Click a recommendation or type your own...' : 'Type your decision...'}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(input)
                  }
                }}
              />
              <button
                onClick={() => handleSubmit(input)}
                disabled={isSubmitting || !input.trim()}
                className="px-5 py-2.5 text-sm bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors font-medium"
              >
                Enter
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-2.5 border-t border-gray-800 bg-gray-900/50 flex-shrink-0">
          <p className="text-[10px] text-gray-600 text-center">
            {hasExecRecs
              ? 'Click a recommendation to use it, or type your own decision.'
              : 'The simulation is paused until you make a decision.'}
          </p>
        </div>
      </div>
    </div>
  )
}

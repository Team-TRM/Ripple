'use client'

import { useState } from 'react'
import { useSimulation, useSimulationDispatch } from './SimulationContext'

export default function DecisionDialog({ projectId }: { projectId: string }) {
  const { showDecisionDialog, decisionPrompt, currentDay, currentTickIndex } = useSimulation()
  const dispatch = useSimulationDispatch()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [customInput, setCustomInput] = useState('')
  const [showCustomInput, setShowCustomInput] = useState(false)

  if (!showDecisionDialog || !decisionPrompt) return null

  const handleSubmit = async (choice: string) => {
    setIsSubmitting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chosenOption: choice,
          userEvent: customInput.trim() || undefined,
        }),
      })

      if (res.ok) {
        // Show decision as official announcement in the feed
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
            timestamp: `Day ${currentDay} · ${TICK_LABELS[currentTickIndex] || 'Morning'}`,
          }],
        })
        dispatch({ type: 'DISMISS_DECISION' })
        setCustomInput('')
        setShowCustomInput(false)
      }
    } catch (err) {
      console.error('Failed to submit decision:', err)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCustomSubmit = () => {
    if (customInput.trim()) {
      handleSubmit(customInput.trim())
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl max-w-lg w-full mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-800 bg-red-950/30">
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-lg">&#9888;</span>
            <h2 className="text-sm font-semibold text-red-300 uppercase tracking-wider">
              Decision Required
            </h2>
          </div>
        </div>

        {/* Prompt */}
        <div className="px-6 py-5">
          <p className="text-gray-200 text-sm leading-relaxed">
            {decisionPrompt.prompt}
          </p>
        </div>

        {/* Options */}
        <div className="px-6 pb-4 space-y-2">
          {decisionPrompt.options.map((option, i) => (
            <button
              key={i}
              onClick={() => handleSubmit(option)}
              disabled={isSubmitting}
              className="w-full text-left px-4 py-3 rounded-lg bg-gray-800/60 hover:bg-gray-700/80 border border-gray-700/50 hover:border-gray-600 text-gray-200 text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-700 group-hover:bg-gray-600 flex items-center justify-center text-xs text-gray-400 font-mono flex-shrink-0">
                  {i + 1}
                </span>
                <span>{option}</span>
              </div>
            </button>
          ))}

          {/* Custom Input Option */}
          {!showCustomInput ? (
            <button
              onClick={() => setShowCustomInput(true)}
              disabled={isSubmitting}
              className="w-full text-left px-4 py-3 rounded-lg bg-gray-800/30 hover:bg-gray-800/60 border border-dashed border-gray-700/50 hover:border-gray-600 text-gray-400 text-sm transition-all disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-gray-800 flex items-center justify-center text-xs text-gray-500 font-mono flex-shrink-0">
                  +
                </span>
                <span>Enter custom response...</span>
              </div>
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Describe the action you want to take..."
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-sm text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500 transition-colors"
                rows={3}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleCustomSubmit()
                  }
                  if (e.key === 'Escape') {
                    setShowCustomInput(false)
                    setCustomInput('')
                  }
                }}
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowCustomInput(false)
                    setCustomInput('')
                  }}
                  className="px-3 py-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCustomSubmit}
                  disabled={isSubmitting || !customInput.trim()}
                  className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
                >
                  Submit
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-3 border-t border-gray-800 bg-gray-900/50">
          <p className="text-[10px] text-gray-600 text-center">
            The simulation is paused until you make a decision.
          </p>
        </div>
      </div>
    </div>
  )
}

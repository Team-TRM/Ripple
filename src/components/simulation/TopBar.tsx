'use client'

import { useState, useRef, useEffect } from 'react'
import { useSimulation, useSimulationDispatch } from './SimulationContext'

const TICK_LABELS = ['Morning', 'Afternoon', 'Evening']

export default function TopBar() {
  const { projectName, healthScores, isPlaying, currentDay, currentTickIndex, eventInputOpen, reportData, showReport } = useSimulation()
  const dispatch = useSimulationDispatch()
  const [eventText, setEventText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const prevOverallRef = useRef<number>(healthScores.overall)
  const initializedRef = useRef(false)
  const [healthDelta, setHealthDelta] = useState(0)

  const overall = healthScores.overall
  const healthColor =
    overall >= 60 ? 'text-green-400' : overall >= 35 ? 'text-yellow-400' : 'text-red-400'

  // Track health score changes for arrow indicator (skip initial load)
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      prevOverallRef.current = overall
      return
    }
    const delta = overall - prevOverallRef.current
    if (delta !== 0) {
      setHealthDelta(delta)
      prevOverallRef.current = overall
      const t = setTimeout(() => setHealthDelta(0), 3000)
      return () => clearTimeout(t)
    }
  }, [overall])

  // Focus input when opened
  useEffect(() => {
    if (eventInputOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [eventInputOpen])

  const handleInjectEvent = () => {
    if (!eventText.trim()) return
    // Set pending user event — will be sent with next step call
    dispatch({ type: 'SET_PENDING_USER_EVENT', event: eventText.trim() })
    // Add to timeline immediately for visual feedback
    dispatch({
      type: 'ADD_TIMELINE_EVENT',
      event: {
        id: `user-${Date.now()}`,
        dayNumber: currentDay,
        title: 'User Input',
        description: eventText.trim(),
        isUserInjected: true,
      },
    })
    setEventText('')
    dispatch({ type: 'SET_EVENT_INPUT_OPEN', open: false })
    // Resume play
    dispatch({ type: 'SET_PLAYING', isPlaying: true })
  }

  return (
    <div className="h-14 bg-black/80 border-b border-gray-800/50 flex items-center justify-between px-5 backdrop-blur-sm">
      {/* Left: project name + day */}
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-semibold text-gray-200 truncate max-w-[200px]">
          {projectName}
        </h1>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="text-gray-400">Day {currentDay + 1}</span>
          <span className="text-gray-700">|</span>
          <span className="text-gray-500">{TICK_LABELS[currentTickIndex] || 'Morning'}</span>
        </div>
        {isPlaying && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            <span className="text-[10px] text-green-500/80 font-mono">running</span>
          </div>
        )}
      </div>

      {/* Center: health score */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500 uppercase tracking-wider">Health</span>
        <div className="flex items-center gap-1.5">
          <span className={`text-2xl font-bold font-mono transition-colors duration-500 ${healthColor}`}>
            {overall}
          </span>
          {healthDelta !== 0 && (
            <div className={`flex items-center gap-0.5 transition-opacity duration-300 ${healthDelta > 0 ? 'text-green-400' : 'text-red-400'}`}>
              <span className="text-sm">{healthDelta > 0 ? '\u25B2' : '\u25BC'}</span>
              <span className="text-xs font-mono font-semibold">
                {healthDelta > 0 ? '+' : ''}{healthDelta}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Right: event input + play/pause */}
      <div className="flex items-center gap-3">
        {/* Event injection */}
        {eventInputOpen ? (
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={eventText}
              onChange={(e) => setEventText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleInjectEvent()
                if (e.key === 'Escape') {
                  dispatch({ type: 'SET_EVENT_INPUT_OPEN', open: false })
                  setEventText('')
                }
              }}
              placeholder="Describe what happens next..."
              className="w-80 px-3 py-1.5 text-sm bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-red-500 transition-colors"
            />
            <button
              onClick={handleInjectEvent}
              disabled={!eventText.trim()}
              className="px-3 py-1.5 text-sm bg-red-600 hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg transition-colors"
            >
              Inject
            </button>
            <button
              onClick={() => {
                dispatch({ type: 'SET_EVENT_INPUT_OPEN', open: false })
                setEventText('')
              }}
              className="px-2 py-1.5 text-sm text-gray-400 hover:text-gray-300 transition-colors"
            >
              &#10005;
            </button>
          </div>
        ) : (
          <button
            onClick={() => {
              dispatch({ type: 'SET_EVENT_INPUT_OPEN', open: true })
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-700/80 border border-gray-700/50 text-sm transition-colors"
            title="Inject a new crisis event"
          >
            <span className="text-red-400 text-xs">&#9889;</span>
            <span className="text-gray-400 text-xs">Inject Event</span>
          </button>
        )}

        {/* Re-open completed simulation report */}
        {reportData && !showReport && (
          <button
            onClick={() => dispatch({ type: 'SHOW_REPORT', report: reportData })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-900/30 hover:bg-blue-800/40 border border-blue-500/40 text-sm transition-colors"
            title="Open simulation results"
          >
            <span className="text-blue-300 text-xs">&#128202;</span>
            <span className="text-blue-200 text-xs">View Results</span>
          </button>
        )}

        {/* Play/Pause */}
        <button
          onClick={() => dispatch({ type: 'SET_PLAYING', isPlaying: !isPlaying })}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 text-sm transition-colors"
        >
          {isPlaying ? (
            <>
              <span className="text-yellow-400">&#9646;&#9646;</span>
              <span className="text-gray-300">Pause</span>
            </>
          ) : (
            <>
              {currentDay > 0 || currentTickIndex > 0 ? (
                <>
                  <span className="text-green-400">&#8635;</span>
                  <span className="text-gray-300">Rerun</span>
                </>
              ) : (
                <>
                  <span className="text-green-400">&#9654;</span>
                  <span className="text-gray-300">Play</span>
                </>
              )}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

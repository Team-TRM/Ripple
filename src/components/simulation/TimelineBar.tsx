'use client'

import { useRef, useEffect } from 'react'
import { useSimulation } from './SimulationContext'

export default function TimelineBar() {
  const { simulationDays, currentDay, currentTickIndex, currentSubTickIndex, timelineEvents } = useSimulation()
  const scrollRef = useRef<HTMLDivElement>(null)

  // Total ticks = simulationDays * 3 ticks * 3 sub-ticks
  const totalSteps = simulationDays * 9
  const currentStep = currentDay * 9 + currentTickIndex * 3 + currentSubTickIndex
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0

  // Auto-scroll to keep current position visible
  useEffect(() => {
    if (!scrollRef.current) return
    const container = scrollRef.current
    const currentPos = (currentDay / simulationDays) * container.scrollWidth
    const viewWidth = container.clientWidth
    if (currentPos > container.scrollLeft + viewWidth * 0.7 || currentPos < container.scrollLeft) {
      container.scrollTo({ left: Math.max(0, currentPos - viewWidth * 0.3), behavior: 'smooth' })
    }
  }, [currentDay, simulationDays])

  return (
    <div className="h-20 bg-black/90 border-t border-gray-800/50 flex flex-col backdrop-blur-sm">
      {/* Progress bar */}
      <div className="h-1.5 bg-gray-900 relative flex-shrink-0">
        <div
          className="absolute inset-y-0 left-0 bg-red-600 transition-all duration-500 ease-out"
          style={{ width: `${Math.max(0.5, progress)}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] border border-red-400 transition-all duration-500 ease-out"
          style={{ left: `${Math.max(0.5, progress)}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>

      {/* Timeline events scroll area */}
      <div ref={scrollRef} className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex items-stretch px-4 gap-0 min-w-max">
          {/* Day markers with events */}
          {Array.from({ length: simulationDays }, (_, dayIdx) => {
            const dayEvents = timelineEvents.filter((e) => e.dayNumber === dayIdx)
            const isPast = dayIdx < currentDay
            const isCurrent = dayIdx === currentDay
            const isFuture = dayIdx > currentDay

            return (
              <div
                key={dayIdx}
                className={`flex-shrink-0 flex flex-col justify-center px-3 border-r border-gray-800/30 min-w-[100px] ${
                  isCurrent ? 'bg-red-950/20' : ''
                }`}
              >
                {/* Day label */}
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div
                    className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      isCurrent
                        ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]'
                        : isPast
                          ? 'bg-red-800'
                          : 'bg-gray-700'
                    }`}
                  />
                  <span
                    className={`text-[10px] font-mono ${
                      isCurrent ? 'text-red-400 font-bold' : isPast ? 'text-gray-500' : 'text-gray-600'
                    }`}
                  >
                    Day {dayIdx}
                  </span>
                </div>

                {/* Events for this day */}
                {dayEvents.length > 0 ? (
                  <div className="space-y-0.5">
                    {dayEvents.map((evt) => (
                      <div
                        key={evt.id}
                        className={`text-[9px] leading-tight truncate max-w-[160px] ${
                          evt.isUserInjected
                            ? 'text-amber-400 font-medium'
                            : isFuture
                              ? 'text-gray-600'
                              : 'text-gray-400'
                        }`}
                        title={`${evt.title}: ${evt.description}`}
                      >
                        {evt.isUserInjected && (
                          <span className="text-amber-500 mr-1">&#9889;</span>
                        )}
                        {evt.title}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[9px] text-gray-700">&mdash;</div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

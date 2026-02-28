'use client'

import { useSimulation } from './SimulationContext'

export default function TimelineBar() {
  const { simulationDays, currentDay, currentTickIndex, currentSubTickIndex, timelineEvents } = useSimulation()

  // Progress as percentage of total simulation
  const totalSteps = simulationDays * 3 // 3 ticks per day
  const currentStep = currentDay * 3 + currentTickIndex
  const progress = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0

  return (
    <div className="h-16 bg-black/90 border-t border-gray-800/50 flex flex-col backdrop-blur-sm">
      {/* Day grid — each column is exactly 1/simulationDays wide, matching the progress bar */}
      <div className="flex-1 grid overflow-hidden" style={{ gridTemplateColumns: `repeat(${simulationDays}, 1fr)` }}>
        {Array.from({ length: simulationDays }, (_, dayIdx) => {
          const dayEvents = timelineEvents.filter((e) => e.dayNumber === dayIdx)
          const isPast = dayIdx < currentDay
          const isCurrent = dayIdx === currentDay
          const isFuture = dayIdx > currentDay

          return (
            <div
              key={dayIdx}
              className={`flex flex-col justify-center px-2 border-r border-gray-800/30 overflow-hidden ${
                isCurrent ? 'bg-red-950/20' : ''
              }`}
            >
              <div className="flex items-center gap-1 mb-0.5">
                <div
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                    isCurrent
                      ? 'bg-red-500 shadow-[0_0_4px_rgba(239,68,68,0.6)]'
                      : isPast
                        ? 'bg-red-800'
                        : 'bg-gray-700'
                  }`}
                />
                <span
                  className={`text-[9px] font-mono truncate ${
                    isCurrent ? 'text-red-400 font-bold' : isPast ? 'text-gray-500' : 'text-gray-600'
                  }`}
                >
                  {dayIdx + 1}
                </span>
              </div>

              {dayEvents.length > 0 ? (
                <div className="truncate">
                  {dayEvents.slice(0, 1).map((evt) => (
                    <div
                      key={evt.id}
                      className={`text-[8px] leading-tight truncate ${
                        evt.isUserInjected
                          ? 'text-amber-400'
                          : isFuture
                            ? 'text-gray-600'
                            : 'text-gray-400'
                      }`}
                      title={`${evt.title}: ${evt.description}`}
                    >
                      {evt.title}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>

      {/* Progress bar at bottom */}
      <div className="h-1 bg-gray-900 relative flex-shrink-0">
        <div
          className="absolute inset-y-0 left-0 bg-red-600 transition-all duration-500 ease-out"
          style={{ width: `${Math.max(0.5, progress)}%` }}
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)] border border-red-400 transition-all duration-500 ease-out"
          style={{ left: `${Math.max(0.5, progress)}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
    </div>
  )
}

type TimelineEvent = {
  id: string
  dayNumber: number
  dateLabel: string
  title: string
}

type Props = {
  events: TimelineEvent[]
  selectedDay: number
  simulatedTicks: number[]
  onSelectDay: (day: number) => void
}

export function TimelineSidebar({ events, selectedDay, simulatedTicks, onSelectDay }: Props) {
  return (
    <div className="w-80 border-r border-gray-800 overflow-y-auto shrink-0">
      <div className="p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
          Timeline
        </h2>
        <div className="space-y-1">
          {events.map((event) => {
            const isSimulated = simulatedTicks.includes(event.dayNumber)
            const isSelected = selectedDay === event.dayNumber

            return (
              <button
                key={event.id}
                onClick={() => onSelectDay(event.dayNumber)}
                className={`w-full text-left px-4 py-3 rounded-lg transition-colors ${
                  isSelected
                    ? 'bg-blue-600/20 border border-blue-500/30 text-white'
                    : isSimulated
                    ? 'hover:bg-gray-800/50 text-gray-300'
                    : 'hover:bg-gray-800/30 text-gray-500'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className={`w-2 h-2 rounded-full ${
                      isSimulated ? 'bg-green-500' : 'bg-gray-600'
                    }`}
                  />
                  <span className="text-xs text-gray-500">{event.dateLabel}</span>
                </div>
                <div className="text-sm font-medium ml-4">{event.title}</div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

'use client'

import { useRef, useEffect, useState } from 'react'
import { useSimulation } from './SimulationContext'

const TYPE_STYLES: Record<string, { border: string; label: string; labelColor: string; bg?: string }> = {
  news: { border: 'border-l-red-500', label: 'BREAKING', labelColor: 'text-red-400' },
  influencer: { border: 'border-l-pink-500', label: 'SOCIAL', labelColor: 'text-pink-400' },
  official: { border: 'border-l-indigo-500', label: 'OFFICIAL', labelColor: 'text-indigo-400', bg: 'bg-indigo-950/20' },
  forum: { border: 'border-l-emerald-500', label: 'FORUM', labelColor: 'text-emerald-400' },
  secondary: { border: 'border-l-amber-500', label: 'EVENT', labelColor: 'text-amber-400' },
  comment: { border: 'border-l-gray-600', label: 'REPLY', labelColor: 'text-gray-500' },
  decision: { border: 'border-l-yellow-500', label: 'DECISION', labelColor: 'text-yellow-400', bg: 'bg-yellow-950/20' },
}

export default function LiveEventsSidebar() {
  const { messages } = useSimulation()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [animatedIds, setAnimatedIds] = useState<Set<string>>(new Set())
  const prevIdsRef = useRef<Set<string>>(new Set())

  // Track which messages are new for animation
  useEffect(() => {
    const currentIds = new Set(messages.map((m) => m.id))
    const newIds = new Set<string>()
    for (const id of currentIds) {
      if (!prevIdsRef.current.has(id)) {
        newIds.add(id)
      }
    }
    if (newIds.size > 0) {
      setAnimatedIds((prev) => new Set([...prev, ...newIds]))
      // Remove animation class after animation completes
      setTimeout(() => {
        setAnimatedIds((prev) => {
          const next = new Set(prev)
          for (const id of newIds) next.delete(id)
          return next
        })
      }, 600)
    }
    prevIdsRef.current = currentIds
  }, [messages])

  // Auto-scroll to top when new messages arrive (latest first)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
  }, [messages.length])

  return (
    <div className="w-72 bg-black/60 border-r border-gray-800/50 flex flex-col backdrop-blur-sm">
      <div className="px-4 py-3 border-b border-gray-800/50 flex items-center justify-between">
        <h2 className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">
          Live Events
        </h2>
        {messages.length > 0 && (
          <span className="text-[10px] text-gray-600 font-mono">{messages.length}</span>
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        {messages.length === 0 ? (
          <div className="p-4 text-xs text-gray-600 text-center">
            Events will appear here as the simulation runs...
          </div>
        ) : (
          <div className="divide-y divide-gray-800/30">
            {messages.map((msg, i) => {
              const style = TYPE_STYLES[msg.type] || TYPE_STYLES.comment
              const prevMsg = i > 0 ? messages[i - 1] : null
              const showTimestamp = !prevMsg || prevMsg.timestamp !== msg.timestamp
              const isNew = animatedIds.has(msg.id)

              // Sentiment indicator
              const sentimentColor =
                msg.sentiment > 0.2 ? 'bg-green-500' :
                msg.sentiment < -0.2 ? 'bg-red-500' : 'bg-gray-600'

              return (
                <div
                  key={msg.id}
                  className={isNew ? 'animate-slideIn' : ''}
                  style={isNew ? { animationDuration: '0.4s' } : undefined}
                >
                  {showTimestamp && msg.timestamp && (
                    <div className="px-4 py-1.5 bg-gray-900/50 border-b border-gray-800/30 sticky top-0 z-10">
                      <span className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">
                        {msg.timestamp}
                      </span>
                    </div>
                  )}
                  <div className={`px-4 py-3 border-l-2 ${style.border} ${style.bg || ''}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${style.labelColor}`}>
                        {style.label}
                      </span>
                      <span className="text-[10px] text-gray-600 truncate flex-1">{msg.author}</span>
                      <div className={`w-1.5 h-1.5 rounded-full ${sentimentColor} flex-shrink-0`} />
                    </div>
                    <p className="text-xs text-gray-300 leading-relaxed line-clamp-4">
                      {msg.content}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-slideIn {
          animation: slideIn 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  )
}

'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'

type Question = {
  id: string
  question: string
  answer: string | null
}

type ChatMessage = {
  role: 'assistant' | 'user' | 'typing'
  content: string
}

type Props = {
  isOpen: boolean
  onClose: () => void
  onCreated: () => void
}

function TypingDots() {
  return (
    <div className="flex justify-start">
      <div className="bg-gray-800 px-4 py-3 rounded-2xl rounded-bl-md flex items-center gap-1.5">
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  )
}

export function CreateProjectModal({ isOpen, onClose, onCreated }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<'input' | 'chat' | 'generating'>('input')
  const [context, setContext] = useState('')
  const [projectId, setProjectId] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [error, setError] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages, isTyping])

  useEffect(() => {
    if (step === 'chat' && !isTyping) {
      inputRef.current?.focus()
    }
  }, [step, currentQuestionIndex, isTyping])

  if (!isOpen) return null

  const addAssistantMessage = (content: string) => {
    return new Promise<void>((resolve) => {
      setIsTyping(true)
      setTimeout(() => {
        setChatMessages((prev) => [...prev, { role: 'assistant', content }])
        setIsTyping(false)
        resolve()
      }, 800)
    })
  }

  const handleSubmitContext = async () => {
    if (!context.trim()) return
    setIsSubmitting(true)
    setError('')

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: context.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to create project')
      }

      const project = await res.json()
      setProjectId(project.id)
      setQuestions(project.questions)
      setAnswers(
        Object.fromEntries(project.questions.map((q: Question) => [q.id, '']))
      )
      setCurrentQuestionIndex(0)
      setStep('chat')

      // Animate messages appearing
      setChatMessages([])
      setIsTyping(true)
      setTimeout(() => {
        setChatMessages([{ role: 'assistant', content: 'Thanks for the context! I have a few quick questions to help set up your simulation.' }])
        setIsTyping(false)
        setTimeout(() => {
          setIsTyping(true)
          setTimeout(() => {
            setChatMessages((prev) => [...prev, { role: 'assistant', content: project.questions[0].question }])
            setIsTyping(false)
          }, 600)
        }, 300)
      }, 800)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSubmitAnswer = async () => {
    if (!currentAnswer.trim() || isTyping) return

    const currentQ = questions[currentQuestionIndex]
    const newAnswers = { ...answers, [currentQ.id]: currentAnswer.trim() }
    setAnswers(newAnswers)

    setChatMessages((prev) => [
      ...prev,
      { role: 'user', content: currentAnswer.trim() },
    ])
    setCurrentAnswer('')

    const nextIndex = currentQuestionIndex + 1

    if (nextIndex < questions.length) {
      setCurrentQuestionIndex(nextIndex)
      setIsTyping(true)
      setTimeout(() => {
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: questions[nextIndex].question },
        ])
        setIsTyping(false)
      }, 800)
    } else {
      // All answered — generate simulation
      setStep('generating')
      setIsTyping(true)
      setTimeout(() => {
        setChatMessages((prev) => [
          ...prev,
          { role: 'assistant', content: 'Perfect. Building your crisis simulation now — this will take a moment...' },
        ])
        setIsTyping(false)
      }, 600)

      try {
        const res = await fetch(`/api/projects/${projectId}/answers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answers: newAnswers }),
        })

        if (!res.ok) {
          const data = await res.json()
          throw new Error(data.error || 'Failed to generate simulation')
        }

        onCreated()
        router.push(`/project/${projectId}`)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
        setStep('chat')
        setIsTyping(false)
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (step === 'input') {
        handleSubmitContext()
      } else {
        handleSubmitAnswer()
      }
    }
  }

  const handleClose = () => {
    setStep('input')
    setContext('')
    setProjectId(null)
    setQuestions([])
    setCurrentQuestionIndex(0)
    setAnswers({})
    setChatMessages([])
    setCurrentAnswer('')
    setIsTyping(false)
    setError('')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl flex flex-col" style={{ height: '80vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-bold text-white">
            {step === 'input' ? 'New Simulation' : step === 'generating' ? 'Setting up...' : `Question ${currentQuestionIndex + 1} of ${questions.length}`}
          </h2>
          <button onClick={handleClose} className="text-gray-500 hover:text-white transition-colors text-xl">&times;</button>
        </div>

        {step === 'input' && (
          <div className="flex flex-col flex-1 p-6">
            <p className="text-gray-400 mb-4">What do you want to simulate today?</p>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe the crisis scenario..."
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl p-4 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500 transition-colors text-sm"
              disabled={isSubmitting}
              autoFocus
            />
            {error && <p className="text-red-400 text-sm mt-3">{error}</p>}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={handleClose} disabled={isSubmitting} className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button
                onClick={handleSubmitContext}
                disabled={isSubmitting || !context.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Analyzing...
                  </span>
                ) : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {(step === 'chat' || step === 'generating') && (
          <>
            {/* Chat messages */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-gray-800 text-gray-200 rounded-bl-md'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}

              {isTyping && <TypingDots />}

              {step === 'generating' && !isTyping && (
                <div className="flex justify-start">
                  <div className="bg-gray-800 text-gray-400 px-4 py-3 rounded-2xl rounded-bl-md text-sm flex items-center gap-3">
                    <span className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    Building simulation...
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input area */}
            {step === 'chat' && (
              <div className="px-6 py-4 border-t border-gray-800">
                {error && <p className="text-red-400 text-sm mb-2">{error}</p>}
                <div className="flex items-end gap-3">
                  <textarea
                    ref={inputRef}
                    value={currentAnswer}
                    onChange={(e) => setCurrentAnswer(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Type your answer..."
                    rows={2}
                    disabled={isTyping}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:border-blue-500 transition-colors text-sm disabled:opacity-50"
                  />
                  <button
                    type="button"
                    aria-label="Voice input coming soon"
                    title="Voice mode (STT/TTS) coming soon"
                    className="h-11 w-11 shrink-0 rounded-xl border border-gray-700 bg-gray-800 text-gray-400 flex items-center justify-center"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="w-[18px] h-[18px] block"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="9" y="2.8" width="6" height="10.8" rx="3" />
                      <path d="M6.8 10.2a5.2 5.2 0 0 0 10.4 0" />
                      <path d="M12 16v3.8" />
                      <path d="M9 20h6" />
                    </svg>
                  </button>
                  <button
                    onClick={handleSubmitAnswer}
                    disabled={!currentAnswer.trim() || isTyping}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white px-4 rounded-xl font-medium transition-colors h-11 shrink-0"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

'use client'

import { useEffect, useState } from 'react'
import { CreateProjectModal } from '@/components/project/CreateProjectModal'
import { ProjectCard } from '@/components/project/ProjectCard'

type ProjectSummary = {
  id: string
  name: string
  context: string
  createdAt: string
  status: string
  events: { id: string; dayNumber: number; dateLabel: string; title: string }[]
  ticks: { id: string; tickNumber: number }[]
}

export default function HomePage() {
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const fetchProjects = async () => {
    setIsLoading(true)
    const res = await fetch('/api/projects')
    const data = await res.json()
    setProjects(data)
    setIsLoading(false)
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchProjects()
    }, 0)
    return () => clearTimeout(timer)
  }, [])

  return (
    <main className="min-h-screen">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="mb-10">
          <h1 className="text-3xl font-bold">Crisis Simulator</h1>
          <p className="text-gray-400 mt-1">Manage your crisis simulations</p>
        </div>

        {isLoading ? (
          <div className="text-gray-400 text-center py-20">Loading...</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {/* + New project square */}
            <button
              onClick={() => setIsModalOpen(true)}
              className="aspect-square border-2 border-dashed border-gray-700 rounded-2xl flex items-center justify-center hover:border-gray-500 transition-colors cursor-pointer group"
            >
              <span className="text-5xl text-gray-600 group-hover:text-gray-400 transition-colors font-light">
                +
              </span>
            </button>

            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} onDeleted={fetchProjects} />
            ))}
          </div>
        )}
      </div>

      <CreateProjectModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={() => {
          setIsModalOpen(false)
          fetchProjects()
        }}
      />
    </main>
  )
}

'use client'

import Link from 'next/link'

type Props = {
  project: {
    id: string
    name: string
    context: string
    createdAt: string
    status: string
    events: { id: string; dayNumber: number; title: string }[]
    ticks: { id: string; tickNumber: number }[]
  }
  onDeleted: () => void
}

export function ProjectCard({ project, onDeleted }: Props) {
  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this simulation?')) return

    const res = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
    if (res.ok) onDeleted()
  }

  return (
    <Link href={`/project/${project.id}`}>
      <div className="aspect-square bg-gray-900 border border-gray-800 rounded-2xl p-6 hover:border-gray-600 transition-colors cursor-pointer flex flex-col justify-between group relative">
        <button
          onClick={handleDelete}
          className="absolute top-3 right-3 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity text-lg"
          title="Delete"
        >
          &times;
        </button>
        <div>
          <h3 className="text-lg font-semibold text-white mb-2 line-clamp-2">{project.name}</h3>
          <p className="text-gray-500 text-sm line-clamp-4">
            {project.context}
          </p>
        </div>
        <div className="text-xs text-gray-600">
          {new Date(project.createdAt).toLocaleDateString()}
        </div>
      </div>
    </Link>
  )
}

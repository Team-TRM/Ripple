'use client'

export default function ZoomControls({
  onZoomIn,
  onZoomOut,
}: {
  onZoomIn: () => void
  onZoomOut: () => void
}) {
  return (
    <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1">
      <button
        onClick={onZoomIn}
        className="w-8 h-8 bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 rounded-lg text-gray-400 hover:text-white flex items-center justify-center text-sm transition-colors backdrop-blur-sm"
      >
        +
      </button>
      <button
        onClick={onZoomOut}
        className="w-8 h-8 bg-gray-800/80 hover:bg-gray-700/80 border border-gray-700/50 rounded-lg text-gray-400 hover:text-white flex items-center justify-center text-sm transition-colors backdrop-blur-sm"
      >
        &minus;
      </button>
    </div>
  )
}

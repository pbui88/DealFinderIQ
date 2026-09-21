import { useNavigate } from 'react-router-dom'
import { X, MapPinArea } from '@phosphor-icons/react'
import { STATUS_LABELS, STATUS_BADGE_CLASS } from '../../lib/constants'

export default function ProjectCard({ project, onDelete }) {
  const navigate = useNavigate()
  const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  // Transient states (analyzing/collecting/queued) should never persist on the
  // dashboard — if the project has scan points it's effectively complete.
  const displayStatus = (
    ['analyzing', 'collecting', 'queued'].includes(project.status) && (project.total_points || 0) > 0
  ) ? 'complete' : project.status

  return (
    <div
      onClick={() => navigate(`/projects/${project.id}`)}
      className="group relative bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-4 cursor-pointer hover:bg-white/[0.06] hover:border-white/[0.14] hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,0.3)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
    >
      {/* Top row: status + menu */}
      <div className="flex items-start justify-between mb-3">
        <span className={STATUS_BADGE_CLASS[displayStatus] || 'badge-slate'}>
          {STATUS_LABELS[displayStatus] || displayStatus}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(project.id) }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500/10 text-slate-600 hover:text-red-400 transition-all duration-300"
        >
          <X weight="light" className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Project name */}
      <h3 className="font-display font-semibold text-slate-200 text-sm leading-snug line-clamp-2 mb-3">
        {project.name}
      </h3>

      {/* Bottom row: meta + icon */}
      <div className="flex items-end justify-between">
        <div className="space-y-0.5">
          <p className="text-xs text-slate-400">
            <span className="text-slate-200 font-semibold font-mono">{project.total_points.toLocaleString()}</span> properties
            {project.failed_points > 0 && (
              <span className="text-red-400 ml-2 font-mono">{project.failed_points} failed</span>
            )}
          </p>
          <p className="text-xs text-slate-600 font-mono">{fmt(project.created_at)}</p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-brand-600/10 border border-brand-600/15 flex items-center justify-center shrink-0 group-hover:bg-brand-600/20 transition-colors duration-300">
          <MapPinArea weight="light" className="w-4 h-4 text-brand-400" />
        </div>
      </div>
    </div>
  )
}

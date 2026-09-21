import { useNavigate } from 'react-router-dom'
import { X, MapPinArea } from '@phosphor-icons/react'
import { STATUS_LABELS } from '../../lib/constants'

// Light-theme pastel badge classes for project status, scoped to the
// dashboard card only (the shared STATUS_BADGE_CLASS map in lib/constants
// still drives dark badge-* classes used elsewhere in the app).
const STATUS_BADGE_LIGHT = {
  draft:      'bg-slate-100 text-ink-muted',
  queued:     'bg-tagYellow-bg text-tagYellow-text',
  collecting: 'bg-tagYellow-bg text-tagYellow-text',
  analyzing:  'bg-tagYellow-bg text-tagYellow-text',
  complete:   'bg-tagGreen-bg text-tagGreen-text',
  failed:     'bg-tagRed-bg text-tagRed-text',
  paused:     'bg-slate-100 text-ink-muted',
}

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
      className="group relative bg-white border border-line rounded-2xl p-4 cursor-pointer hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
    >
      {/* Top row: status + menu */}
      <div className="flex items-start justify-between mb-3">
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_BADGE_LIGHT[displayStatus] || 'bg-slate-100 text-ink-muted'}`}>
          {STATUS_LABELS[displayStatus] || displayStatus}
        </span>
        <button
          onClick={e => { e.stopPropagation(); onDelete(project.id) }}
          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-500/10 text-ink-faint hover:text-red-600 transition-all duration-300"
        >
          <X weight="light" className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Project name */}
      <h3 className="font-display font-semibold text-ink text-sm leading-snug line-clamp-2 mb-3">
        {project.name}
      </h3>

      {/* Bottom row: meta + icon */}
      <div className="flex items-end justify-between">
        <div className="space-y-0.5">
          <p className="text-xs text-ink-muted">
            <span className="text-ink font-semibold font-mono">{project.total_points.toLocaleString()}</span> properties
            {project.failed_points > 0 && (
              <span className="text-red-600 ml-2 font-mono">{project.failed_points} failed</span>
            )}
          </p>
          <p className="text-xs text-ink-faint font-mono">{fmt(project.created_at)}</p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-brand-600/10 border border-brand-600/15 flex items-center justify-center shrink-0 group-hover:bg-brand-600/20 transition-colors duration-300">
          <MapPinArea weight="light" className="w-4 h-4 text-brand-600" />
        </div>
      </div>
    </div>
  )
}

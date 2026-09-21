import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { List, Plus, MapPinArea, TrendUp } from '@phosphor-icons/react'
import { getProjects, deleteProject } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import ProjectCard from './ProjectCard'
import NewProjectModal from './NewProjectModal'

const EASE = [0.32, 0.72, 0, 1]

function StatCard({ label, value, sparkColor, highlight }) {
  return (
    <div className="bg-white border border-line rounded-2xl p-5">
      <p className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-3">{label}</p>
      <div className="flex items-end justify-between">
        <p className={`text-3xl font-bold font-display font-mono ${highlight ? 'text-brand-600' : 'text-ink'}`}>
          {value}
        </p>
        <TrendUp weight="light" className="w-6 h-6 opacity-50" style={{ color: sparkColor }} />
      </div>
    </div>
  )
}

function EmptyState({ onNew, reduce }) {
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="flex flex-col items-center justify-center py-24 px-8 text-center bg-white border border-line rounded-2xl shadow-[0_2px_8px_rgba(15,23,42,0.04)]"
    >
      <div className="w-16 h-16 rounded-2xl bg-brand-600/10 border border-brand-600/20 flex items-center justify-center mb-5">
        <MapPinArea weight="light" className="w-8 h-8 text-brand-600" />
      </div>
      <h3 className="text-base font-display font-semibold text-ink mb-2">No scan projects yet</h3>
      <p className="text-sm text-ink-muted mb-8 max-w-xs leading-relaxed">
        Create a project, draw your scan area on the map, and DealFinderIQ will start collecting Street View imagery.
      </p>
      <button
        onClick={onNew}
        className="inline-flex items-center gap-2 pl-2 pr-5 py-2 rounded-full bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
      >
        <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center">
          <Plus weight="bold" className="w-3.5 h-3.5" />
        </span>
        New List
      </button>
    </motion.div>
  )
}

export default function Dashboard() {
  const { openSidebar } = useOutletContext()
  const { profile } = useAuth()
  const [projects, setProjects] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [showNew,  setShowNew]  = useState(false)
  const reduce = useReducedMotion()

  const load = async () => {
    setLoading(true)
    try {
      const data = await getProjects()

      // Batch-fix any projects stuck in a non-terminal status that have scan points.
      // Transient states (analyzing/collecting/queued) should not persist after
      // the scan tab closes — mark them complete so the DB matches the UI, but
      // only when every point actually reached a terminal state. Otherwise a
      // scan interrupted mid-run (closed tab, dropped network, function
      // timeout) gets silently stamped "Complete" while points are still
      // stuck pending/downloading/downloaded — mirrors the check in
      // Project/index.jsx's loadProject.
      const candidates = (data || [])
        .filter(p => ['analyzing', 'collecting', 'queued'].includes(p.status) && (p.total_points || 0) > 0)
      if (candidates.length > 0) {
        const { data: unfinishedPts } = await supabase
          .from('scan_points')
          .select('project_id')
          .in('project_id', candidates.map(p => p.id))
          .in('status', ['pending', 'downloading', 'downloaded'])
        const stillWorking = new Set((unfinishedPts || []).map(p => p.project_id))
        const toFix = candidates.filter(p => !stillWorking.has(p.id)).map(p => p.id)
        if (toFix.length > 0) {
          await supabase.from('projects').update({ status: 'complete' }).in('id', toFix)
          data.forEach(p => { if (toFix.includes(p.id)) p.status = 'complete' })
        }
      }

      setProjects(data || [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (id) => {
    if (!confirm('Delete this project and all its scan data?')) return
    try {
      await deleteProject(id)
      setProjects(p => p.filter(pr => pr.id !== id))
    } catch (err) { alert(err.message) }
  }

  const totalPoints    = projects.reduce((s, p) => s + (p.total_points || 0), 0)
  const activeProjects = projects.filter(p => ['collecting', 'analyzing'].includes(p.status)).length

  const firstName = profile?.full_name ? profile.full_name.split(' ')[0] : null

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-start gap-3">
          <button
            onClick={openSidebar}
            className="mt-1 p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-slate-100 transition-all duration-300 lg:hidden shrink-0"
            aria-label="Open navigation"
          >
            <List weight="light" className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold font-display text-ink">
              {firstName ? `${firstName}'s Records` : 'Records'}
            </h1>
            <p className="text-sm text-ink-muted mt-1">Manage your neighborhood scan records</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="shrink-0 inline-flex items-center gap-2 pl-2 pr-5 py-2 rounded-full bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
        >
          <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center">
            <Plus weight="bold" className="w-3.5 h-3.5" />
          </span>
          New List
        </button>
      </div>

      {/* Stats */}
      {projects.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard
            label="Total Records"
            value={projects.length}
            sparkColor="#60a5fa"
          />
          <StatCard
            label="Active Scans"
            value={activeProjects}
            highlight={activeProjects > 0}
            sparkColor={activeProjects > 0 ? '#22d3ee' : '#64748b'}
          />
          <StatCard
            label="Properties Scan"
            value={totalPoints.toLocaleString()}
            sparkColor="#34d399"
          />
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-32">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState onNew={() => setShowNew(true)} reduce={reduce} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {projects.map((p, i) => (
            <motion.div
              key={p.id}
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.05, ease: EASE }}
            >
              <ProjectCard project={p} onDelete={handleDelete} />
            </motion.div>
          ))}
        </div>
      )}

      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreated={load} />}
    </div>
  )
}

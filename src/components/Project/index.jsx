import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate, Link, useOutletContext } from 'react-router-dom'
import { useJsApiLoader } from '@react-google-maps/api'
import { motion, useReducedMotion } from 'motion/react'
import {
  MapTrifoldIcon,
  ChartBarIcon,
  ListIcon,
  ArrowLeftIcon,
  CircleNotchIcon,
} from '@phosphor-icons/react'
import { supabase } from '../../lib/supabase'
import { updateProject } from '../../lib/api'
import { STATUS_LABELS, STATUS_BADGE_CLASS } from '../../lib/constants'
import MapTab     from './MapTab'
import ResultsTab from './ResultsTab'

const LIBRARIES = ['geometry']

const EASE = [0.32, 0.72, 0, 1]

const TABS = [
  { id: 'map',     label: 'Map',     icon: MapTrifoldIcon },
  { id: 'results', label: 'Results', icon: ChartBarIcon },
]

export default function ProjectPage() {
  const { openSidebar } = useOutletContext()
  const { id } = useParams()
  const navigate = useNavigate()
  const reduceMotion = useReducedMotion()
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY || '',
    libraries: LIBRARIES,
  })
  const [project,        setProject]        = useState(null)
  const [scanPoints,     setScanPoints]     = useState([])
  const [activeTab,      setActiveTab]      = useState('map')
  const [loading,        setLoading]        = useState(true)
  const [autoStartScan,  setAutoStartScan]  = useState(false)
  const hasAutoStartedRef = useRef(false)

  const loadProject = async () => {
    const { data: proj } = await supabase.from('projects').select('*').eq('id', id).single()
    if (!proj) { navigate('/dashboard'); return }

    const { data: pts } = await supabase
      .from('scan_points')
      .select('id, lat, lng, status')
      .eq('project_id', id)
      .limit(5000)
    setScanPoints(pts || [])

    // Auto-correct project status: if stuck in a non-terminal state but no
    // points need fresh work (pending/downloading/downloaded), mark complete.
    // Stuck 'analyzing' scan_points are handled by the ResultsTab cleanup effect.
    let effectiveProj = proj
    if (['analyzing', 'collecting', 'queued'].includes(proj.status) && pts?.length > 0) {
      const needsWork = pts.some(p => ['pending', 'downloading', 'downloaded'].includes(p.status))
      if (!needsWork) {
        await supabase.from('projects').update({ status: 'complete' }).eq('id', proj.id)
        effectiveProj = { ...proj, status: 'complete' }
      }
    }
    setProject(effectiveProj)
    setLoading(false)

    if (pts?.length > 0) {
      if (!hasAutoStartedRef.current) {
        const hasIncomplete = pts.some(p => ['pending', 'failed', 'downloaded', 'analyzing'].includes(p.status))
        if (hasIncomplete) {
          hasAutoStartedRef.current = true
          setAutoStartScan(true)
          setActiveTab('results')
          return
        }
      }
      if (activeTab === 'map') setActiveTab('results')
    }
  }

  useEffect(() => { loadProject() }, [id])

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-paper">
        <CircleNotchIcon weight="light" className="w-6 h-6 text-brand-500 animate-spin" />
      </div>
    )
  }

  if (!project) return null

  return (
    <div className="flex flex-col h-screen bg-paper">
      {/* Header */}
      <header className="flex items-center gap-3 px-3 sm:px-5 py-3 border-b border-line shrink-0 bg-paper-bone">
        <button
          onClick={openSidebar}
          className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-paper transition active:scale-[0.98] lg:hidden shrink-0"
          aria-label="Open navigation"
        >
          <ListIcon weight="light" className="w-4 h-4" />
        </button>
        <Link to="/dashboard" className="text-ink-muted hover:text-ink transition shrink-0">
          <ArrowLeftIcon weight="light" className="w-4 h-4" />
        </Link>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold text-ink truncate">{project.name}</h1>
            {(() => {
              const displayStatus = (
                ['analyzing', 'collecting', 'queued'].includes(project.status) && scanPoints.length > 0
              ) ? 'complete' : project.status
              return (
                <span className={`${STATUS_BADGE_CLASS[displayStatus] || 'badge-slate'} shrink-0`}>
                  {STATUS_LABELS[displayStatus] || displayStatus}
                </span>
              )
            })()}
          </div>
          {scanPoints.length > 0 && (
            <p className="text-xs text-ink-muted">{scanPoints.length.toLocaleString()} properties scan</p>
          )}
        </div>

        {/* Tabs */}
        <div className="relative flex items-center bg-white/90 backdrop-blur-2xl border border-line rounded-full p-1 gap-0.5">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-display font-medium
                  transition-colors duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]
                  ${isActive ? 'text-white' : 'text-ink-muted hover:text-ink'}`}
              >
                {isActive && (
                  reduceMotion ? (
                    <span className="absolute inset-0 -z-10 bg-brand-600 rounded-full" />
                  ) : (
                    <motion.span
                      layoutId="project-tab-highlight"
                      className="absolute inset-0 -z-10 bg-brand-600 rounded-full"
                      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    />
                  )
                )}
                <tab.icon weight="light" className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">{tab.label}</span>
              </button>
            )
          })}
        </div>
      </header>

      {/* Tab content */}
      <motion.div
        key={activeTab}
        initial={reduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="flex-1 overflow-hidden"
      >
        {activeTab === 'map' && (
          <MapTab
            project={project}
            scanPoints={scanPoints}
            onPointsGenerated={({ autoStart } = {}) => {
              if (autoStart) {
                setAutoStartScan(true)
                setActiveTab('results')  // switch immediately — don't wait for loadProject
              }
              loadProject()
            }}
            isLoaded={isLoaded}
            loadError={loadError}
          />
        )}
        {activeTab === 'results' && (
          <ResultsTab
            project={project}
            onProjectUpdate={loadProject}
            autoStart={autoStartScan}
            onAutoStartConsumed={() => setAutoStartScan(false)}
          />
        )}
      </motion.div>
    </div>
  )
}

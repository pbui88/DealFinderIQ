import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { X, Spinner } from '@phosphor-icons/react'
import { createProject } from '../../lib/api'

const EASE = [0.32, 0.72, 0, 1]

export default function NewProjectModal({ onClose }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', description: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const reduce = useReducedMotion()

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setLoading(true)
    setError(null)
    try {
      const project = await createProject({ name: form.name.trim(), description: form.description.trim() || null })
      navigate(`/projects/${project.id}`)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={reduce ? false : { opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="relative w-full max-w-md bg-slate-100 border border-line p-1.5 rounded-[1.75rem]"
      >
        <div className="bg-white rounded-[calc(1.75rem-0.375rem)]">
          <div className="flex items-center justify-between px-6 py-4 border-b border-line">
            <h2 className="font-display font-semibold text-ink">New Scan List</h2>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-slate-100 transition-all duration-300 active:scale-[0.98]"
            >
              <X weight="light" className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1.5 uppercase tracking-wide">List Name *</label>
              <input
                autoFocus
                value={form.name}
                onChange={e => set('name', e.target.value)}
                placeholder="e.g. North Phoenix Q2 2026"
                className="w-full bg-white border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all duration-300"
                maxLength={100}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-ink-muted mb-1.5 uppercase tracking-wide">
                Description <span className="normal-case text-ink-faint">(optional)</span>
              </label>
              <textarea
                value={form.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Notes about this scan area…"
                rows={3}
                className="w-full bg-white border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all duration-300 resize-none"
                maxLength={500}
              />
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold border border-line text-ink-muted hover:text-ink hover:bg-slate-50 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!form.name.trim() || loading}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold bg-brand-600 hover:bg-brand-500 text-white transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><Spinner weight="bold" className="w-4 h-4 animate-spin" /> Creating…</>
                ) : 'Create List'}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  )
}

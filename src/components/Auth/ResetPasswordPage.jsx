import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  LockIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  ArrowLeftIcon,
} from '@phosphor-icons/react'
import { supabase } from '../../lib/supabase'

const EASE = [0.16, 1, 0.3, 1]

function Field({ label, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <div>
      <label className="block text-xs font-medium text-ink-muted mb-1.5">{label}</label>
      <div className="relative">
        <LockIcon weight="light" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className="w-full pl-10 pr-10 py-3 bg-white border border-line rounded-xl text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
        />
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          tabIndex={-1}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink transition"
        >
          {show ? <EyeSlashIcon weight="light" className="w-4 h-4" /> : <EyeIcon weight="light" className="w-4 h-4" />}
        </button>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [ready,    setReady]    = useState(false)
  const [invalid,  setInvalid]  = useState(false)
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const [done,     setDone]     = useState(false)

  // The recovery link puts a token in the URL that supabase-js exchanges for a
  // session automatically (detectSessionInUrl). That exchange is async, so wait
  // for either a PASSWORD_RECOVERY event or an existing session before showing
  // the form — otherwise updateUser() below would run with no session to act on.
  useEffect(() => {
    let resolved = false
    const markReady = () => { resolved = true; setReady(true) }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) markReady()
    })
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) markReady()
    })
    const timeout = setTimeout(() => {
      if (!resolved) setInvalid(true)
    }, 3000)
    return () => { subscription.unsubscribe(); clearTimeout(timeout) }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (password !== confirm) return setError('Passwords do not match.')
    if (password.length < 8) return setError('Password must be at least 8 characters.')

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError(error.message)
    setDone(true)
  }

  return (
    <div className="relative min-h-screen bg-paper flex items-center justify-center px-4 overflow-hidden">
      <div className="absolute inset-0 bg-grid-light pointer-events-none" />

      {/* ambient glow orbs */}
      <motion.div
        aria-hidden
        className="absolute -z-0 top-[-10%] left-[10%] w-[26rem] h-[26rem] rounded-full bg-brand-500/10 blur-[110px] pointer-events-none"
        animate={reduce ? undefined : { x: [0, 40, 0], y: [0, 24, 0], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="absolute -z-0 bottom-[-15%] right-[12%] w-[22rem] h-[22rem] rounded-full bg-emerald-500/8 blur-[110px] pointer-events-none"
        animate={reduce ? undefined : { x: [0, -30, 0], y: [0, -20, 0], opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />

      <Link to="/login" className="absolute top-6 left-6 z-20 flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
        <ArrowLeftIcon weight="light" className="w-4 h-4" />
        Back to sign in
      </Link>

      <motion.div
        className="relative z-10 w-full max-w-sm"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <div className="bg-slate-100 border border-line p-1.5 rounded-[2rem]">
          <div className="bg-white/90 backdrop-blur-2xl rounded-[calc(2rem-0.375rem)] p-8 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            {invalid ? (
              <div className="text-center">
                <h2 className="text-xl font-bold text-ink mb-2">Link expired</h2>
                <p className="text-sm text-ink-muted mb-6">This password reset link is invalid or has expired. Request a new one from the sign-in page.</p>
                <button onClick={() => navigate('/login')} className="text-sm text-brand-600 hover:text-brand-700 underline-offset-4 hover:underline transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
                  Back to sign in
                </button>
              </div>
            ) : done ? (
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
                  <CheckCircleIcon weight="light" className="w-7 h-7 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-ink mb-2">Password updated</h2>
                <p className="text-sm text-ink-muted mb-8">You can now sign in with your new password.</p>
                <button onClick={() => navigate('/dashboard')} className="w-full py-3 bg-brand-600 hover:bg-brand-500 active:scale-[0.98] text-white font-semibold rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-sm">
                  Continue to DealFinderIQ
                </button>
              </div>
            ) : !ready ? (
              <div className="flex justify-center py-8">
                <CircleNotchIcon weight="bold" className="w-8 h-8 text-brand-500 animate-spin" />
              </div>
            ) : (
              <div>
                <h2 className="text-xl font-bold text-ink mb-1">Set a new password</h2>
                <p className="text-sm text-ink-muted mb-6">Choose a new password for your account.</p>
                <form onSubmit={handleSubmit} className="space-y-4">
                  <Field label="New password" value={password} onChange={setPassword} placeholder="Min. 8 characters" autoComplete="new-password" />
                  <Field label="Confirm password" value={confirm} onChange={setConfirm} placeholder="••••••••" autoComplete="new-password" />
                  {error && <p className="text-xs text-red-600">{error}</p>}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-500 active:scale-[0.98] disabled:opacity-50 text-white font-semibold rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-sm"
                  >
                    {loading && <CircleNotchIcon weight="bold" className="w-4 h-4 animate-spin" />}
                    {loading ? '' : 'Update password'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

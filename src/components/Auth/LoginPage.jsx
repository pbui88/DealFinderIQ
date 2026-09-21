import { useEffect, useState } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  EnvelopeIcon,
  LockIcon,
  EyeIcon,
  EyeSlashIcon,
  CheckCircleIcon,
  ClockIcon,
  CircleNotchIcon,
  ArrowLeftIcon,
  HouseIcon,
} from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'

const EASE = [0.16, 1, 0.3, 1]

function GoogleIcon({ className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function DealFinderIQLogo() {
  return (
    <div className="flex items-center justify-center mb-8">
      <span className="font-display text-3xl font-bold tracking-tight">
        <span className="text-white">Deal</span><span className="text-brand-400">Finder</span><span className="text-white">IQ</span>
      </span>
    </div>
  )
}

// ── Reusable input ────────────────────────────────────────────
function Field({ label, type = 'text', value, onChange, placeholder, autoComplete, icon: Icon, toggle }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-400 mb-1.5">{label}</label>
      <div className="relative">
        {Icon && (
          <Icon weight="light" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        )}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          required
          className={`w-full ${Icon ? 'pl-10' : 'pl-4'} ${toggle ? 'pr-10' : 'pr-4'} py-3 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand-500/50 focus:ring-2 focus:ring-brand-500/20 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]`}
        />
        {toggle}
      </div>
    </div>
  )
}

function PasswordField({ label, value, onChange, placeholder, autoComplete }) {
  const [show, setShow] = useState(false)
  return (
    <Field
      label={label}
      type={show ? 'text' : 'password'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete={autoComplete}
      icon={LockIcon}
      toggle={
        <button
          type="button"
          onClick={() => setShow(s => !s)}
          tabIndex={-1}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
        >
          {show ? <EyeSlashIcon weight="light" className="w-4 h-4" /> : <EyeIcon weight="light" className="w-4 h-4" />}
        </button>
      }
    />
  )
}

// ── Pending approval screen (after sign up) ───────────────────
function PendingApprovalScreen({ email, onBack }) {
  return (
    <div className="text-center">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-5">
        <ClockIcon weight="light" className="w-7 h-7 text-amber-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Account pending approval</h2>
      <p className="text-sm text-slate-400 mb-1">Thanks for signing up,</p>
      <p className="text-sm font-semibold text-slate-200 mb-6">{email}</p>
      <p className="text-xs text-slate-500 mb-8 leading-relaxed">
        Your account is waiting for admin activation. You'll have full access once an admin reviews and activates your account — this usually happens within 24 hours.
      </p>
      <a
        href="https://api.leadconnectorhq.com/widget/bookings/atlas-set-up-xgrsu"
        target="_blank"
        rel="noopener noreferrer"
        className="block w-full py-3 mb-4 bg-brand-600 hover:bg-brand-500 active:scale-[0.98] text-white font-semibold rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-sm"
      >
        Book your setup call
      </a>
      <button onClick={onBack} className="text-sm text-brand-400 hover:text-brand-300 underline-offset-4 hover:underline transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
        Back to sign in
      </button>
    </div>
  )
}

// ── Forgot password screen ────────────────────────────────────
function ForgotPasswordScreen({ onBack, resetPassword }) {
  const [email,   setEmail]   = useState('')
  const [sent,    setSent]    = useState(false)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  const handle = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await resetPassword(email)
    setLoading(false)
    if (error) return setError(error.message)
    setSent(true)
  }

  if (sent) return (
    <div className="text-center">
      <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-5">
        <CheckCircleIcon weight="light" className="w-7 h-7 text-emerald-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">Email sent</h2>
      <p className="text-sm text-slate-400 mb-8">Check your inbox for a password reset link.</p>
      <button onClick={onBack} className="text-sm text-brand-400 hover:text-brand-300 underline-offset-4 hover:underline transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">Back to sign in</button>
    </div>
  )

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] mb-6">
        <ArrowLeftIcon weight="light" className="w-3.5 h-3.5" />
        Back
      </button>
      <h2 className="text-xl font-bold text-white mb-1">Reset password</h2>
      <p className="text-sm text-slate-400 mb-6">Enter your email and we'll send a reset link.</p>
      <form onSubmit={handle} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" icon={EnvelopeIcon} />
        {error && <p className="text-xs text-red-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-500 active:scale-[0.98] disabled:opacity-50 text-white font-semibold rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-sm"
        >
          {loading && <CircleNotchIcon weight="bold" className="w-4 h-4 animate-spin" />}
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function LoginPage() {
  const { user, signInWithGoogle, signInWithEmail, signUpWithEmail, resetPassword } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [tab,      setTab]      = useState(location.state?.tab === 'signup' ? 'signup' : 'signin')
  const [screen,   setScreen]   = useState('form')     // 'form' | 'verify' | 'forgot'
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (user && screen !== 'verify') navigate('/dashboard')
  }, [user, navigate, screen])

  const switchTab = (t) => { setTab(t); setError(''); setPassword(''); setConfirm('') }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (tab === 'signup' && password !== confirm) {
      return setError('Passwords do not match.')
    }
    if (tab === 'signup' && password.length < 8) {
      return setError('Password must be at least 8 characters.')
    }

    setLoading(true)
    if (tab === 'signin') {
      const { error } = await signInWithEmail(email, password)
      setLoading(false)
      if (error) setError(error.message)
    } else {
      const { error } = await signUpWithEmail(email, password)
      setLoading(false)
      if (error) return setError(error.message)
      setScreen('verify')
    }
  }

  if (screen === 'verify') return (
    <PageShell>
      <PendingApprovalScreen email={email} onBack={() => { setScreen('form'); setTab('signin') }} />
    </PageShell>
  )

  if (screen === 'forgot') return (
    <PageShell>
      <ForgotPasswordScreen onBack={() => setScreen('form')} resetPassword={resetPassword} />
    </PageShell>
  )

  return (
    <PageShell>
      <DealFinderIQLogo />

      {/* Tabs */}
      <div className="flex bg-white/5 border border-white/10 rounded-full p-1 mb-6">
        {[['signin', 'Sign In'], ['signup', 'Create Account']].map(([t, label]) => (
          <button
            key={t}
            onClick={() => switchTab(t)}
            className={`flex-1 py-2 text-sm font-medium rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${
              tab === t ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Google button */}
      <button
        onClick={signInWithGoogle}
        className="w-full flex items-center justify-center gap-3 bg-white hover:bg-slate-100 active:scale-[0.98] text-slate-900 font-semibold px-4 py-3 rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-sm mb-5"
      >
        <GoogleIcon className="w-4 h-4" />
        {tab === 'signin' ? 'Sign in with Google' : 'Sign up with Google'}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-xs text-slate-500">or with email</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      {/* Email form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email" type="email" value={email} onChange={setEmail} placeholder="you@example.com" autoComplete="email" icon={EnvelopeIcon} />
        <PasswordField
          label="Password"
          value={password}
          onChange={setPassword}
          placeholder={tab === 'signup' ? 'Min. 8 characters' : '••••••••'}
          autoComplete={tab === 'signin' ? 'current-password' : 'new-password'}
        />
        {tab === 'signup' && (
          <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} placeholder="••••••••" autoComplete="new-password" />
        )}

        {error && <p className="text-xs text-red-400">{error}</p>}

        {tab === 'signin' && (
          <div className="flex justify-end">
            <button type="button" onClick={() => setScreen('forgot')} className="text-xs text-slate-500 hover:text-brand-400 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]">
              Forgot password?
            </button>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3 bg-brand-600 hover:bg-brand-500 active:scale-[0.98] disabled:opacity-50 text-white font-semibold rounded-full transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-sm"
        >
          {loading && <CircleNotchIcon weight="bold" className="w-4 h-4 animate-spin" />}
          {loading ? '' : tab === 'signin' ? 'Sign In' : 'Create Account'}
        </button>
      </form>

      {tab === 'signup' && (
        <p className="text-xs text-slate-500 text-center mt-4 leading-relaxed">
          New accounts require admin approval before access is granted.
        </p>
      )}
    </PageShell>
  )
}

function PageShell({ children }) {
  const reduce = useReducedMotion()
  return (
    <div className="relative min-h-screen bg-navy-950 flex items-center justify-center px-4 overflow-hidden">
      <div className="absolute inset-0 bg-grid-dark pointer-events-none" />

      {/* ambient glow orbs */}
      <motion.div
        aria-hidden
        className="absolute -z-0 top-[-10%] left-[10%] w-[26rem] h-[26rem] rounded-full bg-brand-500/20 blur-[110px] pointer-events-none"
        animate={reduce ? undefined : { x: [0, 40, 0], y: [0, 24, 0], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="absolute -z-0 bottom-[-15%] right-[12%] w-[22rem] h-[22rem] rounded-full bg-emerald-500/10 blur-[110px] pointer-events-none"
        animate={reduce ? undefined : { x: [0, -30, 0], y: [0, -20, 0], opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />

      <Link
        to="/"
        className="absolute top-6 left-6 z-20 flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-200 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
      >
        <HouseIcon weight="light" className="w-4 h-4" />
        Home
      </Link>

      <motion.div
        className="relative z-10 w-full max-w-sm"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        {/* Double-bezel card */}
        <div className="bg-white/5 border border-white/10 p-1.5 rounded-[2rem]">
          <div className="bg-navy-900/80 backdrop-blur-2xl rounded-[calc(2rem-0.375rem)] p-8">
            {children}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

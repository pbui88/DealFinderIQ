import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { ClockIcon } from '@phosphor-icons/react'

const EASE = [0.16, 1, 0.3, 1]

export default function PendingApprovalPage() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const reduce = useReducedMotion()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="relative min-h-screen bg-paper flex flex-col items-center justify-center px-6 overflow-hidden">
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

      <motion.div
        className="relative z-10 max-w-md w-full text-center"
        initial={reduce ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center">
            <ClockIcon weight="light" className="w-8 h-8 text-brand-600" />
          </div>
        </div>

        {/* Logo */}
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <span className="font-display text-sm font-bold tracking-tight">
            <span className="text-ink">Deal</span><span className="text-brand-600">Finder</span><span className="text-ink">IQ</span>
          </span>
        </div>

        <h1 className="font-display text-2xl font-bold text-ink mb-3">Account Pending Approval</h1>
        <p className="text-ink-muted mb-2 leading-relaxed">
          Thanks for signing up{profile?.full_name ? `, ${profile.full_name.split(' ')[0]}` : ''}. Your account is waiting for admin activation.
        </p>
        <p className="text-ink-muted text-sm mb-10">
          You'll have full access once an admin reviews and activates your account. This usually happens within 24 hours.
        </p>

        {/* Status pill */}
        <div className="inline-flex items-center gap-2 bg-brand-500/10 border border-brand-500/20 rounded-full px-4 py-2 text-sm text-brand-600 mb-10">
          <span className="w-2 h-2 bg-brand-500 rounded-full animate-pulse" />
          Waiting for activation
        </div>

        <div className="border-t border-line pt-8">
          <p className="text-xs text-ink-muted mb-4">Signed in as {profile?.email}</p>
          <button
            onClick={handleSignOut}
            className="text-sm text-ink-muted hover:text-ink underline-offset-4 hover:underline transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
          >
            Sign out and use a different account
          </button>
        </div>
      </motion.div>
    </div>
  )
}

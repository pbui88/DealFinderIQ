import { NavLink, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import {
  SquaresFourIcon,
  CreditCardIcon,
  MagnifyingGlassIcon,
  GearSixIcon,
  SignOutIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useAuth } from '../../context/AuthContext'

function NavItem({ to, icon, label }) {
  return (
    <NavLink
      to={to}
      end={to === '/dashboard'}
      className={({ isActive }) =>
        `flex items-center gap-3 px-3 py-2.5 rounded-2xl text-sm font-medium transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] ${
          isActive
            ? 'bg-brand-600/15 text-brand-600 border border-brand-600/25'
            : 'text-ink-muted border border-transparent hover:text-ink hover:bg-black/[0.03]'
        }`
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}

function UsageWidget() {
  const { usage } = useAuth()
  if (!usage) return null

  const { totalCredits = 0, purchasedCreditsUsed = 0 } = usage
  const remaining = Math.max(0, totalCredits - purchasedCreditsUsed)
  const pct       = totalCredits > 0 ? Math.min(100, Math.round((purchasedCreditsUsed / totalCredits) * 100)) : 0
  const empty     = remaining <= 0
  const low       = !empty && pct >= 75

  const barColor   = empty ? 'bg-red-500' : low ? 'bg-amber-500' : 'bg-brand-500'
  const labelColor = empty ? 'text-red-600' : low ? 'text-amber-600' : 'text-ink'

  return (
    <div className="px-3 pb-3">
      <div className="bg-white/70 backdrop-blur-2xl border border-line rounded-2xl p-3 shadow-[0_4px_16px_rgba(15,23,42,0.06)]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-ink-muted">Credits</span>
          <span className={`text-xs font-bold font-mono ${labelColor}`}>
            {remaining.toLocaleString()} left
          </span>
        </div>
        <div className="h-1 w-full bg-black/[0.06] rounded-full overflow-hidden mb-2">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: totalCredits > 0 ? `${100 - pct}%` : '0%' }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs font-mono text-ink-faint">
            {purchasedCreditsUsed.toLocaleString()} used
          </span>
          <span className="text-xs font-mono text-ink-faint">
            {totalCredits.toLocaleString()} total
          </span>
        </div>
        {empty && totalCredits > 0 && (
          <div className="mt-2 flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-xl px-2 py-1.5">
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full shrink-0" />
            <span className="text-xs text-red-600 font-medium">Credits exhausted</span>
          </div>
        )}
        {empty && totalCredits === 0 && (
          <div className="mt-2 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-2 py-1.5">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full shrink-0" />
            <span className="text-xs text-amber-600 font-medium">No credits — contact admin</span>
          </div>
        )}
        {!empty && low && (
          <div className="mt-2 flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl px-2 py-1.5">
            <span className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse shrink-0" />
            <span className="text-xs text-amber-600 font-medium">{remaining.toLocaleString()} pts remaining</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Sidebar({ open, onClose }) {
  const { profile, isAdmin, signOut } = useAuth()
  const navigate = useNavigate()
  const shouldReduceMotion = useReducedMotion()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  const initial = (profile?.full_name || profile?.email || 'U')[0].toUpperCase()

  return (
    <>
      {/* Backdrop — mobile only */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: shouldReduceMotion ? 0 : 0.25 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside className={`
        fixed inset-y-0 left-0 z-50 w-56 shrink-0
        border-r border-line flex flex-col h-full
        transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]
        ${open ? 'translate-x-0' : '-translate-x-full'}
        lg:relative lg:translate-x-0
      `}
        style={{
          backgroundImage: 'url(/hero.png)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      >
        {/* Light overlay so content remains readable over the background image */}
        <div className="absolute inset-0 bg-paper/90 backdrop-blur-2xl pointer-events-none" />

        {/* Close button — mobile only */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-xl text-ink-muted hover:text-ink hover:bg-black/[0.05] transition-all duration-300 active:scale-[0.98] lg:hidden"
          aria-label="Close navigation"
        >
          <XIcon className="w-4 h-4" weight="light" />
        </button>

        {/* Logo */}
        <div className="relative z-10 px-4 py-6 border-b border-line flex justify-center">
          <span className="font-display text-xl font-bold tracking-tight">
            <span className="text-ink">Deal</span><span className="text-brand-600">Finder</span><span className="text-ink">IQ</span>
          </span>
        </div>

        {/* Nav */}
        <nav className="relative z-10 flex-1 p-3 space-y-0.5">
          <NavItem
            to="/dashboard"
            label="Records"
            icon={<SquaresFourIcon className="w-4 h-4" weight="light" />}
          />
          <NavItem
            to="/credits"
            label="Credits"
            icon={<CreditCardIcon className="w-4 h-4" weight="light" />}
          />
          <NavItem
            to="/skiptrace"
            label="Skip Trace"
            icon={<MagnifyingGlassIcon className="w-4 h-4" weight="light" />}
          />
          {isAdmin && (
            <NavItem
              to="/admin"
              label="Admin"
              icon={<GearSixIcon className="w-4 h-4" weight="light" />}
            />
          )}
        </nav>

        {/* Usage */}
        <div className="relative z-10"><UsageWidget /></div>

        {/* User */}
        <div className="relative z-10 p-3 border-t border-line">
          <div className="flex items-center gap-2.5 px-2 py-1.5 mb-1.5">
            <div className="w-7 h-7 rounded-full bg-brand-600/20 border border-brand-600/30 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-brand-600">{initial}</span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink truncate">
                {profile?.full_name || profile?.email || 'User'}
              </p>
              {isAdmin && <p className="text-[10px] text-brand-600 font-semibold">Admin</p>}
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-ink-faint hover:text-ink hover:bg-black/[0.03] transition-all duration-300 active:scale-[0.98]"
          >
            <SignOutIcon className="w-3.5 h-3.5" weight="light" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  )
}

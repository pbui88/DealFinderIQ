import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  AreaChart, Area, ResponsiveContainer,
} from 'recharts'
import {
  ArrowsClockwiseIcon as ArrowsClockwise,
  ListIcon as List,
  XIcon as X,
  PlusIcon as Plus,
  WarningCircleIcon as WarningCircle,
  DatabaseIcon as Database,
  HardDriveIcon as HardDrive,
} from '@phosphor-icons/react'
import {
  adminGetUsers, adminUpdateUser, adminDeleteUser, adminGetUsage, adminGetMonitor,
  adminGetSkipTraceStats, adminCheckSkipTracePending, adminGetStreetViewQuota,
  adminResetUserCycle, adminSetUserKey, adminGrantCredits, adminSetCredits,
} from '../../lib/api'
import { US_STATES } from '../../../shared/taxRates.js'

const EASE = [0.16, 1, 0.3, 1]

function fadeUp(reduce, delay = 0) {
  return {
    initial: reduce ? false : { opacity: 0, y: 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.45, delay, ease: EASE },
  }
}

function fmtBytes(bytes) {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

let sparkGradId = 0

function Sparkline({ points = '0,20 20,16 40,14 60,8 80,6', color = '#60a5fa' }) {
  const [gradId] = useState(() => `spark-grad-${++sparkGradId}`)
  const data = points.trim().split(' ').map(p => {
    const [x, y] = p.split(',').map(Number)
    return { x, y: 24 - y }
  })
  return (
    <div className="w-14 h-4 opacity-60">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 1, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.45} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone" dataKey="y" stroke={color} strokeWidth={1.5}
            fill={`url(#${gradId})`} isAnimationActive={false} dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

function StatCard({ label, value, sparkColor = '#60a5fa', sparkPoints, delay = 0, reduce }) {
  return (
    <motion.div {...fadeUp(reduce, delay)} className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 font-ui">{label}</p>
      <div className="flex items-end justify-between">
        <p className="text-3xl font-bold font-mono text-white tabular-nums">{value}</p>
        <Sparkline color={sparkColor} points={sparkPoints} />
      </div>
    </motion.div>
  )
}

function AlertBanner({ alert }) {
  const critical = alert.level === 'critical'
  return (
    <div className={`flex items-center gap-3 rounded-xl pl-3 pr-4 py-3 bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-l-4 ${
      critical ? 'border-l-red-500' : 'border-l-amber-500'
    }`}>
      <WarningCircle weight="fill" className={`w-4 h-4 shrink-0 ${critical ? 'text-red-400' : 'text-amber-400'}`} />
      <p className={`text-sm font-medium font-ui ${critical ? 'text-red-400' : 'text-amber-400'}`}>{alert.message}</p>
    </div>
  )
}

function CostCard({ label, value, sub }) {
  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-5">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 font-ui">{label}</p>
      <p className="text-3xl font-bold font-mono text-white tabular-nums">${value.toFixed(2)}</p>
      {sub && <p className="text-xs text-slate-500 mt-1 font-ui">{sub}</p>}
    </div>
  )
}

function UsageGauge({ label, used, limit }) {
  const pct   = limit > 0 ? Math.min(100, (used / limit) * 100) : 0
  const color = pct >= 90 ? 'bg-red-500' : pct >= 75 ? 'bg-amber-500' : 'bg-brand-500'
  return (
    <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider font-ui">{label}</p>
        <span className="text-xs text-slate-500 font-mono tabular-nums">{pct.toFixed(1)}%</span>
      </div>
      <p className="text-xl font-bold font-mono text-white mb-3 tabular-nums">
        {fmtBytes(used)} <span className="text-sm font-normal text-slate-500">/ {fmtBytes(limit)}</span>
      </p>
      <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function RoleBadge({ role }) {
  return role === 'admin'
    ? <span className="badge-blue">Admin</span>
    : <span className="badge-slate">User</span>
}

function UsageBar({ used, limit }) {
  if (limit <= 0) {
    return <span className="text-xs text-slate-500 font-ui">No credits granted</span>
  }
  const pct  = Math.min(100, Math.round((used / limit) * 100))
  const over = pct >= 90
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <span className={`text-xs font-medium font-mono tabular-nums ${over ? 'text-red-400' : used > 0 ? 'text-slate-300' : 'text-slate-500'}`}>
          {used.toLocaleString()} <span className="font-normal text-slate-500">/ {limit.toLocaleString()}</span>
        </span>
        {used > 0 && <span className="text-xs text-slate-500 ml-2 font-mono">{pct}%</span>}
      </div>
      <div className="h-1 w-full bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : 'bg-brand-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

function KeyEditor({ user, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value,   setValue]   = useState('')
  const [saving,  setSaving]  = useState(false)

  const save = async () => {
    setSaving(true)
    try { await onSave(user.id, value.trim() || null); setEditing(false); setValue('') }
    catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const clear = async () => {
    if (!confirm(`Remove Google Maps key for ${user.email}?`)) return
    setSaving(true)
    try { await onSave(user.id, null) }
    catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  if (!editing) {
    return user.has_own_key ? (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2 py-0.5 font-ui">
          <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" /> Own key
        </span>
        <button onClick={clear} disabled={saving} className="text-slate-500 hover:text-red-400 transition disabled:opacity-50" title="Remove key">
          <X weight="light" className="w-3 h-3" />
        </button>
      </div>
    ) : (
      <button onClick={() => setEditing(true)} className="text-xs text-slate-500 hover:text-brand-400 transition underline underline-offset-2 font-ui">
        + Set key
      </button>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <input
        type="password" value={value} onChange={e => setValue(e.target.value)} placeholder="AIzaSy…" autoFocus
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        className="w-28 px-1.5 py-0.5 text-xs font-mono bg-navy-800 border border-brand-600/50 rounded text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <button onClick={save} disabled={saving || !value.trim()} className="text-xs text-brand-400 hover:text-brand-300 font-medium disabled:opacity-50 font-ui">{saving ? '…' : 'Save'}</button>
      <button onClick={() => setEditing(false)} className="text-slate-500 hover:text-slate-400">
        <X weight="light" className="w-3 h-3" />
      </button>
    </div>
  )
}

function BillingStateEditor({ user, onSave }) {
  const [saving, setSaving] = useState(false)

  const handleChange = async (e) => {
    const val = e.target.value
    setSaving(true)
    try { await onSave(user.id, val || null) }
    catch (err) { alert(err.message) }
    finally { setSaving(false) }
  }

  return (
    <select
      value={user.billing_state || ''}
      onChange={handleChange}
      disabled={saving}
      className="text-xs bg-navy-800 border border-white/[0.08] rounded-md px-2 py-1 text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:opacity-50 w-[100px] font-ui"
    >
      <option value="">— not set —</option>
      {US_STATES.map(s => (
        <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
      ))}
    </select>
  )
}

function GrantCreditsEditor({ user, onGrant, onSet }) {
  const [editing, setEditing] = useState(false)
  const [mode,    setMode]    = useState('add') // 'add' | 'set'
  const [value,   setValue]   = useState('')
  const [saving,  setSaving]  = useState(false)

  const totalCredits = user.total_credits ?? ((user.purchased_credits ?? 0) + (user.granted_credits ?? 0))

  const open = (m) => { setMode(m); setValue(m === 'set' ? String(totalCredits) : ''); setEditing(true) }

  const save = async () => {
    const pts = parseInt(value, 10)
    if (isNaN(pts) || pts < 0) return
    if (mode === 'add' && pts <= 0) return
    setSaving(true)
    try {
      if (mode === 'add') await onGrant(user.id, pts)
      else                await onSet(user.id, pts)
      setEditing(false); setValue('')
    }
    catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  if (!editing) {
    return (
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium font-mono tabular-nums ${totalCredits > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
          {totalCredits.toLocaleString()} pts
        </span>
        <button onClick={() => open('add')} className="text-slate-500 hover:text-brand-400 transition" title="Add credits">
          <Plus weight="light" className="w-3 h-3" />
        </button>
        <button onClick={() => open('set')} className="text-xs text-slate-500 hover:text-amber-400 transition underline underline-offset-2 font-ui" title="Set exact total">Edit</button>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1">
      <input
        type="number" value={value} onChange={e => setValue(e.target.value)}
        placeholder={mode === 'add' ? 'e.g. 500' : 'total pts'} autoFocus min={mode === 'add' ? '1' : '0'}
        onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
        className="w-20 px-1.5 py-0.5 text-xs font-mono bg-navy-800 border border-brand-600/50 rounded text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
      />
      <button onClick={save} disabled={saving || !value} className={`text-xs font-medium disabled:opacity-50 font-ui ${mode === 'add' ? 'text-brand-400 hover:text-brand-300' : 'text-amber-400 hover:text-amber-300'}`}>
        {saving ? '…' : mode === 'add' ? 'Grant' : 'Set'}
      </button>
      <button onClick={() => setEditing(false)} className="text-slate-500 hover:text-slate-400">
        <X weight="light" className="w-3 h-3" />
      </button>
    </div>
  )
}

function SkipTraceMonitor({ stats, onRefresh }) {
  const { platform, users = [] } = stats

  const fmtDate = ts => ts ? new Date(ts).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  return (
    <div className="space-y-4">
      {/* Platform summary */}
      <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-slate-300 font-display">Skip Trace Usage</h3>
          <button
            onClick={onRefresh}
            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition font-ui"
          >
            <ArrowsClockwise weight="light" className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-ui">User Balances</p>
            <p className="text-2xl font-bold font-mono text-white tabular-nums">${platform.totalUserBalance.toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1 font-ui">outstanding deposits</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-ui">Pending Jobs</p>
            <p className="text-2xl font-bold font-mono text-white tabular-nums">{platform.pendingJobsCount}</p>
            <p className="text-xs text-slate-500 mt-1 font-ui">
              {platform.pendingJobsCount > 0 ? `$${platform.pendingJobsCost.toFixed(2)} committed` : 'no active jobs'}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-ui">API Spend (30d)</p>
            <p className="text-2xl font-bold font-mono text-white tabular-nums">${platform.totalSpent30d.toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1 font-ui">Tracerfy charges</p>
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-ui">All-time Spend</p>
            <p className="text-2xl font-bold font-mono text-white tabular-nums">${platform.totalSpentAllTime.toFixed(2)}</p>
            <p className="text-xs text-slate-500 mt-1 font-ui">cumulative</p>
          </div>
        </div>
      </div>

      {/* Per-user usage table */}
      <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-white/[0.06]">
          <h3 className="text-sm font-semibold text-slate-300 font-display">User Usage</h3>
        </div>
        {users.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8 font-ui">No skip trace activity yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.02]">
                {['User', 'Balance', 'Records Traced', 'Pending', 'Total Spent', 'Last Activity'].map(h => (
                  <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide font-ui">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {users.map(u => {
                const initial = (u.fullName || u.email || 'U')[0].toUpperCase()
                return (
                  <tr key={u.userId} className="hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-brand-600/15 border border-brand-600/20 flex items-center justify-center shrink-0">
                          <span className="text-[11px] font-bold text-brand-400 font-mono">{initial}</span>
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-200 font-ui">{u.fullName || '—'}</p>
                          <p className="text-[11px] text-slate-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold tabular-nums font-mono ${u.balance <= 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                        ${u.balance.toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-300 tabular-nums font-mono">{u.totalRecords.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      {u.pendingRecords > 0
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 font-ui">{u.pendingRecords} pending</span>
                        : <span className="text-xs text-slate-500">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold tabular-nums text-slate-300 font-mono">${u.totalSpent.toFixed(2)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-slate-500 font-ui">{fmtDate(u.lastSubmitted)}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StreetViewQuota({ quota, start, end, onStart, onEnd, onApply, search, onSearch, loading }) {
  const { summary, adminSummary, users, adminUsers } = quota

  const q = search.toLowerCase()
  const filteredUsers = users.filter(u =>
    !q || (u.fullName || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
  )

  const statusBadge = (u) => {
    if (!u.hasOwnKey) return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20 font-ui">
        No own key
      </span>
    )
    if (u.used > u.limit) return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 font-ui">
        <span className="w-1.5 h-1.5 bg-red-400 rounded-full animate-pulse" />Over quota
      </span>
    )
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-ui">
        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />Under quota
      </span>
    )
  }

  return (
    <div className="space-y-5">
      {/* Toolbar: date range + search */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <div>
            <label className="block text-xs text-slate-500 mb-1 font-ui">From</label>
            <input
              type="date" value={start} onChange={e => onStart(e.target.value)}
              className="text-xs bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1 font-ui">To</label>
            <input
              type="date" value={end} onChange={e => onEnd(e.target.value)}
              className="text-xs bg-white/[0.04] border border-white/[0.08] rounded-md px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={onApply} disabled={loading}
            className="mt-5 px-3 py-1.5 text-xs font-medium bg-brand-600/20 text-brand-400 border border-brand-600/30 rounded-full hover:bg-brand-600/30 transition disabled:opacity-50 active:scale-[0.98] font-ui"
          >
            {loading ? '…' : 'Apply'}
          </button>
        </div>
        <div className="flex-1 min-w-[180px] mt-auto">
          <input
            type="text" placeholder="Search user…" value={search} onChange={e => onSearch(e.target.value)}
            className="w-full text-xs bg-white/[0.04] border border-white/[0.08] rounded-md px-3 py-1.5 text-slate-300 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 font-ui">Over Quota</p>
          <p className="text-3xl font-bold font-mono text-red-400 tabular-nums">{summary.usersOverQuota}</p>
          <p className="text-xs text-slate-500 mt-1 font-ui">users this cycle</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 font-ui">Platform Overflow</p>
          <p className="text-3xl font-bold font-mono text-amber-400 tabular-nums">{summary.totalPlatformOverflow.toLocaleString()}</p>
          <p className="text-xs text-slate-500 mt-1 font-ui">pts billed to platform key</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 font-ui">Platform API Cost</p>
          <p className="text-3xl font-bold font-mono text-white tabular-nums">${summary.platformApiCost.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1 font-ui">est. Google charges (cycle)</p>
        </div>
        <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-5">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 font-ui">Markup Revenue</p>
          <p className="text-3xl font-bold font-mono text-emerald-400 tabular-nums">${summary.totalMarkupRevenue.toFixed(2)}</p>
          <p className="text-xs text-slate-500 mt-1 font-ui">$0.014 × all pts (cycle)</p>
        </div>
      </div>

      {/* Per-user table */}
      <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-white/[0.06] flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-300 font-display">Street View Quota</h3>
          <span className="text-xs text-slate-500 font-mono">{filteredUsers.length} users</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-white/[0.02]">
              {['User', 'Status', 'Cycle Used', 'Own Key', 'Platform Overflow', 'Purchased Credits', 'Granted Credits', 'Markup (cycle)', 'Lifetime Spend'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide whitespace-nowrap font-ui">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {filteredUsers.map(u => {
              const overQuota = u.hasOwnKey && u.used > u.limit
              const pct = u.limit > 0 ? Math.min(100, Math.round((u.used / u.limit) * 100)) : 0
              const initial = (u.fullName || u.email || '?')[0].toUpperCase()
              const hasPurchased = (u.purchasedCredits ?? 0) > 0
              return (
                <tr key={u.userId} className={`transition-colors ${overQuota ? 'bg-red-500/[0.04] hover:bg-red-500/[0.07]' : 'hover:bg-white/[0.02]'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-brand-600/15 border border-brand-600/20 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-brand-400 font-mono">{initial}</span>
                      </div>
                      <div>
                        {u.fullName && <p className="text-xs font-semibold text-slate-200 font-ui">{u.fullName}</p>}
                        <p className="text-xs text-slate-500">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{statusBadge(u)}</td>
                  <td className="px-4 py-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-semibold tabular-nums font-mono ${overQuota ? 'text-red-400' : 'text-slate-200'}`}>
                          {u.used.toLocaleString()}
                        </span>
                        {u.hasOwnKey && <span className="text-xs text-slate-500 font-mono">{pct}%</span>}
                      </div>
                      {u.hasOwnKey && (
                        <div className="h-1 w-24 bg-white/[0.06] rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums text-slate-400 font-mono">
                    {u.hasOwnKey ? u.ownKeyUsed.toLocaleString() : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {u.platformOverflow > 0
                      ? <span className="text-xs font-semibold tabular-nums text-amber-400 font-mono">{u.platformOverflow.toLocaleString()}</span>
                      : <span className="text-xs text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums font-semibold text-violet-400 font-mono">
                    {(u.purchasedCredits ?? 0) > 0 ? (u.purchasedCredits).toLocaleString() : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums font-semibold text-brand-400 font-mono">
                    {(u.grantedCredits ?? 0) > 0 ? (u.grantedCredits).toLocaleString() : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold tabular-nums font-mono">
                    {hasPurchased
                      ? <span className="text-emerald-400">${u.markupRevenue.toFixed(2)}</span>
                      : <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold tabular-nums font-mono">
                    {(u.scanCreditSpent ?? 0) > 0
                      ? <span className="text-slate-200">${u.scanCreditSpent.toFixed(2)}</span>
                      : <span className="text-slate-500">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filteredUsers.length === 0 && (
          <p className="text-sm text-slate-500 px-6 py-4 font-ui">{users.length === 0 ? 'No active users.' : 'No users match your search.'}</p>
        )}
      </div>

      {/* Admin usage section */}
      {adminUsers?.length > 0 && adminSummary && (
        <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-300 font-display">Platform Key Usage — Current Cycle</h3>
            <span className="text-xs text-slate-500 font-ui">Shared across all admins · 10k free / $0.007 over</span>
          </div>

          {/* Combined totals */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 font-ui">Total Calls</p>
              <p className={`text-2xl font-bold font-mono tabular-nums ${adminSummary.totalUsed > 10000 ? 'text-amber-400' : 'text-slate-200'}`}>
                {adminSummary.totalUsed.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 font-ui">of 10,000 free</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 font-ui">Billable Points</p>
              <p className={`text-2xl font-bold font-mono tabular-nums ${adminSummary.totalBillable > 0 ? 'text-amber-400' : 'text-slate-500'}`}>
                {adminSummary.totalBillable > 0 ? adminSummary.totalBillable.toLocaleString() : '—'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 font-ui">beyond free tier</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5 font-ui">Est. Cost</p>
              <p className={`text-2xl font-bold font-mono tabular-nums ${adminSummary.totalCost > 0 ? 'text-white' : 'text-slate-500'}`}>
                {adminSummary.totalCost > 0 ? `$${adminSummary.totalCost.toFixed(2)}` : '$0.00'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5 font-ui">this cycle</p>
            </div>
          </div>

          {/* Free tier progress bar */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500 font-ui">Free tier used</span>
              <span className="text-xs text-slate-400 tabular-nums font-mono">
                {Math.min(adminSummary.totalUsed, 10000).toLocaleString()} / 10,000
                {adminSummary.totalBillable > 0 && <span className="text-amber-400 ml-2">+{adminSummary.totalBillable.toLocaleString()} billable</span>}
              </span>
            </div>
            <div className="h-2 w-full bg-white/[0.05] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${adminSummary.totalBillable > 0 ? 'bg-amber-400' : 'bg-brand-500'}`}
                style={{ width: `${Math.min(100, Math.round((adminSummary.totalUsed / 10000) * 100))}%` }}
              />
            </div>
          </div>

          {/* Per-admin breakdown (contribution only, no per-user billing) */}
          {adminUsers.length > 1 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 font-ui">By Admin</p>
              <div className="space-y-2">
                {adminUsers.map(u => {
                  const barPct = adminSummary.totalUsed > 0 ? Math.round((u.used / adminSummary.totalUsed) * 100) : 0
                  const initial = (u.fullName || u.email || '?')[0].toUpperCase()
                  return (
                    <div key={u.userId} className="flex items-center gap-3">
                      <div className="w-6 h-6 rounded-full bg-brand-600/15 border border-brand-600/20 flex items-center justify-center shrink-0">
                        <span className="text-[10px] font-bold text-brand-400 font-mono">{initial}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs text-slate-400 truncate font-ui">{u.fullName || u.email}</span>
                          <span className="text-xs font-semibold tabular-nums text-slate-300 ml-2 shrink-0 font-mono">{u.used.toLocaleString()}</span>
                        </div>
                        <div className="h-1 w-full bg-white/[0.05] rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500/50 rounded-full" style={{ width: `${barPct}%` }} />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}


export default function AdminPanel() {
  const { openSidebar } = useOutletContext()
  const reduce = useReducedMotion()
  const [users,           setUsers]           = useState([])
  const [usersLoading,      setUsersLoading]      = useState(false)
  const [usersRefreshedAt,  setUsersRefreshedAt]  = useState(null)
  const [usersSearch,       setUsersSearch]       = useState('')
  const [usage,           setUsage]           = useState(null)
  const [monitor,         setMonitor]         = useState(null)
  const [svQuota,         setSvQuota]         = useState(null)
  const [svQuotaLoading,  setSvQuotaLoading]  = useState(false)
  const [skipTraceStats,  setSkipTraceStats]  = useState(null)
  const [loading,         setLoading]         = useState(true)
  const [monitorLoading,  setMonitorLoading]  = useState(false)
  const [stLoading,       setStLoading]       = useState(false)

  const defaultStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10) }
  const defaultEnd   = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10) }
  const [quotaStart,  setQuotaStart]  = useState(defaultStart)
  const [quotaEnd,    setQuotaEnd]    = useState(defaultEnd)
  const [quotaSearch, setQuotaSearch] = useState('')
  const [usageStart,  setUsageStart]  = useState(defaultStart)
  const [usageEnd,    setUsageEnd]    = useState(defaultEnd)
  const [usageLoading, setUsageLoading] = useState(false)
  const [tab,             setTab]             = useState('users')

  const safe = (p, ms = 20000) => {
    const t = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
    return Promise.race([p, t]).catch(e => { console.error('[admin]', e.message); return null })
  }

  const loadUsage = async (start, end) => {
    setUsageLoading(true)
    try {
      const data = await safe(adminGetUsage(start, end))
      if (data) setUsage(data)
    } finally {
      setUsageLoading(false)
    }
  }

  const loadUsers = async () => {
    setUsersLoading(true)
    try {
      const data = await safe(adminGetUsers())
      if (data) { setUsers(data); setUsersRefreshedAt(new Date()) }
    } finally {
      setUsersLoading(false)
    }
  }

  const load = async () => {
    setLoading(true)
    try {
      const [usersData, usageData] = await Promise.all([
        safe(adminGetUsers()),
        safe(adminGetUsage(usageStart, usageEnd)),
      ])
      if (usersData) { setUsers(usersData); setUsersRefreshedAt(new Date()) }
      if (usageData) setUsage(usageData)
    } catch (e) {
      console.error('[admin] load failed:', e)
    } finally {
      setLoading(false)
    }
  }

  const loadSvQuota = async (start, end) => {
    setSvQuotaLoading(true)
    try {
      const data = await safe(adminGetStreetViewQuota(start, end), 15000)
      setSvQuota(data || null)
    } finally {
      setSvQuotaLoading(false)
    }
  }

  const loadMonitor = async () => {
    if (monitor || monitorLoading) return
    setMonitorLoading(true)
    try {
      const monitorData = await safe(adminGetMonitor(), 25000)
      setMonitor(monitorData || null)
    } finally {
      setMonitorLoading(false)
    }
    loadSvQuota(quotaStart, quotaEnd)
  }

  const loadSkipTraceStats = async (force = false) => {
    if ((skipTraceStats || stLoading) && !force) return
    setStLoading(true)
    try {
      const data = await safe(adminGetSkipTraceStats(), 20000)
      setSkipTraceStats(data || null)
      if ((data?.platform?.pendingJobsCount ?? 0) > 0) {
        safe(adminCheckSkipTracePending(), 30000).then(() =>
          safe(adminGetSkipTraceStats(), 20000).then(d => { if (d) setSkipTraceStats(d) })
        )
      }
    } finally {
      setStLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Auto-refresh Street View Quota every 60s while Monitor tab is active
  useEffect(() => {
    if (tab !== 'monitor') return
    const id = setInterval(() => loadSvQuota(quotaStart, quotaEnd), 60000)
    return () => clearInterval(id)
  }, [tab, quotaStart, quotaEnd])

  // Auto-refresh Users tab every 30s while active
  useEffect(() => {
    if (tab !== 'users') return
    const id = setInterval(() => loadUsers(), 30000)
    return () => clearInterval(id)
  }, [tab])

  // Auto-refresh Skip Trace stats every 60s while active
  useEffect(() => {
    if (tab !== 'skip-trace') return
    const id = setInterval(() => loadSkipTraceStats(true), 60000)
    return () => clearInterval(id)
  }, [tab])

  const toggleRole   = async (user) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    if (!confirm(`Change ${user.email} to ${newRole}?`)) return
    try { await adminUpdateUser(user.id, { role: newRole }); setUsers(u => u.map(x => x.id === user.id ? { ...x, role: newRole } : x)) }
    catch (err) { alert(err.message) }
  }
  const toggleActive = async (user) => {
    const newActive = !user.is_active
    if (!confirm(`${newActive ? 'Activate' : 'Deactivate'} ${user.email}?`)) return
    try { await adminUpdateUser(user.id, { is_active: newActive }); setUsers(u => u.map(x => x.id === user.id ? { ...x, is_active: newActive } : x)) }
    catch (err) { alert(err.message) }
  }
  const deleteUser   = async (user) => {
    if (!confirm(`Permanently delete ${user.email} and all their data?`)) return
    try { await adminDeleteUser(user.id); setUsers(u => u.filter(x => x.id !== user.id)) }
    catch (err) { alert(err.message) }
  }
  const updateKey    = async (userId, key) => {
    await adminSetUserKey(userId, key)
    setUsers(u => u.map(x => x.id === userId ? { ...x, has_own_key: !!key } : x))
  }
  const updateBillingState = async (userId, state) => {
    await adminUpdateUser(userId, { billing_state: state })
    setUsers(u => u.map(x => x.id === userId ? { ...x, billing_state: state } : x))
  }
  const grantCredits = async (userId, points) => {
    const { purchased_credits, granted_credits, total_credits } = await adminGrantCredits(userId, points)
    setUsers(u => u.map(x => x.id === userId ? { ...x, purchased_credits, granted_credits, total_credits } : x))
  }
  const setCredits = async (userId, points) => {
    const { purchased_credits, granted_credits, total_credits } = await adminSetCredits(userId, points)
    setUsers(u => u.map(x => x.id === userId ? { ...x, purchased_credits, granted_credits, total_credits } : x))
  }

  const resetCycle   = async (user) => {
    if (!confirm(`Reset ${user.email}'s usage cycle to today?`)) return
    try { await adminResetUserCycle(user.id); setUsers(u => u.map(x => x.id === user.id ? { ...x, points_used_cycle: 0 } : x)) }
    catch (err) { alert(err.message) }
  }

  const fmt = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const pendingUsers = users.filter(u => !u.is_active)

  return (
    <div className="p-4 sm:p-8 w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <button
            onClick={openSidebar}
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.05] transition lg:hidden shrink-0"
            aria-label="Open navigation"
          >
            <List weight="light" className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold font-display text-white">Admin</h1>
            <p className="text-sm text-slate-400 mt-1 font-ui">Manage users and monitor platform usage</p>
          </div>
        </div>
        <button onClick={load} className="btn-outline text-xs gap-2 shrink-0">
          <ArrowsClockwise weight="light" className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Pending banner */}
      {pendingUsers.length > 0 && (
        <div className="flex items-center gap-3 bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] border-l-4 border-l-amber-500 rounded-xl pl-3 pr-4 py-3 mb-6">
          <span className="w-2 h-2 bg-amber-400 rounded-full animate-pulse shrink-0" />
          <p className="text-sm text-amber-400 font-medium font-ui">
            {pendingUsers.length} user{pendingUsers.length > 1 ? 's' : ''} waiting for activation
          </p>
          <button onClick={() => setTab('users')} className="ml-auto text-xs text-amber-500 hover:text-amber-300 underline underline-offset-2 font-ui">
            Review
          </button>
        </div>
      )}

      {/* Stats */}
      {usage && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Users"     value={users.length}                           sparkColor="#60a5fa" sparkPoints="0,20 20,18 40,14 60,10 80,8" reduce={reduce} delay={0} />
          <StatCard label="Active Users"    value={users.filter(u => u.is_active).length}  sparkColor="#34d399" sparkPoints="0,18 20,16 40,12 60,10 80,8" reduce={reduce} delay={0.05} />
          <StatCard label="Total Records"   value={usage.totalProjects || 0}               sparkColor="#60a5fa" sparkPoints="0,22 20,18 40,14 60,10 80,6" reduce={reduce} delay={0.1} />
          <StatCard label="API Calls (30d)" value={(usage.totalCalls30d || 0).toLocaleString()} sparkColor="#34d399" sparkPoints="0,20 20,14 40,16 60,8 80,10" reduce={reduce} delay={0.15} />
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-full p-1 w-fit flex-wrap">
        {[
          { key: 'users',      label: 'Users' },
          { key: 'usage',      label: 'Usage' },
          { key: 'monitor',    label: 'Monitor' },
          { key: 'skip-trace', label: 'Skip Trace' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => {
              setTab(key)
              if (key === 'monitor')    loadMonitor()
              if (key === 'skip-trace') loadSkipTraceStats()
            }}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition font-ui ${
              tab === key
                ? 'bg-brand-600 text-white'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === 'users' ? (
        <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-slate-300 font-display">Users</h3>
              {usersRefreshedAt && (
                <span className="text-xs text-slate-500 font-mono">
                  Updated {usersRefreshedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              )}
              {usersLoading && <span className="text-xs text-brand-400 animate-pulse font-ui">Refreshing…</span>}
            </div>
            <div className="flex items-center gap-2">
              <input
                value={usersSearch} onChange={e => setUsersSearch(e.target.value)}
                placeholder="Search user…"
                className="w-44 px-2.5 py-1 text-xs bg-navy-800 border border-white/[0.08] rounded-lg text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <button
                onClick={loadUsers}
                disabled={usersLoading}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 disabled:opacity-40 transition font-ui"
              >
                <ArrowsClockwise weight="light" className={`w-3.5 h-3.5 ${usersLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>
            <table className="w-full text-sm">
            <thead>
              <tr className="bg-white/[0.02]">
                {['User', 'Role', 'Status', 'Credits Used', 'Credits', 'API Key', 'State', 'Joined', ''].map(h => (
                  <th key={h} className="text-left px-2 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide font-ui">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {users.filter(u => {
                const q = usersSearch.trim().toLowerCase()
                return !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)
              }).map(user => {
                const initial = (user.full_name || user.email || 'U')[0].toUpperCase()
                return (
                  <tr key={user.id} className={`transition-colors ${!user.is_active ? 'bg-amber-500/5' : 'hover:bg-white/[0.02]'}`}>
                    <td className="px-2 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-brand-600/15 border border-brand-600/20 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-brand-400 font-mono">{initial}</span>
                        </div>
                        <div>
                          <p className="font-semibold text-slate-200 text-xs font-ui">{user.full_name || '—'}</p>
                          <p className="text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-2 py-2.5"><RoleBadge role={user.role} /></td>
                    <td className="px-2 py-2.5">
                      {user.is_active
                        ? <span className="badge-green">Active</span>
                        : <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 font-ui">
                            <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />Pending
                          </span>}
                    </td>
                    <td className="px-2 py-2.5">
                      {user.role === 'admin'
                        ? <span className="text-xs text-slate-500 font-ui">Unlimited</span>
                        : <UsageBar used={user.purchased_credits_used ?? 0} limit={user.total_credits ?? ((user.purchased_credits ?? 0) + (user.granted_credits ?? 0))} />}
                    </td>
                    <td className="px-2 py-2.5"><GrantCreditsEditor user={user} onGrant={grantCredits} onSet={setCredits} /></td>
                    <td className="px-2 py-2.5"><KeyEditor user={user} onSave={updateKey} /></td>
                    <td className="px-2 py-2.5">{user.role !== 'admin' && <BillingStateEditor user={user} onSave={updateBillingState} />}</td>
                    <td className="px-2 py-2.5 text-xs text-slate-500 whitespace-nowrap font-mono">{fmt(user.created_at)}</td>
                    <td className="px-2 py-2.5 whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => toggleRole(user)}   className="text-xs text-slate-500 hover:text-slate-300 transition font-medium font-ui">{user.role === 'admin' ? 'Demote' : 'Promote'}</button>
                        <button onClick={() => toggleActive(user)} className="text-xs text-slate-500 hover:text-amber-400 transition font-medium font-ui">{user.is_active ? 'Suspend' : 'Activate'}</button>
                        <button onClick={() => resetCycle(user)}   className="text-xs text-slate-500 hover:text-brand-400 transition font-medium font-ui">Reset</button>
                        <button onClick={() => deleteUser(user)}   className="text-xs text-slate-500 hover:text-red-400 transition font-medium font-ui">Delete</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            </table>
          {users.length === 0 && (
            <p className="text-center text-sm text-slate-500 py-10 font-ui">No users found.</p>
          )}
        </div>
      ) : tab === 'usage' ? (
        <div className="space-y-6">
          <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/[0.06] flex flex-wrap items-center gap-4">
              <h3 className="text-sm font-semibold text-slate-300 mr-auto font-display">By User</h3>
              <div className="flex items-center gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-1 font-ui">From</label>
                  <input
                    type="date" value={usageStart} onChange={e => setUsageStart(e.target.value)}
                    className="text-xs bg-navy-900 border border-white/[0.08] rounded-md px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1 font-ui">To</label>
                  <input
                    type="date" value={usageEnd} onChange={e => setUsageEnd(e.target.value)}
                    className="text-xs bg-navy-900 border border-white/[0.08] rounded-md px-2 py-1.5 text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
                <button
                  onClick={() => loadUsage(usageStart, usageEnd)} disabled={usageLoading}
                  className="mt-5 px-3 py-1.5 text-xs font-medium bg-brand-600/20 text-brand-400 border border-brand-600/30 rounded-full hover:bg-brand-600/30 transition disabled:opacity-50 active:scale-[0.98] font-ui"
                >
                  {usageLoading ? '…' : 'Apply'}
                </button>
              </div>
            </div>
            {usage?.byUser?.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-white/[0.02]">
                    {['User', 'Geocoding', 'Street View', 'Gemini Vision'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wide font-ui">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {usage.byUser.map(row => {
                    const u = users.find(x => x.id === row.userId)
                    const initial = (u?.full_name || u?.email || '?')[0].toUpperCase()
                    const svcCount = (keys) => {
                      const total = (row.services || [])
                        .filter(s => keys.includes(s.service))
                        .reduce((sum, s) => sum + (s.total_count || 0), 0)
                      return total > 0 ? total.toLocaleString() : <span className="text-slate-500">—</span>
                    }
                    return (
                      <tr key={row.userId} className="hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-brand-600/15 border border-brand-600/20 flex items-center justify-center shrink-0">
                              <span className="text-xs font-bold text-brand-400 font-mono">{initial}</span>
                            </div>
                            <div>
                              {u?.full_name && <p className="text-xs font-semibold text-slate-200 font-ui">{u.full_name}</p>}
                              <p className="text-xs text-slate-500">{u?.email ?? row.userId}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold tabular-nums text-slate-300 font-mono">
                          {svcCount(['geocoding'])}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold tabular-nums text-slate-300 font-mono">
                          {svcCount(['street_view', 'streetlevel_gsv'])}
                        </td>
                        <td className="px-4 py-3 text-xs font-semibold tabular-nums text-slate-300 font-mono">
                          {svcCount(['gemini_vision'])}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500 px-6 py-4 font-ui">No usage data yet.</p>
            )}
          </div>
        </div>
      ) : tab === 'monitor' ? (
        monitorLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !monitor ? (
          <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-6 text-center">
            <p className="text-sm text-slate-400 font-ui">Monitor data unavailable.</p>
            <p className="text-xs text-slate-500 mt-1 font-ui">Run migration <code className="text-slate-400 font-mono">012_admin_monitoring.sql</code> on your Supabase project, then refresh.</p>
            <button onClick={loadMonitor} className="mt-3 text-xs text-brand-400 hover:text-brand-300 underline underline-offset-2 font-ui">Try again</button>
          </div>
        ) : (
        <div className="space-y-6">
          {/* Street View quota tracker */}
          {(svQuota || svQuotaLoading) && (
            <div>
              <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4 font-ui">Street View Quota</h3>
              {svQuotaLoading && !svQuota
                ? <p className="text-sm text-slate-500 px-2 py-4 font-ui">Loading…</p>
                : svQuota && (
                  <StreetViewQuota
                    quota={svQuota}
                    start={quotaStart} end={quotaEnd}
                    onStart={setQuotaStart} onEnd={setQuotaEnd}
                    onApply={() => loadSvQuota(quotaStart, quotaEnd)}
                    search={quotaSearch} onSearch={setQuotaSearch}
                    loading={svQuotaLoading}
                  />
                )
              }
            </div>
          )}

          {/* Alerts */}
          {monitor.alerts.length > 0 && (
            <div className="space-y-2">
              {monitor.alerts.map((a, i) => <AlertBanner key={i} alert={a} />)}
            </div>
          )}

          {/* Database / storage usage */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <UsageGauge label="Database Size" used={monitor.database.sizeBytes} limit={monitor.database.limitBytes} />
            <UsageGauge label="Storage Used"  used={monitor.storage.sizeBytes}  limit={monitor.storage.limitBytes} />
          </div>

          {/* Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2 font-display">
                <Database weight="light" className="w-4 h-4 text-slate-500" />
                Largest Tables
              </h3>
              {monitor.database.tables.length > 0 ? (
                <div className="divide-y divide-white/[0.06]">
                  {monitor.database.tables.map(t => (
                    <div key={t.name} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-slate-500 font-mono text-xs">{t.name}</span>
                      <span className="text-slate-300 font-medium font-mono">{fmtBytes(t.sizeBytes)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 font-ui">No table data yet.</p>
              )}
            </div>
            <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2 font-display">
                <HardDrive weight="light" className="w-4 h-4 text-slate-500" />
                Storage Buckets
              </h3>
              {monitor.storage.buckets.length > 0 ? (
                <div className="divide-y divide-white/[0.06]">
                  {monitor.storage.buckets.map(b => (
                    <div key={b.name} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="text-slate-500 font-mono text-xs">{b.name}</span>
                      <div className="text-right">
                        <span className="text-slate-300 font-medium font-mono">{fmtBytes(b.sizeBytes)}</span>
                        <span className="text-slate-500 ml-3 font-mono">{b.fileCount.toLocaleString()} files</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 font-ui">No storage data yet.</p>
              )}
            </div>
          </div>
        </div>
        )
      ) : tab === 'skip-trace' ? (
        stLoading ? (
          <div className="flex justify-center py-16">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !skipTraceStats ? (
          <div className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-6 text-center">
            <p className="text-sm text-slate-400 font-ui">Skip trace stats unavailable.</p>
            <button onClick={() => loadSkipTraceStats(true)} className="mt-3 text-xs text-brand-400 hover:text-brand-300 underline underline-offset-2 font-ui">Try again</button>
          </div>
        ) : (
          <SkipTraceMonitor
            stats={skipTraceStats}
            onRefresh={() => { setSkipTraceStats(null); loadSkipTraceStats(true) }}
          />
        )
      ) : null}
    </div>
  )
}

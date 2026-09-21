import { useState, useEffect, useRef, useCallback } from 'react'
import { useOutletContext, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { splitFullAddress } from '../../lib/address'
import {
  getSkipTraceRecords,
  saveSkipTraceRecords,
  deleteSkipTraceRecord,
  deleteSkipTraceGroup,
  submitSkipTrace,
  checkSkipTraceResults,
  submitDncScrub,
} from '../../lib/api'
import {
  ListIcon,
  AddressBookIcon,
  ArrowsClockwiseIcon,
  UploadSimpleIcon,
  CheckCircleIcon,
  XIcon,
  WarningCircleIcon,
  InfoIcon,
  DownloadSimpleIcon,
  TrashIcon,
  CaretRightIcon,
  ArrowRightIcon,
  ShieldCheckIcon,
  UserIcon,
} from '@phosphor-icons/react'

const EASE = [0.32, 0.72, 0, 1]

// ── CSV parser ────────────────────────────────────────────────

function parseCSVLine(line) {
  const cols = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { field += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      cols.push(field.trim())
      field = ''
    } else {
      field += ch
    }
  }
  cols.push(field.trim())
  return cols
}

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return []
  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'))
  const col = (...names) => {
    const idx = headers.findIndex(h => names.includes(h))
    return idx >= 0 ? idx : -1
  }
  const addrIdx  = col('address', 'street', 'property_address')
  const cityIdx  = col('city', 'property_city')
  const stateIdx = col('state', 'state_code', 'property_state')
  const zipIdx   = col('zip', 'zip_code', 'postal_code', 'property_zip')

  return lines.slice(1).map(line => {
    const cols    = parseCSVLine(line)
    const rawAddr = addrIdx >= 0 ? cols[addrIdx] || '' : ''
    if (!rawAddr) return null
    if (cityIdx >= 0 || stateIdx >= 0 || zipIdx >= 0) {
      return {
        address:    rawAddr,
        city:       cityIdx  >= 0 ? cols[cityIdx]  || null : null,
        state_code: stateIdx >= 0 ? cols[stateIdx] || null : null,
        zip:        zipIdx   >= 0 ? cols[zipIdx]   || null : null,
      }
    }
    return splitFullAddress(rawAddr)
  }).filter(Boolean).filter(r => r.address)
}

// ── Status badge ──────────────────────────────────────────────
function StatusBadge({ status }) {
  const cfg = {
    saved:      { label: 'Saved',      cls: 'bg-white/[0.06] text-slate-400 border border-white/[0.08]' },
    submitted:  { label: 'Submitted',  cls: 'bg-brand-500/15 text-brand-400 border border-brand-500/20' },
    processing: { label: 'Processing', cls: 'bg-amber-500/15 text-amber-400 border border-amber-500/20' },
    completed:  { label: 'Completed',  cls: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' },
    failed:     { label: 'Failed',     cls: 'bg-red-500/15 text-red-400 border border-red-500/20' },
  }[status] || { label: status, cls: 'bg-white/[0.06] text-slate-500 border border-white/[0.08]' }
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  )
}

// ── Main page ─────────────────────────────────────────────────
export default function SkipTracePage() {
  const { openSidebar } = useOutletContext()
  const { user, usage, isAdmin } = useAuth()
  const navigate = useNavigate()
  const reduce = useReducedMotion()

  const [records,          setRecords]          = useState([])
  const [loading,          setLoading]          = useState(true)
  const [error,            setError]            = useState(null)
  const [checkedIds,       setCheckedIds]       = useState(new Set())
  const TRACE_TYPE     = 'advanced'
  const COST_PER_RECORD = 0.08
  const [submitting,       setSubmitting]       = useState(false)
  const [submitResult,     setSubmitResult]     = useState(null)
  const [submitError,      setSubmitError]      = useState(null)
  const [uploading,        setUploading]        = useState(false)
  const [uploadError,      setUploadError]      = useState(null)
  const [deletingId,       setDeletingId]       = useState(null)
  const [showConfirm,      setShowConfirm]      = useState(false)
  const [checking,         setChecking]         = useState(false)
  const [checkResult,      setCheckResult]      = useState(null)
  const [expandedGroups,   setExpandedGroups]   = useState(new Set())
  const [deletingGroup,    setDeletingGroup]    = useState(null)
  // DNC scrub state
  const [showDncConfirm,   setShowDncConfirm]   = useState(false)
  const [submittingDnc,    setSubmittingDnc]    = useState(false)
  const [dncSubmitResult,  setDncSubmitResult]  = useState(null)
  const [dncSubmitError,   setDncSubmitError]   = useState(null)
  const [dncPolling,       setDncPolling]       = useState(false)
  const dncPollRef          = useRef(null)
  const [tracePolling, setTracePolling]         = useState(false)
  const tracePollRef        = useRef(null)
  const pendingTraceIdsRef  = useRef(null)   // IDs submitted, cleared when first result arrives
  const fileRef             = useRef(null)
  const autoPollingStarted  = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { records: data } = await getSkipTraceRecords()
      setRecords(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Auto-start polling if page loads with pending records ─
  useEffect(() => {
    if (autoPollingStarted.current || tracePolling) return
    const hasPending = records.some(r => r.status === 'submitted' || r.status === 'processing')
    if (hasPending) {
      autoPollingStarted.current = true
      setTracePolling(true)
    }
  }, [records, tracePolling])

  // ── Realtime subscription ─────────────────────────────────
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel('skip-trace-live')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'skip_trace_records', filter: `user_id=eq.${user.id}` },
        (payload) => {
          setRecords(prev => prev.map(r => r.id === payload.new.id ? { ...r, ...payload.new } : r))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user?.id])

  // ── DNC auto-poll until results arrive ────────────────────
  useEffect(() => {
    if (!dncPolling) return
    let attempts = 0
    const MAX = 24  // 2 min at 5s intervals

    const poll = async () => {
      try {
        const res = await checkSkipTraceResults()
        if ((res.dncRecordsUpdated || 0) > 0) {
          setDncPolling(false)
          setDncSubmitResult(null)  // clear banner — results are visible in the records
          return
        }
      } catch {}
      attempts++
      if (attempts < MAX) {
        dncPollRef.current = setTimeout(poll, 5000)
      } else {
        setDncPolling(false)
        setDncSubmitResult(null)
      }
    }

    dncPollRef.current = setTimeout(poll, 3000)
    return () => { if (dncPollRef.current) clearTimeout(dncPollRef.current) }
  }, [dncPolling])

  // ── Skip trace auto-poll until results arrive ─────────────
  useEffect(() => {
    if (!tracePolling) return
    let attempts = 0
    const MAX = 36  // 3 min at 5s intervals

    const poll = async () => {
      try {
        const res = await checkSkipTraceResults()
        if ((res.recordsUpdated || 0) > 0) {
          await load()
          setSubmitResult(null)
          setTracePolling(false)
          return
        }
      } catch {}
      attempts++
      if (attempts < MAX) {
        tracePollRef.current = setTimeout(poll, 5000)
      } else {
        setTracePolling(false)
        setSubmitResult(null)
      }
    }

    tracePollRef.current = setTimeout(poll, 10000)  // first check after 10s
    return () => { if (tracePollRef.current) clearTimeout(tracePollRef.current) }
  }, [tracePolling, load])

  // ── Clear submit banner when submitted records complete ────
  // Watches records (updated by realtime) — clears the banner the moment
  // any of the just-submitted records transitions to completed.
  useEffect(() => {
    if (!pendingTraceIdsRef.current?.size) return
    const anyDone = records.some(
      r => pendingTraceIdsRef.current.has(r.id) && r.status === 'completed'
    )
    if (anyDone) {
      setSubmitResult(null)
      setTracePolling(false)
      pendingTraceIdsRef.current = null
    }
  }, [records])

  // ── Balance helpers ───────────────────────────────────────
  const skipTraceBalance = usage?.skipTraceBalance ?? 0

  // ── Selection helpers ─────────────────────────────────────
  const savedRecords     = records.filter(r => r.status === 'saved')
  const completedRecords = records.filter(r => r.status === 'completed')
  const savedIds         = new Set(savedRecords.map(r => r.id))
  const completedIds     = new Set(completedRecords.map(r => r.id))
  const checkedSaved     = [...checkedIds].filter(id => savedIds.has(id))
  const checkedCompleted = [...checkedIds].filter(id => completedIds.has(id))

  // Completed records selected that haven't been DNC scrubbed, OR were scrubbed with old
  // code that didn't capture per-flag columns (national_dnc === undefined on any phone)
  const needsDnc = (r) => {
    if (!r.result?.dnc_scrubbed) return true
    return r.result.phones?.some(ph => ph.national_dnc === undefined) ?? false
  }
  const dncCandidates     = records.filter(r =>
    checkedIds.has(r.id) && r.status === 'completed' && r.result && needsDnc(r)
  )
  const totalPhonesForDnc = dncCandidates.reduce((sum, r) => sum + (r.result?.phones?.length || 0), 0)

  // Any selected completed record has DNC data (for download buttons)
  const selectedHasDnc = records.some(r =>
    checkedIds.has(r.id) && r.status === 'completed' && r.result?.dnc_scrubbed
  )

  const toggleCheck = (id) => {
    setCheckedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Download CSV (batch) ──────────────────────────────────
  const downloadResults = (cleanOnly = false) => {
    const selected = records.filter(r => checkedIds.has(r.id) && r.status === 'completed')
    const header = ['List Name','Address','City','State','Zip','Owner Name','Primary Phone','Mobile 1','Mobile 2','Mobile 3','Landline 1','Landline 2','Email 1','Email 2','Email 3']
    const rows = selected.map(r => {
      const res       = r.result || {}
      const rawPhones = (res.phones || []).map(p => typeof p === 'string' ? { number: p, type: 'mobile', dnc: false } : { ...p, dnc: p.dnc ?? false })
      const phones    = cleanOnly ? rawPhones.filter(p => !p.dnc) : rawPhones
      const primary   = phones.find(p => p.type === 'primary')?.number  || ''
      const mobiles   = phones.filter(p => p.type === 'mobile').map(p => p.number)
      const landlines = phones.filter(p => p.type === 'landline').map(p => p.number)
      const emails    = res.emails || []
      return [
        r.list_name   || '', r.address    || '', r.city       || '',
        r.state_code  || '', r.zip        || '', res.full_name || '',
        primary,
        mobiles[0]  || '', mobiles[1]   || '', mobiles[2]   || '',
        landlines[0]|| '', landlines[1] || '',
        emails[0]   || '', emails[1]    || '', emails[2]    || '',
      ]
    })
    const escape = v => `"${String(v).replace(/"/g, '""')}"`
    const csv  = [header, ...rows].map(r => r.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `skip-trace-${cleanOnly ? 'clean-' : ''}${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Grouping — sorted newest-first by most recent record ─────
  const groups = (() => {
    const map = new Map()
    for (const r of records) {
      const key = r.list_name || '__uncategorized__'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(r)
    }
    return [...map.entries()]
      .map(([key, recs]) => ({
        key,
        name:           key === '__uncategorized__' ? 'Uncategorized' : key,
        records:        recs,
        latestAt:       recs[0]?.created_at || '',
        savedCount:     recs.filter(r => r.status === 'saved').length,
        completedCount: recs.filter(r => r.status === 'completed').length,
        submittedCount: recs.filter(r => ['submitted', 'processing'].includes(r.status)).length,
      }))
      .sort((a, b) => b.latestAt.localeCompare(a.latestAt))
  })()

  const toggleGroupExpand = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const handleDeleteGroup = async (group) => {
    if (!window.confirm(`Delete all ${group.records.length} record${group.records.length !== 1 ? 's' : ''} in "${group.name}"? This cannot be undone.`)) return
    setDeletingGroup(group.key)
    try {
      await deleteSkipTraceGroup(group.key)
      setRecords(prev => prev.filter(r => (r.list_name || '__uncategorized__') !== group.key))
      setCheckedIds(prev => {
        const next = new Set(prev)
        group.records.forEach(r => next.delete(r.id))
        return next
      })
      setExpandedGroups(prev => { const n = new Set(prev); n.delete(group.key); return n })
    } catch (e) {
      alert(e.message)
    } finally {
      setDeletingGroup(null)
    }
  }

  const toggleGroupAll = (group) => {
    const selectable = group.records
      .filter(r => r.status === 'saved' || r.status === 'completed')
      .map(r => r.id)
    const allChecked = selectable.length > 0 && selectable.every(id => checkedIds.has(id))
    setCheckedIds(prev => {
      const next = new Set(prev)
      if (allChecked) { selectable.forEach(id => next.delete(id)) }
      else            { selectable.forEach(id => next.add(id)) }
      return next
    })
  }

  // ── CSV upload ────────────────────────────────────────────
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setUploadError(null)
    setUploading(true)
    try {
      const text   = await file.text()
      const parsed = parseCSV(text)
      if (!parsed.length) throw new Error('No valid records found. Check that your CSV has an "address" column.')
      const listName = file.name.replace(/\.csv$/i, '')
      const { count } = await saveSkipTraceRecords(parsed, listName)
      await load()
      setSubmitResult({ message: `${count} record${count !== 1 ? 's' : ''} added from "${listName}".` })
    } catch (e) {
      setUploadError(e.message)
    } finally {
      setUploading(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────
  const handleDelete = async (id) => {
    setDeletingId(id)
    try {
      await deleteSkipTraceRecord(id)
      setRecords(prev => prev.filter(r => r.id !== id))
      setCheckedIds(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch (e) {
      alert(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  // ── Check Results ─────────────────────────────────────────
  const handleCheckResults = async () => {
    setChecking(true)
    setCheckResult(null)
    try {
      const res = await checkSkipTraceResults()
      setCheckResult(res)
      if ((res.recordsUpdated || 0) + (res.dncRecordsUpdated || 0) > 0) await load()
    } catch (e) {
      setCheckResult({ error: e.message })
    } finally {
      setChecking(false)
    }
  }

  // ── Submit skip trace ─────────────────────────────────────
  const handleSubmit = async () => {
    setShowConfirm(false)
    if (!checkedSaved.length) return
    setSubmitting(true)
    setSubmitError(null)
    setSubmitResult(null)
    try {
      const submittedIds = new Set(checkedSaved)
      const res = await submitSkipTrace(checkedSaved, TRACE_TYPE)
      setSubmitResult(res)
      setCheckedIds(new Set())
      pendingTraceIdsRef.current = submittedIds  // watched by records effect
      setTracePolling(true)                       // polling fallback
      await load()
    } catch (e) {
      setSubmitError(e.message)
    } finally {
      setSubmitting(false)
    }
  }

  // ── Submit DNC scrub ──────────────────────────────────────
  const handleScrubDnc = async () => {
    setShowDncConfirm(false)
    if (!dncCandidates.length) return
    setSubmittingDnc(true)
    setDncSubmitError(null)
    setDncSubmitResult(null)
    try {
      const res = await submitDncScrub(dncCandidates.map(r => r.id))
      setDncSubmitResult(res)
      setCheckedIds(new Set())
      setDncPolling(true)  // auto-poll until DNC flags appear via realtime
    } catch (e) {
      setDncSubmitError(e.message)
    } finally {
      setSubmittingDnc(false)
    }
  }

  return (
    <div className="min-h-full bg-navy-950">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={openSidebar}
            className="p-2 rounded-full text-slate-500 hover:text-white hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] lg:hidden shrink-0"
            aria-label="Open navigation"
          >
            <ListIcon weight="light" className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded-lg bg-brand-500/15 border border-brand-500/20 flex items-center justify-center text-brand-400">
                <AddressBookIcon weight="light" className="w-4 h-4" />
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-white tracking-tight">Skip Trace</h1>
            </div>
            <p className="text-sm text-slate-400">Find property owner contact info — phones, emails &amp; more</p>
          </div>

          {/* Action buttons */}
          <div className="shrink-0 flex items-center gap-2">
            {/* Balance chip — only for non-admins */}
            {!isAdmin && usage && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border ${
                skipTraceBalance <= 0
                  ? 'bg-red-500/10 border-red-500/20 text-red-400'
                  : 'bg-violet-500/10 border-violet-500/20 text-violet-300'
              }`}>
                <span className="text-slate-500">Balance:</span>
                <span className="font-mono font-semibold tabular-nums">${skipTraceBalance.toFixed(2)}</span>
              </div>
            )}
            {records.some(r => r.status === 'submitted' || r.status === 'processing') && (
              <button
                onClick={handleCheckResults}
                disabled={checking}
                className="flex items-center gap-2 px-3 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-sm text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-50"
              >
                {checking ? (
                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <ArrowsClockwiseIcon weight="light" className="w-4 h-4" />
                )}
                Check Results
              </button>
            )}

            <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 px-3 py-2 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-sm text-slate-200 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-50"
            >
              {uploading ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <UploadSimpleIcon weight="light" className="w-4 h-4" />
              )}
              Upload CSV
            </button>
          </div>
        </div>

        {/* Banners */}
        <AnimatePresence initial={false}>
          {submitResult?.message && (
            <motion.div
              key="submit-result-msg"
              initial={reduce ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3.5 mb-5"
            >
              <CheckCircleIcon weight="fill" className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-300 font-medium flex-1">{submitResult.message}</p>
              <button onClick={() => setSubmitResult(null)} className="text-emerald-600 hover:text-emerald-400 p-1 rounded-full transition-all duration-300 active:scale-[0.98]"><XIcon weight="light" className="w-4 h-4" /></button>
            </motion.div>
          )}
          {submitResult && !submitResult.message && (
            <motion.div
              key="submit-result-detail"
              initial={reduce ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3.5 mb-5"
            >
              <CheckCircleIcon weight="fill" className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-emerald-300 font-medium">
                  <span className="font-bold">{submitResult.recordCount} record{submitResult.recordCount !== 1 ? 's' : ''}</span> submitted for skip trace.
                </p>
                <p className="text-xs text-emerald-600 mt-0.5">Results will appear here once processing is complete. This typically takes a few minutes.</p>
                {submitResult.skippedIncomplete > 0 && (
                  <p className="text-xs text-amber-400 mt-1">
                    {submitResult.skippedIncomplete} record{submitResult.skippedIncomplete !== 1 ? 's' : ''} skipped and left in your saved list —
                    {submitResult.skippedIncomplete !== 1 ? ' their' : ' its'} address is still missing a state/zip, so we didn't charge for {submitResult.skippedIncomplete !== 1 ? 'them' : 'it'}.
                    Try submitting again in a bit once the address lookup finishes.
                  </p>
                )}
              </div>
              <button onClick={() => setSubmitResult(null)} className="text-emerald-600 hover:text-emerald-400 p-1 rounded-full shrink-0 transition-all duration-300 active:scale-[0.98]"><XIcon weight="light" className="w-4 h-4" /></button>
            </motion.div>
          )}
          {dncSubmitResult?.message && (
            <motion.div
              key="dnc-submit-result"
              initial={reduce ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-2xl px-4 py-3.5 mb-5"
            >
              {dncPolling ? (
                <span className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin shrink-0" />
              ) : (
                <CheckCircleIcon weight="fill" className="w-4 h-4 text-violet-400 shrink-0" />
              )}
              <p className="text-sm text-violet-300 font-medium flex-1">
                {dncPolling ? 'DNC scrub in progress — results will appear automatically…' : dncSubmitResult.message}
              </p>
              {!dncPolling && (
                <button onClick={() => setDncSubmitResult(null)} className="text-violet-600 hover:text-violet-400 p-1 rounded-full transition-all duration-300 active:scale-[0.98]"><XIcon weight="light" className="w-4 h-4" /></button>
              )}
            </motion.div>
          )}
          {(submitError || uploadError || dncSubmitError) && (
            <motion.div
              key="error-banner"
              initial={reduce ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3.5 mb-5"
            >
              <WarningCircleIcon weight="light" className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-300 font-medium flex-1">
                {submitError || uploadError || dncSubmitError}
                {(submitError || dncSubmitError || '').startsWith('Insufficient') && (
                  <> — <button onClick={() => navigate('/credits')} className="underline hover:text-red-200">Deposit funds →</button></>
                )}
              </p>
              <button onClick={() => { setSubmitError(null); setUploadError(null); setDncSubmitError(null) }} className="text-red-500 hover:text-red-300 p-1 rounded-full transition-all duration-300 active:scale-[0.98]"><XIcon weight="light" className="w-4 h-4" /></button>
            </motion.div>
          )}
          {checkResult && !checkResult.error && (
            <motion.div
              key="check-result"
              initial={reduce ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3.5 mb-5"
            >
              <CheckCircleIcon weight="fill" className="w-4 h-4 text-emerald-400 shrink-0" />
              <p className="text-sm text-emerald-300 font-medium flex-1">
                {checkResult.completed === 0 && !checkResult.dncRecordsUpdated
                  ? 'No completed batches yet — still processing. Try again in a few minutes.'
                  : <>
                      {checkResult.completed > 0 && <><span className="font-bold">{checkResult.completed} batch{checkResult.completed !== 1 ? 'es' : ''}</span> completed. </>}
                      {checkResult.recordsUpdated > 0 && <><span className="font-bold">{checkResult.recordsUpdated} record{checkResult.recordsUpdated !== 1 ? 's' : ''}</span> updated with contact info. </>}
                      {checkResult.dncRecordsUpdated > 0 && <><span className="font-bold">{checkResult.dncRecordsUpdated} record{checkResult.dncRecordsUpdated !== 1 ? 's' : ''}</span> updated with DNC flags.</>}
                    </>}
              </p>
              <button onClick={() => setCheckResult(null)} className="text-emerald-600 hover:text-emerald-400 p-1 rounded-full shrink-0 transition-all duration-300 active:scale-[0.98]"><XIcon weight="light" className="w-4 h-4" /></button>
            </motion.div>
          )}
          {checkResult?.error && (
            <motion.div
              key="check-result-error"
              initial={reduce ? false : { opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3.5 mb-5"
            >
              <WarningCircleIcon weight="light" className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-sm text-red-300 font-medium flex-1">{checkResult.error}</p>
              <button onClick={() => setCheckResult(null)} className="text-red-500 hover:text-red-300 p-1 rounded-full shrink-0 transition-all duration-300 active:scale-[0.98]"><XIcon weight="light" className="w-4 h-4" /></button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* CSV format hint */}
        <div className="flex items-start gap-2.5 bg-white/[0.03] border border-white/[0.06] rounded-2xl px-4 py-3 mb-6 text-xs text-slate-400">
          <InfoIcon weight="light" className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
          <span>
            CSV columns: <span className="text-slate-300 font-mono">address</span>, <span className="text-slate-300 font-mono">city</span>, <span className="text-slate-300 font-mono">state</span>, <span className="text-slate-300 font-mono">zip</span>.
            Only <span className="text-slate-300 font-mono">address</span> is required. The filename becomes the list name.
            Records saved from scan results are grouped by the name you choose when saving.
          </span>
        </div>

        {/* Sticky action bar */}
        {(checkedSaved.length > 0 || checkedCompleted.length > 0) && (
          <div className="sticky top-4 z-10 flex flex-wrap items-center gap-3 bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl px-5 py-3.5 mb-6">

            {/* Download + DNC scrub — completed records */}
            {checkedCompleted.length > 0 && (
              <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {checkedCompleted.length} result{checkedCompleted.length !== 1 ? 's' : ''} selected
                  </p>
                  <p className="text-xs text-slate-500">Ready to export</p>
                </div>

                <button
                  onClick={() => downloadResults(false)}
                  className="shrink-0 flex items-center gap-2 pl-4 pr-2 py-2 rounded-full bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
                >
                  {selectedHasDnc ? 'Download All' : 'Download CSV'}
                  <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center">
                    <DownloadSimpleIcon weight="light" className="w-3.5 h-3.5" />
                  </span>
                </button>

                {selectedHasDnc && (
                  <button
                    onClick={() => downloadResults(true)}
                    className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 hover:bg-emerald-500/15 border border-emerald-500/25 text-emerald-300 text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
                  >
                    <DownloadSimpleIcon weight="light" className="w-4 h-4" />
                    Download Clean
                  </button>
                )}

                {dncCandidates.length > 0 && (
                  <button
                    onClick={() => setShowDncConfirm(true)}
                    disabled={submittingDnc || dncPolling}
                    className="shrink-0 flex items-center gap-2 pl-4 pr-2 py-2 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-50"
                  >
                    {submittingDnc ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Starting…</>
                    ) : (
                      <>
                        Scrub DNC
                        <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center">
                          <ShieldCheckIcon weight="light" className="w-3.5 h-3.5" />
                        </span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            {checkedCompleted.length > 0 && checkedSaved.length > 0 && (
              <div className="w-px h-10 bg-white/[0.08] shrink-0" />
            )}

            {/* Submit section — saved records */}
            {checkedSaved.length > 0 && (
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {checkedSaved.length} record{checkedSaved.length !== 1 ? 's' : ''} to trace
                  </p>
                  <p className="text-xs text-slate-500 font-mono">
                    ${(COST_PER_RECORD * checkedSaved.length).toFixed(2)} estimated cost
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    onClick={() => setShowConfirm(true)}
                    disabled={submitting}
                    className="flex items-center gap-2 pl-4 pr-2 py-2 rounded-full bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-50"
                  >
                    {submitting ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Submitting…</>
                    ) : (
                      <>
                        Run Skip Trace
                        <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center">
                          <ArrowRightIcon weight="light" className="w-3.5 h-3.5" />
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={() => setCheckedIds(new Set())}
              className="shrink-0 p-1.5 rounded-full text-slate-500 hover:text-slate-300 hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
              title="Deselect all"
            >
              <XIcon weight="light" className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Skip Trace confirm dialog */}
        {showConfirm && (() => {
          const traceCost = Math.round(COST_PER_RECORD * checkedSaved.length * 100) / 100
          const canAfford = isAdmin || skipTraceBalance >= traceCost
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
              <div className="bg-white/5 border border-white/10 p-1.5 rounded-[1.75rem] max-w-sm w-full">
                <div className="bg-navy-900 rounded-[calc(1.75rem-0.375rem)] p-6">
                  <h3 className="font-display text-base font-bold text-white mb-3">Confirm Skip Trace</h3>
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-5 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Records</span>
                      <span className="text-white font-semibold font-mono">{checkedSaved.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Rate</span>
                      <span className="text-white font-semibold font-mono">$0.08 / record</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Est. Cost</span>
                      <span className="text-brand-400 font-bold font-mono">${traceCost.toFixed(2)}</span>
                    </div>
                    {!isAdmin && (
                      <>
                        <div className="flex justify-between text-sm pt-1 border-t border-white/[0.06]">
                          <span className="text-slate-500">Your Balance</span>
                          <span className={`font-semibold font-mono ${canAfford ? 'text-white' : 'text-red-400'}`}>
                            ${skipTraceBalance.toFixed(2)}
                          </span>
                        </div>
                        {canAfford ? (
                          <div className="flex justify-between text-sm">
                            <span className="text-slate-500">After this job</span>
                            <span className="text-slate-300 font-semibold font-mono">${(skipTraceBalance - traceCost).toFixed(2)}</span>
                          </div>
                        ) : (
                          <div className="pt-1">
                            <p className="text-xs text-red-400">
                              Insufficient funds — you need ${(traceCost - skipTraceBalance).toFixed(2)} more.{' '}
                              <button onClick={() => { setShowConfirm(false); navigate('/credits') }} className="underline hover:text-red-300">Deposit funds →</button>
                            </p>
                          </div>
                        )}
                      </>
                    )}
                    <div className="pt-1 border-t border-white/[0.06]">
                      <p className="text-[11px] text-slate-500">
                        Returns owner name, phones &amp; emails. Charged per matched record only — no charge on misses.
                        After results arrive, you can optionally run DNC scrub on the completed records.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowConfirm(false)} className="flex-1 py-2.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]">Cancel</button>
                    <button onClick={handleSubmit} disabled={!canAfford} className="flex-1 py-2.5 rounded-full bg-brand-600 hover:bg-brand-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]">Confirm</button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* DNC Scrub confirm dialog */}
        {showDncConfirm && (() => {
          const dncCost    = Math.round(totalPhonesForDnc * 0.02 * 100) / 100
          const canAfford  = isAdmin || skipTraceBalance >= dncCost
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm px-4">
              <div className="bg-white/5 border border-white/10 p-1.5 rounded-[1.75rem] max-w-sm w-full">
                <div className="bg-navy-900 rounded-[calc(1.75rem-0.375rem)] p-6">
                  <h3 className="font-display text-base font-bold text-white mb-1">Confirm DNC Scrub</h3>
                  <p className="text-xs text-slate-500 mb-2">Checks phone numbers against these databases:</p>
                  <div className="space-y-2 mb-4">
                    <DncInfoRow label="National DNC" info="Federal Do Not Call Registry managed by the FTC. Calling registered numbers without consent risks fines up to $51,744 per violation." />
                    <DncInfoRow label="State DNC" info="State-level Do Not Call registries. These may include numbers not on the federal list; rules and penalties vary by state." />
                    <DncInfoRow label="DMA" info="Direct Marketing Association Telephone Preference Service — an industry opt-out list for consumers who have requested no telemarketing calls." />
                    <DncInfoRow label="Litigator" info="Known TCPA serial litigators who have previously filed or threatened lawsuits for unsolicited calls. Contacting these numbers carries significant legal risk." />
                  </div>
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 mb-5 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Records</span>
                      <span className="text-white font-semibold font-mono">{dncCandidates.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Phones to check</span>
                      <span className="text-white font-semibold font-mono">{totalPhonesForDnc}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Rate</span>
                      <span className="text-white font-semibold font-mono">$0.02 / phone</span>
                    </div>
                    <div className="flex justify-between text-sm pt-1 border-t border-white/[0.06]">
                      <span className="text-slate-500">Est. Cost</span>
                      <span className="text-violet-400 font-bold font-mono">${dncCost.toFixed(2)} <span className="text-slate-600 font-normal text-[10px]">max</span></span>
                    </div>
                    {!isAdmin && (
                      <>
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-500">Your Balance</span>
                          <span className={`font-semibold font-mono ${canAfford ? 'text-white' : 'text-red-400'}`}>
                            ${skipTraceBalance.toFixed(2)}
                          </span>
                        </div>
                        {!canAfford && (
                          <div className="pt-1">
                            <p className="text-xs text-red-400">
                              Insufficient funds — you need ${(dncCost - skipTraceBalance).toFixed(2)} more.{' '}
                              <button onClick={() => { setShowDncConfirm(false); navigate('/credits') }} className="underline hover:text-red-300">Deposit funds →</button>
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setShowDncConfirm(false)} className="flex-1 py-2.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-slate-200 text-sm font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]">Cancel</button>
                    <button onClick={handleScrubDnc} disabled={!canAfford} className="flex-1 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]">Confirm</button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Records grouped by list */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-7 h-7 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 text-sm mb-3">{error}</p>
            <button onClick={load} className="text-xs text-brand-400 hover:underline">Retry</button>
          </div>
        ) : records.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-4">
            {groups.map(group => {
              const isExpanded       = expandedGroups.has(group.key)
              const selectable       = group.records.filter(r => r.status === 'saved' || r.status === 'completed').map(r => r.id)
              const allGroupChecked  = selectable.length > 0 && selectable.every(id => checkedIds.has(id))
              const someGroupChecked = selectable.some(id => checkedIds.has(id))
              const isDeletingThis   = deletingGroup === group.key

              return (
                <div key={group.key} className="bg-white/[0.04] backdrop-blur-2xl border border-white/[0.08] rounded-2xl overflow-hidden">
                  {/* Group header */}
                  <div className="px-4 py-3 flex items-center gap-3">
                    {selectable.length > 0 && (
                      <input
                        type="checkbox"
                        checked={allGroupChecked}
                        ref={el => { if (el) el.indeterminate = someGroupChecked && !allGroupChecked }}
                        onChange={() => toggleGroupAll(group)}
                        className="accent-brand-600 cursor-pointer shrink-0 w-4 h-4"
                        title={allGroupChecked ? 'Deselect all in list' : 'Select all in list'}
                      />
                    )}

                    <button
                      onClick={() => toggleGroupExpand(group.key)}
                      className="flex-1 flex items-center gap-2.5 text-left min-w-0"
                    >
                      <CaretRightIcon
                        weight="bold"
                        className={`w-3.5 h-3.5 text-slate-500 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${isExpanded ? 'rotate-90' : ''}`}
                      />
                      <span className="text-sm font-semibold text-white truncate">{group.name}</span>
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        <span className="text-[10px] text-slate-500 font-mono">{group.records.length} record{group.records.length !== 1 ? 's' : ''}</span>
                        {group.savedCount > 0 && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-white/[0.06] text-slate-400 border border-white/[0.08] font-semibold">{group.savedCount} ready</span>
                        )}
                        {group.submittedCount > 0 && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-brand-500/15 text-brand-400 border border-brand-500/20 font-semibold">{group.submittedCount} processing</span>
                        )}
                        {group.completedCount > 0 && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 font-semibold">{group.completedCount} done</span>
                        )}
                      </div>
                    </button>

                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteGroup(group) }}
                      disabled={isDeletingThis}
                      className="shrink-0 p-1.5 rounded-full text-slate-500 hover:text-red-400 hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-40"
                      title="Delete this list"
                    >
                      {isDeletingThis
                        ? <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin block" />
                        : <TrashIcon weight="light" className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        key="group-body"
                        initial={reduce ? false : { height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: EASE }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-white/[0.05] divide-y divide-white/[0.04]">
                          {group.records.map(record => (
                            <RecordRow
                              key={record.id}
                              record={record}
                              checked={checkedIds.has(record.id)}
                              onCheck={toggleCheck}
                              onDelete={handleDelete}
                              deletingId={deletingId}
                            />
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}

            <div className="text-center">
              <button onClick={load} className="flex items-center gap-1.5 mx-auto text-xs text-slate-500 hover:text-slate-300 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]">
                <ArrowsClockwiseIcon weight="light" className="w-3.5 h-3.5" />
                Refresh all
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DncInfoRow({ label, info }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
        <span className="text-xs text-slate-300 flex-1">{label}</span>
        <button
          onClick={() => setOpen(v => !v)}
          title={open ? 'Hide info' : 'What is this?'}
          className={`w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] shrink-0
            ${open ? 'bg-violet-600 text-white' : 'bg-white/[0.08] text-slate-400 hover:bg-white/[0.14] hover:text-white'}`}
        >?</button>
      </div>
      {open && (
        <p className="text-[11px] text-slate-400 leading-relaxed mt-1.5 pl-3.5 pr-1">{info}</p>
      )}
    </div>
  )
}

function RecordRow({ record, checked, onCheck, onDelete, deletingId }) {
  const isSaved      = record.status === 'saved'
  const isCompleted  = record.status === 'completed'
  const isSelectable = isSaved || isCompleted
  const isDeleting   = deletingId === record.id

  return (
    <div className={`flex items-start gap-3 px-4 py-3 transition-colors duration-300 ${checked ? 'bg-brand-600/5' : 'hover:bg-white/[0.02]'}`}>
      <div className="shrink-0 pt-0.5 w-4">
        {isSelectable
          ? <input type="checkbox" checked={checked} onChange={() => onCheck(record.id)} className="accent-brand-600 cursor-pointer w-4 h-4" />
          : <span />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 truncate font-medium">
          {record.address
            ? [record.address, record.city, record.state_code && record.zip ? `${record.state_code} ${record.zip}` : (record.state_code || record.zip)].filter(Boolean).join(', ')
            : <span className="text-slate-500 italic">No address</span>}
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[10px] text-slate-600 font-mono">{new Date(record.created_at).toLocaleDateString()}</span>
        </div>
        {record.status === 'completed' && (
          record.result
            ? <ContactResult result={record.result} record={record} />
            : <p className="text-xs text-slate-600 mt-1.5 italic">No contact data found</p>
        )}
      </div>

      <div className="shrink-0 flex items-center gap-2">
        <StatusBadge status={record.status} />
        {isSaved && (
          <button
            onClick={() => onDelete(record.id)}
            disabled={isDeleting}
            className="p-1 rounded-full text-slate-500 hover:text-red-400 hover:bg-white/[0.06] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] disabled:opacity-40"
            title="Remove"
          >
            {isDeleting ? (
              <span className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin block" />
            ) : (
              <TrashIcon weight="light" className="w-3.5 h-3.5" />
            )}
          </button>
        )}
      </div>
    </div>
  )
}

function PhoneTag({ type }) {
  if (type === 'primary')  return <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-400 border border-emerald-500/30 bg-emerald-500/10 rounded-full px-1.5 py-0.5">Primary</span>
  if (type === 'landline') return <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 border border-white/10 bg-white/5 rounded-full px-1.5 py-0.5">Landline</span>
  return                          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-400 border border-brand-500/30 bg-brand-500/10 rounded-full px-1.5 py-0.5">Mobile</span>
}

function DncFlag({ value }) {
  if (value === true)      return <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">Y</span>
  if (value === false)     return <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/[0.06] text-slate-500 border border-white/[0.08]">N</span>
  return                          <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-white/[0.03] text-slate-600 border border-white/[0.05]">–</span>
}

const CSV_HEADER = ['List Name','Address','City','State','Zip','Owner Name','Primary Phone','Mobile 1','Mobile 2','Mobile 3','Landline 1','Landline 2','Email 1','Email 2','Email 3']

function buildCsvRow(record, result, phonesOverride) {
  const phones    = phonesOverride
  const primary   = phones.find(p => p.type === 'primary')?.number  || ''
  const mobiles   = phones.filter(p => p.type === 'mobile').map(p => p.number)
  const landlines = phones.filter(p => p.type === 'landline').map(p => p.number)
  const emails    = result.emails || []
  return [
    record.list_name  || '', record.address    || '', record.city      || '',
    record.state_code || '', record.zip        || '', result.full_name || '',
    primary,
    mobiles[0]  || '', mobiles[1]   || '', mobiles[2]   || '',
    landlines[0]|| '', landlines[1] || '',
    emails[0]   || '', emails[1]    || '', emails[2]    || '',
  ]
}

function triggerDownload(rows, filename) {
  const escape = v => `"${String(v).replace(/"/g, '""')}"`
  const csv  = [CSV_HEADER, ...rows].map(r => r.map(escape).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function ContactResult({ result, record }) {
  const rawPhones = result.phones || []
  const phones = rawPhones.map(p =>
    typeof p === 'string' ? { number: p, type: 'mobile', dnc: false } : { ...p, dnc: p.dnc ?? false }
  )
  const emails       = result.emails || []
  const dncScrubbed  = !!result.dnc_scrubbed
  const cleanPhones  = dncScrubbed ? phones.filter(p => !p.dnc) : []
  const flaggedCount = dncScrubbed ? phones.filter(p => p.dnc).length : 0

  const slug = (record?.address || 'record').replace(/[^a-z0-9]/gi, '-').toLowerCase()

  const downloadSkipTrace = () =>
    triggerDownload([buildCsvRow(record, result, phones)], `${slug}-skip-trace.csv`)

  const downloadClean = () =>
    triggerDownload([buildCsvRow(record, result, cleanPhones)], `${slug}-clean.csv`)

  if (!result.full_name && !phones.length && !emails.length) {
    return <p className="text-xs text-slate-600 mt-1.5 italic">No contact data found</p>
  }

  return (
    <div className="mt-3 space-y-2.5">

      {/* ── Skip Trace Result card ──────────────────────────────── */}
      <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-3">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Skip Trace Result</span>
          <button
            onClick={downloadSkipTrace}
            className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
            title="Download this record as CSV"
          >
            <DownloadSimpleIcon weight="light" className="w-3 h-3" />
            Download Skip Trace Result
          </button>
        </div>

        {result.full_name && (
          <div className="flex items-center gap-1.5 mb-2.5">
            <UserIcon weight="light" className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="text-xs font-semibold text-slate-200">{result.full_name}</span>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="col-span-2 lg:col-span-1">
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Phones</p>
            {phones.length === 0 ? (
              <span className="text-xs text-slate-700">—</span>
            ) : (
              <div className="space-y-1.5">
                {phones.map((ph, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-200 font-mono">{ph.number}</span>
                    <PhoneTag type={ph.type} />
                  </div>
                ))}
              </div>
            )}
          </div>

          {['Email 1', 'Email 2', 'Email 3'].map((label, i) => (
            <div key={i}>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">{label}</p>
              {emails[i]
                ? <span className="text-xs text-violet-300 break-all">{emails[i]}</span>
                : <span className="text-xs text-slate-700">—</span>}
            </div>
          ))}
        </div>
      </div>

      {/* ── DNC Scrub Result card ───────────────────────────────── */}
      {dncScrubbed && (
        <div className="bg-white/[0.03] border border-violet-500/20 rounded-xl p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-1.5">
              <ShieldCheckIcon weight="light" className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">DNC Scrub Result</span>
            </div>
            <button
              onClick={downloadClean}
              className="flex items-center gap-1 text-[10px] text-violet-400 hover:text-violet-300 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
              title="Download clean numbers only"
            >
              <DownloadSimpleIcon weight="light" className="w-3 h-3" />
              Download Clean
            </button>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-6 mb-3 pb-3 border-b border-white/[0.06]">
            <div>
              <p className="text-lg font-bold text-white leading-none font-mono">{phones.length}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Checked</p>
            </div>
            <div>
              <p className="text-lg font-bold text-emerald-400 leading-none font-mono">{cleanPhones.length}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Clean (No Flags)</p>
            </div>
            <div>
              <p className="text-lg font-bold text-red-400 leading-none font-mono">{flaggedCount}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Flagged</p>
            </div>
          </div>

          {/* Phone detail table */}
          {phones.length === 0 ? (
            <p className="text-xs text-slate-600 italic">No phones to display</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-separate border-spacing-0">
                <thead>
                  <tr>
                    {['Phone', 'Type', 'National DNC', 'State DNC', 'DMA', 'Litigator'].map(h => (
                      <th key={h} className="text-left pb-2 pr-4 last:pr-0 text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {phones.map((ph, i) => (
                    <tr key={i} className={ph.dnc ? 'opacity-60' : ''}>
                      <td className="py-1.5 pr-4 font-mono text-slate-200 whitespace-nowrap">{ph.number}</td>
                      <td className="py-1.5 pr-4 whitespace-nowrap"><PhoneTag type={ph.type} /></td>
                      <td className="py-1.5 pr-4 text-center"><DncFlag value={ph.national_dnc} /></td>
                      <td className="py-1.5 pr-4 text-center"><DncFlag value={ph.state_dnc} /></td>
                      <td className="py-1.5 pr-4 text-center"><DncFlag value={ph.dma} /></td>
                      <td className="py-1.5 text-center"><DncFlag value={ph.litigator} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center">
      <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mb-4">
        <AddressBookIcon weight="light" className="w-7 h-7 text-brand-400" />
      </div>
      <h3 className="font-display text-base font-semibold text-white mb-2">No skip trace records yet</h3>
      <p className="text-sm text-slate-400 max-w-xs">
        Save properties from your scan results or upload a CSV to get started.
      </p>
    </div>
  )
}

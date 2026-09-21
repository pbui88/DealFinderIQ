import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, fetchAllRows } from '../../lib/supabase'
import { collectImages, analyzePoints, geocodePoints, exportProject, saveSkipTraceRecords } from '../../lib/api'
import { chunkArray } from '../../lib/geo'
import { scoreLabel } from '../../lib/geo'
import { cleanAddress, splitFullAddress } from '../../lib/address'
import { DISTRESS_SIGNALS, SIGNAL_BADGE } from '../../lib/constants'
import { useAuth } from '../../context/AuthContext'
import {
  CameraIcon,
  ArrowSquareOutIcon,
  XIcon,
  CaretRightIcon,
  CaretDownIcon,
  CheckIcon,
  MapPinIcon,
  ArrowLeftIcon,
  DownloadIcon,
  CircleNotchIcon,
} from '@phosphor-icons/react'

const COLLECT_BATCH     = 20   // must match CAP in collect-images.js
const COLLECT_CONCUR    = 3    // parallel function calls during image collection
const AI_BATCH          = 8    // must match CAP in analyze-points.js
const AI_CONCUR         = 2    // parallel function calls during analysis
const GEO_BATCH         = 20   // must match CAP in geocode-points.js
const GEO_CONCUR        = 2    // parallel function calls during geocoding


const PHASE_LABEL = {
  geocoding:     'Geocoding property addresses…',
  deduplicating: 'Finding unique properties…',
  collecting:    'Collecting Street View images…',
  analyzing:     'Running AI distress analysis…',
}

// Address dedup key: house-number + core street name + city.
// Strips direction prefixes (North/N) and type suffixes (Avenue/Ave/St).
const DIRS  = new Set(['n','s','e','w','ne','nw','se','sw','north','south','east','west','northeast','northwest','southeast','southwest'])
const TYPES = new Set(['ave','avenue','blvd','boulevard','cir','circle','ct','court','dr','drive','ln','lane','pl','place','rd','road','st','street','trl','trail','pkwy','parkway','hwy','highway','way'])
function addrKey(raw) {
  if (!raw) return null
  const parts       = raw.replace(/,?\s*(United States|USA|US)\s*$/i, '').split(',').map(s => s.trim())
  const words       = (parts[0] || '').toLowerCase().replace(/[.,#]/g, '').split(/\s+/).filter(Boolean)
  const num         = words[0]
  if (!num || !/^\d/.test(num)) return null
  const streetWords = words.slice(1)
  const coreWords   = streetWords.filter(w => !DIRS.has(w) && !TYPES.has(w))
  const name        = (coreWords.length ? coreWords : streetWords).join('-')
  const city        = (parts[1] || '').toLowerCase().trim().replace(/\s+/g, '-')
  return `${num}|${name}|${city}`
}

const SIGNAL_MAP = Object.fromEntries(DISTRESS_SIGNALS.map(s => [s.id, s]))
const SEVERITY_DOT = { high: 'bg-red-500', medium: 'bg-orange-500', low: 'bg-amber-500' }

function scoreTextColor(score) {
  if (score == null) return 'text-ink-muted'
  if (score >= 0.70) return 'text-red-600'
  if (score >= 0.45) return 'text-orange-600'
  if (score >= 0.20) return 'text-amber-600'
  return 'text-emerald-600'
}

function scoreBorderColor(score) {
  if (score == null) return 'border-line bg-paper-bone'
  if (score >= 0.70) return 'border-red-200 bg-red-50'
  if (score >= 0.45) return 'border-orange-200 bg-orange-50'
  if (score >= 0.20) return 'border-amber-200 bg-amber-50'
  return 'border-emerald-200 bg-emerald-50'
}

function ProgressBar({ label, value, max, color = 'bg-brand-500' }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-ink-muted">
        <span>{label}</span>
        <span className="font-medium font-mono text-ink">{value} / {max}</span>
      </div>
      <div className="w-full bg-line rounded-full h-1.5 overflow-hidden">
        <div className={`h-1.5 rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function mapsUrl(lat, lng, address) {
  const q = address ? encodeURIComponent(address) : `${lat},${lng}`
  return `https://www.google.com/maps?q=${q}&layer=c&cbll=${lat},${lng}`
}

function PropertyRow({ point, isSelected, isChecked, onCheck, onClick }) {
  const score      = point.ai_analyses?.[0]?.overall_score
  const signals    = point.ai_analyses?.[0]?.signals || []
  const noCoverage = point.status === 'no_coverage'
  const thumb      = point.images?.find(i => i.storage_url)
  return (
    <div
      className={`px-3 py-2 border-b border-line transition-colors flex items-start gap-2 group ${
        isSelected ? 'bg-brand-50 border-l-2 border-l-brand-600' : 'hover:bg-paper-bone'
      }`}
    >
      <input
        type="checkbox"
        checked={isChecked}
        onChange={e => { e.stopPropagation(); onCheck(point.id) }}
        onClick={e => e.stopPropagation()}
        className="mt-1 shrink-0 accent-brand-600 cursor-pointer"
        disabled={noCoverage}
      />
      <div className="flex items-start gap-2 flex-1 min-w-0 cursor-pointer" onClick={onClick}>
        {/* Thumbnail */}
        <div className="shrink-0 w-14 h-11 rounded-lg overflow-hidden bg-paper-bone border border-line">
          {thumb
            ? <img src={thumb.storage_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            : <div className="w-full h-full flex items-center justify-center">
                <CameraIcon className="w-4 h-4 text-ink-muted" weight="light" />
              </div>
          }
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className={`text-sm font-bold font-mono tabular-nums shrink-0 leading-tight ${noCoverage ? 'text-ink-muted' : scoreTextColor(score)}`}>
              {noCoverage ? '—' : scoreLabel(score)}
            </span>
            {point.images?.length > 1 && (
              <span className="text-[9px] text-ink-muted font-mono font-medium">{point.images.length} imgs</span>
            )}
          </div>
          <p className="text-xs text-ink font-medium truncate leading-snug">
            {point.address
              ? point.address.replace(/,?\s*(United States|USA|US)\s*$/, '').trim()
              : <span className="text-ink-muted italic">Address pending</span>}
          </p>
          {noCoverage ? (
            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wide font-semibold bg-tagRed-bg text-tagRed-text">No Street View</span>
          ) : signals.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              {signals.map(sig => {
                const s = SIGNAL_MAP[sig]
                return s ? (
                  <span key={sig} className={`${SIGNAL_BADGE[s.severity]} text-[10px] px-1.5 py-0`}>{s.label}</span>
                ) : null
              })}
            </div>
          )}
        </div>
      </div>
      <a
        href={mapsUrl(point.lat, point.lng, point.address)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={e => e.stopPropagation()}
        title="Open Street View"
        className="shrink-0 mt-0.5 p-1 rounded-full text-ink-muted hover:text-ink opacity-0 group-hover:opacity-100 transition-all"
      >
        <ArrowSquareOutIcon className="w-3.5 h-3.5" weight="light" />
      </a>
    </div>
  )
}

export default function ResultsTab({ project, onProjectUpdate, autoStart = false, onAutoStartConsumed }) {
  const { usage, refreshUsage } = useAuth()
  const keyLoading   = usage === null
  const noCreditsBlocked = usage !== null && !usage.can_scan

  // ── Results state ──────────────────────────────────────────
  const [points,     setPoints]     = useState([])
  const [resLoading, setResLoading] = useState(true)
  const [selected,   setSelected]   = useState(null)
  const [minScore,   setMinScore]   = useState(0)
  const [sigFilter,  setSigFilter]  = useState([])
  const [sigMenuOpen, setSigMenuOpen] = useState(false)
  const [controlsOpen, setControlsOpen] = useState(false)   // collapsed once results exist
  const [exporting,    setExporting]    = useState(false)
  const [selImages,    setSelImages]    = useState([])
  const [imgLoading,   setImgLoading]   = useState(false)
  const [checkedIds,   setCheckedIds]   = useState(new Set())
  const [savingTrace,  setSavingTrace]  = useState(false)
  const [traceSaved,   setTraceSaved]   = useState(null)
  const [showTraceModal, setShowTraceModal] = useState(false)
  const [traceListName,  setTraceListName]  = useState('')
  const [traceModalPts,  setTraceModalPts]  = useState([])
  const [traceSkippedCount, setTraceSkippedCount] = useState(0)
  const [zipFillPending, setZipFillPending] = useState(false)
  const [creditRefunds, setCreditRefunds] = useState(0)
  const [showRefundBanner, setShowRefundBanner] = useState(false)
  const selectAllRef  = useRef(null)
  const sigMenuRef    = useRef(null)
  const zipFillDone   = useRef(false)

  // ── Scan state ─────────────────────────────────────────────
  const [stats,      setStats]      = useState({ total: 0, pending: 0, downloading: 0, downloaded: 0, analyzing: 0, complete: 0, failed: 0, no_coverage: 0 })
  const [running,    setRunning]    = useState(false)
  const [phase,      setPhase]      = useState('')
  const [scanError,  setScanError]  = useState(null)
  const [abortRef]   = useState({ current: false })
  const autoStarted        = useRef(false)
  const autoStartInitialRef = useRef(autoStart)

  // ── Data fetching ──────────────────────────────────────────
  const fetchStats = async () => {
    const data = await fetchAllRows((from, to) =>
      supabase.from('scan_points').select('status').eq('project_id', project.id).range(from, to)
    )
    const c = data.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})
    setStats({ total: data.length, pending: c.pending || 0, downloading: c.downloading || 0, downloaded: c.downloaded || 0, analyzing: c.analyzing || 0, complete: c.complete || 0, failed: c.failed || 0, no_coverage: c.no_coverage || 0 })
  }

  const fetchResults = useCallback(async () => {
    setResLoading(true)

    const pts = await fetchAllRows((from, to) =>
      supabase
        .from('scan_points')
        .select('id, lat, lng, address, status, ai_analyses(scan_point_id, overall_score, confidence, signals, notes), images(id, storage_url, direction, image_source)')
        .eq('project_id', project.id)
        .in('status', ['complete', 'no_coverage'])
        .order('created_at')
        .range(from, to)
    )

    // Normalize one-to-one relations (Supabase returns object instead of array)
    const normalized = (pts || []).map(pt => ({
      ...pt,
      ai_analyses: pt.ai_analyses
        ? (Array.isArray(pt.ai_analyses) ? pt.ai_analyses : [pt.ai_analyses])
        : [],
      images: pt.images
        ? (Array.isArray(pt.images) ? pt.images : [pt.images])
        : [],
    }))

    // Coordinate fallback: use project scan spacing so nearby same-property points collapse.
    // no_coverage points use a wider cell (≥30 m) to avoid many "No Street View" entries
    // for the same coverage gap.
    const spacing   = project.point_spacing_meters || 30
    const COORD_DEG = spacing / 111320
    const NC_DEG    = Math.max(spacing, 30) / 111320

    const seen     = new Map()   // key → winning scan point
    const allIds   = new Map()   // key → all scan_point_ids for same property
    const allImgs  = new Map()   // key → merged images from all sibling points

    for (const pt of normalized) {
      // Include all no_coverage points (even without address) — they show as "No Street View"
      // in the list so the user can see the coverage gap instead of silently missing rows.
      const key = addrKey(pt.address) ||
                  (pt.status === 'no_coverage'
                    ? `nc:${Math.round(pt.lat / NC_DEG)},${Math.round(pt.lng / NC_DEG)}`
                    : `${Math.round(pt.lat / COORD_DEG)},${Math.round(pt.lng / COORD_DEG)}`)
      const existing = seen.get(key)
      const score    = pt.ai_analyses?.[0]?.overall_score ?? -1
      const exScore  = existing?.ai_analyses?.[0]?.overall_score ?? -1
      if (!existing || score > exScore) seen.set(key, pt)
      allIds.set(key, [...(allIds.get(key) || []), pt.id])
      allImgs.set(key, [...(allImgs.get(key) || []), ...(pt.images || [])])
    }

    setPoints(Array.from(seen.entries()).map(([key, pt]) => ({
      ...pt,
      allPointIds: allIds.get(key) || [pt.id],
      images:      allImgs.get(key) || pt.images || [],
    })))
    setResLoading(false)
  }, [project.id])

  // Reflects actual persisted state — not just refunds triggered by a live call
  // in this session. The scheduled background zip-backfill job can also refund
  // credits server-side at any time, with no request in this session to report
  // it, so this is the only reliable way the banner ever surfaces those.
  const fetchCreditRefunds = async () => {
    const { count } = await supabase
      .from('scan_points')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project.id)
      .eq('credit_refunded', true)
    if (count > 0) { setCreditRefunds(count); setShowRefundBanner(true) }
  }

  useEffect(() => { fetchStats(); fetchResults(); fetchCreditRefunds() }, [project.id])

  // Close the signal dropdown on outside click or Escape.
  useEffect(() => {
    if (!sigMenuOpen) return
    const onDown = e => { if (sigMenuRef.current && !sigMenuRef.current.contains(e.target)) setSigMenuOpen(false) }
    const onKey  = e => { if (e.key === 'Escape') setSigMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [sigMenuOpen])

  // If the scan is not running but points are stuck in 'analyzing' (left over from
  // a function timeout in a previous run), reset them to 'failed' immediately so
  // the progress bar clears and they can be retried on the next Start.
  useEffect(() => {
    if (running || stats.analyzing === 0) return
    supabase.from('scan_points')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('project_id', project.id)
      .eq('status', 'analyzing')
      .then(() => fetchStats())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.analyzing, running, project.id])

  // Start scan once usage has loaded and key is confirmed.
  // Uses a ref for the initial autoStart value so the timeout is never
  // canceled when the parent clears the autoStart prop.
  useEffect(() => {
    if (!autoStartInitialRef.current) return
    if (keyLoading) return
    if (noCreditsBlocked) return
    if (autoStarted.current) return
    autoStarted.current = true
    onAutoStartConsumed?.()       // signal parent only after committing
    const t = setTimeout(runScan, 300)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyLoading, noCreditsBlocked])

  // Auto-start when returning to a project that has an incomplete scan.
  useEffect(() => {
    if (autoStarted.current) return
    if (running) return
    if (keyLoading) return
    if (noCreditsBlocked) return
    if (stats.total === 0) return
    const incomplete = (stats.pending || 0) + (stats.failed || 0) + (stats.downloaded || 0) + (stats.analyzing || 0) + (stats.downloading || 0)
    if (incomplete === 0) return
    autoStarted.current = true
    runScan()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stats.total, stats.pending, stats.failed, stats.downloaded, stats.downloading, keyLoading, noCreditsBlocked])

  // Auto-fill missing zip codes once after results load.
  // Points that have an address but no trailing 5-digit zip are passed through
  // geocode-points, which now skips Positionstack and only calls Nominatim (free).
  useEffect(() => {
    if (zipFillDone.current || resLoading || running || points.length === 0) return
    const noZip = points.filter(pt => {
      if (!pt.address) return false
      const addr = pt.address.trim()
      return !/\d{5}\s*$/.test(addr) || !/^\d/.test(addr)  // missing zip OR missing house number
    })
    if (noZip.length === 0) return
    zipFillDone.current = true
    setZipFillPending(true)
    const ids = [...new Set(noZip.flatMap(pt => pt.allPointIds || [pt.id]))]
    const chunks = chunkArray(ids, GEO_BATCH)
    Promise.allSettled(chunks.map(b => geocodePoints(project.id, b).catch(() => {}))).then((res) => {
      const refunded = res.reduce((sum, r) => sum + (r.status === 'fulfilled' ? (r.value?.refundedCount || 0) : 0), 0)
      if (refunded > 0) { setCreditRefunds(c => c + refunded); setShowRefundBanner(true) }
      fetchResults()
    }).finally(() => setZipFillPending(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, resLoading, running])

  // ── Image fetch when property selected ─────────────────────
  // Images are pre-loaded in fetchResults so no extra round-trip is needed in
  // most cases. We only do a full DB fetch when the pre-loaded list is empty
  // (e.g. a scan that completed before this session loaded the results).
  useEffect(() => {
    if (!selected) { setSelImages([]); return }
    if (selected.images?.length) {
      setSelImages(selected.images)
      setImgLoading(false)
      return
    }
    setSelImages([])
    setImgLoading(true)
    const ids = selected.allPointIds?.length ? selected.allPointIds : [selected.id]
    supabase.from('images').select('*').in('scan_point_id', ids)
      .then(({ data }) => { setSelImages(data || []); setImgLoading(false) })
  }, [selected?.id])


  // ── Scan logic ─────────────────────────────────────────────
  const runScan = async () => {
    abortRef.current = false
    setScanError(null)
    setRunning(true)

    // Reset points left mid-flight by a previous run that was interrupted
    // (closed tab, function timeout) so this run picks them back up.
    await supabase.from('scan_points')
      .update({ status: 'pending', updated_at: new Date().toISOString() })
      .eq('project_id', project.id).eq('status', 'downloading')
    await supabase.from('scan_points')
      .update({ status: 'downloaded', updated_at: new Date().toISOString() })
      .eq('project_id', project.id).eq('status', 'analyzing')

    // ── Phase 1: Geocode pending points first ──────────────────
    // Addresses must be known before we can deduplicate by property.
    // geocode-points.js skips points that already have a complete address.
    setPhase('geocoding')
    try {
      // Filter by whether the address is actually missing, not by scan_points.status —
      // a point whose geocode call errored (e.g. a Positionstack rate limit) keeps its
      // image-pipeline status moving forward to 'downloaded'/'complete' independently,
      // so filtering on status here would permanently skip it on every future retry.
      const toGeocode = await fetchAllRows((from, to) =>
        supabase.from('scan_points').select('id')
          .eq('project_id', project.id).is('address', null)
          .not('lat', 'is', null).range(from, to)
      )
      if (toGeocode?.length) {
        const chunks = chunkArray(toGeocode.map(p => p.id), GEO_BATCH)
        for (let i = 0; i < chunks.length; i += GEO_CONCUR) {
          if (abortRef.current) break
          const res = await Promise.allSettled(
            chunks.slice(i, i + GEO_CONCUR).map(batch =>
              geocodePoints(project.id, batch).catch(() => {})
            )
          )
          const refunded = res.reduce((sum, r) => sum + (r.status === 'fulfilled' ? (r.value?.refundedCount || 0) : 0), 0)
          if (refunded > 0) { setCreditRefunds(c => c + refunded); setShowRefundBanner(true) }
        }
      }
    } catch { /* continue */ }

    if (abortRef.current) { setRunning(false); setPhase(''); return }

    // ── Phase 2: Address-based dedup (1 point per property) ───
    // After geocoding, group pending points by address. Mark all but the
    // first occurrence of each address as complete — they share the primary's
    // image later via the collect-images proximity dedup.
    setPhase('deduplicating')
    try {
      const pendingPts = await fetchAllRows((from, to) =>
        supabase.from('scan_points').select('id, lat, lng, address')
          .eq('project_id', project.id).in('status', ['pending', 'failed'])
          .range(from, to)
      )
      if (pendingPts?.length) {
        const spacing   = project.point_spacing_meters || 30
        const COORD_DEG = spacing / 111320
        const seen      = new Map()   // key → primary id
        const dupIds    = []
        for (const pt of pendingPts) {
          const key = addrKey(pt.address) ||
            `${Math.round(pt.lat / COORD_DEG)},${Math.round(pt.lng / COORD_DEG)}`
          if (seen.has(key)) {
            dupIds.push(pt.id)
          } else {
            seen.set(key, pt.id)
          }
        }
        if (dupIds.length) {
          for (const chunk of chunkArray(dupIds, 200)) {
            await supabase.from('scan_points')
              .update({ status: 'complete', updated_at: new Date().toISOString() })
              .in('id', chunk)
          }
          await fetchStats()
        }
      }
    } catch { /* continue */ }

    if (abortRef.current) { setRunning(false); setPhase(''); return }

    // ── Phase 3: Collect Street View images ────────────────────
    // Only unique-property points (pending/failed) reach this phase.
    setPhase('collecting')
    try {
      const pending = await fetchAllRows((from, to) =>
        supabase.from('scan_points').select('id')
          .eq('project_id', project.id).in('status', ['pending', 'failed'])
          .range(from, to)
      )
      if (pending?.length) {
        const chunks = chunkArray(pending.map(p => p.id), COLLECT_BATCH)
        let quotaHit = false
        for (let i = 0; i < chunks.length; i += COLLECT_CONCUR) {
          if (abortRef.current || quotaHit) break
          const results = await Promise.allSettled(
            chunks.slice(i, i + COLLECT_CONCUR).map(batch => collectImages(project.id, batch))
          )
          for (const r of results) {
            if (r.status === 'rejected') {
              const status = r.reason?.status
              if (status === 429 || status === 503) {
                setScanError(r.reason.message)
                abortRef.current = true
                quotaHit = true
                if (status === 429) refreshUsage()
                break
              }
            }
          }
          await fetchStats()
          refreshUsage()
        }
      }
    } catch { /* continue */ }

    if (abortRef.current) { setRunning(false); setPhase(''); return }

    // ── Phase 3: AI distress analysis ──────────────────────────
    // Loops until nothing is left in downloaded/analyzing — re-fetching each
    // pass picks up points left stuck in 'analyzing' by a function timeout
    // during this run. Stops if a pass makes no progress (avoids looping
    // forever on a point that fails the same way every time).
    setPhase('analyzing')
    try {
      const fetchToAnalyze = () => fetchAllRows((from, to) =>
        supabase.from('scan_points').select('id')
          .eq('project_id', project.id).in('status', ['downloaded', 'analyzing'])
          .range(from, to)
      )
      let toAnalyze = await fetchToAnalyze()
      let lastCount = Infinity
      while (toAnalyze?.length && toAnalyze.length < lastCount && !abortRef.current) {
        lastCount = toAnalyze.length
        const chunks = chunkArray(toAnalyze.map(p => p.id), AI_BATCH)
        for (let i = 0; i < chunks.length; i += AI_CONCUR) {
          if (abortRef.current) break
          await Promise.allSettled(
            chunks.slice(i, i + AI_CONCUR).map(batch =>
              analyzePoints(project.id, batch).catch(() => {})
            )
          )
          await fetchStats()
          await fetchResults()
        }
        if (abortRef.current) break
        toAnalyze = await fetchToAnalyze()
      }

      // Any points still in 'analyzing' are stuck (function timeout / API error).
      // Reset them to 'failed' so they show in the failed badge and retry on next run.
      if (!abortRef.current) {
        await supabase.from('scan_points')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('project_id', project.id)
          .eq('status', 'analyzing')
      }
    } catch { /* continue */ }

    setPhase('')
    setRunning(false)

    // Mark project complete so the dashboard badge updates correctly — but only
    // if every point actually reached a terminal state. A silently-failed batch
    // (e.g. a function timeout that isn't a 429/503) doesn't set abortRef, so
    // without this check the project would get stamped "Complete" with points
    // still stuck pending/downloading/failed.
    if (!abortRef.current) {
      const { count: unfinished } = await supabase
        .from('scan_points')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', project.id)
        .in('status', ['pending', 'downloading', 'downloaded', 'analyzing', 'failed'])
      if (!unfinished) {
        await supabase.from('projects')
          .update({ status: 'complete' })
          .eq('id', project.id)
      }
    }

    await fetchStats()
    await fetchResults()
    onProjectUpdate?.()
  }

  const pause = () => { abortRef.current = true }

  // ── Checkbox selection ─────────────────────────────────────
  const toggleCheck = (id) => setCheckedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  // Filter / sort ──────────────────────────────────────────
  const toggleSignal = (id) => setSigFilter(f => f.includes(id) ? f.filter(s => s !== id) : [...f, id])

  const filtered = points.filter(pt => {
    if (pt.status === 'no_coverage') return true  // always show, no score to filter on
    const score = pt.ai_analyses?.[0]?.overall_score ?? 0
    if (score < minScore / 100) return false
    if (sigFilter.length > 0) {
      const sigs = pt.ai_analyses?.[0]?.signals || []
      if (!sigFilter.some(s => sigs.includes(s))) return false
    }
    return true
  })

  const sorted = [...filtered].sort((a, b) => {
    if (a.status === 'no_coverage' && b.status !== 'no_coverage') return 1
    if (b.status === 'no_coverage' && a.status !== 'no_coverage') return -1
    return (b.ai_analyses?.[0]?.overall_score ?? 0) - (a.ai_analyses?.[0]?.overall_score ?? 0)
  })

  const exportable   = sorted.filter(pt => pt.status !== 'no_coverage')
  const allChecked   = exportable.length > 0 && exportable.every(pt => checkedIds.has(pt.id))
  const someChecked  = exportable.some(pt => checkedIds.has(pt.id))
  const checkedCount = exportable.filter(pt => checkedIds.has(pt.id)).length

  // Sync indeterminate state on the select-all checkbox
  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someChecked && !allChecked
    }
  }, [someChecked, allChecked])

  const toggleAll = () => {
    if (allChecked) {
      setCheckedIds(new Set())
    } else {
      setCheckedIds(new Set(exportable.map(pt => pt.id)))
    }
  }

  // Build export payload from local data (used for selected-only exports)
  const buildLocalExport = (pts, format) => {
    if (format === 'CSV') {
      const header = 'address,distress_score,confidence,signals,notes'
      const rows = pts.map(pt => {
        const a = pt.ai_analyses?.[0] || {}
        return [
          `"${cleanAddress(pt.address).replace(/"/g, '""')}"`,
          a.overall_score ?? '', a.confidence ?? '',
          `"${(a.signals || []).join('; ')}"`,
          `"${(a.notes || '').replace(/"/g, '""')}"`,
        ].join(',')
      })
      return { data: [header, ...rows].join('\n'), type: 'text/csv', ext: 'csv' }
    }
    if (format === 'JSON') {
      const data = pts.map(pt => ({
        id: pt.id, lat: pt.lat, lng: pt.lng, address: pt.address,
        distressScore: pt.ai_analyses?.[0]?.overall_score,
        confidence:    pt.ai_analyses?.[0]?.confidence,
        signals:       pt.ai_analyses?.[0]?.signals || [],
        notes:         pt.ai_analyses?.[0]?.notes,
      }))
      return { data: JSON.stringify(data, null, 2), type: 'application/json', ext: 'json' }
    }
    const geojson = {
      type: 'FeatureCollection',
      features: pts.map(pt => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [pt.lng, pt.lat] },
        properties: {
          id: pt.id, address: pt.address,
          distressScore: pt.ai_analyses?.[0]?.overall_score,
          confidence:    pt.ai_analyses?.[0]?.confidence,
          signals:       pt.ai_analyses?.[0]?.signals || [],
          notes:         pt.ai_analyses?.[0]?.notes,
        },
      })),
    }
    return { data: JSON.stringify(geojson, null, 2), type: 'application/json', ext: 'json' }
  }

  // ── Export ─────────────────────────────────────────────────
  const handleExport = async (format) => {
    const selectedPts = checkedCount > 0 ? sorted.filter(pt => checkedIds.has(pt.id)) : null

    // Client-side export for selected rows
    if (selectedPts) {
      const { data, type, ext } = buildLocalExport(selectedPts, format)
      const blob = new Blob([data], { type })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `${project.name.replace(/\s+/g, '_')}_${checkedCount}_selected.${format === 'CSV' ? 'csv' : 'json'}`
      a.click()
      URL.revokeObjectURL(url)
      return
    }

    // Server-side export for all filtered results
    setExporting(true)
    try {
      const result = await exportProject(project.id, format, {
        minScore: minScore / 100,
        signals: sigFilter.length ? sigFilter : undefined,
      })
      const blob = new Blob(
        [typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)],
        { type: format === 'CSV' ? 'text/csv' : 'application/json' }
      )
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href    = url
      a.download = `${project.name.replace(/\s+/g, '_')}_${format.toLowerCase()}.${format === 'CSV' ? 'csv' : 'json'}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) { alert(err.message) }
    finally { setExporting(false) }
  }

  // ── Save to Skip Trace ────────────────────────────────────
  // Only points with a complete address (state + zip) are eligible — Tracerfy
  // can't match a person without them, and submit-skip-trace.js excludes
  // incomplete records from billing anyway, so saving them just creates dead
  // "saved" rows the user has to notice and clean up later. Filtering here
  // instead keeps the list itself accurate from the start.
  const openSaveModal = (pts) => {
    const complete = pts.filter(pt => {
      if (!pt.address) return false
      const { state_code, zip } = splitFullAddress(pt.address)
      return !!state_code && !!zip
    })
    setTraceModalPts(complete)
    setTraceListName(project.name || '')
    setShowTraceModal(true)
    setTraceSkippedCount(pts.length - complete.length)
  }

  const handleSaveToSkipTrace = async () => {
    setShowTraceModal(false)
    setSavingTrace(true)
    setTraceSaved(null)
    try {
      const records = traceModalPts.map(pt => ({
        source_point_id: pt.id,
        project_id:      project.id,
        ...splitFullAddress(pt.address),
      }))
      const { count } = await saveSkipTraceRecords(records, traceListName.trim() || project.name || 'Unnamed List')
      setTraceSaved(count)
      setTimeout(() => setTraceSaved(null), 4000)
    } catch (e) {
      alert(e.message)
    } finally {
      setSavingTrace(false)
    }
  }

  const hasFilters  = minScore > 0 || sigFilter.length > 0
  const canStart    = stats.total > 0 && !running && !noCreditsBlocked && !keyLoading
  const analysis    = selected?.ai_analyses?.[0]
  const score       = analysis?.overall_score
  const signals     = analysis?.signals || []
  const notes       = analysis?.notes

  return (
    <div className="flex flex-col md:flex-row h-full bg-paper font-ui text-ink">

      {/* ── Left panel ── hidden on mobile when a property is selected */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-[28rem] bg-white/80 backdrop-blur-2xl border-b md:border-b-0 md:border-r border-line shrink-0`}>

        {/* Results header — always visible */}
        <div className="px-4 py-2 border-b border-line flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-display font-semibold text-ink">Results</h3>
            {running && PHASE_LABEL[phase] && (
              <p className="text-[11px] text-ink-muted mt-0.5 truncate">{PHASE_LABEL[phase]}</p>
            )}
            {keyLoading && !running && (
              <p className="text-[11px] text-ink-muted mt-0.5 truncate">Loading account…</p>
            )}
            {noCreditsBlocked && !running && (
              <p className="text-[11px] text-amber-600 mt-0.5 truncate">No credits — contact your admin</p>
            )}
            {scanError && !running && (
              <p className="text-[11px] text-red-600 mt-0.5 truncate">{scanError}</p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {running ? (
              <>
                <CircleNotchIcon className="w-3.5 h-3.5 text-ink-muted animate-spin" weight="light" />
                <button onClick={pause} className="rounded-full border border-line bg-white hover:bg-amber-50 text-amber-600 text-xs px-3 py-1.5 font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]">
                  Pause
                </button>
              </>
            ) : canStart ? (
              <button
                onClick={() => { autoStarted.current = true; runScan() }}
                className="rounded-full bg-brand-600 hover:bg-brand-500 text-white text-xs px-3 py-1.5 font-medium transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
              >
                {scanError ? 'Retry' : 'Start'}
              </button>
            ) : null}
          </div>
        </div>

        {showRefundBanner && creditRefunds > 0 && (
          <div className="flex items-start justify-between gap-2 px-4 py-2 bg-amber-50 border-b border-line">
            <p className="text-xs text-amber-600">
              {creditRefunds} scan credit{creditRefunds !== 1 ? 's' : ''} refunded — {creditRefunds === 1 ? 'a property' : 'properties'} without a resolvable street address can't be skip traced.
            </p>
            <button onClick={() => setShowRefundBanner(false)} className="text-amber-600/70 hover:text-amber-600 transition shrink-0">
              <XIcon className="w-3.5 h-3.5" weight="light" />
            </button>
          </div>
        )}

        {/* Collapsible controls summary — click to expand progress/status/filters.
            Hidden while running (detail is force-shown then so progress is visible). */}
        {(stats.total > 0 || points.length > 0) && !running && (
          <button
            type="button"
            onClick={() => { setSigMenuOpen(false); setControlsOpen(o => !o) }}
            className={`w-full px-4 py-2 border-b border-line flex items-center gap-2 transition bg-paper-bone hover:bg-line/40`}
          >
            <CaretRightIcon className={`w-3 h-3 shrink-0 transition-transform ${controlsOpen ? 'rotate-90' : ''} ${hasFilters ? 'text-brand-600' : 'text-ink-muted'}`} weight="light" />
            <span className={`truncate flex-1 text-left text-[11px] font-semibold uppercase tracking-wide ${hasFilters ? 'text-brand-600' : 'text-ink-muted'}`}>
              {(minScore > 0 || sigFilter.length > 0)
                ? `Filters: ${[minScore > 0 ? `Min ${minScore}` : null, sigFilter.length > 0 ? `${sigFilter.length} signal${sigFilter.length === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ')}`
                : 'Stats & filters'}
            </span>
            {controlsOpen && (minScore > 0 || sigFilter.length > 0) && (
              <span onClick={e => { e.stopPropagation(); setMinScore(0); setSigFilter([]) }}
                className="shrink-0 text-[10px] text-ink-muted hover:text-ink">Clear</span>
            )}
          </button>
        )}

        {/* Detail blocks: progress, status, filters — shown while running or when expanded */}
        {(controlsOpen || running) && (<>

        {/* Progress bars — shown while running or when scan has started */}
        {stats.total > 0 && (
          <div className="px-4 py-2 border-b border-line space-y-1.5">
            <ProgressBar label="Collecting Property Images" value={stats.total - stats.pending} max={stats.total} />
            <ProgressBar label="DealFinderIQ Analyzing" value={stats.complete + stats.no_coverage + stats.failed} max={stats.total} color="bg-emerald-500" />
          </div>
        )}

        {/* Status breakdown — explains any gap from stats.total */}
        {(stats.no_coverage > 0 || stats.failed > 0 || stats.pending > 0) && (
          <div className="px-4 pb-2 border-b border-line flex flex-wrap gap-1">
            {stats.no_coverage > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-tagRed-bg text-tagRed-text">
                {stats.no_coverage} no Street View coverage
              </span>
            )}
            {stats.failed > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-tagRed-bg text-tagRed-text">
                {stats.failed} failed{!running && ' — will retry on next run'}
              </span>
            )}
            {stats.pending > 0 && !running && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-tagYellow-bg text-tagYellow-text">
                {stats.pending} pending
              </span>
            )}
          </div>
        )}

        {/* Filters — only shown once there are results */}
        {points.length > 0 && (
          <div className="px-4 py-2 border-b border-line space-y-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Min Score</span>
                <span className="text-xs font-bold font-mono text-ink tabular-nums">{minScore}</span>
              </div>
              <input type="range" min={0} max={90} step={5} value={minScore}
                onChange={e => setMinScore(+e.target.value)} className="w-full accent-brand-600" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide">Signal</span>
                {sigFilter.length > 0 && (
                  <button onClick={() => setSigFilter([])} className="text-[10px] text-ink-muted hover:text-ink transition">Clear</button>
                )}
              </div>
              <div className="relative" ref={sigMenuRef}>
                <button
                  type="button"
                  onClick={() => setSigMenuOpen(o => !o)}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-line text-xs hover:bg-paper-bone transition"
                >
                  <span className={`min-w-0 truncate ${sigFilter.length === 0 ? 'text-ink-muted' : 'text-ink font-medium'}`}>
                    {sigFilter.length === 0
                      ? 'All signals'
                      : `${sigFilter.length} selected: ${sigFilter.map(s => SIGNAL_MAP[s]?.label).filter(Boolean).join(', ')}`
                    }
                  </span>
                  <CaretDownIcon className={`w-3.5 h-3.5 text-ink-muted shrink-0 transition-transform ${sigMenuOpen ? 'rotate-180' : ''}`} weight="light" />
                </button>
                {sigMenuOpen && (
                  <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-xl bg-white backdrop-blur-xl border border-line shadow-[0_8px_24px_rgba(15,23,42,0.08)] py-1">
                    {DISTRESS_SIGNALS.map(sig => {
                      const checked = sigFilter.includes(sig.id)
                      return (
                        <button
                          key={sig.id}
                          type="button"
                          onClick={() => toggleSignal(sig.id)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left hover:bg-paper-bone transition"
                        >
                          <span className={`w-3.5 h-3.5 shrink-0 rounded border flex items-center justify-center ${
                            checked ? 'bg-brand-600 border-brand-600' : 'border-line'
                          }`}>
                            {checked && (
                              <CheckIcon className="w-2.5 h-2.5 text-white" weight="fill" />
                            )}
                          </span>
                          <span className={`text-xs ${checked ? 'text-ink font-medium' : 'text-ink-muted'}`}>{sig.label}</span>
                          <span className={`ml-auto w-1.5 h-1.5 rounded-full shrink-0 ${SEVERITY_DOT[sig.severity]}`} title={sig.severity} />
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        </>)}

        {/* Count + select-all + refresh */}
        <div className="px-3 py-1.5 border-b border-line flex items-center gap-2">
          {sorted.length > 0 && (
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="shrink-0 accent-brand-600 cursor-pointer"
              title={allChecked ? 'Deselect all' : 'Select all'}
            />
          )}
          <span className="text-xs text-ink-muted flex-1">
            {resLoading ? 'Loading…' : checkedCount > 0
              ? <span className="font-medium font-mono text-ink">{checkedCount} selected</span>
              : `${sorted.length} propert${sorted.length === 1 ? 'y' : 'ies'}`
            }
            {!resLoading && checkedCount === 0 && hasFilters && points.length !== sorted.length && (
              <span className="text-ink-muted"> of {points.length}</span>
            )}
            {!resLoading && checkedCount === 0 && stats.total > 0 && stats.total !== sorted.length && (
              <span className="text-ink-muted font-mono"> · {stats.total} pts</span>
            )}
          </span>
          <button onClick={() => { fetchStats(); fetchResults() }} className="text-xs text-ink-muted hover:text-ink transition">Refresh</button>
        </div>

        {/* Property list */}
        <div className="flex-1 overflow-y-auto">
          {resLoading ? (
            <div className="flex justify-center py-12">
              <CircleNotchIcon className="w-5 h-5 text-ink-muted animate-spin" weight="light" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-10 px-4">
              {stats.total === 0 ? (
                <>
                  <p className="text-sm text-ink-muted">No properties scan yet.</p>
                  <p className="text-xs text-ink-muted mt-1">Go to the Map tab to draw a polygon first.</p>
                </>
              ) : running ? (
                <p className="text-sm text-ink-muted">Results will appear here as the scan completes…</p>
              ) : hasFilters ? (
                <>
                  <p className="text-sm text-ink-muted">No properties match your filters.</p>
                  <button onClick={() => { setMinScore(0); setSigFilter([]) }}
                    className="mt-2 text-xs text-brand-600 hover:underline">Clear filters</button>
                </>
              ) : (stats.pending || 0) + (stats.failed || 0) + (stats.downloaded || 0) + (stats.analyzing || 0) > 0 ? (
                <p className="text-sm text-ink-muted">Starting scan…</p>
              ) : (
                <p className="text-sm text-ink-muted">No results yet.</p>
              )}
            </div>
          ) : (
            sorted.map(pt => (
              <PropertyRow
                key={pt.id}
                point={pt}
                isSelected={selected?.id === pt.id}
                isChecked={checkedIds.has(pt.id)}
                onCheck={toggleCheck}
                onClick={() => setSelected(prev => prev?.id === pt.id ? null : pt)}
              />
            ))
          )}
        </div>

        {/* Export + Save to Skip Trace — compact single row */}
        {sorted.length > 0 && (
          <div className="p-3 border-t border-line flex items-center gap-2">
            <button
              onClick={() => handleExport('CSV')}
              disabled={exporting}
              className="flex-1 flex items-center justify-between gap-2 rounded-full border border-line bg-white hover:bg-paper-bone text-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] py-1.5 pl-4 pr-1.5 text-xs font-medium disabled:opacity-50 active:scale-[0.98]"
              title={checkedCount > 0 ? `Download ${checkedCount} selected` : 'Download all filtered'}
            >
              <span>{exporting ? 'Exporting…' : 'Download'}</span>
              <span className="w-6 h-6 rounded-full bg-paper-bone flex items-center justify-center shrink-0">
                {exporting ? <CircleNotchIcon className="w-3.5 h-3.5 animate-spin" weight="light" /> : <DownloadIcon className="w-3.5 h-3.5" weight="light" />}
              </span>
            </button>
            <button
              onClick={() => {
                const pts = checkedCount > 0 ? exportable.filter(pt => checkedIds.has(pt.id)) : exportable
                openSaveModal(pts)
              }}
              disabled={savingTrace || zipFillPending}
              title={zipFillPending ? 'Finishing address lookups before saving…' : undefined}
              className="flex-1 flex items-center justify-between gap-2 py-1.5 pl-4 pr-1.5 rounded-full bg-brand-600 hover:bg-brand-500 text-white transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-xs font-medium disabled:opacity-50 active:scale-[0.98]"
            >
              <span>
                {savingTrace ? 'Saving…' : zipFillPending ? 'Finishing addresses…' : traceSaved != null ? `${traceSaved} saved` : `Save to Skip Trace${checkedCount > 0 ? ` (${checkedCount})` : ''}`}
              </span>
              <span className="w-6 h-6 rounded-full bg-white/15 flex items-center justify-center shrink-0">
                {savingTrace || zipFillPending
                  ? <CircleNotchIcon className="w-3.5 h-3.5 animate-spin" weight="light" />
                  : <CheckIcon className="w-3.5 h-3.5" weight={traceSaved != null ? 'fill' : 'light'} />
                }
              </span>
            </button>
          </div>
        )}
      </div>

      {/* ── Right panel: image viewer — hidden on mobile when nothing selected ── */}
      <div className={`${selected ? 'flex' : 'hidden md:flex'} flex-1 flex-col bg-paper-bone min-w-0`}>
        {selected ? (
          <>
            {/* Property header */}
            <div className="bg-white/80 backdrop-blur-2xl border-b border-line px-4 py-3 flex items-start gap-4 shrink-0">
              <div className={`shrink-0 px-3 py-1.5 rounded-2xl border text-center min-w-[3.5rem] ${scoreBorderColor(score)}`}>
                <p className={`text-xl font-bold font-mono tabular-nums leading-none ${scoreTextColor(score)}`}>{scoreLabel(score)}</p>
                <p className="text-[10px] text-ink-muted mt-0.5">/ 100</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink truncate">
                  {selected.address
                    ? selected.address.replace(/,?\s*(United States|USA|US)\s*$/, '').trim()
                    : <span className="text-ink-muted italic font-normal">Address pending</span>}
                </p>
                {signals.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {signals.map(sig => {
                      const s = SIGNAL_MAP[sig]
                      return s ? (
                        <span key={sig} className={`${SIGNAL_BADGE[s.severity]} text-[10px] px-1.5 py-0`}>{s.label}</span>
                      ) : null
                    })}
                  </div>
                )}
                {notes && <p className="text-xs text-ink-muted mt-1.5 leading-relaxed line-clamp-2">{notes}</p>}
              </div>
              <a
                href={mapsUrl(selected.lat, selected.lng, selected.address)}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-line bg-white hover:bg-paper-bone text-ink transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] text-xs font-medium active:scale-[0.98]"
              >
                <MapPinIcon className="w-3.5 h-3.5" weight="light" />
                Street View
              </a>
              <button onClick={() => setSelected(null)}
                className="shrink-0 flex items-center gap-1 p-1.5 rounded-full hover:bg-paper-bone text-ink-muted hover:text-ink transition">
                <ArrowLeftIcon className="w-4 h-4 md:hidden" weight="light" />
                <span className="text-xs font-medium md:hidden">Back</span>
                <XIcon className="w-4 h-4 hidden md:block" weight="light" />
              </button>
            </div>

            {/* Images */}
            <div className="flex-1 relative overflow-hidden">
              <div className="absolute inset-0 overflow-y-auto">
                {imgLoading ? (
                  <div className="flex justify-center py-16">
                    <CircleNotchIcon className="w-5 h-5 text-ink-muted animate-spin" weight="light" />
                  </div>
                ) : selImages.filter(i => i.storage_url).length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-center px-6">
                    <CameraIcon className="w-10 h-10 text-ink-muted" weight="light" />
                    <p className="text-sm text-ink-muted">No images captured for this location</p>
                  </div>
                ) : (
                  <div className="p-4 space-y-3">
                    {selImages.filter(i => i.storage_url).map(img => (
                      <div key={img.id} className="rounded-2xl overflow-hidden border border-line bg-white/80 backdrop-blur-2xl relative">
                        <img src={img.storage_url} alt={img.direction} className="w-full object-cover" loading="lazy" />
                        {img.image_source && (
                          <span
                            title={img.image_source === 'mapillary' ? 'Mapillary (free)' : 'Google Street View'}
                            className={`absolute top-2 right-2 px-1.5 py-0.5 text-[9px] font-bold rounded-full uppercase tracking-wider border border-line bg-white/90
                              ${img.image_source === 'mapillary'
                                ? 'text-emerald-600'
                                : 'text-brand-600'}`}
                          >
                            {img.image_source === 'mapillary' ? 'M' : 'G'}
                          </span>
                        )}
                        <div className="px-3 py-1.5">
                          <span className="text-[10px] font-semibold font-mono text-ink-muted uppercase tracking-widest">
                            {img.direction === 'F' ? 'Facing' : img.direction}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <CameraIcon className="w-12 h-12 text-ink-muted" weight="light" />
            <p className="text-sm text-ink-muted">Select a property to view captured images</p>
          </div>
        )}
      </div>

      {/* ── Save-to-Skip-Trace modal ── */}
      {showTraceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm bg-slate-100 border border-line p-1.5 rounded-[1.5rem] shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
            <div className="bg-white rounded-[calc(1.5rem-0.375rem)] p-6">
              <h2 className="text-base font-display font-semibold text-ink mb-1">Save to Skip Trace</h2>
              <p className="text-xs text-ink-muted mb-1">
                {traceModalPts.length} record{traceModalPts.length !== 1 ? 's' : ''} will be saved. Give this list a name so you can find it later.
              </p>
              {traceSkippedCount > 0 && (
                <p className="text-xs text-amber-600 mb-3">
                  {traceSkippedCount} propert{traceSkippedCount === 1 ? 'y was' : 'ies were'} skipped — {traceSkippedCount === 1 ? 'its' : 'their'} address is missing or still missing a state/zip.
                </p>
              )}
              <label className="block text-xs font-medium text-ink-muted mb-1 mt-3">List name</label>
              <input
                type="text"
                value={traceListName}
                onChange={e => setTraceListName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && traceModalPts.length > 0) handleSaveToSkipTrace() }}
                placeholder="e.g. Phoenix Q1 Leads"
                className="w-full bg-white border border-line rounded-xl px-3 py-2 text-sm text-ink placeholder-ink-muted focus:outline-none focus:ring-2 focus:ring-brand-500/40 mb-5"
                autoFocus
              />
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowTraceModal(false)}
                  className="px-4 py-2 rounded-full text-sm text-ink-muted hover:text-ink hover:bg-paper-bone transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveToSkipTrace}
                  disabled={!traceListName.trim() || traceModalPts.length === 0}
                  className="px-5 py-2 rounded-full text-sm font-medium bg-brand-600 hover:bg-brand-500 text-white transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] disabled:opacity-40 active:scale-[0.98]"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

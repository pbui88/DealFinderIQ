import { useState, useEffect } from 'react'
import { useSearchParams, useOutletContext, useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { createPayment, createSkipTracePayment } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import {
  CoinsIcon as Coins,
  ListIcon as List,
  CheckIcon as Check,
  CheckCircleIcon as CheckCircle,
  WarningCircleIcon as WarningCircle,
  XIcon as X,
  ShieldCheckIcon as ShieldCheck,
  UsersThreeIcon as UsersThree,
  PhoneXIcon as PhoneX,
  ArrowRightIcon as ArrowRight,
  SpinnerIcon as Spinner,
  WalletIcon as Wallet,
} from '@phosphor-icons/react'

const PACKAGES = [
  { points:  2500, price:  35, perPoint: '1.4¢' },
  { points:  5000, price:  70, perPoint: '1.4¢' },
  { points: 10000, price: 140, perPoint: '1.4¢' },
  { points: 15000, price: 210, perPoint: '1.4¢', popular: true },
  { points: 20000, price: 280, perPoint: '1.4¢' },
]

const VALID_POINTS = new Set(PACKAGES.map(p => p.points))

const EASE = [0.32, 0.72, 0, 1]

function StatCard({ value, label, accent = false }) {
  return (
    <div className="flex flex-col gap-1">
      <span className={`font-display text-2xl sm:text-3xl font-bold tabular-nums tracking-tight ${accent ? 'text-brand-600' : 'text-ink'}`}>
        {value}
      </span>
      <span className="text-xs text-ink-muted font-medium uppercase tracking-wider">{label}</span>
    </div>
  )
}

export default function BuyCreditsPage() {
  const { openSidebar } = useOutletContext()
  const { usage, refreshUsage } = useAuth()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const reduce = useReducedMotion()
  const [loading,      setLoading]      = useState(null)
  const [paymentError, setPaymentError] = useState(null)

  const [showSuccess,       setShowSuccess]       = useState(false)
  const [successPts,        setSuccessPts]        = useState(0)
  const [creditsPolling,    setCreditsPolling]    = useState(false)
  const [showStSuccess,     setShowStSuccess]      = useState(false)
  const [successStAmount,   setSuccessStAmount]   = useState(0)
  const [depositAmount,     setDepositAmount]     = useState('')
  const [depositLoading,    setDepositLoading]    = useState(false)
  const [depositError,      setDepositError]      = useState(null)
  const [stPolling,         setStPolling]         = useState(false)

  const rawPts       = parseInt(searchParams.get('purchase') || '0', 10)
  const addedPts     = VALID_POINTS.has(rawPts) ? rawPts : 0
  const success      = addedPts > 0
  const rawStDeposit = parseFloat(searchParams.get('skip_trace_deposit') || '0')
  const pendingAmt   = parseFloat(sessionStorage.getItem('_pendingStDeposit') || '0')
  const stSuccess    = rawStDeposit >= 5 && rawStDeposit <= 5000 &&
                       Math.abs(rawStDeposit - pendingAmt) < 0.01

  useEffect(() => {
    if (!success || addedPts <= 0) return
    setShowSuccess(true)
    setSuccessPts(addedPts)
    setCreditsPolling(true)
    navigate('/credits', { replace: true })
  }, [success, addedPts, navigate])

  // Poll refreshUsage every 3s for up to ~30s after a scan credit purchase.
  // The Stripe webhook fires asynchronously after the redirect, so the
  // balance may not be updated yet on the first render.
  useEffect(() => {
    if (!creditsPolling) return
    refreshUsage()
    let count = 0
    const id = setInterval(() => {
      refreshUsage()
      if (++count >= 9) { clearInterval(id); setCreditsPolling(false) }
    }, 3000)
    return () => clearInterval(id)
  }, [creditsPolling, refreshUsage])

  useEffect(() => {
    if (!stSuccess || rawStDeposit <= 0) return
    sessionStorage.removeItem('_pendingStDeposit')
    setShowStSuccess(true)
    setSuccessStAmount(rawStDeposit)
    setStPolling(true)
    navigate('/credits', { replace: true })
  }, [stSuccess, rawStDeposit, navigate])

  // Poll refreshUsage every 3s for up to ~30s after a skip trace deposit return.
  // The Stripe webhook fires asynchronously after the redirect, so the
  // balance may not be updated yet on the first render.
  useEffect(() => {
    if (!stPolling) return
    refreshUsage()
    let count = 0
    const id = setInterval(() => {
      refreshUsage()
      if (++count >= 9) {
        clearInterval(id)
        setStPolling(false)
      }
    }, 3000)
    return () => clearInterval(id)
  }, [stPolling, refreshUsage])

  // Reset loading when the user navigates back from Stripe Checkout
  // via the browser Back button (page is restored from bfcache with stale state).
  useEffect(() => {
    const handlePageShow = (e) => { if (e.persisted) setLoading(null) }
    window.addEventListener('pageshow', handlePageShow)
    return () => window.removeEventListener('pageshow', handlePageShow)
  }, [])

  const handleBuy = async (points) => {
    setLoading(points)
    setPaymentError(null)
    try {
      const { url } = await createPayment(points)
      window.location.href = url
    } catch (e) {
      setPaymentError(e.message)
      setLoading(null)
    }
  }

  const handleDeposit = async () => {
    const amt = parseFloat(depositAmount)
    if (!isFinite(amt) || amt < 5) { setDepositError('Minimum deposit is $5.00'); return }
    setDepositLoading(true)
    setDepositError(null)
    try {
      const { url } = await createSkipTracePayment(amt)
      sessionStorage.setItem('_pendingStDeposit', amt.toFixed(2))
      window.location.href = url
    } catch (e) {
      setDepositError(e.message)
      setDepositLoading(false)
    }
  }

  return (
    <div className="min-h-full bg-paper">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8 sm:mb-10">
          <button
            onClick={openSidebar}
            className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-paper-bone transition lg:hidden shrink-0"
            aria-label="Open navigation"
          >
            <List className="w-5 h-5" weight="light" />
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded-lg bg-brand-50 border border-brand-200 flex items-center justify-center text-brand-600">
                <Coins className="w-4 h-4" weight="light" />
              </div>
              <h1 className="font-display text-xl sm:text-2xl font-bold text-ink tracking-tight">Credits</h1>
            </div>
            <p className="text-sm text-ink-muted">Track your scan credit balance and buy more when you need them</p>
          </div>
        </div>

        {/* Success banner */}
        {showSuccess && successPts > 0 && (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-4 py-3.5 mb-6">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
              <CheckCircle className="w-4 h-4 text-emerald-600" weight="fill" />
            </div>
            <p className="text-sm text-emerald-700 font-medium flex-1 flex items-center gap-2">
              Payment received — <span className="font-bold">{successPts.toLocaleString()} credits</span> added to your account.
              {creditsPolling && <Spinner className="w-3.5 h-3.5 text-emerald-600 animate-spin shrink-0" weight="bold" />}
            </p>
            <button onClick={() => setShowSuccess(false)} className="text-emerald-600 hover:text-emerald-700 transition p-1">
              <X className="w-4 h-4" weight="light" />
            </button>
          </div>
        )}

        {/* Skip trace deposit success banner */}
        {showStSuccess && successStAmount > 0 && (
          <div className="flex items-center gap-3 bg-violet-500/10 border border-violet-500/20 rounded-2xl px-4 py-3.5 mb-6">
            <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
              <CheckCircle className="w-4 h-4 text-violet-600" weight="fill" />
            </div>
            <p className="text-sm text-violet-700 font-medium flex-1">
              Payment received — <span className="font-bold">${successStAmount.toFixed(2)}</span> will be added to your Skip Trace balance shortly.
            </p>
            <button onClick={() => setShowStSuccess(false)} className="text-violet-600 hover:text-violet-700 transition p-1">
              <X className="w-4 h-4" weight="light" />
            </button>
          </div>
        )}

        {/* Error banner */}
        {paymentError && (
          <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3.5 mb-6">
            <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
              <WarningCircle className="w-4 h-4 text-red-500" weight="light" />
            </div>
            <p className="text-sm text-red-700 font-medium flex-1">{paymentError}</p>
            <button onClick={() => setPaymentError(null)} className="text-red-500 hover:text-red-700 transition p-1">
              <X className="w-4 h-4" weight="light" />
            </button>
          </div>
        )}


        {/* Balance strip */}
        {usage && (
          <div className="relative overflow-hidden bg-white border border-line shadow-[0_2px_8px_rgba(15,23,42,0.04)] rounded-[1.75rem] p-5 sm:p-6 mb-8 sm:mb-10">
            <div className="absolute inset-0 bg-gradient-to-r from-brand-50/60 via-transparent to-emerald-50/60 pointer-events-none" />
            <div className="relative">
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-widest mb-4">Account Balance</p>
              <div className="grid grid-cols-2 gap-4 sm:gap-6">
                <StatCard value={usage.used.toLocaleString()} label="Used this cycle" />
                {usage.totalCredits > 0 && (
                  <StatCard value={usage.purchasedRemaining.toLocaleString()} label="Credits left" accent />
                )}
              </div>
              {usage.totalCredits > 0 && (
                <div className="mt-4 pt-4 border-t border-line">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-ink-muted">Credits used</span>
                    <span className="text-xs text-ink-muted tabular-nums font-mono">
                      {usage.purchasedCreditsUsed?.toLocaleString() ?? 0} / {usage.totalCredits.toLocaleString()}
                    </span>
                  </div>
                  <div className="h-1.5 bg-paper-bone rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, ((usage.purchasedCreditsUsed ?? 0) / usage.totalCredits) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section label */}
        <div className="flex items-center gap-3 mb-5">
          <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-widest">Buy more credits</p>
          <div className="flex-1 h-px bg-line" />
          <p className="text-[11px] text-ink-muted">All at 1.4¢ per credit</p>
        </div>

        {/* Package cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 mb-8">
          {PACKAGES.map((pkg, i) => {
            const card = (
              <div
                className={`group relative flex flex-col h-full rounded-2xl overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:-translate-y-0.5 ${
                  pkg.popular
                    ? 'bg-white shadow-[0_8px_24px_rgba(37,99,235,0.10)]'
                    : 'bg-white border border-line shadow-[0_2px_8px_rgba(15,23,42,0.04)] hover:border-brand-200'
                }`}
              >
                {pkg.popular && (
                  <div className="bg-brand-600 px-3 py-1.5 text-center">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-white">Most Popular</span>
                  </div>
                )}

                <div className="flex flex-col flex-1 p-5">
                  {/* Credits */}
                  <div className="mb-4">
                    <p className="font-display text-2xl sm:text-3xl font-bold tabular-nums tracking-tight mb-0.5 text-ink">
                      {pkg.points.toLocaleString()}
                    </p>
                    <p className="text-xs text-ink-muted font-medium uppercase tracking-wider">scan credits</p>
                  </div>

                  {/* Price */}
                  <div className="mb-5">
                    <p className={`font-display text-xl font-bold ${pkg.popular ? 'text-brand-600' : 'text-ink-muted'}`}>
                      ${pkg.price.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-0.5">{pkg.perPoint} per credit</p>
                  </div>

                  {/* Divider */}
                  <div className={`h-px mb-4 ${pkg.popular ? 'bg-brand-200' : 'bg-line'}`} />

                  {/* What you get */}
                  <div className="flex items-center gap-2 mb-5">
                    <Check className={`w-3.5 h-3.5 shrink-0 ${pkg.popular ? 'text-emerald-600' : 'text-emerald-600/70'}`} weight="light" />
                    <span className="text-xs text-ink-muted">{pkg.points.toLocaleString()} property scans</span>
                  </div>

                  {/* Button */}
                  <button
                    onClick={() => handleBuy(pkg.points)}
                    disabled={!!loading}
                    className={`mt-auto w-full py-2.5 rounded-full text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
                      pkg.popular
                        ? 'bg-brand-600 hover:bg-brand-500 text-white'
                        : 'bg-paper-bone hover:bg-line border border-line text-ink-muted hover:text-ink'
                    }`}
                  >
                    {loading === pkg.points ? (
                      <>
                        <Spinner className="w-4 h-4 animate-spin" weight="bold" />
                        Redirecting…
                      </>
                    ) : (
                      <>
                        Buy for ${pkg.price.toFixed(2)}
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${pkg.popular ? 'bg-white/15' : 'bg-ink/10'}`}>
                          <ArrowRight className="w-3 h-3" weight="bold" />
                        </span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )

            return pkg.popular ? (
              <div key={pkg.points} className="bg-gradient-to-br from-brand-50 to-white border border-brand-200 p-1.5 rounded-[1.75rem]">
                {reduce ? card : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
                    className="h-full"
                  >
                    {card}
                  </motion.div>
                )}
              </div>
            ) : (
              <div key={pkg.points}>
                {reduce ? card : (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.5, delay: i * 0.08, ease: EASE }}
                    className="h-full"
                  >
                    {card}
                  </motion.div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Skip Trace Services ── */}
        <>
            <div className="flex items-center gap-3 mb-5 mt-4">
              <p className="text-[11px] font-semibold text-ink-muted uppercase tracking-widest whitespace-nowrap">Skip Trace Services</p>
              <div className="flex-1 h-px bg-line" />
            </div>

            {/* Pricing cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-5">
              {/* Skip Trace */}
              <div className="bg-white border border-line shadow-[0_2px_8px_rgba(15,23,42,0.04)] rounded-2xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">Skip Trace</p>
                    <p className="text-xs text-ink-muted mt-0.5">Full property owner lookup</p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
                    <UsersThree className="w-4 h-4 text-violet-600" weight="light" />
                  </div>
                </div>
                <p className="font-display text-2xl font-bold text-ink mb-0.5">
                  $0.08<span className="text-sm font-normal text-ink-muted"> / record</span>
                </p>
                <p className="text-xs text-ink-muted mt-1">e.g. 100 records = <span className="text-ink font-medium font-mono">$8.00</span></p>
              </div>

              {/* DNC Scrub */}
              <div className="bg-white border border-line shadow-[0_2px_8px_rgba(15,23,42,0.04)] rounded-2xl p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">DNC Scrub</p>
                    <p className="text-xs text-ink-muted mt-0.5">Do Not Call list verification</p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center shrink-0">
                    <PhoneX className="w-4 h-4 text-emerald-600" weight="light" />
                  </div>
                </div>
                <p className="font-display text-2xl font-bold text-ink mb-0.5">
                  $0.02<span className="text-sm font-normal text-ink-muted"> / phone</span>
                </p>
                <p className="text-xs text-ink-muted mt-1">e.g. 100 phones = <span className="text-ink font-medium font-mono">$2.00</span></p>
              </div>
            </div>

            {/* Balance + deposit */}
            <div className="bg-white border border-line shadow-[0_2px_8px_rgba(15,23,42,0.04)] rounded-2xl p-5 mb-8">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm text-ink-muted">Skip Trace Balance</p>
                <p className="font-mono text-lg font-bold text-ink tabular-nums flex items-center gap-2">
                  ${(usage?.skipTraceBalance ?? 0).toFixed(2)}
                  {stPolling && <Spinner className="w-3.5 h-3.5 text-violet-600 animate-spin" weight="bold" />}
                </p>
              </div>

              <p className="text-xs text-ink-muted mb-3">Deposit funds to use for Skip Trace and DNC Scrub (minimum $5)</p>

              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm pointer-events-none">$</span>
                  <input
                    type="number"
                    min={5}
                    max={5000}
                    step={1}
                    placeholder="25"
                    value={depositAmount}
                    onChange={e => { setDepositAmount(e.target.value); setDepositError(null) }}
                    className="w-full pl-7 pr-4 py-2.5 bg-paper-bone border border-line rounded-xl text-ink text-sm focus:outline-none focus:border-violet-400 placeholder:text-ink-faint [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                </div>
                <button
                  onClick={handleDeposit}
                  disabled={depositLoading || !depositAmount}
                  className="px-5 py-2.5 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98] flex items-center gap-2 whitespace-nowrap"
                >
                  {depositLoading ? (
                    <><Spinner className="w-4 h-4 animate-spin" weight="bold" />Redirecting…</>
                  ) : (
                    <>
                      <Wallet className="w-4 h-4" weight="light" />
                      Deposit
                    </>
                  )}
                </button>
              </div>

              {depositError && (
                <p className="text-xs text-red-600 mt-2">{depositError}</p>
              )}

              {depositAmount && parseFloat(depositAmount) >= 5 && !depositError && (
                <p className="text-xs text-ink-muted mt-2">
                  ≈ <span className="text-ink">{Math.floor(parseFloat(depositAmount) / 0.08).toLocaleString()}</span> skip trace records
                  {' '}or <span className="text-ink">{Math.floor(parseFloat(depositAmount) / 0.02).toLocaleString()}</span> DNC phone checks
                  {' '}· <span className="text-ink-muted">Sales tax may apply</span>
                </p>
              )}
            </div>
          </>

        {/* Footer */}
        <div className="flex items-center justify-center gap-2 text-xs text-ink-muted">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" weight="light" />
          Payments processed securely by Stripe · Credits never expire
        </div>

      </div>
    </div>
  )
}

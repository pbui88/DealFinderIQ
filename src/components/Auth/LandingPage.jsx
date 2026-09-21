import { useNavigate } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import {
  MapTrifoldIcon as MapTrifold,
  CameraIcon as Camera,
  SparkleIcon as Sparkle,
  ArrowRightIcon as ArrowRight,
  ShieldCheckIcon as ShieldCheck,
  GlobeHemisphereWestIcon as GlobeHemisphereWest,
  UsersThreeIcon as UsersThree,
} from '@phosphor-icons/react'

const EASE = [0.16, 1, 0.3, 1]

function fadeUp(reduce, delay = 0) {
  return {
    initial: reduce ? false : { opacity: 0, y: 20 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount: 0.3 },
    transition: { duration: 0.6, delay, ease: EASE },
  }
}

// ── Nav ───────────────────────────────────────────────────────
function NavBar({ onSignIn, onGetStarted }) {
  return (
    <nav className="relative z-10 px-6 sm:px-8 h-16 flex items-center justify-between max-w-7xl mx-auto w-full">
      <span className="font-display text-xl font-bold tracking-tight">
        <span className="text-white">Deal</span><span className="text-brand-400">Finder</span><span className="text-white">IQ</span>
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={onSignIn}
          className="text-sm text-slate-400 hover:text-white transition font-medium px-4 py-2 rounded-xl hover:bg-white/[0.05]"
        >
          Sign in
        </button>
        <button
          onClick={onGetStarted}
          className="text-sm bg-brand-600 hover:bg-brand-500 text-white font-semibold px-4 py-2 rounded-xl transition shadow-lg shadow-brand-600/25"
        >
          Get started
        </button>
      </div>
    </nav>
  )
}

// ── Abstract scan-map hero visual ────────────────────────────
// Not a product screenshot — a stylized visualization of the actual
// mechanic (grid of scan points along a drawn boundary, a sweep pass,
// then a distress-flagged property surfacing). Built from real SVG/DOM,
// not a faked UI mockup.
function ScanMap() {
  const reduce = useReducedMotion()
  const points = [
    [18, 26], [34, 20], [50, 24], [66, 18], [82, 28],
    [22, 42], [40, 46], [58, 40], [74, 46], [88, 44],
    [16, 62], [32, 66], [48, 60], [64, 66], [80, 60],
    [24, 82], [42, 78], [60, 82], [76, 76],
  ]
  const flagged = new Set([7, 12, 15])

  return (
    <div className="relative w-full aspect-[4/5] max-w-md rounded-3xl border border-white/[0.08] bg-navy-800/60 overflow-hidden">
      <div className="absolute inset-0 bg-grid-dark" />
      <div className="absolute inset-0 bg-gradient-to-t from-navy-900/80 via-transparent to-navy-900/40" />

      {/* drawn boundary polygon */}
      <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full">
        <polygon
          points="12,30 60,10 92,32 84,86 20,90"
          fill="rgb(37 99 235 / 0.06)"
          stroke="rgb(96 165 250 / 0.35)"
          strokeWidth="0.6"
          strokeDasharray="2 2"
        />
        {!reduce && (
          <motion.g
            animate={{ x: [0, 100, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
          >
            <line x1="0" y1="0" x2="0" y2="100" stroke="rgb(96 165 250 / 0.5)" strokeWidth="0.5" />
          </motion.g>
        )}
      </svg>

      {/* scan points */}
      {points.map(([x, y], i) => {
        const isFlagged = flagged.has(i)
        return (
          <motion.div
            key={i}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${x}%`, top: `${y}%` }}
            initial={reduce ? false : { opacity: 0, scale: 0.4 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.045, ease: EASE }}
          >
            {isFlagged ? (
              <span className="relative flex items-center justify-center w-3 h-3">
                {!reduce && (
                  <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400/40 animate-ping-slow" />
                )}
                <span className="relative w-2 h-2 rounded-full bg-amber-400" />
              </span>
            ) : (
              <span className="block w-1.5 h-1.5 rounded-full bg-brand-400/70" />
            )}
          </motion.div>
        )
      })}

      {/* flagged-property callout */}
      <div className="absolute left-[58%] top-[40%] -translate-x-1/2 translate-y-3 bg-navy-900/95 border border-amber-400/25 rounded-lg px-2.5 py-1.5 shadow-xl">
        <p className="text-[10px] font-semibold text-amber-400 leading-none">Distress score 78</p>
        <p className="text-[9px] text-slate-500 mt-0.5 leading-none">Overgrown lot, boarded window</p>
      </div>

      <div className="absolute bottom-4 left-4 right-4 flex items-center justify-between text-[10px] text-slate-500 font-mono">
        <span>19 points scanned</span>
        <span className="text-amber-400/80">3 flagged</span>
      </div>
    </div>
  )
}

// ── Hero ──────────────────────────────────────────────────────
function Hero({ onGetStarted, onSignIn }) {
  const reduce = useReducedMotion()
  return (
    <div className="relative z-10 max-w-7xl mx-auto w-full px-6 sm:px-8 pt-10 pb-20 lg:pt-16 lg:pb-28">
      <div className="grid lg:grid-cols-2 gap-12 lg:gap-8 items-center">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] tracking-tight mb-5">
            Find distressed properties street by street.
          </h1>
          <p className="text-base text-slate-400 leading-relaxed mb-8 max-w-md">
            Draw a neighborhood and DealFinderIQ scans every street with Google Street View, scoring each property for signs of distress.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={onGetStarted}
              className="group flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold pl-6 pr-5 py-3.5 rounded-xl transition text-sm shadow-xl shadow-brand-600/25"
            >
              Get started
              <ArrowRight weight="bold" className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </button>
            <button
              onClick={onSignIn}
              className="bg-white/[0.06] hover:bg-white/[0.10] border border-white/[0.10] text-slate-200 font-semibold px-6 py-3.5 rounded-xl transition text-sm"
            >
              Sign in
            </button>
          </div>
        </motion.div>

        <motion.div
          className="flex justify-center lg:justify-end"
          initial={reduce ? false : { opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
        >
          <ScanMap />
        </motion.div>
      </div>
    </div>
  )
}

// ── Per-step motion — each card acts out its own verb ─────────
// Draw: the boundary path traces itself, vertices land as it passes them.
// Scan: a viewfinder sweeps top to bottom on loop, like a capture pass.
// Score: a progress ring fills toward the flagged score, number pops on land.
// All loop on a repeatDelay pause (a "breath" between passes, not frantic),
// and collapse to a single static frame under prefers-reduced-motion.
function DrawVisual({ reduce }) {
  const verts = [[100, 24], [166, 56], [148, 132], [64, 148], [30, 78]]
  const d = `M${verts.map(p => p.join(',')).join(' L')} Z`
  return (
    <svg viewBox="0 0 200 170" className="absolute top-4 right-4 w-32 h-28 opacity-90">
      <motion.path
        d={d}
        fill="rgb(37 99 235 / 0.08)"
        stroke="rgb(96 165 250 / 0.7)"
        strokeWidth="2"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={reduce ? undefined : { pathLength: [0, 1, 1] }}
        transition={reduce ? undefined : { duration: 2.2, times: [0, 0.8, 1], repeat: Infinity, repeatDelay: 1.1, ease: EASE }}
      />
      {verts.map((p, i) => {
        const land  = ((i + 1) / verts.length) * 0.8
        const start = Math.max(0.001, land - 0.06)
        return (
          <motion.circle
            key={i}
            cx={p[0]} cy={p[1]} r="4"
            fill="rgb(96 165 250)"
            initial={reduce ? false : { scale: 0, opacity: 0 }}
            animate={reduce ? { scale: 1, opacity: 1 } : { scale: [0, 0, 1, 1], opacity: [0, 0, 1, 1] }}
            transition={reduce ? undefined : {
              duration: 2.2, repeat: Infinity, repeatDelay: 1.1, ease: EASE,
              times: [0, start, land, 1],
            }}
          />
        )
      })}
    </svg>
  )
}

function ScanVisual({ reduce }) {
  return (
    <svg viewBox="0 0 200 140" className="absolute top-4 right-4 w-32 h-24 opacity-90">
      {/* viewfinder corners */}
      {[[8, 8, 1, 1], [192, 8, -1, 1], [8, 132, 1, -1], [192, 132, -1, -1]].map(([x, y, dx, dy], i) => (
        <path key={i} d={`M${x},${y + dy * 18} L${x},${y} L${x + dx * 18},${y}`} fill="none" stroke="rgb(96 165 250 / 0.6)" strokeWidth="2.5" />
      ))}
      {!reduce && (
        <motion.line
          x1="14" x2="186" stroke="rgb(96 165 250 / 0.85)" strokeWidth="2"
          initial={{ y1: 10, y2: 10, opacity: 0 }}
          animate={{ y1: [10, 130, 130], y2: [10, 130, 130], opacity: [0, 1, 0] }}
          transition={{ duration: 2, times: [0, 0.85, 1], repeat: Infinity, repeatDelay: 0.8, ease: 'easeInOut' }}
        />
      )}
    </svg>
  )
}

function ScoreVisual({ reduce }) {
  const r = 34, c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 100 100" className="absolute top-4 right-4 w-24 h-24 opacity-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth="6" />
      <motion.circle
        cx="50" cy="50" r={r} fill="none" stroke="rgb(251 191 36 / 0.85)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} transform="rotate(-90 50 50)"
        initial={reduce ? false : { strokeDashoffset: c }}
        animate={reduce ? { strokeDashoffset: c * 0.22 } : { strokeDashoffset: [c, c * 0.22, c * 0.22] }}
        transition={reduce ? undefined : { duration: 2, times: [0, 0.8, 1], repeat: Infinity, repeatDelay: 1.1, ease: EASE }}
      />
      <motion.text
        x="50" y="56" textAnchor="middle" className="fill-white font-display font-bold" style={{ fontSize: 22 }}
        initial={reduce ? false : { opacity: 0, scale: 0.7 }}
        animate={reduce ? { opacity: 1, scale: 1 } : { opacity: [0, 0, 1, 1], scale: [0.7, 0.7, 1, 1] }}
        transition={reduce ? undefined : { duration: 2, times: [0, 0.78, 0.92, 1], repeat: Infinity, repeatDelay: 1.1, ease: EASE }}
      >
        78
      </motion.text>
    </svg>
  )
}

// ── How it works — asymmetric bento (3 items, 3 cells) ───────
// Each card gets a slow ambient glow (a quiet "still processing" pulse) and a
// bespoke looping motion that acts out its own verb (see visuals above), not
// decoration for its own sake. All motion collapses under prefers-reduced-motion.
function HowItWorks() {
  const reduce = useReducedMotion()
  const steps = [
    {
      icon: MapTrifold,
      title: 'Draw',
      desc: 'Outline any neighborhood on the map. DealFinderIQ lays down scan points along every road inside it.',
      bg: '/polygon-bg.webp',
      glow: 'bg-brand-500/20',
      Visual: DrawVisual,
      tall: true,
    },
    {
      icon: Camera,
      title: 'Scan',
      desc: 'Each point pulls live Google Street View imagery automatically, no manual driving required.',
      bg: '/dealfinderiq_car.webp',
      glow: 'bg-brand-500/20',
      Visual: ScanVisual,
    },
    {
      icon: Sparkle,
      title: 'Score',
      desc: 'AI reviews every photo and grades the property for visible signs of distress.',
      bg: '/dealfinderiq_chip.webp',
      glow: 'bg-amber-500/15',
      Visual: ScoreVisual,
    },
  ]

  return (
    <div className="relative isolate overflow-hidden bg-navy-950">
      {/* ── Ethereal glass backdrop — OLED-black section, two drifting glow orbs ── */}
      <motion.div
        aria-hidden
        className="absolute -z-10 top-[-10%] left-[8%] w-[26rem] h-[26rem] rounded-full bg-brand-500/25 blur-[110px]"
        animate={reduce ? undefined : { x: [0, 40, 0], y: [0, 24, 0], opacity: [0.6, 0.85, 0.6] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        aria-hidden
        className="absolute -z-10 bottom-[-15%] right-[10%] w-[24rem] h-[24rem] rounded-full bg-amber-500/15 blur-[110px]"
        animate={reduce ? undefined : { x: [0, -30, 0], y: [0, -20, 0], opacity: [0.5, 0.75, 0.5] }}
        transition={{ duration: 16, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />

      <div className="relative z-10 max-w-7xl mx-auto w-full px-6 sm:px-8 py-16 lg:py-20">
        <motion.h2 {...fadeUp(reduce)} className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-10 max-w-lg">
          How DealFinderIQ finds deals
        </motion.h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {steps.map((s, i) => (
            <motion.div
              key={s.title}
              {...fadeUp(reduce, i * 0.08)}
              className={`group relative overflow-hidden bg-white/[0.03] backdrop-blur-2xl border border-white/[0.08] rounded-2xl p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-white/[0.16] hover:bg-white/[0.05] transition-colors ${
                s.tall ? 'md:row-span-2' : ''
              }`}
            >
              {/* per-card ambient glow — slow breathing pulse, reads as "engine idle" */}
              <motion.div
                aria-hidden
                className={`absolute -inset-8 rounded-full blur-3xl ${s.glow}`}
                animate={reduce ? undefined : { opacity: [0.4, 0.7, 0.4], scale: [1, 1.08, 1] }}
                transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.6 }}
              />

              <img
                src={s.bg}
                alt=""
                aria-hidden
                className="absolute inset-0 w-full h-full object-cover opacity-[0.14] transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                style={{
                  maskImage: 'radial-gradient(ellipse 85% 85% at 50% 40%, black 5%, transparent 78%)',
                  WebkitMaskImage: 'radial-gradient(ellipse 85% 85% at 50% 40%, black 5%, transparent 78%)',
                }}
              />

              {/* static grain for texture — no repaint cost, not animated */}
              <div
                aria-hidden
                className="absolute inset-0 opacity-[0.04] mix-blend-overlay pointer-events-none"
                style={{
                  backgroundImage:
                    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
                }}
              />

              {/* bespoke verb animation — Draw traces its polygon, Scan sweeps, Score fills */}
              <s.Visual reduce={reduce} />

              <div className="relative z-10 flex flex-col h-full justify-end min-h-[9rem]">
                <div className="w-10 h-10 bg-white/[0.06] border border-white/[0.08] rounded-xl flex items-center justify-center mb-4 transition-colors group-hover:border-brand-400/40">
                  <s.icon weight="regular" className="w-5 h-5 text-brand-400" />
                </div>
                <h3 className="text-base font-semibold text-white mb-1.5">{s.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed max-w-xs">{s.desc}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Trust strip ───────────────────────────────────────────────
function TrustStrip() {
  const reduce = useReducedMotion()
  const items = [
    { icon: GlobeHemisphereWest, label: 'Nationwide coverage', desc: 'Scan any US neighborhood with Street View data.' },
    { icon: ShieldCheck, label: 'Your data stays yours', desc: 'Scan areas and results are private to your account.' },
    { icon: UsersThree, label: 'Reviewed sign-ups', desc: 'New accounts are checked by our team before access.' },
  ]
  return (
    <div className="relative z-10 max-w-7xl mx-auto w-full px-6 sm:px-8 pb-16 lg:pb-20">
      <motion.div
        {...fadeUp(reduce)}
        className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06] border-t border-b border-white/[0.06]"
      >
        {items.map(it => (
          <div key={it.label} className="flex items-start gap-3 py-6 sm:px-6 first:sm:pl-0 last:sm:pr-0">
            <it.icon weight="light" className="w-5 h-5 text-brand-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-white">{it.label}</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{it.desc}</p>
            </div>
          </div>
        ))}
      </motion.div>
    </div>
  )
}

// ── Final CTA band ────────────────────────────────────────────
function FinalCta({ onGetStarted }) {
  const reduce = useReducedMotion()
  return (
    <div className="relative z-10 max-w-7xl mx-auto w-full px-6 sm:px-8 pb-20 lg:pb-28">
      <motion.div
        {...fadeUp(reduce)}
        className="relative overflow-hidden rounded-3xl border border-brand-600/20 bg-gradient-to-br from-brand-600/10 via-navy-800 to-navy-800 px-8 py-14 text-center"
      >
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight mb-3">
          Start scanning your first neighborhood.
        </h2>
        <p className="text-sm text-slate-400 mb-8">Free to create an account. No card required.</p>
        <button
          onClick={onGetStarted}
          className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-500 text-white font-semibold pl-6 pr-5 py-3.5 rounded-xl transition text-sm shadow-xl shadow-brand-600/25"
        >
          Get started
          <ArrowRight weight="bold" className="w-4 h-4" />
        </button>
      </motion.div>
    </div>
  )
}

// ── Footer ────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="relative z-10 max-w-7xl mx-auto w-full px-6 sm:px-8 py-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-3">
      <span className="font-display text-sm font-bold tracking-tight">
        <span className="text-white">Deal</span><span className="text-brand-400">Finder</span><span className="text-white">IQ</span>
      </span>
      <p className="text-xs text-slate-600">New accounts are reviewed by an admin before access is granted.</p>
      <p className="text-xs text-slate-600">&copy; {new Date().getFullYear()} DealFinderIQ</p>
    </footer>
  )
}

// ── Page ──────────────────────────────────────────────────────
export default function LandingPage() {
  const navigate = useNavigate()
  const onSignIn     = () => navigate('/login', { state: { tab: 'signin' } })
  const onGetStarted = () => navigate('/login', { state: { tab: 'signup' } })

  return (
    <div className="min-h-[100dvh] bg-navy-900 flex flex-col overflow-hidden">
      <div className="fixed inset-0 bg-grid-dark pointer-events-none" />
      <div className="fixed top-0 left-1/4 w-[600px] h-[600px] bg-brand-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[400px] h-[400px] bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

      <NavBar onSignIn={onSignIn} onGetStarted={onGetStarted} />
      <Hero onSignIn={onSignIn} onGetStarted={onGetStarted} />
      <HowItWorks />
      <TrustStrip />
      <FinalCta onGetStarted={onGetStarted} />
      <Footer />
    </div>
  )
}

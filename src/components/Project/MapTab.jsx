import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { GoogleMap, Polygon, Polyline, Marker } from '@react-google-maps/api'
import * as turf from '@turf/turf'
import { motion, useReducedMotion } from 'motion/react'
import {
  MagnifyingGlassIcon,
  XIcon,
  MapPinIcon,
  PencilSimpleIcon,
  SlidersHorizontalIcon,
  PlayIcon,
  CircleNotchIcon,
  CheckCircleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { generatePoints } from '../../lib/api'
import { generateGridPoints } from '../../lib/geo'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

const EASE = [0.32, 0.72, 0, 1]

// ── Shared chrome classNames (presentational only) ──
const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-display font-semibold ' +
  'bg-brand-600 hover:bg-brand-500 text-white transition-all duration-300 active:scale-[0.98] ' +
  'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 shadow-[0_8px_32px_rgba(37,99,235,0.25)]'
const btnGlass =
  'inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-display font-semibold ' +
  'border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white ' +
  'transition-all duration-300 active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed'
const panelShadow = 'shadow-[0_8px_32px_rgba(0,0,0,0.35)]'

// Grid-based clustering — cell size shrinks as zoom increases
function buildClusters(points, zoom) {
  if (!points.length) return []
  const deg = 0.0015 * Math.pow(2, Math.max(0, 15 - zoom))
  const cells = {}
  for (const pt of points) {
    const k = `${Math.round(pt.lng / deg)},${Math.round(pt.lat / deg)}`
    if (!cells[k]) cells[k] = { lat: 0, lng: 0, n: 0, scoreSum: 0, scoreCount: 0 }
    cells[k].lat += pt.lat
    cells[k].lng += pt.lng
    cells[k].n++
    if (pt.overall_score != null) { cells[k].scoreSum += pt.overall_score; cells[k].scoreCount++ }
  }
  return Object.values(cells).map(c => ({
    lat:   c.lat / c.n,
    lng:   c.lng / c.n,
    count: c.n,
    score: c.scoreCount > 0 ? c.scoreSum / c.scoreCount : null,
  }))
}

function clusterIcon(count, score) {
  const color = score != null
    ? score >= 0.70 ? '#ef4444' : score >= 0.45 ? '#f97316' : score >= 0.20 ? '#eab308' : '#22c55e'
    : '#7c3aed'
  const size  = count === 1 ? 12 : count < 5 ? 24 : count < 20 ? 30 : 36
  const fs    = size <= 12 ? 0 : size <= 24 ? 10 : 11
  const label = size <= 12 ? '' : String(count)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${size/2-1}" fill="${color}" stroke="white" stroke-width="1.5" opacity="0.92"/>
    ${label ? `<text x="${size/2}" y="${size/2+4}" text-anchor="middle" fill="white" font-size="${fs}" font-weight="700" font-family="Arial,sans-serif">${label}</text>` : ''}
  </svg>`
  return {
    url:        `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new window.google.maps.Size(size, size),
    anchor:     new window.google.maps.Point(size / 2, size / 2),
  }
}

const US_CENTER = { lat: 39.5, lng: -98.35 }

// Grid spacing (meters) is adaptive: small areas get a fine grid, while
// city/county-scale areas get a coarser grid so the point count stays
// scannable. See computeSpacing().
const MIN_SPACING_M      = 30
const MAX_SPACING_M      = 200
const TARGET_GRID_POINTS = 1500

// Even at the coarsest spacing, areas with more than this many estimated
// points are too large for a single scan — show an estimate and disable Run.
// Must match the generate-points.js backend cap.
const MAX_SCAN_POINTS = 5000

// Boundaries with more vertices than this are simplified before rendering,
// so large city/county polygons from OSM/Census don't bog down the map.
const MAX_POLYGON_VERTICES = 2000

// Pick a grid spacing that keeps the point count near TARGET_GRID_POINTS,
// scaling from MIN_SPACING_M (small custom areas) up to MAX_SPACING_M
// (city/county-scale boundaries).
function computeSpacing(areaM2) {
  const raw = Math.sqrt(areaM2 / TARGET_GRID_POINTS)
  const clamped = Math.min(MAX_SPACING_M, Math.max(MIN_SPACING_M, raw))
  return Math.round(clamped / 5) * 5
}

export default function MapTab({ project, scanPoints, onPointsGenerated, isLoaded, loadError }) {
  const { usage } = useAuth()
  const reduceMotion = useReducedMotion()
  const keyLoading   = usage === null
  const noCreditsBlocked = usage !== null && !usage.can_scan

  const [showPanel,      setShowPanel]      = useState(false)
  const [drawingMode,    setDrawingMode]    = useState(null)
  const [tempPoints,     setTempPoints]     = useState([])
  const [isDragging,     setIsDragging]     = useState(false)
  const [polygon,        setPolygon]        = useState(project.scan_area_geojson || null)
  const [preview,        setPreview]        = useState([])
  const [pointCount,     setPointCount]     = useState(null)
  const [generating,     setGenerating]     = useState(false)
  const [error,          setError]          = useState(null)
  const [searchPin,      setSearchPin]      = useState(null)
  const [searchInput,    setSearchInput]    = useState('')
  const [suggestions,    setSuggestions]    = useState([])
  const [showDropdown,   setShowDropdown]   = useState(false)
  const [boundaryInput,  setBoundaryInput]  = useState('')
  const [boundaryLoading, setBoundaryLoading] = useState(false)
  const [boundaryError,  setBoundaryError]  = useState(null)
  const [largeArea,      setLargeArea]      = useState(false)
  const [estimatedCount, setEstimatedCount] = useState(null)
  const [spacing,        setSpacing]        = useState(() =>
    project.scan_area_geojson ? computeSpacing(turf.area(project.scan_area_geojson)) : MIN_SPACING_M
  )

  const [zoom, setZoom] = useState(4)
  const [pastAreas, setPastAreas] = useState([])

  const mapRef         = useRef(null)
  const tempPointsRef  = useRef([])
  const isDraggingRef  = useRef(false)
  const searchInputRef = useRef(null)
  const debounceRef    = useRef(null)

  // Nominatim (OpenStreetMap) autocomplete — no API key required
  const fetchSuggestions = async (input) => {
    if (!input || input.length < 2) { setSuggestions([]); setShowDropdown(false); return }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(input)}&format=json&countrycodes=us&limit=5&addressdetails=1`,
        { headers: { 'Accept-Language': 'en-US' }, signal: controller.signal }
      )
      const data = await res.json()
      setSuggestions(data)
      setShowDropdown(data.length > 0)
    } catch (e) {
      if (e.name !== 'AbortError') console.warn('Nominatim search failed:', e.message)
      setSuggestions([]); setShowDropdown(false)
    } finally {
      clearTimeout(timer)
    }
  }

  const handleSearchChange = (e) => {
    const val = e.target.value
    setSearchInput(val)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 350)
  }

  const handleSelectSuggestion = (s) => {
    setShowDropdown(false)
    const label = s.display_name.split(',').slice(0, 3).join(',').trim()
    setSearchInput(label)
    const lat = parseFloat(s.lat)
    const lng = parseFloat(s.lon)
    if (mapRef.current) {
      mapRef.current.setCenter({ lat, lng })
      mapRef.current.setZoom(15)
    }
    setSearchPin({ lat, lng, address: s.display_name })
  }


  // Past scan areas from this account's other projects, shown grayed out for
  // reference. RLS on `projects` scopes this to the signed-in user, so other
  // accounts' areas never come back in the query.
  useEffect(() => {
    let cancelled = false
    supabase
      .from('projects')
      .select('id, name, scan_area_geojson')
      .neq('id', project.id)
      .not('scan_area_geojson', 'is', null)
      .then(({ data }) => {
        if (!cancelled) setPastAreas(data || [])
      })
    return () => { cancelled = true }
  }, [project.id])

  const onMapLoad = useCallback((map) => {
    mapRef.current = map
    if (polygon) {
      const bounds = new window.google.maps.LatLngBounds()
      polygon.coordinates[0].forEach(([lng, lat]) => bounds.extend({ lat, lng }))
      map.fitBounds(bounds, 60)
    }
  }, [polygon])

  // Compute adaptive grid spacing for a polygon and update the preview /
  // large-area state accordingly. Shared by drawn and auto-loaded polygons.
  const applySpacingAndPreview = (g) => {
    const areaM2   = turf.area(g)
    const sp       = computeSpacing(areaM2)
    const estimate = Math.round(areaM2 / (sp * sp))
    setSpacing(sp)
    if (estimate > MAX_SCAN_POINTS) {
      setLargeArea(true)
      setEstimatedCount(estimate)
      setPreview([])
    } else {
      setLargeArea(false)
      setEstimatedCount(null)
      setPreview(generateGridPoints(g, sp))
    }
  }

  const finishDrag = useCallback(() => {
    if (!isDraggingRef.current) return
    isDraggingRef.current = false
    setIsDragging(false)
    const pts = tempPointsRef.current
    tempPointsRef.current = []
    setTempPoints([])
    if (pts.length < 3) return
    const coords = pts.map(p => [p.lng, p.lat])
    coords.push(coords[0])
    const geoJson = { type: 'Polygon', coordinates: [coords] }
    setPolygon(geoJson)
    setDrawingMode(null)
    applySpacingAndPreview(geoJson)
  }, [])

  const handleMapMouseDown = useCallback((e) => {
    if (drawingMode !== 'polygon') return
    isDraggingRef.current = true
    setIsDragging(true)
    const pt = { lat: e.latLng.lat(), lng: e.latLng.lng() }
    tempPointsRef.current = [pt]
    setTempPoints([pt])
  }, [drawingMode])

  const handleMapMouseMove = useCallback((e) => {
    if (drawingMode !== 'polygon' || !isDraggingRef.current) return
    const pt = { lat: e.latLng.lat(), lng: e.latLng.lng() }
    const prev = tempPointsRef.current
    const last = prev[prev.length - 1]
    if (last) {
      const dlat = pt.lat - last.lat
      const dlng = pt.lng - last.lng
      if (Math.sqrt(dlat * dlat + dlng * dlng) < 0.0002) return
    }
    const updated = [...prev, pt]
    tempPointsRef.current = updated
    setTempPoints(updated)
  }, [drawingMode])

  useEffect(() => {
    if (drawingMode !== 'polygon') return
    document.addEventListener('mouseup', finishDrag)
    return () => document.removeEventListener('mouseup', finishDrag)
  }, [drawingMode, finishDrag])

  const handleCancelDrawing = useCallback(() => {
    isDraggingRef.current = false
    setIsDragging(false)
    tempPointsRef.current = []
    setDrawingMode(null)
    setTempPoints([])
  }, [])


  // Keep point count in sync with whatever polygon/points are currently shown.
  useEffect(() => {
    if (!polygon) { setPointCount(null); return }
    if (largeArea) { setPointCount(estimatedCount); return }
    const count = scanPoints?.length > 0
      ? scanPoints.length
      : (preview.length || generateGridPoints(polygon, spacing).length)
    setPointCount(count)
  }, [polygon, preview, scanPoints, largeArea, estimatedCount, spacing])

  const applyBoundaryPolygon = (geo) => {
    let g = geo
    if (g.type === 'MultiPolygon') {
      const largest = g.coordinates.reduce((a, b) => a[0].length > b[0].length ? a : b)
      g = { type: 'Polygon', coordinates: largest }
    }
    if (g.type !== 'Polygon') return false

    // Simplify very detailed boundaries (e.g. counties) for smooth rendering
    if (g.coordinates[0].length > MAX_POLYGON_VERTICES) {
      const simplified = turf.simplify(g, { tolerance: 0.0008, highQuality: false })
      if (simplified?.coordinates?.[0]?.length > 3) g = simplified
    }

    setPolygon(g)
    setDrawingMode(null)
    if (mapRef.current) {
      const bounds = new window.google.maps.LatLngBounds()
      g.coordinates[0].forEach(([lng, lat]) => bounds.extend({ lat, lng }))
      mapRef.current.fitBounds(bounds, 40)
    }

    // City/county boundaries can be huge — adaptive spacing keeps the grid
    // (and point count) scannable, or flags the area as too large.
    applySpacingAndPreview(g)
    return true
  }

  // Auto-draw a boundary polygon from a ZIP code, city, or county name.
  const handleBoundarySearch = async () => {
    const query = boundaryInput.trim()
    if (!query) return
    setBoundaryLoading(true)
    setBoundaryError(null)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 12000)

    try {
      if (/^\d{5}$/.test(query)) {
        // ZIP code — Census TIGERweb ZCTA is authoritative for every US ZIP
        const censusUrl =
          `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/PUMA_TAD_TAZ_UGA_ZCTA/MapServer/2/query` +
          `?where=ZCTA5CE20%3D%27${query}%27&outFields=ZCTA5CE20&outSR=4326&f=geojson`
        const censusRes = await fetch(censusUrl, { signal: controller.signal })
        if (censusRes.ok) {
          const censusData = await censusRes.json()
          const geo = censusData.features?.[0]?.geometry
          if (geo && applyBoundaryPolygon(geo)) return
        }

        // Fallback: Nominatim postal code boundary (OSM coverage varies for US ZIPs)
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?postalcode=${query}&country=us&format=json&polygon_geojson=1&limit=1`,
          { headers: { 'Accept-Language': 'en-US' }, signal: controller.signal }
        )
        const nomData = await nomRes.json()
        const geo = nomData[0]?.geojson
        if (geo && applyBoundaryPolygon(geo)) return

        setBoundaryError(`No boundary found for ZIP ${query}`)
      } else {
        // City or county name — Nominatim admin boundary (OSM relation)
        const nomRes = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&polygon_geojson=1&limit=1&countrycodes=us&addressdetails=1`,
          { headers: { 'Accept-Language': 'en-US' }, signal: controller.signal }
        )
        const nomData = await nomRes.json()
        const geo = nomData[0]?.geojson
        if (geo && applyBoundaryPolygon(geo)) return

        setBoundaryError(`No boundary found for "${query}"`)
      }
    } catch (e) {
      setBoundaryError(e.name === 'AbortError' ? 'Request timed out — try again' : 'Failed to load boundary')
    } finally {
      clearTimeout(timer)
      setBoundaryLoading(false)
    }
  }

  const handleGenerate = async () => {
    if (!polygon || largeArea) return
    setGenerating(true)
    setError(null)
    try {
      await generatePoints(project.id, { geojson: polygon, spacingMeters: spacing })
      setPreview([])
      onPointsGenerated({ autoStart: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setGenerating(false)
    }
  }

  const handleClear = () => {
    setPolygon(null)
    setPreview([])
    setPointCount(null)
    setBoundaryInput('')
    setBoundaryError(null)
    setLargeArea(false)
    setEstimatedCount(null)
    setSpacing(MIN_SPACING_M)
  }


  const displayPoints = scanPoints?.length > 0 ? scanPoints : preview
  const ptCount       = displayPoints.length
  const clusters      = useMemo(() => buildClusters(displayPoints, zoom), [displayPoints, zoom])

  if (loadError) return (
    <div className="flex items-center justify-center h-full text-red-400 text-sm gap-2">
      <WarningCircleIcon weight="light" className="w-4 h-4" />
      Failed to load Google Maps. Check your API key.
    </div>
  )

  if (!isLoaded) return (
    <div className="flex items-center justify-center h-full">
      <CircleNotchIcon weight="light" className="w-6 h-6 text-brand-500 animate-spin" />
    </div>
  )

  return (
    <div className="flex h-full">

      {/* ── Map + Street View column ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Map */}
        <div className="relative flex-1">
          <GoogleMap
            mapContainerStyle={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            center={US_CENTER}
            zoom={4}
            options={{
              zoomControl: true,
              streetViewControl: false,
              mapTypeControl: false,
              fullscreenControl: false,
              draggableCursor: drawingMode === 'polygon' ? 'crosshair' : undefined,
              draggable:       drawingMode !== 'polygon',
              scrollwheel:     drawingMode !== 'polygon',
            }}
            onLoad={onMapLoad}
            onZoomChanged={() => { if (mapRef.current) setZoom(mapRef.current.getZoom()) }}
            onMouseDown={handleMapMouseDown}
            onMouseMove={handleMapMouseMove}
            onMouseUp={finishDrag}
          >
            {/* Live drag outline */}
            {drawingMode === 'polygon' && tempPoints.length >= 2 && (
              <Polyline
                path={tempPoints}
                options={{ strokeColor: '#ef4444', strokeWeight: 2, strokeOpacity: 1 }}
              />
            )}

            {/* Past scan areas from this account, grayed out for reference */}
            {pastAreas.map(p => (
              <Polygon
                key={p.id}
                paths={p.scan_area_geojson.coordinates[0].map(([lng, lat]) => ({ lat, lng }))}
                options={{
                  fillColor: '#334155', fillOpacity: 0.35,
                  strokeColor: '#334155', strokeWeight: 1.5, strokeOpacity: 0.9,
                  clickable: false, zIndex: 1,
                }}
              />
            ))}

            {polygon && (
              <Polygon
                paths={polygon.coordinates[0].map(([lng, lat]) => ({ lat, lng }))}
                options={{ fillColor: '#ef4444', fillOpacity: 0.12, strokeColor: '#ef4444', strokeWeight: 2, zIndex: 2 }}
              />
            )}

            {/* Search result pin */}
            {searchPin && (
              <Marker
                position={{ lat: searchPin.lat, lng: searchPin.lng }}
                options={{
                  icon: {
                    path:        window.google.maps.SymbolPath.CIRCLE,
                    scale:       9,
                    fillColor:   '#f59e0b',
                    fillOpacity: 1,
                    strokeColor: '#ffffff',
                    strokeWeight: 2,
                  },
                  zIndex: 999,
                }}
              />
            )}

            {/* Clustered scan points */}
            {clusters.map((c, i) => (
              <Marker
                key={i}
                position={{ lat: c.lat, lng: c.lng }}
                icon={clusterIcon(c.count, c.score)}
                zIndex={c.count}
              />
            ))}
          </GoogleMap>

          {/* ── Search box overlay ── */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="absolute top-4 left-1/2 -translate-x-1/2 z-10 w-80"
          >
            <div className="relative">
              <div className={`flex items-center bg-white/[0.06] backdrop-blur-2xl border border-white/[0.10] rounded-full px-3.5 py-2.5 gap-2 ${panelShadow}`}>
                <MagnifyingGlassIcon weight="light" className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchInput}
                  onChange={handleSearchChange}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                  placeholder="Search city, state or ZIP…"
                  className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 outline-none"
                />
                {searchInput && (
                  <button onClick={() => { setSearchInput(''); setSuggestions([]); setShowDropdown(false) }}
                    className="text-slate-500 hover:text-white transition active:scale-[0.98]">
                    <XIcon weight="light" className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Dropdown suggestions */}
              {showDropdown && suggestions.length > 0 && (
                <div className={`absolute top-full mt-2 w-full bg-white/[0.06] backdrop-blur-2xl border border-white/[0.10] rounded-2xl overflow-hidden ${panelShadow}`}>
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onMouseDown={() => handleSelectSuggestion(s)}
                      className="w-full text-left px-4 py-2.5 hover:bg-white/[0.08] flex items-start gap-2.5 transition"
                    >
                      <MapPinIcon weight="light" className="w-3.5 h-3.5 text-slate-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm text-white truncate">{s.display_name.split(',').slice(0, 2).join(',')}</p>
                        <p className="text-xs text-slate-500 truncate">{s.display_name.split(',').slice(2, 4).join(',').trim()}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>

          {/* Point count badge */}
          {largeArea && estimatedCount != null ? (
            <div className={`absolute top-4 left-4 bg-white/[0.06] backdrop-blur-2xl border border-white/[0.10] rounded-full px-3.5 py-1.5 text-xs text-slate-300 ${panelShadow}`}>
              ~<span className="font-mono">{estimatedCount.toLocaleString()}</span> scan points <span className="text-slate-500 ml-1">(estimated)</span>
            </div>
          ) : ptCount > 0 && (
            <div className={`absolute top-4 left-4 bg-white/[0.06] backdrop-blur-2xl border border-white/[0.10] rounded-full px-3.5 py-1.5 text-xs text-slate-300 ${panelShadow}`}>
              <span className="font-mono">{ptCount.toLocaleString()}</span> scan points
              {ptCount > 2000 && <span className="text-slate-500 ml-1">(showing 2,000)</span>}
            </div>
          )}

          {/* Mobile panel toggle */}
          <button
            onClick={() => setShowPanel(p => !p)}
            className={`absolute bottom-4 right-4 z-10 lg:hidden flex items-center gap-1.5 px-3.5 py-2.5 bg-white/[0.06] backdrop-blur-2xl border border-white/[0.10] rounded-full text-xs font-medium text-slate-300 active:scale-[0.98] transition ${panelShadow}`}
          >
            <SlidersHorizontalIcon weight="light" className="w-3.5 h-3.5" />
            Scan Area
          </button>

        </div>
      </div>

      {/* ── Right panel ── */}
      <div className={`${showPanel ? 'flex' : 'hidden'} lg:flex flex-col bg-white/[0.04] backdrop-blur-2xl border-l border-white/[0.10]
        absolute inset-0 z-20 lg:relative lg:inset-auto lg:z-auto lg:w-72`}>
        <div className="p-4 border-b border-white/[0.06] flex items-start justify-between">
          <div>
            <h3 className="text-sm font-display font-semibold text-white">Scan Area</h3>
            <p className="text-xs text-slate-500 mt-0.5">Draw your target neighborhood</p>
          </div>
          <button
            onClick={() => setShowPanel(false)}
            className="lg:hidden p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.05] transition active:scale-[0.98] shrink-0"
          >
            <XIcon weight="light" className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 p-4 space-y-5 overflow-y-auto">

          {/* Draw polygon */}
          {!polygon ? (
            <div>
              {drawingMode !== 'polygon' && (
                <>
                  <p className="text-xs text-slate-500 mb-3">
                    Click Draw, then click and drag on the map to outline your target area.
                  </p>
                  <button
                    onClick={() => setDrawingMode('polygon')}
                    className={`${btnGlass} w-full`}
                  >
                    <PencilSimpleIcon weight="light" className="w-4 h-4" />
                    Draw Area
                  </button>
                </>
              )}
              {drawingMode === 'polygon' && (
                <div className="space-y-2">
                  <div className="bg-brand-600/10 border border-brand-600/20 rounded-2xl px-3 py-2">
                    <p className="text-xs text-brand-400 font-medium">
                      {isDragging ? 'Drawing… release to finish' : 'Click and drag on the map to draw'}
                    </p>
                  </div>
                  <button onClick={handleCancelDrawing} className={`${btnGlass} w-full`}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-slate-400 truncate">
                  {boundaryInput ? boundaryInput : 'Polygon drawn'}
                </span>
                <button onClick={handleClear} className="text-xs text-slate-500 hover:text-red-400 transition shrink-0 ml-2">Clear</button>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl px-3 py-2">
                <CheckCircleIcon weight="fill" className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <p className="text-xs text-emerald-400">Area selected</p>
              </div>
            </div>
          )}

          {/* Stats card */}
          {(ptCount > 0 || pointCount !== null) && (
            <div className="bg-white/[0.04] border border-white/[0.08] rounded-2xl p-3 space-y-2">
              {largeArea ? (
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Est. Scan Points</span>
                    <span className="text-brand-400 font-bold font-mono">~{(estimatedCount ?? 0).toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Large area — too big to scan directly. Draw a smaller custom area to run a scan.
                  </p>
                </>
              ) : (
                <>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Scan Points</span>
                    <span className="text-brand-400 font-bold font-mono">{ptCount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">Est. Property Count</span>
                    <span className="text-slate-300 font-mono">
                      ~{Math.ceil(ptCount / 3).toLocaleString()}
                      <span className="text-slate-600"> – </span>
                      {ptCount.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Each scan point costs 1 credit. In dense urban areas, 1 credit ≈ 1 property. In rural or large-scale areas, a property may span multiple scan points (up to 3 credits or more each).
                  </p>
                </>
              )}
            </div>
          )}

          {error && (
            <p className="flex items-start gap-1.5 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-2xl px-3 py-2">
              <WarningCircleIcon weight="light" className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              {error}
            </p>
          )}
        </div>

        {/* Run button */}
        <div className="p-4 border-t border-white/[0.06] space-y-2">
          {noCreditsBlocked && (
            <p className="flex items-center justify-center gap-1.5 text-xs text-center text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-2xl px-2 py-1.5">
              <WarningCircleIcon weight="light" className="w-3.5 h-3.5 shrink-0" />
              No credits remaining — contact your admin to add credits
            </p>
          )}
          {scanPoints?.length > 0 && !generating && !noCreditsBlocked && !keyLoading && (
            <p className="text-xs text-center text-slate-400">
              {scanPoints.length.toLocaleString()} points from previous scan — re-draw to run again
            </p>
          )}
          {largeArea && (
            <p className="text-xs text-center text-amber-400">
              Area too large to scan — narrow your search to enable Run
            </p>
          )}
          <button
            onClick={handleGenerate}
            disabled={!polygon || generating || noCreditsBlocked || keyLoading || largeArea}
            className={`${btnPrimary} w-full`}
          >
            {keyLoading ? (
              <><CircleNotchIcon weight="light" className="w-4 h-4 animate-spin" /> Loading…</>
            ) : generating ? (
              <><CircleNotchIcon weight="light" className="w-4 h-4 animate-spin" /> Generating points…</>
            ) : (
              <>
                <PlayIcon weight="fill" className="w-4 h-4" />
                {scanPoints?.length > 0 ? 'Re-run Scan' : 'Run'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

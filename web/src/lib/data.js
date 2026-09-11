import { useEffect, useState } from 'react'
import { HOURS } from '../store.js'
import { buildTripModel } from './trip.js'
import { HEAT_DOMAIN, prefetchImages } from './heat.js'
import { anchorsFor } from './color.js'
import { APPROACH_LABEL } from './venues.js'

const BASE = `${import.meta.env.BASE_URL}data/`

export const shadeUrl = hour => `${BASE}shade_${hour}.png`

export const expoUrl = hour => `${BASE}expo_${hour}.png`

async function getJson (name, required) {
  try {
    const res = await fetch(`${BASE}${name}`, { cache: 'force-cache' })
    if (!res.ok) throw new Error(`${res.status}`)
    return { name, value: await res.json(), required }
  } catch (err) {
    return { name, value: null, required, error: String(err.message || err) }
  }
}

function toSegments (geojson) {
  if (!geojson || !Array.isArray(geojson.features)) return []
  const segments = geojson.features
    .filter(f => f && f.geometry && f.geometry.type === 'LineString' && f.properties)
    .map((f, i) => ({
      ...f.properties,
      order: i,
      coords: f.geometry.coordinates
    }))
    .filter(s => s.id && s.degmin)
  const counts = new Map()
  for (const s of segments) {
    const key = s.approach || 'unknown'
    counts.set(key, (counts.get(key) || 0) + 1)
    s.seq = counts.get(key)
    s.approach_label = APPROACH_LABEL[key] || key
  }
  for (const s of segments) s.of = counts.get(s.approach || 'unknown')
  return segments
}

function toBuildings (geojson) {
  if (!geojson || !Array.isArray(geojson.features)) return []
  return geojson.features
    .filter(f => f && f.geometry && f.geometry.type === 'Polygon' && Array.isArray(f.geometry.coordinates[0]))
    .map(f => ({
      id: f.properties.id,
      name: f.properties.name,
      height: Number(f.properties.height) || 3.5,
      height_source: f.properties.height_source || 'default',
      kind: f.properties.kind || 'building',
      polygon: f.geometry.coordinates[0]
    }))
}

function maxima (segments) {
  const out = {}
  for (const h of HOURS) {
    out[h] = segments.reduce((m, s) => Math.max(m, s.degmin[h] ?? 0), 0) || 1
  }
  out.all = Math.max(...HOURS.map(h => out[h])) || 1
  return out
}

function totals (segments) {
  const out = {}
  for (const h of HOURS) {
    out[h] = segments.reduce((sum, s) => sum + (s.degmin[h] ?? 0), 0)
  }
  return out
}

function hourStats (segments) {
  const out = {}
  for (const h of HOURS) {
    let degmin = 0
    let lo = 0
    let hi = 0
    let peak = 0
    let shade = 0
    let over = 0
    let metres = 0
    for (const s of segments) {
      degmin += s.degmin[h] ?? 0
      lo += s.degmin_lo?.[h] ?? s.degmin[h] ?? 0
      hi += s.degmin_hi?.[h] ?? s.degmin[h] ?? 0
      peak = Math.max(peak, s.wbgt?.[h] ?? 0)
      shade += s.shade_frac?.[h] ?? 0
      metres += s.len_m || 0
      if ((s.degmin[h] ?? 0) > 0) over += s.len_m || 0
    }
    const n = segments.length || 1
    out[h] = {
      degmin,
      lo,
      hi,
      peak_wbgt: peak,
      shade_mean: shade / n,
      metres_over: over,
      metres,
      share_over: metres ? over / metres : 0,
      exposed: segments.filter(s => (s.degmin[h] ?? 0) > 0).length
    }
  }
  return out
}

function bounds (segments) {
  if (!segments.length) return null
  let w = 180
  let s = 90
  let e = -180
  let n = -90
  for (const seg of segments) {
    for (const c of seg.coords) {
      w = Math.min(w, c[0])
      e = Math.max(e, c[0])
      s = Math.min(s, c[1])
      n = Math.max(n, c[1])
    }
  }
  return [w, s, e, n]
}

function groupByApproach (segments) {
  const map = new Map()
  for (const seg of segments) {
    const key = seg.approach || 'unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(seg)
  }
  return [...map.entries()].map(([approach, segs]) => ({ approach, segs }))
}

const LOOP = 8000
const SLICE = 4
const PHASES = 7

export function buildTrips (segments) {
  const trips = []
  for (const { segs } of groupByApproach(segments)) {
    const lengths = segs.map(s => s.len_m || 20)
    const total = lengths.reduce((a, b) => a + b, 0) || 1
    const starts = []
    let run = 0
    for (const l of lengths) {
      starts.push(run / total)
      run += l
    }
    starts.push(1)
    for (let i = 0; i + SLICE <= segs.length; i += 1) {
      const slice = segs.slice(i, i + SLICE)
      const path = [slice[0].coords[0], ...slice.map(s => s.coords[s.coords.length - 1])]
      const times = [starts[i] * LOOP, ...slice.map((s, k) => starts[i + k + 1] * LOOP)]
      const degmin = {}
      const wbgt = {}
      for (const h of HOURS) {
        degmin[h] = slice.reduce((a, s) => a + (s.degmin[h] ?? 0), 0) / slice.length
        wbgt[h] = slice.reduce((a, s) => a + (s.wbgt?.[h] ?? 0), 0) / slice.length
      }
      for (let p = 0; p < PHASES; p++) {
        const offset = (p * LOOP) / PHASES
        trips.push({ path, timestamps: times.map(t => t + offset), degmin, wbgt })
        trips.push({ path, timestamps: times.map(t => t + offset - LOOP), degmin, wbgt })
      }
    }
  }
  return trips
}

export function approachSummary (segments) {
  return groupByApproach(segments).map(({ approach, segs }) => {
    const metres = segs.reduce((a, s) => a + (s.len_m || 0), 0)
    const perHour = {}
    const peak = {}
    for (const h of HOURS) {
      perHour[h] = segs.reduce((a, s) => a + (s.degmin[h] ?? 0), 0)
      peak[h] = segs.reduce((m, s) => Math.max(m, s.wbgt?.[h] ?? 0), 0)
    }
    return {
      approach,
      label: APPROACH_LABEL[approach] || approach,
      segments: segs.length,
      metres,
      fans: segs[0]?.fans ?? 0,
      degmin: perHour,
      peak_wbgt: peak
    }
  })
}

export function fanWeighted (approaches) {
  const fans = approaches.reduce((a, x) => a + (x.fans || 0), 0) || 1
  const out = { fans }
  for (const h of HOURS) {
    out[h] = approaches.reduce((a, x) => a + (x.degmin[h] ?? 0) * (x.fans || 0), 0) / fans
  }
  return out
}

export function worstApproach (approaches, hour) {
  let best = null
  for (const a of approaches) {
    if (!best || (a.degmin[hour] ?? 0) > (best.degmin[hour] ?? 0)) best = a
  }
  return best
}

function surfaceAnchors (raw, threshold, domain) {
  const stats = raw && raw.hour_stats ? Object.values(raw.hour_stats) : []
  const tops = stats.map(v => v.max_c).filter(Number.isFinite)
  if (!Number.isFinite(threshold)) {
    const [lo, hi] = domain
    return [lo, (lo + hi) / 2, hi]
  }
  if (!tops.length) return anchorsFor(threshold)
  const high = Math.max(threshold + 4, Math.ceil(Math.max(...tops) * 2) / 2)
  return [threshold - 4, threshold, high]
}

function heatMeta (raw, fallbackBounds, threshold, rasterPresent) {
  const available = Boolean(raw) || Boolean(rasterPresent)
  const domain = (raw && raw.domain_c) || HEAT_DOMAIN
  return {
    available,
    bounds: (raw && raw.bounds) || fallbackBounds || null,
    domain,
    domainStated: Boolean(raw && raw.domain_c),
    anchors: surfaceAnchors(raw, threshold, domain),
    provisional: raw ? Boolean(raw.provisional) : true,
    method: (raw && raw.method) || null,
    quantity: (raw && raw.quantity) || 'wet bulb globe temperature',
    grid: (raw && raw.grid) || null,
    stats: (raw && raw.hour_stats) || null,
    inputs: (raw && raw.inputs) || null
  }
}

async function surfacePresent () {
  try {
    const res = await fetch(expoUrl(HOURS[0]), { method: 'HEAD', cache: 'force-cache' })
    return res.ok
  } catch (err) {
    return false
  }
}

export function useData () {
  const [state, setState] = useState({ status: 'loading', errors: [], data: null })

  useEffect(() => {
    let live = true
    Promise.all([
      getJson('segments.geojson', true),
      getJson('solutions.json', true),
      getJson('cities.json', true),
      getJson('meta.json', true),
      getJson('buildings.geojson', false),
      getJson('expo_meta.json', false),
      getJson('cities_method.json', false),
      getJson('kickoff_clock.json', false),
      getJson('equity.json', false),
      getJson('uhi_validation.json', false),
      getJson('fan_volumes.json', false),
      getJson('retrospective.json', false),
      getJson('trip_exposure.json', false),
      surfacePresent()
    ]).then(results => {
      if (!live) return
      const rasterPresent = results[results.length - 1] === true
      const byName = Object.fromEntries(results.slice(0, -1).map(r => [r.name, r]))
      const errors = results.filter(r => r.required && r.error).map(r => `${r.name} (${r.error})`)
      const segments = toSegments(byName['segments.geojson'].value)
      const solutions = byName['solutions.json'].value
      const cities = byName['cities.json'].value
      const meta = byName['meta.json'].value
      const buildings = toBuildings(byName['buildings.geojson'].value)
      const segBounds = bounds(segments)
      const rawThreshold = meta?.wbgt_threshold_c ?? meta?.threshold_wbgt_c
      const threshold = Number.isFinite(rawThreshold) ? rawThreshold : null
      const approaches = approachSummary(segments)
      const max = maxima(segments)
      prefetchImages([...HOURS.map(expoUrl), ...HOURS.map(shadeUrl)])
      setState({
        status: 'ready',
        errors,
        data: {
          segments,
          laSegments: [],
          laSource: null,
          laTrusted: false,
          buildings,
          solutions,
          cities: Array.isArray(cities) ? cities : [],
          citiesMethod: byName['cities_method.json'].value || null,
          clock: byName['kickoff_clock.json'].value || null,
          equity: byName['equity.json'].value || null,
          uhi: byName['uhi_validation.json'].value || null,
          fanVolumes: byName['fan_volumes.json'].value || null,
          retrospective: byName['retrospective.json'].value || null,
          trip: buildTripModel(byName['trip_exposure.json'].value),
          meta: meta || null,
          threshold,
          heat: heatMeta(byName['expo_meta.json'].value, meta?.raster_bounds || segBounds, threshold, rasterPresent),
          max,
          maxAll: max.all,
          totals: totals(segments),
          stats: hourStats(segments),
          approaches,
          walk: fanWeighted(approaches),
          bounds: segBounds,
          laBounds: null,
          trips: buildTrips(segments),
          laMax: { all: 1 }
        }
      })
    })
    return () => {
      live = false
    }
  }, [])

  return state
}

export function matchedBounds (a, b) {
  if (!a || !b) return [a, b]
  const span = box => {
    const lat = (box[1] + box[3]) / 2
    return {
      lat,
      lon: (box[2] - box[0]) * 111320 * Math.cos((lat * Math.PI) / 180),
      y: (box[3] - box[1]) * 110540,
      cx: (box[0] + box[2]) / 2,
      cy: (box[1] + box[3]) / 2
    }
  }
  const sa = span(a)
  const sb = span(b)
  const wide = Math.max(sa.lon, sb.lon)
  const tall = Math.max(sa.y, sb.y)
  const build = s => {
    const dLon = wide / 2 / (111320 * Math.cos((s.lat * Math.PI) / 180))
    const dLat = tall / 2 / 110540
    return [s.cx - dLon, s.cy - dLat, s.cx + dLon, s.cy + dLat]
  }
  return [build(sa), build(sb)]
}

export function pathFor (solutions, horizon) {
  if (!solutions) return null
  if (horizon === 'mature') return solutions.path_mature || solutions.path || null
  return solutions.path || null
}

export function hasMaturePath (solutions) {
  return Boolean(solutions && solutions.path_mature)
}

export function budgetLevels (solutions, horizon) {
  const path = pathFor(solutions, horizon)
  if (!path) return []
  return Object.keys(path)
    .map(Number)
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
}

export function solutionAt (solutions, budget, horizon) {
  const path = pathFor(solutions, horizon)
  if (!path) return null
  const key = String(budget)
  if (path[key]) return path[key]
  const keys = budgetLevels(solutions, horizon)
  let best = null
  for (const k of keys) {
    if (k <= budget) best = k
  }
  return best === null ? null : path[String(best)]
}

export const fansClearOfExtreme = solution =>
  solution ? solution.fans_clear_of_extreme ?? solution.fans_below_threshold ?? 0 : 0

export function interventionPoints (set, segments) {
  if (!Array.isArray(set)) return []
  const index = new Map(segments.map(s => [s.id, s]))
  const points = []
  for (const key of set) {
    const [id, kind] = String(key).split('#')
    const seg = index.get(id)
    if (!seg) continue
    const mid = seg.coords[Math.floor(seg.coords.length / 2)] || seg.coords[0]
    points.push({ key, id, kind: kind || 'shade', position: mid, name: seg.name })
  }
  return points
}

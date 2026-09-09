import { useEffect, useState } from 'react'
import { HOURS } from '../store.js'

const BASE = `${import.meta.env.BASE_URL}data/`

export const shadeUrl = hour => `${BASE}shade_${hour}.png`

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
  return geojson.features
    .filter(f => f && f.geometry && f.geometry.type === 'LineString' && f.properties)
    .map((f, i) => ({
      ...f.properties,
      order: i,
      coords: f.geometry.coordinates
    }))
    .filter(s => s.id && s.degmin)
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
      for (const h of HOURS) {
        degmin[h] = slice.reduce((a, s) => a + (s.degmin[h] ?? 0), 0) / slice.length
      }
      for (let p = 0; p < PHASES; p++) {
        const offset = (p * LOOP) / PHASES
        trips.push({ path, timestamps: times.map(t => t + offset), degmin })
        trips.push({ path, timestamps: times.map(t => t + offset - LOOP), degmin })
      }
    }
  }
  return trips
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
      getJson('la_segments.geojson', false)
    ]).then(results => {
      if (!live) return
      const byName = Object.fromEntries(results.map(r => [r.name, r]))
      const errors = results.filter(r => r.required && r.error).map(r => `${r.name} (${r.error})`)
      const segments = toSegments(byName['segments.geojson'].value)
      const laSegments = toSegments(byName['la_segments.geojson'].value)
      const solutions = byName['solutions.json'].value
      const cities = byName['cities.json'].value
      const meta = byName['meta.json'].value
      setState({
        status: 'ready',
        errors,
        data: {
          segments,
          laSegments,
          solutions,
          cities: Array.isArray(cities) ? cities : [],
          meta: meta || null,
          max: maxima(segments),
          totals: totals(segments),
          bounds: bounds(segments),
          laBounds: bounds(laSegments),
          trips: buildTrips(segments),
          laMax: maxima(laSegments)
        }
      })
    })
    return () => {
      live = false
    }
  }, [])

  return state
}

export function solutionAt (solutions, budget) {
  if (!solutions || !solutions.path) return null
  const key = String(budget)
  if (solutions.path[key]) return solutions.path[key]
  const keys = Object.keys(solutions.path)
    .map(Number)
    .sort((a, b) => a - b)
  let best = null
  for (const k of keys) {
    if (k <= budget) best = k
  }
  return best === null ? null : solutions.path[String(best)]
}

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

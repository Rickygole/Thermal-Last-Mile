import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')
const OVERPASS = 'https://overpass-api.de/api/interpreter'

const round = (v, p) => {
  const f = 10 ** p
  return Math.round(v * f) / f
}

function readBounds () {
  const meta = JSON.parse(readFileSync(`${OUT}/meta.json`, 'utf8'))
  const b = meta.raster_bounds
  if (!Array.isArray(b) || b.length !== 4) throw new Error('meta.json has no raster_bounds, cannot pick a fetch extent')
  return b
}

function parseHeight (tags) {
  const h = tags.height || tags['building:height']
  if (h) {
    const v = parseFloat(String(h).replace(',', '.'))
    if (Number.isFinite(v) && v > 0) return { height: round(v, 1), source: 'tagged' }
  }
  const levels = tags['building:levels']
  if (levels) {
    const v = parseFloat(levels)
    if (Number.isFinite(v) && v > 0) return { height: round(v * 3.5, 1), source: 'levels' }
  }
  return { height: 3.5, source: 'default' }
}

function ringOf (el) {
  if (!Array.isArray(el.geometry)) return null
  const ring = el.geometry.filter(p => p && Number.isFinite(p.lon)).map(p => [round(p.lon, 6), round(p.lat, 6)])
  if (ring.length < 4) return null
  const first = ring[0]
  const last = ring[ring.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
  return ring
}

async function overpass (query) {
  const res = await fetch(OVERPASS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'thermal-last-mile-data/1.0' },
    body: `data=${encodeURIComponent(query)}`,
    signal: AbortSignal.timeout(120000)
  })
  if (!res.ok) throw new Error(`overpass http ${res.status}`)
  return res.json()
}

async function main () {
  const bounds = readBounds()
  const box = `${bounds[1]},${bounds[0]},${bounds[3]},${bounds[2]}`
  const data = await overpass(`[out:json][timeout:90];(way["building"](${box}););out geom tags;`)
  const features = []
  const counts = { tagged: 0, levels: 0, default: 0 }
  for (const el of data.elements || []) {
    const ring = ringOf(el)
    if (!ring) continue
    const tags = el.tags || {}
    const { height, source } = parseHeight(tags)
    counts[source] += 1
    features.push({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [ring] },
      properties: {
        id: `way/${el.id}`,
        name: tags.name || null,
        height,
        height_source: source,
        kind: tags.leisure === 'stadium' || tags.building === 'stadium' ? 'venue' : 'building'
      }
    })
  }
  if (!features.length) throw new Error('overpass returned no building ways for this extent, nothing written')
  const collection = {
    type: 'FeatureCollection',
    features,
    properties: {
      source: 'OpenStreetMap via Overpass API',
      licence: 'ODbL',
      height_rule: 'height tag where present, else building:levels times 3.5 m per storey, else 3.5 m single storey default',
      height_source_counts: counts,
      fetched_utc: new Date().toISOString()
    }
  }
  mkdirSync(OUT, { recursive: true })
  writeFileSync(`${OUT}/buildings.geojson`, JSON.stringify(collection))
  process.stdout.write(`wrote buildings.geojson, ${features.length} footprints, ${counts.tagged} tagged, ${counts.levels} from levels, ${counts.default} assumed\n`)
}

main().catch(err => {
  process.stderr.write(`${err.message || err}\n`)
  process.exit(1)
})

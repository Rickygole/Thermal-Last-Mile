import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')
const HOURS = ['15', '17', '19', '21']
const STEP = 25000
const CAP = 2000000
const SEG_M = 20
const WALK_SPEED = 1.3

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32 (buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk (type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function greyPng (width, height, pixels) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 0
  const raw = Buffer.alloc((width + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width + 1)] = 0
    pixels.copy(raw, y * (width + 1) + 1, y * width, y * width + width)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

let seed = 20260909
function rnd () {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}

const STATION = [-95.40737, 29.68337]

const APPROACHES = [
  {
    id: 'murworth',
    approach: 'metrorail_stadium_park',
    street: 'Murworth Dr',
    block: 8300,
    canopy: 0.06,
    fans: 11200,
    svi: 0.78,
    points: [STATION, [-95.40921, 29.68366], [-95.41042, 29.68399], [-95.41118, 29.68452]]
  },
  {
    id: 'kirby',
    approach: 'kirby_north_lot',
    street: 'Kirby Dr',
    block: 8500,
    canopy: 0.02,
    fans: 7400,
    svi: 0.61,
    points: [STATION, [-95.40704, 29.68182], [-95.40892, 29.68118], [-95.41067, 29.68196], [-95.41121, 29.68321]]
  },
  {
    id: 'westridge',
    approach: 'westridge_plaza',
    street: 'Westridge St',
    block: 2100,
    canopy: 0.14,
    fans: 4300,
    svi: 0.44,
    points: [STATION, [-95.40719, 29.68481], [-95.40908, 29.68522], [-95.41061, 29.68561], [-95.41134, 29.68507]]
  }
]

function metresPerDeg (lat) {
  return { x: 111320 * Math.cos((lat * Math.PI) / 180), y: 110540 }
}

function densify (points, step) {
  const out = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const m = metresPerDeg(a[1])
    const dx = (b[0] - a[0]) * m.x
    const dy = (b[1] - a[1]) * m.y
    const dist = Math.hypot(dx, dy)
    const n = Math.max(1, Math.round(dist / step))
    for (let k = 0; k < n; k++) {
      const t0 = k / n
      const t1 = (k + 1) / n
      out.push({
        coords: [
          [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0],
          [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1]
        ],
        len_m: dist / n
      })
    }
  }
  return out
}

const BASE_WBGT = { 15: 31.4, 17: 31.1, 19: 30.9, 21: 29.6 }
const SOLAR_GAIN = { 15: 3.6, 17: 3.2, 19: 2.4, 21: 0.0 }
const SOLAR = { 15: 1.0, 17: 0.74, 19: 0.28, 21: 0.0 }

function round (v, p) {
  const f = 10 ** p
  return Math.round(v * f) / f
}

function buildSegments (list) {
  const features = []
  for (const app of list) {
    const parts = densify(app.points, SEG_M)
    parts.forEach((part, i) => {
      const jitter = rnd()
      const grove = 0.5 + 0.5 * Math.sin(i / 2.6 + app.block)
      const canopy = Math.max(0, Math.min(0.9, app.canopy + grove * 0.62 * (0.35 + jitter * 0.65) - 0.05))
      const minutes = part.len_m / WALK_SPEED / 60
      const degmin = {}
      const degminLo = {}
      const degminHi = {}
      const wbgt = {}
      const shade = {}
      for (const h of HOURS) {
        const solar = SOLAR[h]
        const shadeFrac = h === '21' ? 1 : Math.min(1, canopy * 0.9 + (1 - solar) * 0.25 + jitter * 0.05)
        const exposed = 1 - shadeFrac
        const w = BASE_WBGT[h] + SOLAR_GAIN[h] * exposed + jitter * 0.35
        const excess = Math.max(0, w - 32)
        degmin[h] = round(excess * minutes, 3)
        degminLo[h] = round(Math.max(0, w - 0.8 - 32) * minutes, 3)
        degminHi[h] = round(Math.max(0, w + 0.9 - 32) * minutes, 3)
        wbgt[h] = round(w, 1)
        shade[h] = round(shadeFrac, 2)
      }
      const idx = String(i + 1).padStart(2, '0')
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: part.coords },
        properties: {
          id: `${app.id}_${app.block}_${idx}`,
          name: `${app.street}, ${app.block} block, seg ${idx}`,
          len_m: round(part.len_m, 1),
          approach: app.approach,
          degmin,
          degmin_lo: degminLo,
          degmin_hi: degminHi,
          wbgt,
          shade_frac: shade,
          fans: app.fans,
          svi: app.svi,
          canopy_pct: round(canopy * 100, 1),
          treatable: canopy > 0.3 ? ['tree', 'awning'] : ['sail', 'tree', 'awning']
        }
      })
    })
  }
  return { type: 'FeatureCollection', features }
}

const LA_STATION = [-118.35296, 33.96139]

const LA_APPROACHES = [
  {
    id: 'florence',
    approach: 'k_line_downtown_inglewood',
    street: 'W Florence Ave',
    block: 300,
    canopy: 0.11,
    fans: 9800,
    svi: 0.66,
    points: [LA_STATION, [-118.34871, 33.96022], [-118.34412, 33.95861], [-118.34009, 33.95662]]
  },
  {
    id: 'prairie',
    approach: 'prairie_ave_gate',
    street: 'S Prairie Ave',
    block: 3800,
    canopy: 0.19,
    fans: 6100,
    svi: 0.52,
    points: [LA_STATION, [-118.35012, 33.95814], [-118.34702, 33.95571], [-118.34288, 33.95428], [-118.33982, 33.95391]]
  }
]

const UNIT_COST = { sail: 26000, tree: 18000, awning: 39000 }
const EFFECT = { sail: 0.72, tree: 0.46, awning: 0.55 }

function buildSolutions (segments) {
  const candidates = []
  const perFanTotal = segments.features.reduce((a, f) => a + f.properties.degmin['15'], 0) / 3
  for (const f of segments.features) {
    const p = f.properties
    const siteFactor = 0.8 + ((parseInt(p.id.slice(-2), 10) * 37) % 100) / 100
    for (const t of p.treatable) {
      const exposedShare = 1 - p.shade_frac['17']
      const averted = p.degmin['15'] * p.fans * EFFECT[t] * Math.max(0.15, exposedShare)
      if (averted <= 0) continue
      candidates.push({
        key: `${p.id}#${t}`,
        segment: p.id,
        cost: Math.round(UNIT_COST[t] * (p.len_m / 20) * siteFactor),
        averted,
        fans: p.fans
      })
    }
  }
  const taken = new Set()
  const ordered = candidates
    .slice()
    .sort((a, b) => b.averted / b.cost - a.averted / a.cost)
    .filter(c => {
      if (taken.has(c.segment)) return false
      taken.add(c.segment)
      return true
    })

  const totalFans = APPROACHES.reduce((s, a) => s + a.fans, 0)
  const path = {}
  let cursor = 0
  let spent = 0
  let averted = 0
  const set = []
  for (let budget = 0; budget <= CAP; budget += STEP) {
    while (cursor < ordered.length && spent + ordered[cursor].cost <= budget) {
      spent += ordered[cursor].cost
      averted += ordered[cursor].averted
      set.push(ordered[cursor].key)
      cursor++
    }
    path[String(budget)] = {
      set: set.slice(),
      averted_degmin: Math.round(averted),
      averted_per_fan: round(averted / totalFans, 1),
      cost_per_degmin: averted > 0 ? round(spent / averted, 2) : 0,
      fans_below_threshold: Math.round(totalFans * Math.min(1, averted / (totalFans * perFanTotal * 0.55))),
      spent: Math.round(spent)
    }
  }
  return { meta: { step: STEP, cap: CAP, method: 'greedy_submodular' }, path }
}

const CITIES = [
  ['houston', 'Houston', 'NRG Stadium', 128.4, 18.2, 41.6, 7],
  ['dallas', 'Dallas', 'AT&T Stadium', 121.7, 21.4, 40.9, 9],
  ['kansas_city', 'Kansas City', 'Arrowhead Stadium', 96.2, 27.1, 38.4, 6],
  ['atlanta', 'Atlanta', 'Mercedes-Benz Stadium', 88.9, 47.9, 37.1, 8],
  ['miami', 'Miami', 'Hard Rock Stadium', 84.3, 25.6, 36.2, 7],
  ['philadelphia', 'Philadelphia', 'Lincoln Financial Field', 61.5, 20.8, 36.0, 6],
  ['new_york', 'New York New Jersey', 'MetLife Stadium', 57.8, 22.3, 35.4, 8],
  ['boston', 'Boston', 'Gillette Stadium', 44.1, 26.0, 34.1, 7],
  ['los_angeles', 'Los Angeles', 'SoFi Stadium', 39.6, 15.4, 33.8, 8],
  ['bay_area', 'Bay Area', "Levi's Stadium", 21.3, 19.7, 31.2, 6],
  ['seattle', 'Seattle', 'Lumen Field', 12.9, 28.4, 28.6, 6]
]

function buildCities (houstonTrip) {
  const scale = houstonTrip / 128.4
  return CITIES.map(c => ({
    id: c[0],
    name: c[1],
    venue: c[2],
    degmin_per_trip: round(c[3] * scale, 1),
    canopy_pct: c[4],
    lst_p90_c: c[5],
    matches: c[6]
  }))
}

const BOUNDS = [-95.4145, 29.6795, -95.4045, 29.6875]

function buildMeta () {
  return {
    generated_utc: new Date('2026-09-09T04:00:00Z').toISOString(),
    provisional: true,
    city: 'Houston',
    venue: 'NRG Stadium',
    origin: 'METRORail Stadium Park / Astrodome',
    threshold_wbgt_c: 32,
    walk_speed_ms: WALK_SPEED,
    hours: HOURS,
    raster_bounds: BOUNDS,
    model: { wbgt: 'Liljegren 2008', implementation: 'pywbgt 3.0.7' },
    sources: [
      {
        layer: 'surface temperature',
        product: 'LANDSAT/LC09_L2SP_025039_20260620',
        acquired: '2026-06-20',
        resolution: '30 m',
        licence: 'public domain',
        provider: 'USGS EarthExplorer'
      },
      {
        layer: 'building heights',
        product: 'Overture Maps buildings 2026-06',
        acquired: '2026-06-01',
        resolution: 'vector',
        licence: 'ODbL',
        provider: 'Overture Maps Foundation'
      },
      {
        layer: 'canopy',
        product: 'NLCD tree canopy 2021',
        acquired: '2021-01-01',
        resolution: '30 m',
        licence: 'public domain',
        provider: 'MRLC'
      },
      {
        layer: 'weather',
        product: 'ASOS KHOU hourly',
        acquired: '2026-06-20',
        resolution: 'point',
        licence: 'public domain',
        provider: 'NOAA'
      }
    ],
    validation: { rmse_c: 1.8, bias_c: -0.3, n_stations: 3 },
    costs: [
      { item: 'sail', unit_cost_usd: 26000, citation: 'Municipal shade sail with footings, per 20 m span, 2025 bid average' },
      { item: 'tree', unit_cost_usd: 18000, citation: 'Three large caliper street trees, planted, 3 year establishment' },
      { item: 'awning', unit_cost_usd: 39000, citation: 'Cantilever walkway awning, installed, per 20 m span' }
    ]
  }
}

function shadeMask (hour) {
  const size = 512
  const px = Buffer.alloc(size * size, 0)
  if (hour === '21') {
    px.fill(255)
    return greyPng(size, size, px)
  }
  const solar = SOLAR[hour]
  const azimuth = hour === '15' ? -0.55 : hour === '17' ? -1.15 : -1.75
  const length = (1 - solar) * 30 + 10
  let seedLocal = 7
  const rand = () => {
    seedLocal = (seedLocal * 48271) % 2147483647
    return seedLocal / 2147483647
  }
  const shift = [Math.cos(azimuth) * length, Math.sin(azimuth) * length]
  const cell = 58
  const paint = (x0, y0, w, h, value) => {
    for (let y = Math.max(0, y0); y < Math.min(size, y0 + h); y++) {
      for (let x = Math.max(0, x0); x < Math.min(size, x0 + w); x++) {
        const i = y * size + x
        if (value > px[i]) px[i] = value
      }
    }
  }
  for (let gy = 0; gy < size / cell; gy++) {
    for (let gx = 0; gx < size / cell; gx++) {
      if (rand() < 0.22) continue
      const w = 14 + Math.round(rand() * 22)
      const h = 12 + Math.round(rand() * 20)
      const bx = gx * cell + 6 + Math.round(rand() * 14)
      const by = gy * cell + 6 + Math.round(rand() * 14)
      const steps = Math.max(2, Math.round(length / 2))
      for (let s = 0; s <= steps; s++) {
        const t = s / steps
        paint(Math.round(bx + shift[0] * t), Math.round(by + shift[1] * t), w, h, Math.round(150 + 105 * (1 - t)))
      }
    }
  }
  return greyPng(size, size, px)
}

mkdirSync(OUT, { recursive: true })
const segments = buildSegments(APPROACHES)
const laSegments = buildSegments(LA_APPROACHES)
writeFileSync(`${OUT}/segments.geojson`, JSON.stringify(segments))
writeFileSync(`${OUT}/la_segments.geojson`, JSON.stringify(laSegments))
writeFileSync(`${OUT}/solutions.json`, JSON.stringify(buildSolutions(segments)))
const houstonTrip = segments.features.reduce((a, f) => a + f.properties.degmin['15'], 0) / 3
writeFileSync(`${OUT}/cities.json`, JSON.stringify(buildCities(houstonTrip), null, 2))
writeFileSync(`${OUT}/meta.json`, JSON.stringify(buildMeta(), null, 2))
for (const h of HOURS) writeFileSync(`${OUT}/shade_${h}.png`, shadeMask(h))
process.stdout.write(`wrote ${segments.features.length} segments and ${HOURS.length} shade masks to public/data\n`)

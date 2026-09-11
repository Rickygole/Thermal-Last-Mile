const HOUR_LAYER = /^meteorology hour (\d{1,2})$/

export function hourDates (meta) {
  const out = {}
  for (const s of meta?.sources || []) {
    const m = HOUR_LAYER.exec(String(s?.layer || ''))
    if (!m) continue
    const date = s.date_used || s.acquired || null
    if (date) out[String(Number(m[1]))] = date
  }
  return out
}

export function hourDate (meta, hour) {
  return hourDates(meta)[String(Number(hour))] || null
}

export function kickoffHours (retrospective) {
  const out = {}
  for (const m of retrospective?.matches || []) {
    const h = String(Number(m?.kickoff_local_hour))
    if (h === 'NaN') continue
    out[h] = (out[h] || 0) + 1
  }
  return out
}

export function hourContext (meta, retrospective, hour) {
  const h = String(Number(hour))
  const counts = kickoffHours(retrospective)
  const played = counts[h] || 0
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const busiest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || null
  return {
    hour: h,
    date: hourDate(meta, h),
    played,
    total,
    busiest: busiest ? { hour: busiest[0], played: busiest[1] } : null
  }
}

function median (sorted) {
  if (!sorted.length) return null
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function quantile (sorted, q) {
  if (!sorted.length) return null
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return sorted[lo]
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function corridorSpread (segments, hour) {
  const h = String(Number(hour))
  const wbgt = []
  const intensity = []
  for (const s of segments || []) {
    const w = s.wbgt?.[h]
    if (Number.isFinite(w)) wbgt.push(w)
    const len = Number(s.len_m)
    const d = s.degmin?.[h]
    if (Number.isFinite(len) && len > 0 && Number.isFinite(d)) intensity.push(d / len)
  }
  if (!wbgt.length || !intensity.length) return null
  intensity.sort((a, b) => a - b)
  const mean = intensity.reduce((a, b) => a + b, 0) / intensity.length
  const variance = intensity.reduce((a, b) => a + (b - mean) ** 2, 0) / intensity.length
  const med = median(intensity)
  const q1 = quantile(intensity, 0.25)
  const q3 = quantile(intensity, 0.75)
  return {
    n: wbgt.length,
    wbgtMin: Math.min(...wbgt),
    wbgtMax: Math.max(...wbgt),
    wbgtSpan: Math.max(...wbgt) - Math.min(...wbgt),
    cvPct: mean > 0 ? (Math.sqrt(variance) / mean) * 100 : null,
    iqrPct: med > 0 ? ((q3 - q1) / med) * 100 : null,
    ratio: intensity[0] > 0 ? intensity[intensity.length - 1] / intensity[0] : null
  }
}

export function shadeFinding (retrospective) {
  const matches = (retrospective?.matches || []).filter(m => Number.isFinite(m?.shaded_fraction_route))
  if (!matches.length) return null
  const counts = kickoffHours(retrospective)
  const busiest = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || null
  const hour = busiest ? Number(busiest[0]) : null
  const atHour = hour === null ? [] : matches.filter(m => Number(m.kickoff_local_hour) === hour)
  const zeroAtHour = atHour.filter(m => m.shaded_fraction_route === 0)
  const nonZero = matches.filter(m => m.shaded_fraction_route > 0)
  return {
    hour,
    measured: matches.length,
    atHour: atHour.length,
    zeroAtHour: zeroAtHour.length,
    allZeroAtHour: atHour.length > 0 && zeroAtHour.length === atHour.length,
    best: nonZero.reduce((a, m) => (m.shaded_fraction_route > (a?.shaded_fraction_route ?? -1) ? m : a), null)
  }
}

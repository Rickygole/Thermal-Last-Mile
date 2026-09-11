export const n0 = v => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : '--')

export const n1 = v => (Number.isFinite(v) ? v.toFixed(1) : '--')

export const n2 = v => (Number.isFinite(v) ? v.toFixed(2) : '--')

export const pct = v => (Number.isFinite(v) ? `${Math.round(v)}%` : '--')

export const pct1 = v => (Number.isFinite(v) ? `${v.toFixed(1)}%` : '--')

export function usdExact (v) {
  return Number.isFinite(v) ? `$${Math.round(v).toLocaleString('en-US')}` : '--'
}

export function perDegmin (v) {
  if (!Number.isFinite(v) || v <= 0) return null
  return v >= 1 ? `$${v.toFixed(2)}` : `${(v * 100).toFixed(1)} cents`
}

export function usd (v) {
  if (!Number.isFinite(v)) return '--'
  if (v >= 1000000) return `$${(v / 1000000).toFixed(2)}M`
  if (v >= 1000) return `$${Math.round(v / 1000)}k`
  return `$${Math.round(v)}`
}

export const hourLabel = h => `${h}:00 kickoff`

export const tempC = v => (Number.isFinite(v) ? `${v} C` : 'not stated in meta.json')

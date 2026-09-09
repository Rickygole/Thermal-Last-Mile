export const EXPOSURE = {
  low: [151, 196, 89],
  moderate: [239, 159, 39],
  severe: [226, 75, 74]
}

export const ACCENT = [45, 162, 187]

export const HEAT_ANCHORS = [27, 32, 37]

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

export function exposureColor (t) {
  const c = Math.max(0, Math.min(1, t))
  if (c < 0.5) return mix(EXPOSURE.low, EXPOSURE.moderate, c / 0.5)
  return mix(EXPOSURE.moderate, EXPOSURE.severe, (c - 0.5) / 0.5)
}

export function heatT (wbgt) {
  const [a, b, c] = HEAT_ANCHORS
  const t = wbgt < b ? (0.5 * (wbgt - a)) / (b - a) : 0.5 + (0.5 * (wbgt - b)) / (c - b)
  return Math.max(0, Math.min(1, t))
}

export const heatColor = wbgt => exposureColor(heatT(wbgt))

export const lighten = (c, t) => c.map(v => Math.round(v + (255 - v) * t))

export const rgbCss = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`

export const exposureCss = t => rgbCss(exposureColor(t))

export const heatCss = wbgt => rgbCss(heatColor(wbgt))

export function exposureBand (t) {
  if (t < 0.34) return 'low'
  if (t < 0.67) return 'moderate'
  return 'severe'
}

export const BAND_LABEL = { low: 'Low', moderate: 'Moderate', severe: 'Severe' }

export const glsl = c => `vec3(${(c[0] / 255).toFixed(4)}, ${(c[1] / 255).toFixed(4)}, ${(c[2] / 255).toFixed(4)})`

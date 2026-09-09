import { tokens } from './theme.js'

export const ramp = () => tokens().exposure
export const accentRgb = () => tokens().accent

export const HEAT_ANCHORS = [27, 32, 37]

export const anchorsFor = threshold => [threshold - 5, threshold, threshold + 5]

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

export function exposureColor (t) {
  const c = Math.max(0, Math.min(1, t))
  const stops = ramp()
  if (c < 0.5) return mix(stops.low, stops.moderate, c / 0.5)
  return mix(stops.moderate, stops.severe, (c - 0.5) / 0.5)
}

export function heatT (wbgt, anchors = HEAT_ANCHORS) {
  const [a, b, c] = anchors
  const t = wbgt < b ? (0.5 * (wbgt - a)) / (b - a) : 0.5 + (0.5 * (wbgt - b)) / (c - b)
  return Math.max(0, Math.min(1, t))
}

export const heatColor = (wbgt, anchors) => exposureColor(heatT(wbgt, anchors))

export const lighten = (c, t) => c.map(v => Math.round(v + (255 - v) * t))

export const shift = (c, t) => c.map(v => Math.round(t >= 0 ? v + (255 - v) * t : v * (1 + t)))

export const rgbCss = c => `rgb(${c[0]}, ${c[1]}, ${c[2]})`

export const exposureCss = t => rgbCss(exposureColor(t))

export const heatCss = (wbgt, anchors) => rgbCss(heatColor(wbgt, anchors))

export function exposureBand (t) {
  if (t < 0.34) return 'low'
  if (t < 0.67) return 'moderate'
  return 'severe'
}

export const BAND_LABEL = { low: 'Low', moderate: 'Moderate', severe: 'Severe' }

export const glsl = c => `vec3(${(c[0] / 255).toFixed(4)}, ${(c[1] / 255).toFixed(4)}, ${(c[2] / 255).toFixed(4)})`

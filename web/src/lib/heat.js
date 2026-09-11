import { useRef } from 'react'
import { BitmapLayer } from '@deck.gl/layers'
import { HEAT_ANCHORS, glsl, ramp } from './color.js'
import { tokens } from './theme.js'
import { ms } from './motion.js'

export const RASTER_WINDOW = 4

export function useRasterWindow (hour, cap = RASTER_WINDOW) {
  const held = useRef([])
  if (held.current[0] !== hour) {
    held.current = [hour, ...held.current.filter(h => h !== hour)].slice(0, cap)
  }
  return held.current
}

export function prefetchImages (urls) {
  if (typeof window === 'undefined') return
  const queue = urls.slice()
  const step = () => {
    const url = queue.shift()
    if (!url) return
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    if (queue.length) schedule()
  }
  const schedule = () => {
    if (window.requestIdleCallback) window.requestIdleCallback(step, { timeout: 2000 })
    else window.setTimeout(step, 120)
  }
  schedule()
}

export const HEAT_DOMAIN = [24, 44]

export class HeatSurfaceLayer extends BitmapLayer {
  getShaders () {
    const base = super.getShaders()
    const [lo, hi] = this.props.domain || HEAT_DOMAIN
    const [a0, a1, a2] = this.props.anchors || HEAT_ANCHORS
    const stops = ramp()
    const field = tokens().field
    const span = (hi - lo).toFixed(4)
    return {
      ...base,
      inject: {
        ...(base.inject || {}),
        'fs:DECKGL_FILTER_COLOR': `
  float wbgt = ${lo.toFixed(4)} + color.r * ${span};
  float t = wbgt < ${a1.toFixed(1)}
    ? 0.5 * (wbgt - ${a0.toFixed(1)}) / ${(a1 - a0).toFixed(1)}
    : 0.5 + 0.5 * (wbgt - ${a1.toFixed(1)}) / ${(a2 - a1).toFixed(1)};
  t = clamp(t, 0.0, 1.0);
  vec3 ramp = t < 0.5
    ? mix(${glsl(stops.low)}, ${glsl(stops.moderate)}, t * 2.0)
    : mix(${glsl(stops.moderate)}, ${glsl(stops.severe)}, (t - 0.5) * 2.0);
  float body = ${field.alphaFloor.toFixed(4)} + ${field.alphaGain.toFixed(4)} * pow(t, ${field.alphaGamma.toFixed(4)});
  float fade = ${Math.max(field.vignette, 0.32).toFixed(4)};
  vec2 uv = geometry.uv;
  float edge = smoothstep(0.0, fade, uv.x) * smoothstep(0.0, fade, 1.0 - uv.x)
    * smoothstep(0.0, fade, uv.y) * smoothstep(0.0, fade, 1.0 - uv.y);
  color = vec4(ramp, color.a * body * edge);
`
      }
    }
  }
}

HeatSurfaceLayer.layerName = 'HeatSurfaceLayer'
HeatSurfaceLayer.defaultProps = {
  ...BitmapLayer.defaultProps,
  domain: { type: 'array', value: HEAT_DOMAIN, compare: true },
  anchors: { type: 'array', value: HEAT_ANCHORS, compare: true }
}

export function heatLayers ({ hour, hours, heat, urlFor, bounds, domain, anchors }) {
  if (!bounds || heat <= 0) return []
  const theme = tokens().name
  const mounted = hours && hours.length ? hours : [hour]
  return mounted.map(
    h =>
      new HeatSurfaceLayer({
        id: `heat-${theme}-${h}`,
        image: urlFor(h),
        bounds,
        domain: domain || HEAT_DOMAIN,
        anchors: anchors || HEAT_ANCHORS,
        opacity: h === hour ? heat : 0,
        transitions: { opacity: ms(220) },
        pickable: false,
        textureParameters: { minFilter: 'linear', magFilter: 'linear' }
      })
  )
}

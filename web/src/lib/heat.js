import { BitmapLayer } from '@deck.gl/layers'
import { EXPOSURE, HEAT_ANCHORS, glsl } from './color.js'
import { HOURS } from '../store.js'

export const HEAT_DOMAIN = [24, 44]

export class HeatSurfaceLayer extends BitmapLayer {
  getShaders () {
    const base = super.getShaders()
    const [lo, hi] = this.props.domain || HEAT_DOMAIN
    const [a0, a1, a2] = HEAT_ANCHORS
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
    ? mix(${glsl(EXPOSURE.low)}, ${glsl(EXPOSURE.moderate)}, t * 2.0)
    : mix(${glsl(EXPOSURE.moderate)}, ${glsl(EXPOSURE.severe)}, (t - 0.5) * 2.0);
  color = vec4(ramp, color.a * (0.5 + 0.5 * t));
`
      }
    }
  }
}

HeatSurfaceLayer.layerName = 'HeatSurfaceLayer'
HeatSurfaceLayer.defaultProps = { ...BitmapLayer.defaultProps, domain: { type: 'array', value: HEAT_DOMAIN, compare: true } }

export function heatLayers ({ hour, heat, urlFor, bounds, domain }) {
  if (!bounds || heat <= 0) return []
  return HOURS.map(
    h =>
      new HeatSurfaceLayer({
        id: `heat-${h}`,
        image: urlFor(h),
        bounds,
        domain: domain || HEAT_DOMAIN,
        opacity: h === hour ? heat : 0,
        transitions: { opacity: 220 },
        pickable: false,
        textureParameters: { minFilter: 'linear', magFilter: 'linear' }
      })
  )
}

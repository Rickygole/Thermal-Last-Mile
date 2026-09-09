import { BitmapLayer, PathLayer, PolygonLayer } from '@deck.gl/layers'
import { TripsLayer } from '@deck.gl/geo-layers'
import { accentRgb, exposureColor, shift } from './color.js'
import { tokens } from './theme.js'
import { shadeUrl } from './data.js'
import { ms } from './motion.js'

export function shadeLayers (hour, bounds, opacity = 0.16, hours) {
  if (!bounds || opacity <= 0) return []
  const mounted = hours && hours.length ? hours : [hour]
  return mounted.map(
    h =>
      new BitmapLayer({
        id: `shade-${h}`,
        image: shadeUrl(h),
        bounds,
        opacity: h === hour ? opacity : 0,
        tintColor: tokens().map.shadeTint,
        transitions: { opacity: ms(200) },
        pickable: false
      })
  )
}

export function buildingLayer ({ buildings, pitch, onHover, idSuffix = '' }) {
  if (!buildings || !buildings.length) return null
  const extruded = pitch > 2
  const skin = tokens().map
  return new PolygonLayer({
    id: `buildings${idSuffix}`,
    data: buildings,
    extruded,
    filled: true,
    stroked: true,
    wireframe: false,
    getPolygon: d => d.polygon,
    getElevation: d => d.height,
    elevationScale: 1,
    getFillColor: d => (d.height_source === 'default' ? skin.buildingAssumed : skin.buildingMeasured),
    getLineColor: skin.buildingLine,
    lineWidthMinPixels: 0.5,
    material: { ambient: 0.55, diffuse: 0.55, shininess: 24, specularColor: skin.buildingSpecular },
    pickable: Boolean(onHover),
    onHover: onHover ? info => onHover(info.object ? { kind: 'building', object: info.object, x: info.x, y: info.y } : null) : undefined,
    updateTriggers: { getFillColor: [extruded, skin] }
  })
}

export function pathCasingLayer ({ segments, selected, idSuffix = '' }) {
  const skin = tokens().map
  return new PathLayer({
    id: `casing${idSuffix}`,
    data: segments,
    getPath: d => d.coords,
    getColor: skin.casing,
    getWidth: d => (d.id === selected ? 17 : 12),
    widthUnits: 'pixels',
    widthMinPixels: 6,
    capRounded: true,
    jointRounded: true,
    pickable: false,
    transitions: { getWidth: ms(150) },
    updateTriggers: { getWidth: [selected], getColor: [skin] }
  })
}

export function exposureLayer ({ segments, hour, max, selected, onSelect, onHover, idSuffix = '', dim = false }) {
  const skin = tokens().map
  return new PathLayer({
    id: `exposure${idSuffix}`,
    opacity: dim ? 0.65 : 1,
    data: segments,
    getPath: d => d.coords,
    getColor: d => exposureColor((d.degmin[hour] ?? 0) / max),
    getWidth: d => (d.id === selected ? 11 : 7),
    widthUnits: 'pixels',
    widthMinPixels: 3,
    capRounded: true,
    jointRounded: true,
    pickable: Boolean(onSelect || onHover),
    autoHighlight: Boolean(onSelect),
    highlightColor: skin.highlight,
    onClick: onSelect ? info => onSelect(info.object ? info.object.id : null) : undefined,
    onHover: onHover ? info => onHover(info.object ? { kind: 'segment', object: info.object, x: info.x, y: info.y } : null) : undefined,
    transitions: { getColor: ms(200), getWidth: ms(150) },
    updateTriggers: { getColor: [hour, max, skin], getWidth: [selected] }
  })
}

export function fundedLayer ({ segments, treated, idSuffix = '' }) {
  const data = segments.filter(s => treated.has(s.id))
  if (!data.length) return null
  const skin = tokens().map
  return new PathLayer({
    id: `funded${idSuffix}`,
    data,
    getPath: d => d.coords,
    getColor: [...accentRgb(), skin.fundedAlpha],
    getWidth: 17,
    widthUnits: 'pixels',
    widthMinPixels: 8,
    capRounded: true,
    jointRounded: true,
    pickable: false,
    transitions: { getColor: ms(200) },
    updateTriggers: { getColor: [data.length, skin] }
  })
}

export function fanFlowLayer ({ trips, hour, max, currentTime }) {
  const skin = tokens().map
  return new TripsLayer({
    id: 'fan-flow',
    data: trips,
    getPath: d => d.path,
    getTimestamps: d => d.timestamps,
    getColor: d => shift(exposureColor((d.degmin[hour] ?? 0) / max), skin.trailShift),
    opacity: 1,
    widthMinPixels: 4,
    jointRounded: true,
    capRounded: true,
    trailLength: 900,
    currentTime,
    updateTriggers: { getColor: [hour, max, skin] }
  })
}

import { BitmapLayer, PathLayer, PolygonLayer } from '@deck.gl/layers'
import { TripsLayer } from '@deck.gl/geo-layers'
import { ACCENT, exposureColor, lighten } from './color.js'
import { shadeUrl } from './data.js'
import { HOURS } from '../store.js'

export function shadeLayers (hour, bounds, opacity = 0.16) {
  if (!bounds || opacity <= 0) return []
  return HOURS.map(
    h =>
      new BitmapLayer({
        id: `shade-${h}`,
        image: shadeUrl(h),
        bounds,
        opacity: h === hour ? opacity : 0,
        tintColor: [255, 255, 255],
        transitions: { opacity: 200 },
        pickable: false
      })
  )
}

export function buildingLayer ({ buildings, pitch, onHover, idSuffix = '' }) {
  if (!buildings || !buildings.length) return null
  const extruded = pitch > 2
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
    getFillColor: d => (d.height_source === 'default' ? [37, 42, 50, 190] : [50, 57, 67, 235]),
    getLineColor: [66, 74, 86, 170],
    lineWidthMinPixels: 0.5,
    material: { ambient: 0.55, diffuse: 0.55, shininess: 24, specularColor: [32, 36, 42] },
    pickable: Boolean(onHover),
    onHover: onHover ? info => onHover(info.object ? { kind: 'building', object: info.object, x: info.x, y: info.y } : null) : undefined,
    updateTriggers: { getFillColor: [extruded] }
  })
}

export function pathCasingLayer ({ segments, selected, idSuffix = '' }) {
  return new PathLayer({
    id: `casing${idSuffix}`,
    data: segments,
    getPath: d => d.coords,
    getColor: [17, 19, 23, 205],
    getWidth: d => (d.id === selected ? 17 : 12),
    widthUnits: 'pixels',
    widthMinPixels: 6,
    capRounded: true,
    jointRounded: true,
    pickable: false,
    transitions: { getWidth: 150 },
    updateTriggers: { getWidth: [selected] }
  })
}

export function exposureLayer ({ segments, hour, max, selected, onSelect, onHover, idSuffix = '', dim = false }) {
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
    highlightColor: [231, 233, 236, 120],
    onClick: onSelect ? info => onSelect(info.object ? info.object.id : null) : undefined,
    onHover: onHover ? info => onHover(info.object ? { kind: 'segment', object: info.object, x: info.x, y: info.y } : null) : undefined,
    transitions: { getColor: 200, getWidth: 150 },
    updateTriggers: { getColor: [hour, max], getWidth: [selected] }
  })
}

export function fundedLayer ({ segments, treated, idSuffix = '' }) {
  const data = segments.filter(s => treated.has(s.id))
  if (!data.length) return null
  return new PathLayer({
    id: `funded${idSuffix}`,
    data,
    getPath: d => d.coords,
    getColor: [...ACCENT, 170],
    getWidth: 18,
    widthUnits: 'pixels',
    widthMinPixels: 8,
    capRounded: true,
    jointRounded: true,
    pickable: false,
    transitions: { getColor: 200 },
    updateTriggers: { getColor: [data.length] }
  })
}

export function fanFlowLayer ({ trips, hour, max, currentTime }) {
  return new TripsLayer({
    id: 'fan-flow',
    data: trips,
    getPath: d => d.path,
    getTimestamps: d => d.timestamps,
    getColor: d => lighten(exposureColor((d.degmin[hour] ?? 0) / max), 0.35),
    opacity: 1,
    widthMinPixels: 4,
    jointRounded: true,
    capRounded: true,
    trailLength: 900,
    currentTime,
    updateTriggers: { getColor: [hour, max] }
  })
}

import { BitmapLayer, IconLayer, PathLayer } from '@deck.gl/layers'
import { TripsLayer } from '@deck.gl/geo-layers'
import { ACCENT, exposureColor, lighten } from './color.js'
import { shadeUrl } from './data.js'
import { HOURS } from '../store.js'

let iconCache = null

function iconUrl () {
  if (iconCache) return iconCache
  const size = 64
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.beginPath()
  ctx.arc(size / 2, size / 2, 22, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(21, 23, 27, 0.9)'
  ctx.fill()
  ctx.lineWidth = 4
  ctx.strokeStyle = `rgb(${ACCENT.join(',')})`
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(size / 2, 20)
  ctx.lineTo(size - 20, size / 2)
  ctx.lineTo(size / 2, size - 20)
  ctx.lineTo(20, size / 2)
  ctx.closePath()
  ctx.fillStyle = `rgb(${ACCENT.join(',')})`
  ctx.fill()
  iconCache = canvas.toDataURL('image/png')
  return iconCache
}

export function shadeLayers (hour, bounds) {
  if (!bounds) return []
  return HOURS.map(
    h =>
      new BitmapLayer({
        id: `shade-${h}`,
        image: shadeUrl(h),
        bounds,
        opacity: h === hour ? 0.35 : 0,
        tintColor: [255, 255, 255],
        transitions: { opacity: 200 },
        pickable: false
      })
  )
}

export function exposureLayer ({ segments, hour, max, selected, onSelect, idSuffix = '', dim = false }) {
  return new PathLayer({
    id: `exposure${idSuffix}`,
    opacity: dim ? 0.5 : 1,
    data: segments,
    getPath: d => d.coords,
    getColor: d => exposureColor((d.degmin[hour] ?? 0) / max),
    getWidth: d => (d.id === selected ? 11 : 7),
    widthUnits: 'pixels',
    widthMinPixels: 3,
    capRounded: true,
    jointRounded: true,
    pickable: Boolean(onSelect),
    autoHighlight: Boolean(onSelect),
    highlightColor: [231, 233, 236, 120],
    onClick: onSelect ? info => onSelect(info.object ? info.object.id : null) : undefined,
    transitions: { getColor: 200, getWidth: 150 },
    updateTriggers: { getColor: [hour, max], getWidth: [selected] }
  })
}

export function interventionLayer ({ points, scale, onSelect }) {
  return new IconLayer({
    id: 'interventions',
    data: points,
    getIcon: () => ({ url: iconUrl(), width: 64, height: 64, mask: false }),
    getPosition: d => d.position,
    getSize: 18,
    sizeScale: scale,
    sizeUnits: 'pixels',
    pickable: Boolean(onSelect),
    onClick: onSelect ? info => onSelect(info.object ? info.object.id : null) : undefined,
    updateTriggers: { getPosition: points.length }
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
    rounded: true,
    trailLength: 900,
    currentTime,
    updateTriggers: { getColor: [hour, max] }
  })
}

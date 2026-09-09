import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { tokens } from '../lib/theme.js'
import { useThemeName } from '../store.js'

const fallbackStyle = () => ({
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': tokens().fallbackBackground } }]
})

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

const RES0 = 156543.03392

function zoomFor (bounds, width, height, pad) {
  const lat = (bounds[1] + bounds[3]) / 2
  const mx = (bounds[2] - bounds[0]) * 111320 * Math.cos((lat * Math.PI) / 180)
  const my = (bounds[3] - bounds[1]) * 110540
  const w = Math.max(80, width - pad * 2)
  const h = Math.max(80, height - pad * 2)
  const res = Math.max(mx / w, my / h)
  return Math.log2((RES0 * Math.cos((lat * Math.PI) / 180)) / res)
}

export default function DeckMap ({ view, bounds, layers, effects, interactive = true, label, pitch = 0, children }) {
  const holder = useRef(null)
  const mapRef = useRef(null)
  const overlayRef = useRef(null)
  const [ready, setReady] = useState(false)
  const theme = useThemeName()
  const firstTheme = useRef(theme)

  useEffect(() => {
    if (!holder.current) return undefined
    const map = new maplibregl.Map({
      container: holder.current,
      style: tokens().basemap,
      center: [view.longitude, view.latitude],
      zoom: view.zoom,
      pitch: view.pitch || 0,
      bearing: view.bearing || 0,
      interactive,
      attributionControl: { compact: true },
      dragRotate: false,
      touchPitch: false
    })
    map.on('error', e => {
      if (e && e.error && /style/i.test(String(e.error.message || ''))) {
        try {
          map.setStyle(fallbackStyle())
        } catch (ignored) {
          setReady(true)
        }
      }
    })
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left')
    const overlay = new MapboxOverlay({ layers: [] })
    map.addControl(overlay)
    mapRef.current = map
    overlayRef.current = overlay
    map.once('load', () => setReady(true))
    const timer = setTimeout(() => setReady(true), 3000)
    return () => {
      clearTimeout(timer)
      overlay.finalize()
      map.remove()
      mapRef.current = null
      overlayRef.current = null
    }
  }, [])

  useEffect(() => {
    if (overlayRef.current) overlayRef.current.setProps(effects ? { layers, effects } : { layers })
  }, [layers, effects])

  useEffect(() => {
    const map = mapRef.current
    if (!map || firstTheme.current === theme) return
    firstTheme.current = theme
    try {
      map.setStyle(tokens().basemap, { diff: false })
    } catch (ignored) {
      map.setStyle(fallbackStyle())
    }
  }, [theme])

  useEffect(() => {
    const map = mapRef.current
    const node = holder.current
    if (!map || !ready || !bounds || !node) return undefined
    const fit = () => {
      map.resize()
      const rect = node.getBoundingClientRect()
      const zoom = Math.min(17.5, zoomFor(bounds, rect.width, rect.height, 24))
      map.jumpTo({
        center: [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2],
        zoom
      })
    }
    fit()
    let frame = 0
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(fit)
    })
    observer.observe(node)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [ready, bounds])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.easeTo({ pitch, duration: reduced() ? 0 : 260, essential: true })
  }, [pitch])

  return (
    <div className="map-frame">
      <div className="map-canvas" ref={holder} role="region" aria-label={label} />
      {ready ? null : (
        <div className="map-loading" role="status">
          <span className="pulse" aria-hidden="true" />
          Loading basemap tiles and exposure surface
        </div>
      )}
      {children}
    </div>
  )
}

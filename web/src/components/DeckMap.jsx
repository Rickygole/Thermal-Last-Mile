import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'

const STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const FALLBACK_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#15171B' } }]
}

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export default function DeckMap ({ view, bounds, layers, interactive = true, label, pitch = 0, children }) {
  const holder = useRef(null)
  const mapRef = useRef(null)
  const overlayRef = useRef(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (!holder.current) return undefined
    const map = new maplibregl.Map({
      container: holder.current,
      style: STYLE,
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
          map.setStyle(FALLBACK_STYLE)
        } catch (ignored) {
          setReady(true)
        }
      }
    })
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
    if (overlayRef.current) overlayRef.current.setProps({ layers })
  }, [layers])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || !bounds) return
    map.fitBounds(
      [
        [bounds[0], bounds[1]],
        [bounds[2], bounds[3]]
      ],
      { padding: 64, duration: 0, maxZoom: 16.5 }
    )
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

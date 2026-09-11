import { useMemo, useRef } from 'react'
import DeckMap from './DeckMap.jsx'
import { heatLayers } from '../lib/heat.js'
import { exposureLayer, pathCasingLayer, shadeLayers } from '../lib/layers.js'
import { expoUrl } from '../lib/data.js'
import { VENUE_VIEWS } from '../lib/venues.js'
import { HOURS, useThemeName } from '../store.js'
import { HEAT_ANCHORS, heatCss } from '../lib/color.js'
import { n1 } from '../lib/format.js'

function neighbours (hour) {
  const h = Number(hour)
  return [h - 1, h + 1, h]
    .map(String)
    .filter(v => HOURS.includes(v))
}

export default function TripSurface ({ data, hour, label }) {
  const theme = useThemeName()
  const held = useRef([])
  const mounted = useMemo(() => neighbours(hour), [hour])
  held.current = mounted
  const bounds = data.heat.bounds || data.meta?.raster_bounds || data.bounds

  const layers = useMemo(() => {
    const surface = data.heat.available
      ? [
          ...shadeLayers(hour, bounds, 0.12, mounted),
          ...heatLayers({
            hour,
            hours: mounted,
            heat: 0.55,
            urlFor: expoUrl,
            bounds,
            domain: data.heat.domain,
            anchors: data.heat.anchors
          })
        ]
      : shadeLayers(hour, bounds, 0.35, mounted)
    return [
      ...surface,
      pathCasingLayer({ segments: data.segments, selected: null, idSuffix: '-trip' }),
      exposureLayer({ segments: data.segments, hour, max: data.maxAll, selected: null, idSuffix: '-trip', dim: true })
    ]
  }, [hour, mounted, bounds, data, theme])

  const anchors = data.heat?.anchors || HEAT_ANCHORS
  const stops = Array.from({ length: 13 }, (_, i) => {
    const c = anchors[0] + ((anchors[2] - anchors[0]) * i) / 12
    return `${heatCss(c, anchors)} ${Math.round((i / 12) * 100)}%`
  }).join(', ')

  return (
    <>
      <div className="trip-surface">
        <DeckMap view={VENUE_VIEWS.houston} bounds={data.bounds} layers={layers} label={label} interactive={false} />
      </div>
      <div className="trip-ramp">
        <span className="label">Surface, wet bulb globe temperature at {hour}:00</span>
        <div className="ramp" style={{ background: `linear-gradient(90deg, ${stops})` }} aria-hidden="true">
          <span className="tick" style={{ left: '50%' }} />
        </div>
        <div className="ramp-scale" aria-hidden="true">
          <span>{n1(anchors[0])} C and below</span>
          <span className="mid">{n1(anchors[1])} C threshold</span>
          <span>{n1(anchors[2])} C and above</span>
        </div>
      </div>
    </>
  )
}

import { useMemo } from 'react'
import DeckMap from '../components/DeckMap.jsx'
import Ridgeline from '../components/Ridgeline.jsx'
import { buildingLayer, exposureLayer, fanFlowLayer, pathCasingLayer, shadeLayers } from '../lib/layers.js'
import { heatLayers, useRasterWindow } from '../lib/heat.js'
import { expoUrl } from '../lib/data.js'
import { useLoopClock } from '../lib/useClock.js'
import { setScreen, useStore } from '../store.js'
import { VENUE_VIEWS } from '../lib/venues.js'
import { n0, n1, n2, pct, tempC } from '../lib/format.js'

export default function Walk ({ data }) {
  const hour = useStore(s => s.hour)
  const heat = useStore(s => s.heat)
  const pitch = useStore(s => s.pitch)
  const time = useLoopClock(8000, true)
  const mountedHours = useRasterWindow(hour)
  const bounds = data.heat.bounds || data.meta?.raster_bounds || data.bounds
  const stat = data.stats[hour]

  const layers = useMemo(() => {
    const surface = data.heat.available
      ? [
          ...shadeLayers(hour, bounds, 0.12, mountedHours),
          ...heatLayers({ hour, hours: mountedHours, heat, urlFor: expoUrl, bounds, domain: data.heat.domain, anchors: data.heat.anchors })
        ]
      : shadeLayers(hour, bounds, 0.35, mountedHours)
    const buildings = buildingLayer({ buildings: data.buildings, pitch, idSuffix: '-walk' })
    return [
      ...surface,
      ...(buildings ? [buildings] : []),
      pathCasingLayer({ segments: data.segments, selected: null, idSuffix: '-walk' }),
      exposureLayer({ segments: data.segments, hour, max: data.max.all, selected: null, idSuffix: '-walk', dim: true }),
      fanFlowLayer({ trips: data.trips, hour, max: data.max.all, currentTime: time })
    ]
  }, [hour, mountedHours, heat, pitch, bounds, data, time])

  return (
    <div className="walk">
      <div className="walk-map">
        <DeckMap
          view={VENUE_VIEWS.houston}
          bounds={data.bounds}
          layers={layers}
          pitch={pitch}
          label="Fan walk from rail platform to stadium gates over the modelled heat surface"
        />
        <div className="walk-overlay panel">
          <h2>
            One fan, one walk, {n2(data.walk[hour])} degree-minutes above WBGT {tempC(data.threshold)} at {hour}:00.
          </h2>
          <p>
            The average across {data.approaches.length} approaches, weighted by how many fans use each. The surface is modelled wet
            bulb globe temperature across the whole catchment, the lines are the walking segments coloured by what one fan
            accumulates on them.
          </p>
          <div className="stat-grid">
            <div className="stat">
              <div className="k">Peak segment WBGT</div>
              <div className="v">{n1(stat.peak_wbgt)} C</div>
            </div>
            <div className="stat">
              <div className="k">Route accumulating exposure</div>
              <div className="v">{pct(stat.share_over * 100)}</div>
            </div>
            <div className="stat">
              <div className="k">Walk length</div>
              <div className="v">{n0(stat.metres)} m</div>
            </div>
            <div className="stat">
              <div className="k">Mean shade</div>
              <div className="v">{pct(stat.shade_mean * 100)}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="walk-foot">
        <Ridgeline segments={data.segments} threshold={data.threshold} />
        <button type="button" className="continue" onClick={() => setScreen('clock')}>
          Now ask what time the match starts
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  )
}

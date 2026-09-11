import { useMemo } from 'react'
import DeckMap from '../components/DeckMap.jsx'
import Ridgeline from '../components/Ridgeline.jsx'
import { buildingLayer, exposureLayer, fanFlowLayer, pathCasingLayer, shadeLayers } from '../lib/layers.js'
import { heatLayers, useRasterWindow } from '../lib/heat.js'
import { expoUrl } from '../lib/data.js'
import { useLoopClock } from '../lib/useClock.js'
import { setScreen, useStore, useThemeName } from '../store.js'
import { VENUE_VIEWS } from '../lib/venues.js'
import { n0, n1, n2, pct, tempC } from '../lib/format.js'
import { hourContext, shadeFinding } from '../lib/context.js'
import { longDate } from '../lib/retro.js'

export default function Walk ({ data }) {
  const hour = useStore(s => s.hour)
  const heat = useStore(s => s.heat)
  const pitch = useStore(s => s.pitch)
  const theme = useThemeName()
  const time = useLoopClock(8000, true)
  const mountedHours = useRasterWindow(hour)
  const bounds = data.heat.bounds || data.meta?.raster_bounds || data.bounds
  const stat = data.stats[hour]
  const ctx = useMemo(() => hourContext(data.meta, data.retrospective, hour), [data.meta, data.retrospective, hour])
  const shade = useMemo(() => shadeFinding(data.retrospective), [data.retrospective])

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
  }, [hour, mountedHours, heat, pitch, bounds, data, time, theme])

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
          <p className="walk-when">
            {ctx.date ? `Modelled on ${longDate(ctx.date)}, the hottest of the ${n0(ctx.total)} match dates at this hour. ` : ''}
            {ctx.played > 0
              ? `${n0(ctx.played)} of the ${n0(ctx.total)} matches here kicked off at ${hour}:00.`
              : `No match here kicked off at ${hour}:00${
                  ctx.busiest ? `, ${n0(ctx.busiest.played)} of the ${n0(ctx.total)} kicked off at ${ctx.busiest.hour}:00` : ''
                }. A design condition, not a fixture.`}
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
          {shade?.allZeroAtHour && Number(hour) === shade.hour ? (
            <p className="label walk-shade">
              Zero shade is the measured answer. The raymarched shadow model returns exactly zero shaded route fraction at all{' '}
              {n0(shade.atHour)} measured {n0(shade.hour)}:00 kickoffs, so none of the figure above is explained by shade.
            </p>
          ) : null}
          <p>
            The average across {data.approaches.length} approaches, weighted by how many fans use each. The surface is modelled wet
            bulb globe temperature across the whole catchment, the lines are the walking segments coloured by what one fan
            accumulates on them.
          </p>
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

import { useMemo } from 'react'
import DeckMap from '../components/DeckMap.jsx'
import Ridgeline from '../components/Ridgeline.jsx'
import { exposureLayer, fanFlowLayer, shadeLayers } from '../lib/layers.js'
import { useLoopClock } from '../lib/useClock.js'
import { setScreen, useStore } from '../store.js'
import { VENUE_VIEWS } from '../lib/venues.js'
import { n1 } from '../lib/format.js'

export default function Walk ({ data }) {
  const hour = useStore(s => s.hour)
  const time = useLoopClock(8000, true)
  const bounds = data.meta?.raster_bounds || data.bounds

  const layers = useMemo(
    () => [
      ...shadeLayers(hour, bounds),
      exposureLayer({ segments: data.segments, hour, max: data.max.all, selected: null, idSuffix: '-walk', dim: true }),
      fanFlowLayer({ trips: data.trips, hour, max: data.max.all, currentTime: time })
    ],
    [hour, bounds, data, time]
  )

  return (
    <div className="walk">
      <div className="walk-map">
        <DeckMap view={VENUE_VIEWS.houston} bounds={data.bounds} layers={layers} label="Fan walk from rail platform to stadium gates" />
        <div className="walk-overlay panel">
          <h2>One fan, one walk, {n1(data.totals[hour])} degree-minutes above WBGT 32.</h2>
          <p>
            {data.meta?.origin || 'The rail platform'} to {data.meta?.venue || 'the stadium'} at {hour}:00 kickoff, colour is
            measured exposure, brightness is where shade already exists.
          </p>
        </div>
      </div>
      <div className="walk-foot">
        <Ridgeline segments={data.segments} max={data.max.all} totals={data.totals} />
        <button type="button" className="continue" onClick={() => setScreen('map')}>
          Rank every segment
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  )
}

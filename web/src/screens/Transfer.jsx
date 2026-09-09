import { useMemo } from 'react'
import DeckMap from '../components/DeckMap.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { exposureLayer, pathCasingLayer } from '../lib/layers.js'
import { heatLayers } from '../lib/heat.js'
import { expoUrl } from '../lib/data.js'
import { useStore } from '../store.js'
import { LA_CONTEXT, VENUE_VIEWS } from '../lib/venues.js'
import { n1 } from '../lib/format.js'

const CHAIN = ['Segment the walk', 'Bake shade masks', 'Solve WBGT per hour', 'Accumulate degree-minutes', 'Greedy shade allocation']

function Side ({ title, subtitle, view, bounds, layers, stats, chain, note, label }) {
  return (
    <div className="side">
      <div className="panel side-head">
        <div className="t">
          <h3>{title}</h3>
          <span className="label">{subtitle}</span>
        </div>
        <div className="stat-grid">
          {stats.map(s => (
            <div className="stat" key={s.k}>
              <div className="k">{s.k}</div>
              <div className="v">{s.v}</div>
            </div>
          ))}
        </div>
        <div className="method-chain">
          {chain.map(c => (
            <span key={c}>{c}</span>
          ))}
        </div>
      </div>
      <div className="map-hold">
        {layers ? (
          <DeckMap view={view} bounds={bounds} layers={layers} label={label} />
        ) : (
          <EmptyState title="Geometry pending" body={note} hint="npm run data" />
        )}
      </div>
    </div>
  )
}

export default function Transfer ({ data }) {
  const hour = useStore(s => s.hour)
  const houstonCity = data.cities.find(c => c.id === 'houston')
  const laCity = data.cities.find(c => c.id === 'los_angeles')

  const houstonLayers = useMemo(
    () => [
      ...(data.heat.available
        ? heatLayers({
            hour,
            heat: 0.55,
            urlFor: expoUrl,
            bounds: data.heat.bounds || data.meta?.raster_bounds,
            domain: data.heat.domain
          })
        : []),
      pathCasingLayer({ segments: data.segments, selected: null, idSuffix: '-hou' }),
      exposureLayer({ segments: data.segments, hour, max: data.max.all, selected: null, idSuffix: '-hou' })
    ],
    [hour, data]
  )

  const laLayers = useMemo(
    () =>
      data.laSegments.length
        ? [
            pathCasingLayer({ segments: data.laSegments, selected: null, idSuffix: '-la' }),
            exposureLayer({ segments: data.laSegments, hour, max: data.max.all, selected: null, idSuffix: '-la' })
          ]
        : null,
    [hour, data]
  )

  return (
    <div className="transfer">
      <Side
        title="Houston 2026"
        subtitle={`${hour}:00 kickoff`}
        view={VENUE_VIEWS.houston}
        bounds={data.bounds}
        layers={houstonLayers}
        label="Houston walk exposure"
        chain={CHAIN}
        stats={[
          { k: 'Origin', v: data.meta?.origin || 'Rail platform' },
          { k: 'Venue', v: data.meta?.venue || 'NRG Stadium' },
          { k: 'Degmin per trip', v: n1(houstonCity?.degmin_per_trip) },
          { k: 'Canopy', v: `${n1(houstonCity?.canopy_pct)}%` }
        ]}
      />
      <Side
        title="Los Angeles 2028"
        subtitle={LA_CONTEXT.event}
        view={VENUE_VIEWS.los_angeles}
        bounds={data.laBounds}
        layers={laLayers}
        label="Los Angeles walk exposure"
        chain={CHAIN}
        note="The same five steps run on Los Angeles venue geography. The segment extraction for this corridor has not been committed yet, so nothing is drawn here rather than guessed."
        stats={[
          { k: 'Origin', v: LA_CONTEXT.origin },
          { k: 'Venue', v: LA_CONTEXT.venue },
          { k: 'Degmin per trip', v: n1(laCity?.degmin_per_trip) },
          { k: 'Canopy', v: `${n1(laCity?.canopy_pct)}%` }
        ]}
      />
    </div>
  )
}

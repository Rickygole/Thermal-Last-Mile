import { useMemo } from 'react'
import DeckMap from '../components/DeckMap.jsx'
import EmptyState from '../components/EmptyState.jsx'
import { ProvenanceChip } from '../components/Chips.jsx'
import { exposureLayer, pathCasingLayer } from '../lib/layers.js'
import { heatLayers } from '../lib/heat.js'
import { expoUrl, matchedBounds } from '../lib/data.js'
import { useStore } from '../store.js'
import { LA_CONTEXT, VENUE_VIEWS } from '../lib/venues.js'
import { n0, n1, n2, tempC } from '../lib/format.js'

const CHAIN = ['Segment the walk', 'Bake shade masks', 'Solve WBGT per hour', 'Accumulate degree-minutes', 'Greedy shade allocation']

const SCALE_NOTE = 'Both panels are drawn at the same ground scale so the two corridors could be compared by eye once both exist.'

function Side ({ title, subtitle, view, bounds, layers, stats, chain, chainLabel, note, label, provenance, scaleNote }) {
  return (
    <div className="side">
      <div className="panel side-head">
        <div className="t">
          <h3>{title}</h3>
          <span className="label">{subtitle}</span>
        </div>
        {provenance ? (
          <>
            <ProvenanceChip state={provenance} className="wide" />
            <p className="label">{provenance.detail}</p>
          </>
        ) : null}
        <div className="stat-grid">
          {stats.map(s => (
            <div className="stat" key={s.k}>
              <div className="k">{s.k}</div>
              <div className="v">{s.v}</div>
              {s.note ? <div className={`tag ${s.tone || 'assumed'}`}>{s.note}</div> : null}
            </div>
          ))}
        </div>
        <div className="chain-block">
          <div className="label">{chainLabel}</div>
          <div className="method-chain">
            {chain.map(c => (
              <span key={c}>{c}</span>
            ))}
          </div>
        </div>
        {scaleNote ? <p className="label">{scaleNote}</p> : null}
      </div>
      <div className="map-hold">
        {layers ? (
          <DeckMap view={view} bounds={bounds} layers={layers} label={label} />
        ) : (
          <EmptyState title="Nothing measured, nothing drawn" body={note} hint="pipeline extraction pending" />
        )}
      </div>
    </div>
  )
}

export default function Transfer ({ data }) {
  const hour = useStore(s => s.hour)
  const [houBounds, laBounds] = useMemo(() => matchedBounds(data.bounds, data.laBounds), [data.bounds, data.laBounds])
  const laCity = data.cities.find(c => c.id === 'los_angeles')
  const stat = data.stats[hour]

  const houstonLayers = useMemo(
    () => [
      ...(data.heat.available
        ? heatLayers({
            hour,
            heat: 0.42,
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
            exposureLayer({ segments: data.laSegments, hour, max: data.laMax.all, selected: null, idSuffix: '-la' })
          ]
        : null,
    [hour, data]
  )

  const houstonProvenance = {
    tone: 'observed',
    label: 'MODELLED FROM OBSERVED INPUTS',
    detail: `Every value on this side comes from the Houston pipeline run listed in meta.json, at the ${hour}:00 kickoff.`
  }

  const laProvenance = {
    tone: 'illustrative',
    label: 'ILLUSTRATIVE ONLY, NOTHING MEASURED HERE',
    detail:
      'No Los Angeles walk has been segmented, shaded or solved. The two figures below come from the eleven city proxy ledger, which is a canopy and surface temperature estimate for a radius around the venue, not a modelled walk.'
  }

  return (
    <div className="transfer">
      <Side
        title="Houston 2026"
        subtitle={`${hour}:00 kickoff`}
        view={VENUE_VIEWS.houston}
        bounds={houBounds}
        layers={houstonLayers}
        label="Houston walk exposure"
        scaleNote={SCALE_NOTE}
        chain={CHAIN}
        chainLabel="Steps run for this corridor"
        provenance={houstonProvenance}
        stats={[
          { k: 'Segments modelled', v: n0(data.segments.length) },
          { k: 'Approaches', v: n0(data.approaches.length) },
          { k: `Fan trip at ${hour}:00`, v: `${n2(data.walk[hour] ?? 0)} degmin` },
          { k: 'Threshold', v: `WBGT ${tempC(data.threshold)}` }
        ]}
      />
      <Side
        title="Los Angeles 2028"
        subtitle={LA_CONTEXT.event}
        view={VENUE_VIEWS.los_angeles}
        bounds={laBounds}
        layers={laLayers}
        chain={CHAIN}
        chainLabel="Steps that would run, none of them run yet"
        provenance={data.laSegments.length ? null : laProvenance}
        note="No Los Angeles corridor has been extracted from the pipeline. Rather than draw a plausible looking route from invented coordinates, this panel stays empty until a real extraction exists."
        stats={[
          { k: 'Segments modelled', v: '0', note: 'None extracted', tone: 'assumed' },
          { k: 'Origin considered', v: LA_CONTEXT.origin, note: 'Planning context', tone: 'assumed' },
          { k: 'Ledger proxy per trip', v: `${n1(laCity?.degmin_per_trip)} degmin`, note: 'Proxy, not a modelled walk', tone: 'assumed' },
          { k: 'Ledger canopy', v: `${n1(laCity?.canopy_pct)}%`, note: 'Venue radius, not the route', tone: 'measured' }
        ]}
      />
      <p className="sr-only">
        Houston corridor peak segment WBGT at {hour}:00 is {n1(stat.peak_wbgt)} degrees celsius. No equivalent Los Angeles figure
        exists.
      </p>
    </div>
  )
}

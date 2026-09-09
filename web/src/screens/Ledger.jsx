import { useMemo } from 'react'
import EmptyState from '../components/EmptyState.jsx'
import CityScatter from '../components/CityScatter.jsx'
import CityMethods from '../components/CityMethods.jsx'
import { exposureCss } from '../lib/color.js'
import { n0, n1 } from '../lib/format.js'
import { setScreen } from '../store.js'

const FOCUS = 'houston'
const CLUSTER_PCT = 15

function Sparkbar ({ value, max, focus }) {
  const w = Math.max(2, Math.round((value / max) * 100))
  return (
    <svg viewBox="0 0 100 8" preserveAspectRatio="none" style={{ height: 8 }} aria-hidden="true">
      <rect x="0" y="2.5" width="100" height="3" rx="1.5" fill="#262B33" />
      <rect x="0" y="2" width={w} height="4" rx="2" fill={exposureCss(value / max)} opacity={focus ? 1 : 0.75} />
    </svg>
  )
}

function joinNames (names) {
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

function fieldStatus (method, id, field) {
  const entry = method?.cities?.[id]?.[field]
  if (!entry || typeof entry !== 'object') return null
  if (entry.is_proxy === true) return 'assumed'
  if (entry.is_proxy === false) return 'measured'
  return null
}

export default function Ledger ({ data }) {
  const method = data.citiesMethod
  const cities = useMemo(
    () => data.cities.slice().sort((a, b) => (b.degmin_per_trip ?? 0) - (a.degmin_per_trip ?? 0)),
    [data.cities]
  )

  const reading = useMemo(() => {
    if (!cities.length) return null
    const leader = cities[0]
    const top = leader.degmin_per_trip ?? 0
    if (!top) return { leader, near: [], spread: 0 }
    const near = cities.slice(1).filter(c => ((top - (c.degmin_per_trip ?? 0)) / top) * 100 <= CLUSTER_PCT)
    const last = near.length ? near[near.length - 1] : cities[1]
    const spread = last ? ((top - (last.degmin_per_trip ?? 0)) / top) * 100 : 0
    return { leader, near, spread }
  }, [cities])

  if (!cities.length) {
    return <EmptyState title="No city ledger" body="cities.json is missing or empty, so the comparison cannot be drawn." hint="npm run data" />
  }

  const max = Math.max(...cities.map(c => c.degmin_per_trip ?? 0)) || 1
  const focusIndex = cities.findIndex(c => c.id === FOCUS)
  const focusCity = focusIndex >= 0 ? cities[focusIndex] : null
  const bufferMiles = method?.cities ? Object.values(method.cities).map(c => c.buffer_miles).find(Number.isFinite) : null

  return (
    <div className="ledger">
      <div className="ledger-top">
        <div className="ledger-head">
          <h2>
            {n0(cities.length)} host cities, ranked by a deliberately lighter proxy than the Houston model.
          </h2>
          <p>
            {reading.leader.name} is top of this table at {n1(reading.leader.degmin_per_trip)} degree-minutes per trip.{' '}
            {reading.near.length
              ? `${joinNames(reading.near.map(c => c.name))} ${reading.near.length > 1 ? 'sit' : 'sits'} within ${CLUSTER_PCT} percent of it, a spread of ${n1(reading.spread)} percent across the leading ${n0(reading.near.length + 1)}. This method cannot separate that group, and nothing here should be read as it doing so.`
              : `The next city is ${n1(reading.spread)} percent below it, the widest gap in the table.`}
            {focusCity && focusIndex > 0
              ? ` Houston, the corridor modelled segment by segment on the other screens, ranks ${n0(focusIndex + 1)} of ${n0(cities.length)} here.`
              : ''}
          </p>
          <p>
            The scatter asks the obvious follow up and answers it with a flat line. Canopy percent across a whole city does not
            predict what a fan carries on the last mile. Latitude, humidity, kickoff time and the geometry of the specific walk
            do. That is the argument for modelling the walk itself rather than ranking cities by a canopy statistic.
          </p>
        </div>
        <CityScatter cities={cities} focus={FOCUS} />
      </div>

      <section className="panel method-note" aria-label="How this ledger differs from the Houston model">
        <h3>This is not the model behind the other three screens.</h3>
        <div className="mn-grid">
          <div>
            <div className="k">The Houston screens use</div>
            <p>
              Wet bulb globe temperature per hour from station observations, ray traced building shadow, and the geometry of each
              walking segment between platform and gate.
            </p>
          </div>
          <div>
            <div className="k">This ledger uses</div>
            <p>
              Tree canopy and Landsat land surface temperature inside a{bufferMiles ? ` ${n1(bufferMiles)} mile` : ''} radius buffer
              around each venue, combined with one flat nominal trip duration applied identically to every city.
            </p>
          </div>
          <div>
            <div className="k">So this table has</div>
            <p>
              No WBGT, no ray tracing, no route geometry and no per city walking distance. Surface temperature is not what a person
              feels. Degree-minutes per trip here is a scaled proxy anchored to the Houston pipeline result, not an independent
              measurement of any other city.
            </p>
          </div>
        </div>
      </section>

      <div className="multiples">
        {cities.map((c, i) => {
          const focus = c.id === FOCUS
          const matchesStatus = fieldStatus(method, c.id, 'matches')
          const canopyStatus = fieldStatus(method, c.id, 'canopy_pct')
          const lstStatus = fieldStatus(method, c.id, 'lst_p90_c')
          return (
            <article key={c.id} className={`panel city${focus ? ' is-focus' : ''}`}>
              <div className="top">
                <div>
                  <h3>
                    {i + 1}. {c.name}
                  </h3>
                  <div className="venue">{c.venue}</div>
                </div>
                {focus ? (
                  <span className="chip" title="The proxy formula is scaled so this city matches the full Houston pipeline result">
                    ANCHOR CITY
                  </span>
                ) : null}
              </div>
              <div className="n">
                {n1(c.degmin_per_trip)} <small>degmin per trip, proxy</small>
              </div>
              <Sparkbar value={c.degmin_per_trip ?? 0} max={max} focus={focus} />
              <div className="stat-grid">
                <div className="stat">
                  <div className="k">Canopy</div>
                  <div className="v">{n1(c.canopy_pct)}%</div>
                  {canopyStatus ? <div className={`tag ${canopyStatus}`}>{canopyStatus === 'measured' ? 'Measured' : 'Assumed'}</div> : null}
                </div>
                <div className="stat">
                  <div className="k">LST p90</div>
                  <div className="v">{n1(c.lst_p90_c)} C</div>
                  {lstStatus ? <div className={`tag ${lstStatus}`}>{lstStatus === 'measured' ? 'Measured' : 'Assumed'}</div> : null}
                </div>
                <div className="stat">
                  <div className="k">Matches</div>
                  <div className="v">{n0(c.matches)}</div>
                  {matchesStatus ? <div className={`tag ${matchesStatus}`}>{matchesStatus === 'measured' ? 'Measured' : 'Assumed'}</div> : null}
                </div>
                <div className="stat">
                  <div className="k">Proxy times matches</div>
                  <div className="v">{n0((c.degmin_per_trip ?? 0) * (c.matches ?? 0))}</div>
                </div>
              </div>
            </article>
          )
        })}
      </div>

      <CityMethods method={method} cities={cities} />

      <div style={{ marginTop: 24 }}>
        <button type="button" className="continue" onClick={() => setScreen('transfer')}>
          Move the method to Los Angeles 2028
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  )
}

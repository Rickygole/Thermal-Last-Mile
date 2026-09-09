import { useMemo } from 'react'
import EmptyState from '../components/EmptyState.jsx'
import { exposureCss } from '../lib/color.js'
import { n0, n1 } from '../lib/format.js'
import { setScreen } from '../store.js'

const FOCUS = 'houston'

function Sparkbar ({ value, max, focus }) {
  const w = Math.max(2, Math.round((value / max) * 100))
  return (
    <svg viewBox="0 0 100 8" preserveAspectRatio="none" style={{ height: 8 }} aria-hidden="true">
      <rect x="0" y="2.5" width="100" height="3" rx="1.5" fill="#262B33" />
      <rect x="0" y="2" width={w} height="4" rx="2" fill={exposureCss(value / max)} opacity={focus ? 1 : 0.75} />
    </svg>
  )
}

export default function Ledger ({ data }) {
  const cities = useMemo(
    () => data.cities.slice().sort((a, b) => (b.degmin_per_trip ?? 0) - (a.degmin_per_trip ?? 0)),
    [data.cities]
  )

  if (!cities.length) {
    return <EmptyState title="No city ledger" body="cities.json is missing or empty, so the comparison cannot be drawn." hint="npm run data" />
  }

  const max = Math.max(...cities.map(c => c.degmin_per_trip ?? 0)) || 1

  return (
    <div className="ledger">
      <div className="ledger-head">
        <h2>Every host city ranked by heat carried on one fan trip.</h2>
        <p>
          Same model, same threshold, same walking speed. Degree-minutes above WBGT 32 accumulated between transit and gate,
          for the hottest scheduled kickoff. Houston is first, and it is not close.
        </p>
      </div>
      <div className="multiples">
        {cities.map((c, i) => {
          const focus = c.id === FOCUS
          return (
            <article key={c.id} className={`panel city${focus ? ' is-focus' : ''}`}>
              <div className="top">
                <div>
                  <h3>
                    {i + 1}. {c.name}
                  </h3>
                  <div className="venue">{c.venue}</div>
                </div>
                {focus ? <span className="chip">THIS STUDY</span> : null}
              </div>
              <div className="n">
                {n1(c.degmin_per_trip)} <small>degmin per trip</small>
              </div>
              <Sparkbar value={c.degmin_per_trip ?? 0} max={max} focus={focus} />
              <div className="stat-grid">
                <div className="stat">
                  <div className="k">Canopy</div>
                  <div className="v">{n1(c.canopy_pct)}%</div>
                </div>
                <div className="stat">
                  <div className="k">LST p90</div>
                  <div className="v">{n1(c.lst_p90_c)} C</div>
                </div>
                <div className="stat">
                  <div className="k">Matches</div>
                  <div className="v">{n0(c.matches)}</div>
                </div>
                <div className="stat">
                  <div className="k">Trip load</div>
                  <div className="v">{n0((c.degmin_per_trip ?? 0) * (c.matches ?? 0))}</div>
                </div>
              </div>
            </article>
          )
        })}
      </div>
      <div style={{ marginTop: 24 }}>
        <button type="button" className="continue" onClick={() => setScreen('transfer')}>
          Move the method to Los Angeles 2028
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  )
}

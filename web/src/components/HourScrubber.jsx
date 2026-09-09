import { useRef } from 'react'
import { HOURS, setHour, useStore } from '../store.js'
import { arrowSelect } from '../lib/keys.js'
import { exposureCss } from '../lib/color.js'
import { n0, n1, n2, pct } from '../lib/format.js'

export default function HourScrubber ({ totals, stats, walk, threshold }) {
  const hour = useStore(s => s.hour)
  const refs = useRef([])
  const stat = stats ? stats[hour] : null
  const peak = Math.max(...HOURS.map(h => walk?.[h] ?? 0)) || 1

  return (
    <section className="panel pane" aria-label="Kickoff hour">
      <div className="pane-head">
        <h3>Kickoff hour</h3>
        <span className="label">local time, arrow keys move</span>
      </div>
      <div className="hours" role="group" aria-label="Select kickoff hour" onKeyDown={e => arrowSelect(e, HOURS, hour, setHour, refs)}>
        {HOURS.map((h, i) => (
          <button
            key={h}
            type="button"
            ref={el => {
              refs.current[i] = el
            }}
            aria-pressed={hour === h}
            onClick={() => setHour(h)}
          >
            <span className="hb">{h}:00</span>
            <span className="hbar" aria-hidden="true">
              <span
                style={{
                  width: `${Math.max(2, Math.round(((walk?.[h] ?? 0) / peak) * 100))}%`,
                  background: exposureCss((walk?.[h] ?? 0) / peak)
                }}
              />
            </span>
          </button>
        ))}
      </div>
      <div className="stat">
        <div className="k">Average fan trip at {hour}:00, weighted by approach volume</div>
        <div className="v big">
          {n2(walk?.[hour] ?? 0)} <span className="label">degree-minutes above WBGT {threshold} C</span>
        </div>
        <div className="label">
          {stat
            ? `All ${n0(stat.metres)} m of modelled segment sums to ${n2(totals?.[hour] ?? 0)} degmin, 90 percent interval ${n2(stat.lo)} to ${n2(stat.hi)}`
            : 'interval unavailable'}
        </div>
      </div>
      <div className="detail">
        <div className="row">
          <span>Peak segment WBGT</span>
          <span>{n1(stat?.peak_wbgt ?? 0)} C</span>
        </div>
        <div className="row">
          <span>Route accumulating exposure</span>
          <span>
            {n0(stat?.metres_over ?? 0)} m of {n0(stat?.metres ?? 0)} m, {pct((stat?.share_over ?? 0) * 100)}
          </span>
        </div>
        <div className="row">
          <span>Mean shade fraction</span>
          <span>{pct((stat?.shade_mean ?? 0) * 100)}</span>
        </div>
      </div>
    </section>
  )
}

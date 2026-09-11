import { useRef } from 'react'
import { HOURS, setHour, setScreen, useStore, useThemeRepaint } from '../store.js'
import { arrowSelect } from '../lib/keys.js'
import { exposureCss } from '../lib/color.js'
import { n0, n1, n2, pct, tempC } from '../lib/format.js'

export default function HourScrubber ({ totals, stats, walk, threshold, clock, shade }) {
  useThemeRepaint()
  const hour = useStore(s => s.hour)
  const refs = useRef([])
  const stat = stats ? stats[hour] : null
  const peak = Math.max(...HOURS.map(h => walk?.[h] ?? 0)) || 1
  const baselineHour = clock ? String(clock.summary?.baseline_hour ?? '15') : null
  const baselineValue = baselineHour ? clock.hours?.[baselineHour]?.fan_hours_above_threshold ?? 0 : 0
  const hourValue = clock ? clock.hours?.[hour]?.fan_hours_above_threshold ?? 0 : 0
  const freed = baselineValue - hourValue
  const treeCeiling = clock?.summary?.tree_only_ceiling_at_1500?.max_fan_hours_removable_at_15_00 ?? null

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
          {n2(walk?.[hour] ?? 0)} <span className="label">degree-minutes above WBGT {tempC(threshold)}</span>
        </div>
        <div className="label">
          {stat
            ? `All ${n0(stat.metres)} m of modelled segment sums to ${n2(totals?.[hour] ?? 0)} degmin, 90 percent interval ${n2(stat.lo)} to ${n2(stat.hi)}`
            : 'interval unavailable'}
        </div>
      </div>
      {clock ? (
        <div className="notice">
          {freed > 0
            ? `Moving kickoff from ${baselineHour}:00 to ${hour}:00 removes ${n0(freed)} fan degree-hours at no capital cost${
                Number.isFinite(treeCeiling) && freed > treeCeiling
                  ? `, more than the ${n0(treeCeiling)} that the largest modelled tree planting can buy.`
                  : '.'
              }`
            : freed < 0
              ? `This hour is ${n0(-freed)} fan degree-hours worse than the ${baselineHour}:00 baseline.`
              : `This is the ${baselineHour}:00 baseline hour.`}{' '}
          <button type="button" className="linky" onClick={() => setScreen('clock')}>
            Open The Clock
          </button>
        </div>
      ) : null}
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
      {shade?.allZeroAtHour && Number(hour) === shade.hour ? (
        <p className="label">Zero is the measured answer, not a missing input. See the note above the ranked list.</p>
      ) : null}
    </section>
  )
}

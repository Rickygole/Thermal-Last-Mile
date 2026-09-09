import { useRef } from 'react'
import { setHour, useStore, useThemeRepaint } from '../store.js'
import { arrowSelect } from '../lib/keys.js'
import { exposureCss } from '../lib/color.js'
import { n0, n1, pct1 } from '../lib/format.js'

function Change ({ removed, share }) {
  if (Math.abs(removed) < 0.5) return <span className="ck-flat">baseline</span>
  if (removed > 0) {
    return (
      <span className="ck-better">
        <span aria-hidden="true">&darr;</span> {n0(removed)} removed, {pct1(share * 100)}
      </span>
    )
  }
  return (
    <span className="ck-worse">
      <span aria-hidden="true">&uarr;</span> {n0(-removed)} added, {pct1(-share * 100)} worse
    </span>
  )
}

export default function ClockTable ({ rows, baseline, max, threshold, extreme }) {
  useThemeRepaint()
  const hour = useStore(s => s.hour)
  const refs = useRef([])
  const hours = rows.map(r => r.hour)

  return (
    <section className="panel pane clock-table" aria-label="Exposure at every modelled kickoff hour">
      <div className="pane-head">
        <h3>Every modelled kickoff hour</h3>
        <span className="label">fan degree-hours above WBGT {n1(threshold)} C, arrow keys move</span>
      </div>
      <div className="ck-head" aria-hidden="true">
        <span>Kickoff</span>
        <span>Exposure carried by all fans</span>
        <span className="ck-num">Fan degree-hours</span>
        <span>Against the {baseline.hour}:00 baseline</span>
        <span className="ck-num">Peak WBGT</span>
      </div>
      <div className="ck-rows" role="group" aria-label="Select kickoff hour" onKeyDown={e => arrowSelect(e, hours, hour, setHour, refs)}>
        {rows.map((r, i) => {
          const t = max > 0 ? r.value / max : 0
          const active = r.hour === hour
          return (
            <button
              key={r.hour}
              type="button"
              className="ck-row"
              ref={el => {
                refs.current[i] = el
              }}
              aria-pressed={active}
              tabIndex={active ? 0 : -1}
              onClick={() => setHour(r.hour)}
            >
              <span className="ck-hour">
                {r.hour}:00
                {r.hour === baseline.hour ? <span className="label"> baseline</span> : null}
                {r.best ? <span className="label"> best</span> : null}
                {r.worst ? <span className="label"> worst</span> : null}
              </span>
              <span className="ck-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(r.value > 0 ? 1.5 : 0, t * 100)}%`, background: exposureCss(t) }} />
              </span>
              <span className="ck-num">{n0(r.value)}</span>
              <span className="ck-change">
                <Change removed={r.removed} share={r.share} />
              </span>
              <span className="ck-num ck-wbgt">
                {n1(r.peak)} C
                {r.crossesExtreme ? <span className="ck-flag">over {n1(extreme)} C</span> : null}
              </span>
            </button>
          )
        })}
      </div>
      <p className="label">
        Click any hour to move the whole application to it. The bar is the exposure carried at that kickoff, the column beside it is
        the change against {baseline.hour}:00. Hours flagged over {n1(extreme)} C carry at least one approach whose peak segment
        crosses the extreme tier, where the walk stops being an inconvenience.
      </p>
    </section>
  )
}

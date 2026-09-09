import { useRef } from 'react'
import { arrowSelect } from '../lib/keys.js'
import { exposureCss } from '../lib/color.js'
import { useThemeRepaint } from '../store.js'
import { shortDate } from '../lib/retro.js'
import { n0, n1, n2 } from '../lib/format.js'

export default function MatchTable ({ model, selected, onSelect }) {
  useThemeRepaint()
  const refs = useRef([])
  const dates = model.matches.map(m => m.date)
  const max = model.max || 1

  return (
    <section className="panel pane match-table" aria-label="Every match played at this stadium, measured">
      <div className="pane-head">
        <h3>Seven matches, each measured on its own date</h3>
        <span className="label">fan degree-hours above WBGT {n1(model.threshold)} C, arrow keys move</span>
      </div>
      <div className="mt-head" aria-hidden="true">
        <span>Match</span>
        <span>Kickoff</span>
        <span className="mt-num">Air C</span>
        <span className="mt-num">Dew C</span>
        <span className="mt-num">Wind m/s</span>
        <span>Exposure carried by all fans</span>
        <span className="mt-num">Fan degree-hours</span>
      </div>
      <div className="mt-rows" role="group" aria-label="Select a match" onKeyDown={e => arrowSelect(e, dates, selected, onSelect, refs)}>
        {model.matches.map((m, i) => {
          const t = max > 0 ? m.fanHours / max : 0
          const active = m.date === selected
          return (
            <button
              key={m.date}
              type="button"
              className={`mt-row${m.evening ? ' is-control' : ''}`}
              ref={el => {
                refs.current[i] = el
              }}
              aria-pressed={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onSelect(m.date)}
            >
              <span className="mt-who">
                <span className="mt-date">{shortDate(m.date)}</span>
                <span className="label">
                  {m.stage}
                  {m.evening ? ', the control' : ''}
                  {m.date === model.worst?.date ? ', the worst' : ''}
                </span>
              </span>
              <span className="mt-kick">
                {n0(m.hour)}:00
                {m.evening ? <span className="label"> evening</span> : null}
              </span>
              <span className="mt-num">{n1(m.tair)}</span>
              <span className="mt-num">{n1(m.tdew)}</span>
              <span className="mt-num mt-wind">
                {n1(m.wind)}
                {m.calm ? <span className="mt-flag">calm at all {n0(m.stationCount)}</span> : null}
              </span>
              {m.fanHours > 0 ? (
                <span className="mt-bar" aria-hidden="true">
                  <span style={{ width: `${Math.max(1.5, t * 100)}%`, background: exposureCss(t) }} />
                </span>
              ) : (
                <span className="mt-under">
                  peak {n2(m.peak)} C, {n2(model.threshold - m.peak)} C under the counting threshold
                </span>
              )}
              <span className="mt-num mt-value">{n0(m.fanHours)}</span>
            </button>
          )
        })}
      </div>
      {model.spread ? (
        <p className="label">
          The six noon kickoffs range from {n0(model.spread.lo)} to {n0(model.spread.hi)} fan degree-hours, a factor of{' '}
          {n1(model.spread.lo > 0 ? model.spread.hi / model.spread.lo : 0)} at one fixed hour. Day to day weather moves the answer
          almost as much as the hour does, which a sweep of a single hottest date per hour cannot show. Click any match for its four
          approaches.
        </p>
      ) : null}
    </section>
  )
}

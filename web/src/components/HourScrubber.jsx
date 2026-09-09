import { HOURS, setHour, useStore } from '../store.js'
import { n1 } from '../lib/format.js'

export default function HourScrubber ({ totals }) {
  const hour = useStore(s => s.hour)
  return (
    <section className="panel pane" aria-label="Kickoff hour">
      <div className="pane-head">
        <h3>Kickoff hour</h3>
        <span className="label">local time</span>
      </div>
      <div className="hours" role="group" aria-label="Select kickoff hour">
        {HOURS.map(h => (
          <button key={h} type="button" aria-pressed={hour === h} onClick={() => setHour(h)}>
            {h}:00
          </button>
        ))}
      </div>
      <div className="stat">
        <div className="k">Walk exposure per fan at {hour}:00</div>
        <div className="v big">
          {n1(totals?.[hour] ?? 0)} <span className="label">degree-minutes over WBGT 32</span>
        </div>
      </div>
    </section>
  )
}

import { useMemo } from 'react'
import { longDate } from '../lib/retro.js'
import { n0, n1 } from '../lib/format.js'

export default function ZeroMatch ({ trip, threshold }) {
  const match = useMemo(
    () => (trip?.playable || []).find(m => m.instant === 0 && Number.isFinite(m.total)) || null,
    [trip]
  )
  if (!match) return null

  return (
    <section className="panel pane zero-match" aria-label="The match that measured zero at the kickoff instant">
      <div className="pane-head">
        <h3>The control match is the argument</h3>
        <span className="label">
          {longDate(match.date)}, {n0(match.hour)}:00 kickoff
        </span>
      </div>
      <div className="zm-pair">
        <div className="zm-side">
          <div className="k">at the kickoff instant</div>
          <div className="zm-v">{n0(match.instant)}</div>
        </div>
        <span className="zm-arrow" aria-hidden="true">&rarr;</span>
        <div className="zm-side is-lead">
          <div className="k">across the whole trip</div>
          <div className="zm-v">{n0(match.total)}</div>
        </div>
      </div>
      <p className="zm-read">
        The one evening kickoff measured exactly zero fan degree-hours above WBGT {n1(threshold)} C at the moment the whistle
        went. Count the walk in and the walk back out and the same fans, on the same evening, on that date's own observed weather,
        carried {n0(match.total)}. Nothing about the method changed between those two numbers. Only the clock was allowed to run
        for the length of the trip fans actually make, which is why every headline on this screen is measured that way.
      </p>
    </section>
  )
}

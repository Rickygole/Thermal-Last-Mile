import { n0, n1, n2, pct1 } from '../lib/format.js'
import { shortDate } from '../lib/retro.js'

export default function EveningControl ({ model, rmse, thresholdNote, trip, instantSix }) {
  const control = model.control
  const controlTrip = control ? (trip?.playable || []).find(m => m.date === control.date) || null : null
  const cf = model.counterfactual
  const margin = control && Number.isFinite(model.threshold) ? model.threshold - control.peak : null
  const totals = cf?.totals || null

  return (
    <section className="panel evening" aria-label="What the zero at the evening kickoff does and does not mean">
      <div className="pane-head">
        <h3>The evening match measured zero at the kickoff instant. Zero is a near miss, not a null, and not the trip.</h3>
        <span className="label">kickoff instant basis throughout this panel</span>
      </div>
      <div className="ev-grid">
        <div className="ev-col">
          {control ? (
            <div className="detail">
              <div className="row">
                <span>Match measured at zero, kickoff instant</span>
                <span>
                  {shortDate(control.date)}, {n0(control.hour)}:00
                </span>
              </div>
              <div className="row">
                <span>Hottest segment on any approach</span>
                <span>{n2(control.peak)} C WBGT</span>
              </div>
              <div className="row">
                <span>Threshold the metric counts above</span>
                <span>{n1(model.threshold)} C WBGT</span>
              </div>
              <div className="row">
                <span>Margin under the threshold</span>
                <span>{n2(margin)} C</span>
              </div>
              <div className="row">
                <span>Interpolation error of the input field</span>
                <span>{n2(rmse)} C RMSE</span>
              </div>
              {controlTrip && Number.isFinite(controlTrip.total) ? (
                <div className="row">
                  <span>Same match, whole trip basis</span>
                  <span>{n0(controlTrip.total)} fan degree-hours</span>
                </div>
              ) : null}
            </div>
          ) : null}
          <p className="ev-body">
            The metric counts degree-minutes above the threshold and nothing below it, so a match that peaks{' '}
            {n2(margin)} C under the line reports zero. That margin sits inside this project's own{' '}
            {n2(rmse)} C interpolation error, published on the map screen. Read the zero as this walk did not cross the
            counting threshold on this evening, not as this walk was comfortable, and not as an evening kickoff being safe by
            construction.{controlTrip && Number.isFinite(controlTrip.total)
              ? ` The zero is a property of the instant, not of the evening: counting the walk in and the walk back out, the same match carried ${n0(controlTrip.total)} fan degree-hours.`
              : ''}
          </p>
        </div>
        <div className="ev-col">
          {cf ? (
            <>
              <table className="coverage ev-table">
                <caption className="label">
                  The six noon dates recomputed at {n0(cf.alternate_hour)}:00, each holding its own observed weather fixed. Both
                  value columns are kickoff instant figures, not trip totals
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col" className="mt-num">As played at noon, instant</th>
                    <th scope="col" className="mt-num">At {n0(cf.alternate_hour)}:00, instant</th>
                    <th scope="col">Still above the line</th>
                  </tr>
                </thead>
                <tbody>
                  {cf.rows.map(r => {
                    const evening = r.counterfactual_evening_fan_degree_hours_above_threshold ?? 0
                    return (
                      <tr key={r.date}>
                        <th scope="row">{shortDate(r.date)}</th>
                        <td className="mt-num">{n0(r.actual_fan_degree_hours_above_threshold)}</td>
                        <td className="mt-num">{n0(evening)}</td>
                        <td>{evening > 0 ? 'yes' : 'no'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="ev-body">
                {n0(cf.nonZero.length)} of the {n0(cf.rows.length)} noon dates still carry exposure when they are moved to{' '}
                {n0(cf.alternate_hour)}:00 on their own weather. The evening hour is not magic. It removed{' '}
                {n0(totals?.removed_fan_degree_hours)} of {n0(totals?.actual_total_fan_degree_hours_above_threshold)} fan
                degree-hours, {pct1((totals?.removed_fraction ?? 0) * 100)} of the measured kickoff instant total, and left{' '}
                {n0(totals?.counterfactual_total_fan_degree_hours_above_threshold)} behind that no schedule change reaches.
              </p>
            </>
          ) : (
            <p className="label">
              retrospective.json carries no counterfactual_evening_kickoff block, so the alternate hour comparison cannot be shown.
            </p>
          )}
        </div>
      </div>
      {trip?.counterfactual?.totals ? (
        <div className="notice ev-basis">
          <strong>
            That {pct1((totals?.removed_fraction ?? 0) * 100)} is a kickoff instant figure. On the whole trip it is{' '}
            {pct1((trip.counterfactual.totals.removed_fraction ?? 0) * 100)}.
          </strong>{' '}
          The table above stops the clock at kickoff across all {n0(cf?.rows.length)} dates. Recomputed across the full inbound and
          outbound trip, on the {n0(trip.counterfactual.totals.n_matches_included)} dates with a complete trip computation, moving
          to {n0(trip.alternateHour)}:00 removes {n0(trip.counterfactual.totals.removed_trip_fan_degree_hours)} of{' '}
          {n0(trip.counterfactual.totals.actual_total_trip_fan_degree_hours_above_threshold)} fan degree-hours,{' '}
          {pct1((trip.counterfactual.totals.removed_fraction ?? 0) * 100)}.
          {instantSix
            ? ` On those same ${n0(instantSix.dates)} dates the kickoff instant basis gives ${pct1((instantSix.fraction ?? 0) * 100)}, so the gap is the two legs and not the change of denominator.`
            : ''}{' '}
          An evening kickoff still has an arrival window, and at {n0(trip.alternateHour)}:00 that window runs through the hot late
          afternoon.
        </div>
      ) : null}
      {thresholdNote ? (
        <div className="notice ev-threshold">
          <strong>The share removed is conditional on where the threshold is drawn.</strong> {thresholdNote}
        </div>
      ) : null}
      {cf?.note ? <p className="label ev-note">{cf.note}</p> : null}
    </section>
  )
}

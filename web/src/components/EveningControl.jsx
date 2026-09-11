import { n0, n1, n2, pct1 } from '../lib/format.js'
import { shortDate } from '../lib/retro.js'

export default function EveningControl ({ model, rmse, thresholdNote }) {
  const control = model.control
  const cf = model.counterfactual
  const margin = control && Number.isFinite(model.threshold) ? model.threshold - control.peak : null
  const totals = cf?.totals || null

  return (
    <section className="panel evening" aria-label="What the zero at the evening kickoff does and does not mean">
      <div className="pane-head">
        <h3>The evening match measured zero. Zero is a near miss, not a null.</h3>
        <span className="label">read straight from the same run as the table above</span>
      </div>
      <div className="ev-grid">
        <div className="ev-col">
          {control ? (
            <div className="detail">
              <div className="row">
                <span>Match measured at zero</span>
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
            </div>
          ) : null}
          <p className="ev-body">
            The metric counts degree-minutes above the threshold and nothing below it, so a match that peaks{' '}
            {n2(margin)} C under the line reports zero. That margin sits inside this project's own{' '}
            {n2(rmse)} C interpolation error, published on the map screen. Read the zero as this walk did not cross the
            counting threshold on this evening, not as this walk was comfortable, and not as an evening kickoff being safe by
            construction.
          </p>
        </div>
        <div className="ev-col">
          {cf ? (
            <>
              <table className="coverage ev-table">
                <caption className="label">
                  The six noon dates recomputed at {n0(cf.alternate_hour)}:00, each holding its own observed weather fixed
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col" className="mt-num">As played, noon</th>
                    <th scope="col" className="mt-num">At {n0(cf.alternate_hour)}:00</th>
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
                degree-hours, {pct1((totals?.removed_fraction ?? 0) * 100)} of the measured total, and left{' '}
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
      {thresholdNote ? (
        <div className="notice ev-threshold">
          <strong>The share removed is conditional on where the threshold is drawn.</strong> {thresholdNote}
        </div>
      ) : null}
      {cf?.note ? <p className="label ev-note">{cf.note}</p> : null}
    </section>
  )
}

import { ProvenanceChip } from './Chips.jsx'
import { APPROACH_LABEL } from '../lib/venues.js'
import { n0, n2, pct1 } from '../lib/format.js'

const REJECTED = {
  tone: 'illustrative',
  label: 'DERIVED, TESTED, REJECTED',
  detail: 'The derivation ran, failed a plausibility gate declared before it ran, and was not used. The prior constants stayed.'
}

const INCONCLUSIVE = {
  tone: 'proxy',
  label: 'TESTED, TOO WEAK TO CONCLUDE',
  detail: 'The correlation was run and reported. It neither corroborates nor contradicts the pipeline field.'
}

export default function OrganiserData ({ uhi, fanVolumes }) {
  if (!uhi && !fanVolumes) return null
  const shares = fanVolumes?.derived_relative_share || {}
  const prior = fanVolumes?.old_invented_mode_share || {}
  const keys = Object.keys(shares).length ? Object.keys(shares) : Object.keys(prior)

  return (
    <section className="panel org" aria-label="Organiser datasets, what was tested and what was rejected">
      <div className="pane-head">
        <h3>Two organiser datasets were ingested, tested, and not used</h3>
        <span className="label">reported as results, not withheld as failures</span>
      </div>
      <div className="org-grid">
        {uhi ? (
          <article className="org-item">
            <div className="org-top">
              <h4>Urban heat index against the Landsat anomaly</h4>
              <ProvenanceChip state={INCONCLUSIVE} className="wide" quiet />
            </div>
            <div className="detail">
              <div className="row">
                <span>Houston market points read</span>
                <span>{n0(uhi.n_houston_market_points)}</span>
              </div>
              <div className="row">
                <span>Points inside the study grid</span>
                <span>{n0(uhi.n_points_inside_study_bbox)}</span>
              </div>
              <div className="row">
                <span>Rank correlation, Spearman</span>
                <span>{n2(uhi.spearman_r)}</span>
              </div>
              <div className="row">
                <span>Linear correlation, Pearson</span>
                <span>{n2(uhi.pearson_r)}</span>
              </div>
            </div>
            <p className="label">{uhi.verdict}</p>
          </article>
        ) : null}
        {fanVolumes ? (
          <article className="org-item">
            <div className="org-top">
              <h4>Points of interest and store visits as a fan volume weighting</h4>
              <ProvenanceChip state={REJECTED} className="wide" quiet />
            </div>
            <div className="detail">
              <div className="row">
                <span>Points of interest near the stadium</span>
                <span>{n0(fanVolumes.n_poi_in_nrg_area)} of {n0(fanVolumes.n_poi_houston_market)}</span>
              </div>
              <div className="row">
                <span>Store visit rows behind the category rates</span>
                <span>{n0(fanVolumes.n_store_visit_rows_used_for_category_rates)}</span>
              </div>
            </div>
            <table className="coverage org-table">
              <caption className="label">Derived share against the share the model still uses</caption>
              <thead>
                <tr>
                  <th scope="col">Approach</th>
                  <th scope="col">Derived from organiser data</th>
                  <th scope="col">In use</th>
                </tr>
              </thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k}>
                    <th scope="row">{APPROACH_LABEL[k] || k}</th>
                    <td>{pct1((shares[k] ?? 0) * 100)}</td>
                    <td>{pct1((prior[k] ?? 0) * 100)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="limits">
              {(fanVolumes.plausibility_notes || []).map(nte => (
                <li key={nte} className="label">
                  {nte}
                </li>
              ))}
            </ul>
          </article>
        ) : null}
      </div>
      <p className="label org-limit">{uhi?.organizer_data_limitation || fanVolumes?.organizer_data_limitation}</p>
    </section>
  )
}

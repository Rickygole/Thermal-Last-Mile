import { ProvenanceChip } from './Chips.jsx'
import { n0, n1, n2, pct1 } from '../lib/format.js'

function Corr ({ title, c, weak, caveat }) {
  if (!c) return null
  return (
    <div className="eq-corr">
      <div className="row">
        <span>{title}</span>
        <span>
          {n2(c.spearman_r)} <span className="label">rank, n {n0(c.n)}</span>
        </span>
      </div>
      <p className="label">
        Pearson {n2(c.pearson_r)}, p {n2(c.pearson_p)}. Spearman p {n2(c.spearman_p)}.{weak ? ` ${weak}` : ''}
      </p>
      {caveat ? <p className="label">{caveat}</p> : null}
    </div>
  )
}

export default function EquityPanel ({ equity }) {
  if (!equity) {
    return (
      <section className="panel pane" aria-label="Equity">
        <div className="pane-head">
          <h3>Equity</h3>
        </div>
        <p className="label">equity.json did not load, so no vulnerability or canopy analysis can be shown.</p>
      </section>
    )
  }
  const opt = equity.optimizer_equity || {}
  const tract = equity.correlation_exposure_vs_svi_tract_level
  const seg = equity.correlation_exposure_vs_svi_segment_level
  const canopy = equity.correlation_exposure_vs_canopy_pct
  const bins = equity.exposure_by_svi_quartile
  const worker = equity.unmodeled_repeat_worker_population
  const svi = equity.segment_level_summary?.svi
  const cover = equity.segment_level_summary?.canopy_pct
  const distinct = svi?.n_distinct_values ?? 0
  const binMax = bins?.bins?.length ? Math.max(...bins.bins.map(b => b.mean_exposure_degmin_per_trip)) : 1
  const state = {
    tone: 'proxy',
    label: 'LOW POWERED, READ THE CAVEATS',
    detail: `Social vulnerability is a tract level value joined onto ${n0(equity.n_segments)} short segments, and only ${n0(tract?.n ?? 0)} distinct tracts contain a segment midpoint.`
  }

  return (
    <section className="panel pane equity" aria-label="Exposure against social vulnerability and canopy">
      <div className="pane-head">
        <h3>Who carries it</h3>
        <span className="label">SVI 2022 and NLCD canopy</span>
      </div>
      <ProvenanceChip state={state} className="wide" quiet />
      <div className="stat">
        <div className="k">Is the allocation regressive</div>
        <div className="v">{opt.verdict ? 'No, mildly progressive' : 'not stated'}</div>
        <div className="label">
          Dollar weighted mean SVI of the funded set is {n2(opt.dollar_weighted_mean_svi_at_full_cap)} against{' '}
          {n2(opt.baseline_mean_svi_all_172_segments)} across every segment, a gap of{' '}
          {n2(opt.dollar_weighted_minus_baseline_mean_svi)}. The optimizer has no vulnerability term anywhere in its objective, so
          this is a byproduct of where cost effectiveness happens to land, not a policy.
        </div>
      </div>
      <div className="detail">
        <div className="row">
          <span>Segment SVI, {n0(distinct)} distinct values</span>
          <span>
            {n2(svi?.min)} to {n2(svi?.max)} <span className="label">mean {n2(svi?.mean)}</span>
          </span>
        </div>
        <div className="row">
          <span>Segment canopy</span>
          <span>
            {pct1(cover?.min)} to {pct1(cover?.max)} <span className="label">mean {pct1(cover?.mean)}</span>
          </span>
        </div>
      </div>
      <Corr
        title="Exposure against vulnerability, by tract"
        c={tract}
        weak={`n equals ${n0(tract?.n ?? 0)}. Three tracts contain a segment midpoint, so this correlation means very little and is not evidence of anything.`}
      />
      <Corr
        title="Exposure against vulnerability, by segment"
        c={seg}
        caveat={equity.correlation_exposure_vs_svi_segment_level_caveat}
      />
      <Corr title="Exposure against canopy, by segment" c={canopy} />
      {bins?.bins?.length ? (
        <div className="eq-bins">
          <div className="label">
            Mean exposure per trip by vulnerability bin, {n0(bins.n_bins_achieved)} bins reached of {n0(bins.requested_bins)}{' '}
            requested
          </div>
          {bins.bins.map(b => (
            <div key={b.bin} className="eq-bin">
              <div className="row">
                <span>
                  SVI {n2(b.svi_min)} to {n2(b.svi_max)} <span className="label">{n0(b.n_segments)} segments</span>
                </span>
                <span>{n2(b.mean_exposure_degmin_per_trip)} degmin</span>
              </div>
              <div className="bar-track">
                <span
                  className="bar-fill neutral"
                  style={{ width: `${Math.max(2, (b.mean_exposure_degmin_per_trip / binMax) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          {bins.note ? <p className="label">{bins.note}</p> : null}
        </div>
      ) : null}
      {worker ? (
        <details className="scenes">
          <summary>A population this pipeline does not model</summary>
          <p className="label">{worker.population_not_modeled}</p>
          <div className="detail">
            <div className="row">
              <span>Measured one way trip on the Lot C approach</span>
              <span>{n1(worker.one_way_trip_degmin_this_approach_measured)} degmin</span>
            </div>
            <div className="row">
              <span>Illustrative cumulative exposure across shifts</span>
              <span>{n1(worker.illustrative_cumulative_degmin_across_shifts)} degmin</span>
            </div>
            <div className="row">
              <span>Mean SVI along that approach</span>
              <span>{n2(worker.mean_svi_along_this_approach)}</span>
            </div>
          </div>
          <p className="label">{worker.assumption_stated}</p>
          <p className="label">{worker.caveat}</p>
        </details>
      ) : null}
      <details className="scenes">
        <summary>Known gaps in this analysis</summary>
        <ul className="limits">
          {(equity.known_gaps || []).map(g => (
            <li key={g} className="label">
              {g}
            </li>
          ))}
        </ul>
        <p className="label">{equity.svi_source?.fetch_meta?.source}. {equity.canopy_source?.fetch_meta?.source}.</p>
        <p className="label">{equity.canopy_source?.join_diagnostics?.resolution_vs_segment_length_note}</p>
      </details>
    </section>
  )
}

import { ProvenanceChip } from './Chips.jsx'
import EquityCurve from './EquityCurve.jsx'
import { equitySeries } from '../lib/equity.js'
import { n0, n1, n2, pct1, usd } from '../lib/format.js'

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
  const series = equitySeries(equity)
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
        <div className="k">Where the money lands, against vulnerability</div>
        <div className="v">
          {series && series.rows.length
            ? `${n2(series.min)} to ${n2(series.max)} across ${series.scopedBelow ? 'the levels below saturation' : 'the budget axis'}`
            : Number.isFinite(series?.point)
              ? n2(series.point)
              : 'not stated'}
        </div>
        <div className="label">
          {series && series.rows.length
            ? `${series.weighted ? 'Dollar weighted' : 'Set membership'} mean SVI of the funded set, read across ${
                series.scopedBelow
                  ? `the ${n0(series.below.length)} of ${n0(series.rows.length)} budget levels at or below saturation`
                  : `all ${n0(series.rows.length)} budget levels`
              } rather than at one. ${
                Number.isFinite(series.baseline)
                  ? `The corridor baseline is ${n2(series.baseline)}.`
                  : 'equity.json states no corridor baseline to compare against.'
              }`
            : 'equity.json carries no budget series for the funded set, so only the single reported figure is available and it should be read as one point on a curve this file does not publish.'}
        </div>
      </div>
      {series && series.rows.length ? <EquityCurve series={series} /> : null}
      {series && series.rows.length ? (
        <div className="notice">
          <strong>Read the curve, not the endpoint.</strong> The answer to whether this allocation is progressive depends entirely
          on where the budget axis stops.{' '}
          {series.first && series.last
            ? `At ${usd(series.first.budget)} the funded set sits at ${n2(series.first.value)}, at ${usd(
                series.last.budget
              )} it sits at ${n2(series.last.value)}.`
            : ''}
          {Number.isFinite(series.gapLo) && Number.isFinite(series.gapHi)
            ? ` Measured as a gap over the baseline that is ${n2(series.gapHi)} at its widest and ${n2(series.gapLo)} at its narrowest${
                Number.isFinite(series.gapFactor) ? `, a factor of ${n1(series.gapFactor)}` : ''
              }${series.crossesBaseline ? ', and it changes sign, so the direction of the finding is not stable either' : ''}.`
            : ''}
          {series.note ? ` ${series.note}` : ''}
        </div>
      ) : null}
      {series?.verdict ? (
        <details className="scenes">
          <summary>The verdict this file states</summary>
          <p className="label">{series.verdict}</p>
        </details>
      ) : null}
      <p className="label">
        The optimizer has no vulnerability term anywhere in its objective, so whatever this curve does is a byproduct of where cost
        effectiveness happens to land, not a policy.
      </p>
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

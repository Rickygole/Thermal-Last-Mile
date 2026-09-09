import { n0, n1, n2, tempC, usd } from '../lib/format.js'

const join = parts => parts.filter(Boolean).join(', ')

const UNSOURCED = /^no\b[^.]*\b(located|found|exists|available)\b|order of magnitude estimate/i

function isUnsourced (cost) {
  if (typeof cost.sourced === 'boolean') return !cost.sourced
  if (typeof cost.is_proxy === 'boolean') return cost.is_proxy
  if (typeof cost.citation_status === 'string') return /unsourced|estimate|none/i.test(cost.citation_status)
  if (typeof cost.citation !== 'string') return false
  return UNSOURCED.test(cost.citation.split('. ')[0])
}

export default function MethodsPanel ({ meta, solutionMethod, heat }) {
  if (!meta) {
    return (
      <section className="panel pane methods" aria-label="Methods and provenance">
        <div className="pane-head">
          <h3>Methods</h3>
        </div>
        <p className="label">meta.json did not load, so provenance cannot be shown and nothing on this screen should be quoted.</p>
      </section>
    )
  }
  const v = meta.validation || {}
  const rawThreshold = meta.wbgt_threshold_c ?? meta.threshold_wbgt_c
  const threshold = Number.isFinite(rawThreshold) ? rawThreshold : null
  const speed = Number.isFinite(meta.walk_speed_ms) ? `, walked at ${n1(meta.walk_speed_ms)} m/s` : ''
  const segs = Number.isFinite(meta.n_segments) ? `, ${n0(meta.n_segments)} segments` : ''
  const metric = `Degree-minutes above WBGT ${tempC(threshold)}${speed}${segs}.${speed ? '' : ' Walking speed is not stated in meta.json.'}`
  const costs = meta.costs || []
  const unsourced = costs.filter(isUnsourced).length
  return (
    <section className="panel pane methods" aria-label="Methods and provenance">
      <div className="pane-head">
        <h3>Methods and provenance</h3>
        <span className="label">{meta.generated_utc ? meta.generated_utc.slice(0, 10) : 'undated'}</span>
      </div>
      <dl>
        <div>
          <dt>Heat model</dt>
          <dd>{join([meta.model?.wbgt, meta.model?.implementation, meta.model?.pvlib_version ? `pvlib ${meta.model.pvlib_version}` : null])}</dd>
        </div>
        <div>
          <dt>Metric</dt>
          <dd>{metric}</dd>
        </div>
        <div>
          <dt>Validation</dt>
          <dd>
            {Number.isFinite(v.rmse_c)
              ? `RMSE ${n2(v.rmse_c)} C, bias ${n2(v.bias_c)} C, ${n0(v.n_stations)} stations, ${n0(v.n_samples)} samples${
                  v.quantity_validated ? `, on ${v.quantity_validated}` : ''
                }`
              : 'meta.json reports no validation figures for this run.'}
          </dd>
        </div>
        {v.method ? (
          <div>
            <dt>Validation caveat</dt>
            <dd className="fine">{v.method}</dd>
          </div>
        ) : null}
        <div>
          <dt>Allocation</dt>
          <dd>{solutionMethod ? `${solutionMethod}, solved offline, every budget level precomputed` : 'solutions.json names no method for the allocation.'}</dd>
        </div>
        {heat ? (
          <div>
            <dt>Heat surface</dt>
            <dd>
              {heat.available
                ? join([
                    heat.method,
                    heat.grid ? `${heat.grid[0]} by ${heat.grid[1]} grid` : null,
                    heat.domainStated ? `domain ${heat.domain[0]} to ${heat.domain[1]} C` : 'colour domain not stated in expo_meta.json'
                  ])
                : 'expo raster not present, the map falls back to the baked shade masks'}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="src">
        <div className="label">Data products</div>
        {(meta.sources || []).map((s, i) => (
          <div key={`${s.layer}-${i}`} className="src-item">
            <div className="p">{s.product}</div>
            <div className="m">{join([s.layer, s.resolution, s.acquired || s.date_used, s.provider, s.licence])}</div>
            {s.substitution_note ? (
              <div className="m">
                <span className="tag assumed">Substitution</span> {s.substitution_note}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <div className="src">
        <div className="label">
          Unit costs{unsourced ? `, ${n0(unsourced)} of ${n0(costs.length)} with no public unit cost located` : ''}
        </div>
        {costs.map(c => {
          const open = isUnsourced(c)
          return (
            <div key={c.item} className={`src-item${open ? ' is-unsourced' : ''}`}>
              <div className="p">
                {c.item}, {usd(c.unit_cost_usd)}
                {open ? <span className="tag assumed">Unsourced estimate</span> : null}
              </div>
              {open ? (
                <div className="m">
                  No public unit cost was located for this item, so the figure is a stated estimate rather than a citation. The
                  search that failed is written out below so it can be checked or beaten.
                </div>
              ) : null}
              <div className="m">{c.citation}</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

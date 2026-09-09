import { n0, n1, n2, usd } from '../lib/format.js'

const join = parts => parts.filter(Boolean).join(', ')

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
  const threshold = meta.wbgt_threshold_c ?? meta.threshold_wbgt_c ?? 32
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
          <dd>
            Degree-minutes above WBGT {n0(threshold)} C, walked at {n1(meta.walk_speed_ms ?? 1.3)} m/s, {n0(meta.n_segments ?? 0)} segments
          </dd>
        </div>
        <div>
          <dt>Validation</dt>
          <dd>
            RMSE {n2(v.rmse_c)} C, bias {n2(v.bias_c)} C, {n0(v.n_stations)} stations, {n0(v.n_samples ?? 0)} samples
            {v.quantity_validated ? `, on ${v.quantity_validated}` : ''}
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
          <dd>{solutionMethod || 'greedy_submodular'}, solved offline, every budget level precomputed</dd>
        </div>
        {heat ? (
          <div>
            <dt>Heat surface</dt>
            <dd>
              {heat.available
                ? join([
                    heat.method,
                    heat.grid ? `${heat.grid[0]} by ${heat.grid[1]} grid` : null,
                    `domain ${heat.domain[0]} to ${heat.domain[1]} C`
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
            {s.substitution_note ? <div className="m warn">Substitution: {s.substitution_note}</div> : null}
          </div>
        ))}
      </div>
      <div className="src">
        <div className="label">Unit costs</div>
        {(meta.costs || []).map(c => (
          <div key={c.item} className="src-item">
            <div className="p">
              {c.item}, {usd(c.unit_cost_usd)}
            </div>
            <div className="m">{c.citation}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

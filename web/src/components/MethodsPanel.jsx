import { n0, n1, usd } from '../lib/format.js'

export default function MethodsPanel ({ meta, solutionMethod }) {
  if (!meta) {
    return (
      <section className="panel pane methods" aria-label="Methods and provenance">
        <h3>Methods</h3>
        <p className="label">meta.json did not load, so provenance cannot be shown.</p>
      </section>
    )
  }
  const v = meta.validation || {}
  return (
    <section className="panel pane methods" aria-label="Methods and provenance">
      <div className="pane-head">
        <h3>Methods</h3>
        <span className="label">{meta.generated_utc ? meta.generated_utc.slice(0, 10) : 'undated'}</span>
      </div>
      <dl>
        <div>
          <dt>Heat model</dt>
          <dd>
            {meta.model?.wbgt || 'unspecified'}, {meta.model?.implementation || 'implementation unspecified'}
          </dd>
        </div>
        <div>
          <dt>Metric</dt>
          <dd>
            Degree-minutes above WBGT {n0(meta.threshold_wbgt_c ?? 32)}, walked at {n1(meta.walk_speed_ms ?? 1.3)} m/s
          </dd>
        </div>
        <div>
          <dt>Validation</dt>
          <dd>
            RMSE {n1(v.rmse_c)} C, bias {n1(v.bias_c)} C, {n0(v.n_stations)} stations
          </dd>
        </div>
        <div>
          <dt>Allocation</dt>
          <dd>{solutionMethod || 'greedy_submodular'}, precomputed offline</dd>
        </div>
      </dl>
      <div className="src">
        <dt className="label">Data products</dt>
        {(meta.sources || []).map(s => (
          <div key={`${s.layer}-${s.product}`} style={{ marginTop: 8 }}>
            <div className="p">{s.product}</div>
            <div className="m">
              {s.layer}, {s.resolution}, {s.acquired}, {s.provider}, {s.licence}
            </div>
          </div>
        ))}
      </div>
      <div className="src">
        <dt className="label">Unit costs</dt>
        {(meta.costs || []).map(c => (
          <div key={c.item} style={{ marginTop: 8 }}>
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

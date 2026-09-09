import { HOURS, setSelected } from '../store.js'
import { exposureBand, exposureCss, BAND_LABEL } from '../lib/color.js'
import { n0, n1, n2, pct } from '../lib/format.js'

export default function SegmentDetail ({ segment, hour, max, treated }) {
  if (!segment) {
    return (
      <section className="panel pane" aria-label="Segment detail">
        <h3>Segment detail</h3>
        <p className="label">Select a segment on the map or in the ranked list.</p>
      </section>
    )
  }
  const t = (segment.degmin[hour] ?? 0) / max
  const band = exposureBand(t)
  return (
    <section className="panel pane" aria-label="Segment detail">
      <div className="pane-head">
        <h3>{segment.name}</h3>
        <button type="button" className="ghost" onClick={() => setSelected(null)}>
          Clear
        </button>
      </div>
      <div className="legend">
        <span className="item">
          <span className="swatch" style={{ background: exposureCss(t) }} aria-hidden="true" />
          {BAND_LABEL[band]} at {hour}:00
        </span>
        {treated ? <span className="item">Treated in current budget</span> : null}
      </div>
      <div className="detail">
        <div className="row">
          <span>Degree-minutes</span>
          <span>
            {n2(segment.degmin[hour] ?? 0)} ({n2(segment.degmin_lo?.[hour] ?? 0)} to {n2(segment.degmin_hi?.[hour] ?? 0)})
          </span>
        </div>
        <div className="row">
          <span>WBGT</span>
          <span>{n1(segment.wbgt?.[hour] ?? 0)} C</span>
        </div>
        <div className="row">
          <span>Shade fraction</span>
          <span>{pct((segment.shade_frac?.[hour] ?? 0) * 100)}</span>
        </div>
        <div className="row">
          <span>Length</span>
          <span>{n0(segment.len_m)} m</span>
        </div>
        <div className="row">
          <span>Fans per match</span>
          <span>{n0(segment.fans)}</span>
        </div>
        <div className="row">
          <span>Canopy</span>
          <span>{pct(segment.canopy_pct)}</span>
        </div>
        <div className="row">
          <span>Social vulnerability</span>
          <span>{n2(segment.svi)}</span>
        </div>
        <div className="row">
          <span>Treatable with</span>
          <span>{(segment.treatable || []).join(', ') || 'none'}</span>
        </div>
      </div>
      <div className="legend" aria-label="Degree-minutes by hour">
        {HOURS.map(h => (
          <span className="item" key={h}>
            <span className="swatch" style={{ background: exposureCss((segment.degmin[h] ?? 0) / max) }} aria-hidden="true" />
            {h}:00 {n2(segment.degmin[h] ?? 0)}
          </span>
        ))}
      </div>
    </section>
  )
}

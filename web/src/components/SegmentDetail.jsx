import HourProfile, { buildSeries } from './HourProfile.jsx'
import { setSelected, useThemeRepaint } from '../store.js'
import { exposureBand, exposureCss, BAND_LABEL } from '../lib/color.js'
import { n0, n1, n2, pct, pct1, tempC } from '../lib/format.js'

export default function SegmentDetail ({ segment, hour, max, treated, corridor, corridorLabel, anchors, threshold, worst }) {
  useThemeRepaint()
  if (!segment) {
    return (
      <section className="panel pane" aria-label="Segment detail">
        <div className="pane-head">
          <h3>Whole corridor</h3>
          <span className="label">nothing selected</span>
        </div>
        <p className="label">
          Click any segment on the map or in the ranked list to swap this panel to that segment. Until then it reports every
          modelled segment summed, {corridorLabel}.
          {worst ? ` The worst approach at ${hour}:00 is the ${worst.label.toLowerCase()}, ${n2(worst.degmin[hour] ?? 0)} degmin for ${n0(worst.fans)} fans.` : ''}
        </p>
        <HourProfile
          series={buildSeries(corridor)}
          anchors={anchors}
          title="Corridor across the kickoff window"
          unit="degmin summed, peak WBGT"
        />
      </section>
    )
  }
  const v = segment.degmin[hour] ?? 0
  const t = v / max
  const band = exposureBand(t)
  const lo = segment.degmin_lo?.[hour] ?? v
  const hi = segment.degmin_hi?.[hour] ?? v
  return (
    <section className="panel pane" aria-label="Segment detail">
      <div className="pane-head">
        <h3>
          {segment.name}
          {segment.of > 1 ? <span className="label"> segment {segment.seq} of {segment.of}</span> : null}
        </h3>
        <button type="button" className="ghost" onClick={() => setSelected(null)}>
          Clear
        </button>
      </div>
      <div className="legend">
        <span className="item">
          <span className="swatch" style={{ background: exposureCss(t) }} aria-hidden="true" />
          {BAND_LABEL[band]} at {hour}:00
        </span>
        {treated ? (
          <span className="item">
            <span className="swatch accent" aria-hidden="true" />
            Funded in the current budget
          </span>
        ) : null}
      </div>
      <div className="detail">
        <div className="row">
          <span>Degree-minutes per fan, threshold {tempC(threshold)}</span>
          <span>
            {n2(v)} <span className="label">({n2(lo)} to {n2(hi)})</span>
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
          <span>Fans per match on this approach</span>
          <span>{n0(segment.fans)}</span>
        </div>
        <div className="row">
          <span>Fan degree-minutes at this hour</span>
          <span>{n0(v * (segment.fans || 0))}</span>
        </div>
        <div className="row">
          <span>Canopy</span>
          <span>{Number.isFinite(segment.canopy_pct) ? pct1(segment.canopy_pct) : 'not joined in this run'}</span>
        </div>
        <div className="row">
          <span>Social vulnerability</span>
          <span>
            {Number.isFinite(segment.svi) ? (
              <>
                {n2(segment.svi)} <span className="label">tract percentile</span>
              </>
            ) : (
              'not joined in this run'
            )}
          </span>
        </div>
        <div className="row">
          <span>Treatable with</span>
          <span>{(segment.treatable || []).join(', ') || 'none'}</span>
        </div>
      </div>
      <HourProfile series={buildSeries(segment)} title="This segment across the kickoff window" unit="degmin per fan" />
    </section>
  )
}

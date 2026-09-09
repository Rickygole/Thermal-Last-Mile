import { BAND_LABEL, exposureBand, exposureCss } from '../lib/color.js'
import { n0, n1, n2, pct } from '../lib/format.js'

export default function HoverCard ({ hover, hour, max }) {
  if (!hover) return null
  const style = { left: Math.round(hover.x) + 14, top: Math.round(hover.y) + 14 }
  if (hover.kind === 'building') {
    const b = hover.object
    return (
      <div className="hover-card panel" style={style} role="status">
        <div className="hc-title">{b.name || 'Unnamed building'}</div>
        <div className="hc-row">
          <span>Height</span>
          <span>{n1(b.height)} m</span>
        </div>
        <div className="hc-row">
          <span>Height source</span>
          <span>{b.height_source === 'tagged' ? 'measured tag' : b.height_source === 'levels' ? 'storeys times 3.5 m' : 'assumed 3.5 m'}</span>
        </div>
      </div>
    )
  }
  if (hover.kind === 'intervention') {
    const p = hover.object
    return (
      <div className="hover-card panel" style={style} role="status">
        <div className="hc-title">{p.name}</div>
        <div className="hc-row">
          <span>Funded</span>
          <span>{p.kind}</span>
        </div>
      </div>
    )
  }
  const s = hover.object
  const t = (s.degmin[hour] ?? 0) / max
  return (
    <div className="hover-card panel" style={style} role="status">
      <div className="hc-title">
        <span className="swatch" style={{ background: exposureCss(t) }} aria-hidden="true" />
        {s.name}
      </div>
      <div className="hc-row">
        <span>Degree-minutes</span>
        <span>
          {n2(s.degmin[hour] ?? 0)} <span className="label">{BAND_LABEL[exposureBand(t)]}</span>
        </span>
      </div>
      <div className="hc-row">
        <span>WBGT</span>
        <span>{n1(s.wbgt?.[hour] ?? 0)} C</span>
      </div>
      <div className="hc-row">
        <span>Shaded</span>
        <span>{pct((s.shade_frac?.[hour] ?? 0) * 100)}</span>
      </div>
      <div className="hc-row">
        <span>Fans, length</span>
        <span>
          {n0(s.fans)}, {n0(s.len_m)} m
        </span>
      </div>
    </div>
  )
}

import { HEAT_ANCHORS, exposureCss, heatCss } from '../lib/color.js'
import { n1, n2 } from '../lib/format.js'
import { useThemeRepaint } from '../store.js'

export default function Legend ({ max, hour, heat, threshold }) {
  useThemeRepaint()
  const anchors = heat?.anchors || HEAT_ANCHORS
  const [LOW_C, MID_C, HIGH_C] = anchors
  const stated = Number.isFinite(threshold)
  const stops = Array.from({ length: 13 }, (_, i) => {
    const c = LOW_C + ((HIGH_C - LOW_C) * i) / 12
    return `${heatCss(c, anchors)} ${Math.round((i / 12) * 100)}%`
  }).join(', ')
  return (
    <section className="panel pane legend-panel" aria-label="Legend">
      <div className="legend-block">
        <div className="pane-head">
          <h3>Surface, wet bulb globe temperature</h3>
          <span className="label">degrees C at {hour}:00</span>
        </div>
        <div className="ramp" style={{ background: `linear-gradient(90deg, ${stops})` }} aria-hidden="true">
          <span className="tick" style={{ left: '50%' }} />
        </div>
        <div className="ramp-scale" aria-hidden="true">
          <span>{n1(LOW_C)} and below</span>
          <span className="mid">{n1(MID_C)} {stated ? 'threshold' : 'ramp midpoint'}</span>
          <span>{n1(HIGH_C)} and above</span>
        </div>
        <p className="label">
          {heat && heat.available
            ? `Continuous field, ${heat.grid ? `${heat.grid[0]} by ${heat.grid[1]} grid` : 'baked raster'}, one image per kickoff hour.`
            : 'Surface raster not found, segments only.'}
        </p>
      </div>
      <div className="legend-block">
        <div className="pane-head">
          <h3>Segments, degree-minutes per fan</h3>
          <span className="label">{stated ? `above WBGT ${n1(MID_C)} C` : 'threshold not stated in meta.json'}</span>
        </div>
        <div className="ramp" style={{ background: `linear-gradient(90deg, ${exposureCss(0)}, ${exposureCss(0.5)}, ${exposureCss(1)})` }} aria-hidden="true" />
        <div className="ramp-scale" aria-hidden="true">
          <span>0.00</span>
          <span className="mid">{n2(max / 2)}</span>
          <span>{n2(max)}</span>
        </div>
        <p className="label">Scaled to the highest segment value across the whole kickoff window, so every modelled hour stays comparable.</p>
        <div className="legend">
          <span className="item">
            <span className="swatch accent" aria-hidden="true" /> Funded intervention
          </span>
          <span className="item">
            <span className="swatch build" aria-hidden="true" /> Building, measured height
          </span>
          <span className="item">
            <span className="swatch build weak" aria-hidden="true" /> Building, assumed height
          </span>
        </div>
      </div>
    </section>
  )
}

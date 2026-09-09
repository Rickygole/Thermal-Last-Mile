import { useMemo } from 'react'
import { exposureCss } from '../lib/color.js'
import { n1, n2 } from '../lib/format.js'
import { useThemeRepaint } from '../store.js'

const W = 560
const H = 300
const L = 46
const R = 16
const T = 16
const B = 40

function fit (points) {
  const n = points.length
  if (n < 3) return null
  const mx = points.reduce((a, p) => a + p.x, 0) / n
  const my = points.reduce((a, p) => a + p.y, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my)
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
  }
  if (sxx === 0 || syy === 0) return null
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy) }
}

export default function CityScatter ({ cities, focus }) {
  useThemeRepaint()
  const model = useMemo(() => {
    const points = cities
      .filter(c => Number.isFinite(c.canopy_pct) && Number.isFinite(c.degmin_per_trip))
      .map(c => ({ x: c.canopy_pct, y: c.degmin_per_trip, city: c }))
    if (!points.length) return null
    const maxX = Math.max(...points.map(p => p.x)) * 1.12
    const maxY = Math.max(...points.map(p => p.y)) * 1.12
    const maxMatches = Math.max(...points.map(p => p.city.matches || 1))
    return { points, maxX, maxY, maxMatches, line: fit(points) }
  }, [cities])

  if (!model) return null
  const px = v => L + (v / model.maxX) * (W - L - R)
  const py = v => H - B - (v / model.maxY) * (H - T - B)

  return (
    <section className="panel pane scatter" aria-label="Canopy against trip exposure across host cities">
      <div className="pane-head">
        <h3>Canopy against exposure, all host cities</h3>
        <span className="label">circle area is matches hosted</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Scatter of tree canopy percent against degree-minutes per trip for ${model.points.length} host cities`}>
        <line x1={L} x2={W - R} y1={H - B} y2={H - B} stroke="var(--border)" strokeWidth="0.5" />
        <line x1={L} x2={L} y1={T} y2={H - B} stroke="var(--border)" strokeWidth="0.5" />
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={py(model.maxY * t)} y2={py(model.maxY * t)} stroke="var(--hover)" strokeWidth="0.5" />
            <text x={L - 8} y={py(model.maxY * t) + 3} fontSize="10" fill="var(--muted)" textAnchor="end" fontFamily="inherit">
              {n1(model.maxY * t)}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map(t => (
          <text key={t} x={px(model.maxX * t)} y={H - B + 15} fontSize="10" fill="var(--muted)" textAnchor="middle" fontFamily="inherit">
            {Math.round(model.maxX * t)}
          </text>
        ))}
        {model.line ? (
          <line
            x1={px(0)}
            y1={py(Math.max(0, model.line.intercept))}
            x2={px(model.maxX)}
            y2={py(Math.max(0, model.line.intercept + model.line.slope * model.maxX))}
            stroke="var(--neutral)"
            strokeWidth="1"
            strokeDasharray="4 4"
          />
        ) : null}
        {model.points
          .slice()
          .sort((a, b) => py(a.y) - py(b.y))
          .map((p, i, all) => {
          const r = 4 + 5 * Math.sqrt((p.city.matches || 1) / model.maxMatches)
          const isFocus = p.city.id === focus
          const prev = i > 0 ? all[i - 1] : null
          const crowded = prev && Math.abs(py(prev.y) - py(p.y)) < 13 && Math.abs(px(prev.x) - px(p.x)) < 90
          const dy = crowded ? 12 : 3
          return (
            <g key={p.city.id}>
              <circle
                cx={px(p.x)}
                cy={py(p.y)}
                r={r}
                fill={exposureCss(p.y / model.maxY)}
                fillOpacity={isFocus ? 1 : 0.75}
                stroke={isFocus ? 'var(--accent)' : 'var(--page)'}
                strokeWidth={isFocus ? 2 : 1}
              />
              <text
                x={px(p.x) + r + 5}
                y={py(p.y) + dy}
                fontSize="10"
                fill={isFocus ? 'var(--text)' : 'var(--muted)'}
                fontFamily="inherit"
              >
                {p.city.name}
              </text>
            </g>
          )
        })}
        <text x={L} y={H - 6} fontSize="10" fill="var(--muted)" fontFamily="inherit">
          tree canopy percent
        </text>
        <text x={W - R} y={H - 6} fontSize="10" fill="var(--muted)" textAnchor="end" fontFamily="inherit">
          degree-minutes per trip on the vertical
        </text>
      </svg>
      <p className="label">
        {model.line
          ? `Least squares fit across ${model.points.length} cities, slope ${n2(model.line.slope)} degmin per canopy point, correlation r ${n2(model.line.r)}. Descriptive only, canopy is not the only difference between these cities.`
          : 'Too few cities to fit a trend.'}
      </p>
    </section>
  )
}

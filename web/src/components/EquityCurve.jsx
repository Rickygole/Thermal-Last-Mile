import { n0, n2, usd } from '../lib/format.js'

const W = 320
const H = 96
const PAD = { top: 10, right: 8, bottom: 18, left: 8 }

export default function EquityCurve ({ series }) {
  const rows = series.rows
  if (rows.length < 2) return null
  const xs = rows.map(r => r.budget)
  const values = rows.map(r => r.value)
  const lo = Math.min(...values, Number.isFinite(series.baseline) ? series.baseline : Infinity)
  const hi = Math.max(...values, Number.isFinite(series.baseline) ? series.baseline : -Infinity)
  const pad = (hi - lo) * 0.15 || 0.02
  const yLo = lo - pad
  const yHi = hi + pad
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const log = minX > 0 && maxX / minX >= 20
  const t = v => (log ? Math.log10(Math.max(v, minX)) : v)
  const x0 = t(minX)
  const x1 = t(maxX)
  const x = v => PAD.left + ((t(v) - x0) / (x1 - x0 || 1)) * (W - PAD.left - PAD.right)
  const y = v => PAD.top + (1 - (v - yLo) / (yHi - yLo || 1)) * (H - PAD.top - PAD.bottom)
  const line = rows.map(r => `${x(r.budget).toFixed(1)},${y(r.value).toFixed(1)}`).join(' ')
  const satX = Number.isFinite(series.saturation) ? x(series.saturation) : null
  const label = `${series.weighted ? 'Dollar weighted' : 'Set membership'} mean social vulnerability of the funded set, ${n2(
    Math.min(...values)
  )} to ${n2(Math.max(...values))} across budget levels from ${usd(minX)} to ${usd(maxX)}${
    Number.isFinite(series.baseline) ? `, against a corridor baseline of ${n2(series.baseline)}` : ''
  }.`

  return (
    <figure className="eq-curve">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {satX !== null && satX > PAD.left && satX < W - PAD.right ? (
          <>
            <rect
              x={satX}
              y={PAD.top}
              width={W - PAD.right - satX}
              height={H - PAD.top - PAD.bottom}
              className="eq-past"
            />
            <line x1={satX} x2={satX} y1={PAD.top} y2={H - PAD.bottom} className="eq-sat" />
          </>
        ) : null}
        {Number.isFinite(series.baseline) ? (
          <line x1={PAD.left} x2={W - PAD.right} y1={y(series.baseline)} y2={y(series.baseline)} className="eq-base" />
        ) : null}
        <polyline points={line} className="eq-line" />
        {rows.map(r => (
          <circle key={r.budget} cx={x(r.budget)} cy={y(r.value)} r="1.8" className="eq-dot" />
        ))}
      </svg>
      <figcaption className="label eq-axis">
        <span>{usd(minX)}</span>
        {satX !== null ? <span>saturates at {usd(series.saturation)}</span> : null}
        <span>{usd(maxX)}</span>
      </figcaption>
      {log ? <p className="label">Budget axis is logarithmic, so the levels below saturation stay readable.</p> : null}
      <p className="label">
        {n0(rows.length)} budget levels. The flat line is the corridor baseline, every segment counted once. The shaded band is
        above saturation, where every segment already carries a funded intervention and the comparison stops separating anything.
      </p>
    </figure>
  )
}

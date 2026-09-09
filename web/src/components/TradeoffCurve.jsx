import { useMemo, useRef } from 'react'
import { fansClearOfExtreme, pathFor } from '../lib/data.js'
import { n0, usd } from '../lib/format.js'

const W = 300
const H = 104
const PAD_L = 8
const PAD_R = 8
const PAD_T = 10
const PAD_B = 18

export function curvePoints (solutions, levels, horizon) {
  const path = pathFor(solutions, horizon)
  if (!path || !levels.length) return []
  return levels.map(level => {
    const s = path[String(level)] || {}
    return {
      level,
      spent: s.spent ?? 0,
      averted: s.averted_degmin ?? 0,
      cpd: s.cost_per_degmin ?? 0,
      fans: fansClearOfExtreme(s),
      count: Array.isArray(s.set) ? s.set.length : 0
    }
  })
}

export function marginals (points) {
  const out = []
  for (let i = 1; i < points.length; i++) {
    const dCost = points[i].level - points[i - 1].level
    const dAv = points[i].averted - points[i - 1].averted
    out.push(dCost > 0 ? (dAv / dCost) * 100000 : 0)
  }
  return out
}

export default function TradeoffCurve ({ points, index, onPick }) {
  const ref = useRef(null)
  const geometry = useMemo(() => {
    if (points.length < 2) return null
    const maxAverted = Math.max(...points.map(p => p.averted)) || 1
    const maxLevel = points[points.length - 1].level || 1
    const x = level => PAD_L + (level / maxLevel) * (W - PAD_L - PAD_R)
    const y = averted => H - PAD_B - (averted / maxAverted) * (H - PAD_T - PAD_B)
    const line = points.map((p, i) => `${i ? 'L' : 'M'} ${x(p.level).toFixed(1)} ${y(p.averted).toFixed(1)}`).join(' ')
    const area = `${line} L ${x(maxLevel).toFixed(1)} ${H - PAD_B} L ${PAD_L} ${H - PAD_B} Z`
    const m = marginals(points)
    const peak = Math.max(...m) || 1
    let knee = -1
    for (let i = 0; i < m.length; i++) {
      if (m[i] < peak * 0.3) {
        knee = i + 1
        break
      }
    }
    return { x, y, line, area, maxAverted, maxLevel, marginal: m, knee, peak }
  }, [points])

  if (!geometry) return <p className="label">Solution path has too few levels to draw a curve.</p>

  const current = points[index] || points[0]
  const nextMarginal = geometry.marginal[Math.min(geometry.marginal.length - 1, index)] || 0
  const kneePoint = geometry.knee > 0 ? points[geometry.knee] : null

  const pick = event => {
    if (!onPick || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const frac = (event.clientX - rect.left) / rect.width
    const level = ((frac * W - PAD_L) / (W - PAD_L - PAD_R)) * geometry.maxLevel
    let best = 0
    let bestDist = Infinity
    points.forEach((p, i) => {
      const d = Math.abs(p.level - level)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    })
    onPick(best)
  }

  return (
    <div className="tradeoff">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Cost effectiveness curve across ${points.length} budget levels. At ${usd(current.level)} the plan averts ${n0(current.averted)} degree-minutes.`}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          pick(e)
        }}
        onPointerMove={e => {
          if (e.buttons === 1) pick(e)
        }}
      >
        <line x1={PAD_L} x2={W - PAD_R} y1={H - PAD_B} y2={H - PAD_B} stroke="#2E353E" strokeWidth="0.5" />
        <path d={geometry.area} fill="rgba(45, 162, 187, 0.10)" />
        <path d={geometry.line} fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinejoin="round" />
        {kneePoint ? (
          <g>
            <line
              x1={geometry.x(kneePoint.level)}
              x2={geometry.x(kneePoint.level)}
              y1={PAD_T - 4}
              y2={H - PAD_B}
              stroke="#8B929B"
              strokeWidth="0.5"
              strokeDasharray="2 3"
            />
            <text x={geometry.x(kneePoint.level) + 4} y={PAD_T + 2} fontSize="9" fill="#8B929B" fontFamily="inherit">
              returns fall off
            </text>
          </g>
        ) : null}
        <line
          x1={geometry.x(current.level)}
          x2={geometry.x(current.level)}
          y1={PAD_T - 6}
          y2={H - PAD_B}
          stroke="#E7E9EC"
          strokeWidth="1"
        />
        <circle cx={geometry.x(current.level)} cy={geometry.y(current.averted)} r="4" fill="var(--accent)" stroke="#15171B" strokeWidth="1.5" />
        <text x={PAD_L} y={H - 6} fontSize="9" fill="#8B929B" fontFamily="inherit">
          $0
        </text>
        <text x={W - PAD_R} y={H - 6} fontSize="9" fill="#8B929B" fontFamily="inherit" textAnchor="end">
          {usd(geometry.maxLevel)}
        </text>
      </svg>
      <div className="stat-grid">
        <div className="stat">
          <div className="k">Next {usd(100000)} averts</div>
          <div className="v">{n0(nextMarginal)} degmin</div>
        </div>
        <div className="stat">
          <div className="k">Opening {usd(100000)} averted</div>
          <div className="v">{n0(geometry.peak)} degmin</div>
        </div>
      </div>
      <p className="label">
        {kneePoint
          ? `Marginal return drops below a third of the opening rate at ${usd(kneePoint.level)}. Every level shown is precomputed, drag the curve or the slider.`
          : 'Returns are close to linear across the whole path, so the ceiling is the binding constraint, not the ordering.'}
      </p>
    </div>
  )
}

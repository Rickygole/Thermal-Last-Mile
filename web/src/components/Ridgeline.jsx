import { useMemo } from 'react'
import { HOURS, setHour, useStore } from '../store.js'
import { exposureCss } from '../lib/color.js'
import { n1 } from '../lib/format.js'

const W = 900
const ROW = 46
const PAD = 26

function areaPath (values, max, baseline, width) {
  if (values.length < 2) return ''
  const step = width / (values.length - 1)
  const y = v => baseline - (v / max) * (ROW - 10)
  let d = `M 0 ${baseline}`
  values.forEach((v, i) => {
    const x = i * step
    if (i === 0) d += ` L ${x.toFixed(1)} ${y(v).toFixed(1)}`
    else {
      const px = (i - 1) * step
      const cx = (px + x) / 2
      d += ` C ${cx.toFixed(1)} ${y(values[i - 1]).toFixed(1)}, ${cx.toFixed(1)} ${y(v).toFixed(1)}, ${x.toFixed(1)} ${y(v).toFixed(1)}`
    }
  })
  d += ` L ${width} ${baseline} Z`
  return d
}

export default function Ridgeline ({ segments, max, totals }) {
  const hour = useStore(s => s.hour)
  const series = useMemo(() => {
    const primary = segments.filter(s => s.approach === (segments[0] && segments[0].approach))
    const use = primary.length > 4 ? primary : segments
    return HOURS.map(h => ({ hour: h, values: use.map(s => s.degmin[h] ?? 0) }))
  }, [segments])

  if (!segments.length) return null
  const height = PAD + HOURS.length * ROW + 14
  const width = W - 120

  return (
    <div className="ridgeline panel pane">
      <div className="pane-head">
        <h3>Exposure along the walk</h3>
        <span className="label">platform on the left, gate on the right</span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Exposure profile by kickoff hour along the walk">
        {series.map((s, i) => {
          const baseline = PAD + (i + 1) * ROW - 12
          const active = s.hour === hour
          const peak = Math.max(...s.values)
          return (
            <g key={s.hour} transform="translate(110, 0)" opacity={active ? 1 : 0.4}>
              <path
                d={areaPath(s.values, max, baseline, width)}
                fill={active ? exposureCss(peak / max) : '#39414C'}
                fillOpacity={active ? 0.55 : 0.5}
                stroke={active ? exposureCss(peak / max) : '#3A424D'}
                strokeWidth="1"
              />
              <line x1="0" x2={width} y1={baseline} y2={baseline} stroke="#2E353E" strokeWidth="0.5" />
            </g>
          )
        })}
        {series.map((s, i) => {
          const baseline = PAD + (i + 1) * ROW - 12
          const active = s.hour === hour
          return (
            <g key={`label-${s.hour}`} onClick={() => setHour(s.hour)} style={{ cursor: 'pointer' }}>
              <text x="0" y={baseline} fill={active ? '#E7E9EC' : '#8B929B'} fontSize="13" fontFamily="inherit">
                {s.hour}:00
              </text>
              <text x="52" y={baseline} fill="#8B929B" fontSize="11" fontFamily="inherit">
                {n1(totals?.[s.hour] ?? 0)}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="label">Numbers are degree-minutes above WBGT 32 for one fan, whole walk.</p>
    </div>
  )
}

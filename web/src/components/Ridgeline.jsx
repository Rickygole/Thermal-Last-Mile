import { useMemo } from 'react'
import { HOURS, setHour, useStore } from '../store.js'
import { exposureCss, heatCss } from '../lib/color.js'
import { APPROACH_LABEL } from '../lib/venues.js'
import { n0, n1, n2, tempC } from '../lib/format.js'

const W = 1400
const LABEL_W = 128
const ROW = 54
const PAD_T = 22

function pickApproach (segments) {
  const groups = new Map()
  for (const s of segments) {
    const key = s.approach || 'unknown'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(s)
  }
  let best = null
  for (const [key, segs] of groups) {
    const peak = segs.reduce((m, s) => Math.max(m, s.wbgt?.['15'] ?? 0), 0)
    const score = segs.length * 0.02 + peak
    if (!best || score > best.score) best = { key, segs, score }
  }
  return best || { key: 'unknown', segs: [] }
}

export default function Ridgeline ({ segments, threshold }) {
  const THRESHOLD = Number.isFinite(threshold) ? threshold : null
  const hour = useStore(s => s.hour)
  const picked = useMemo(() => pickApproach(segments), [segments])
  const width = W - LABEL_W

  const series = useMemo(() => {
    const segs = picked.segs
    const total = segs.reduce((a, s) => a + (s.len_m || 20), 0) || 1
    const xs = []
    let run = 0
    for (const s of segs) {
      xs.push((run / total) * width)
      run += s.len_m || 20
    }
    xs.push(width)
    const rows = HOURS.map(h => ({
      hour: h,
      xs,
      values: segs.map(s => s.wbgt?.[h] ?? 0),
      peak: segs.reduce((m, s) => Math.max(m, s.wbgt?.[h] ?? 0), 0),
      degmin: segs.reduce((a, s) => a + (s.degmin[h] ?? 0), 0)
    }))
    const all = rows.flatMap(r => r.values).filter(Number.isFinite)
    const lo = all.length ? Math.floor(Math.min(...all) * 2) / 2 - 0.5 : 26
    const hi = all.length ? Math.ceil(Math.max(...all) * 2) / 2 + 0.5 : 38
    return { rows, lo, hi }
  }, [picked, width])

  if (!segments.length) return null
  const { rows, lo: LO_C, hi: HI_C } = series
  const height = PAD_T + HOURS.length * ROW + 18
  const inRange = THRESHOLD > LO_C && THRESHOLD < HI_C

  const yFor = (v, baseline) => baseline - ((Math.max(LO_C, Math.min(HI_C, v)) - LO_C) / (HI_C - LO_C)) * (ROW - 22)

  return (
    <div className="ridgeline panel pane">
      <div className="pane-head">
        <h3>Wet bulb globe temperature along the walk, all four kickoffs</h3>
        <span className="label">
          {APPROACH_LABEL[picked.key] || picked.key}, platform on the left, gate on the right
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Temperature profile along the walk for each kickoff hour">
        {rows.map((s, i) => {
          const baseline = PAD_T + (i + 1) * ROW - 14
          const active = s.hour === hour
          const thresholdY = yFor(THRESHOLD, baseline)
          const line = s.values
            .map((v, k) => `${k ? 'L' : 'M'} ${s.xs[k].toFixed(1)} ${yFor(v, baseline).toFixed(1)}`)
            .join(' ')
          const above = `${line} L ${width} ${thresholdY.toFixed(1)} L 0 ${thresholdY.toFixed(1)} Z`
          return (
            <g key={s.hour} transform={`translate(${LABEL_W}, 0)`} opacity={active ? 1 : 0.45}>
              <clipPath id={`clip-${s.hour}`}>
                <rect x="0" y={baseline - ROW} width={width} height={thresholdY - (baseline - ROW)} />
              </clipPath>
              <line x1="0" x2={width} y1={baseline} y2={baseline} stroke="#2E353E" strokeWidth="0.5" />
              {inRange ? (
                <line x1="0" x2={width} y1={thresholdY} y2={thresholdY} stroke="#4A525E" strokeWidth="0.5" strokeDasharray="3 3" />
              ) : null}
              {inRange ? <path d={above} fill={exposureCss(0.85)} fillOpacity="0.4" clipPath={`url(#clip-${s.hour})`} /> : null}
              <path d={line} fill="none" stroke={heatCss(s.peak)} strokeWidth={active ? 1.6 : 1} strokeLinejoin="round" />
            </g>
          )
        })}
        {rows.map((s, i) => {
          const baseline = PAD_T + (i + 1) * ROW - 14
          const active = s.hour === hour
          return (
            <g key={`label-${s.hour}`} onClick={() => setHour(s.hour)} style={{ cursor: 'pointer' }}>
              <text x="0" y={baseline} fill={active ? '#E7E9EC' : '#8B929B'} fontSize="13" fontFamily="inherit">
                {s.hour}:00
              </text>
              <text x="46" y={baseline} fill="#8B929B" fontSize="11" fontFamily="inherit">
                {n1(s.peak)} C peak
              </text>
              <text x="46" y={baseline - 15} fill="#8B929B" fontSize="11" fontFamily="inherit">
                {n2(s.degmin)} degmin
              </text>
            </g>
          )
        })}
        <text x={LABEL_W} y={height - 4} fontSize="10" fill="#8B929B" fontFamily="inherit">
          platform
        </text>
        <text x={W} y={height - 4} fontSize="10" fill="#8B929B" fontFamily="inherit" textAnchor="end">
          gate, {n0(picked.segs.reduce((a, s) => a + (s.len_m || 0), 0))} m
        </text>
      </svg>
      <p className="label">
        {inRange
          ? `Dashed line is WBGT ${tempC(THRESHOLD)}, the exposure threshold. Filled area above it is what the degree-minute metric counts. `
          : `No hour on this approach reaches WBGT ${tempC(THRESHOLD)}, so the threshold line sits outside the plotted range. `}
        Vertical range is {n1(LO_C)} to {n1(HI_C)} C, shared by all four rows. Click a row to move every view to that kickoff hour.
      </p>
    </div>
  )
}

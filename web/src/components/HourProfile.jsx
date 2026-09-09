import { HEAT_ANCHORS, exposureCss, heatCss } from '../lib/color.js'
import { HOURS, setHour, useStore } from '../store.js'
import { n1, n2, pct } from '../lib/format.js'

const W = 320
const ROW = 34
const HEAD = 16
const BAR_X = 46
const BAR_W = 116
const AX_X = 190
const AX_W = 112
const [LOW_C, MID_C, HIGH_C] = HEAT_ANCHORS

const axisX = c => AX_X + ((Math.max(LOW_C, Math.min(HIGH_C, c)) - LOW_C) / (HIGH_C - LOW_C)) * AX_W

export function buildSeries (source) {
  return HOURS.map(h => ({
    hour: h,
    degmin: source.degmin?.[h] ?? 0,
    lo: source.degmin_lo?.[h] ?? source.lo?.[h] ?? null,
    hi: source.degmin_hi?.[h] ?? source.hi?.[h] ?? null,
    wbgt: source.wbgt?.[h] ?? 0,
    shade: source.shade_frac?.[h] ?? null
  }))
}

export default function HourProfile ({ series, unit = 'degmin per fan', title = 'All four kickoffs', note }) {
  const hour = useStore(s => s.hour)
  const peak = Math.max(...series.map(s => Math.max(s.degmin, s.hi ?? 0)), 0)
  const scale = peak > 0 ? peak : 1
  const height = HEAD + series.length * ROW + 14

  return (
    <div className="hour-profile">
      <div className="pane-head">
        <h3>{title}</h3>
        <span className="label">{unit}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`Exposure at each kickoff hour, ${series.map(s => `${s.hour}:00 ${n2(s.degmin)} degree-minutes, WBGT ${n1(s.wbgt)} C`).join('. ')}`}>
        <text x={BAR_X} y="10" fontSize="9" fill="#8B929B" fontFamily="inherit">
          DEGREE-MINUTES
        </text>
        <text x={AX_X} y="10" fontSize="9" fill="#8B929B" fontFamily="inherit">
          WBGT {LOW_C} TO {HIGH_C} C
        </text>
        <line x1={axisX(MID_C)} x2={axisX(MID_C)} y1={HEAD - 2} y2={height - 16} stroke="#3A424D" strokeWidth="0.5" strokeDasharray="2 2" />
        {series.map((s, i) => {
          const y = HEAD + i * ROW
          const mid = y + ROW / 2 - 4
          const active = s.hour === hour
          const t = peak > 0 ? s.degmin / scale : 0
          const w = Math.max(s.degmin > 0 ? 2 : 0, t * BAR_W)
          return (
            <g key={s.hour} opacity={active ? 1 : 0.62} onClick={() => setHour(s.hour)} style={{ cursor: 'pointer' }}>
              <rect x="0" y={y} width={W} height={ROW - 4} rx="4" fill={active ? '#22262E' : 'transparent'} />
              <text x="6" y={mid + 4} fontSize="11" fill={active ? '#E7E9EC' : '#8B929B'} fontFamily="inherit">
                {s.hour}:00
              </text>
              <rect x={BAR_X} y={mid - 3} width={BAR_W} height="6" rx="3" fill="#262B33" />
              {w > 0 ? <rect x={BAR_X} y={mid - 4} width={w} height="8" rx="4" fill={exposureCss(t)} /> : null}
              {s.hi !== null && s.hi > 0 ? (
                <g stroke="#8B929B" strokeWidth="1">
                  <line x1={BAR_X + (s.lo / scale) * BAR_W} x2={BAR_X + (s.hi / scale) * BAR_W} y1={mid + 9} y2={mid + 9} />
                  <line x1={BAR_X + (s.lo / scale) * BAR_W} x2={BAR_X + (s.lo / scale) * BAR_W} y1={mid + 6} y2={mid + 12} />
                  <line x1={BAR_X + (s.hi / scale) * BAR_W} x2={BAR_X + (s.hi / scale) * BAR_W} y1={mid + 6} y2={mid + 12} />
                </g>
              ) : null}
              <text x={AX_X - 10} y={mid + 4} fontSize="11" fill="#E7E9EC" fontFamily="inherit" textAnchor="end">
                {n2(s.degmin)}
              </text>
              <line x1={AX_X} x2={AX_X + AX_W} y1={mid} y2={mid} stroke="#262B33" strokeWidth="4" strokeLinecap="round" />
              <circle cx={axisX(s.wbgt)} cy={mid} r="4.5" fill={heatCss(s.wbgt)} stroke="#15171B" strokeWidth="1" />
              <text x={AX_X + AX_W} y={mid - 8} fontSize="10" fill="#8B929B" fontFamily="inherit" textAnchor="end">
                {n1(s.wbgt)} C{s.shade !== null ? `, ${pct(s.shade * 100)} shaded` : ''}
              </text>
            </g>
          )
        })}
      </svg>
      <p className="label">{note || 'Click a row to move the whole view to that kickoff hour. Whisker is the 90 percent interval.'}</p>
    </div>
  )
}

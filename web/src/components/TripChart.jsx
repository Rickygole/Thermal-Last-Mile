import { DAY_END, DAY_START, actualCurve, alternateBand, clockLabel, valueAt } from '../lib/trip.js'
import { n0 } from '../lib/format.js'

const W = 1000
const H = 352
const L = 66
const R = 14
const T = 52
const B = 46
const CHAR = 2.9

const x = t => L + ((t - DAY_START) / (DAY_END - DAY_START)) * (W - L - R)
const yFor = max => v => H - B - (max > 0 ? v / max : 0) * (H - T - B)

const centre = (from, to, text) => {
  const half = text.length * CHAR
  const mid = (x(from) + x(to)) / 2
  return Math.min(Math.max(mid, L + half), W - R - half)
}

const line = (pts, y) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')

const area = (upper, lower, y) =>
  `${line(upper, y)} ${lower
    .slice()
    .reverse()
    .map(p => `L${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(' ')} Z`

function Bands ({ clock, window, delay, pulse }) {
  const top = T
  const bottom = H - B
  const cells = [
    { from: clock.start, to: clock.kickoff, label: `walking in, ${n0(window)} min`, fill: 'tc-band-in', row: 0 },
    { from: clock.kickoff, to: clock.whistle, label: `in the stadium, ${n0(delay)} min`, fill: 'tc-band-hold', row: 0 },
    { from: clock.whistle, to: clock.end, label: `walking out, ${n0(pulse)} min`, fill: 'tc-band-out', row: 1 }
  ]
  return (
    <g className="tc-bands" aria-hidden="true">
      {cells.map(c => (
        <rect key={c.label} className={c.fill} x={x(c.from)} y={top} width={Math.max(1, x(c.to) - x(c.from))} height={bottom - top} />
      ))}
      {cells.map(c => (
        <line key={`${c.label}-edge`} className="tc-band-edge" x1={x(c.from)} x2={x(c.from)} y1={top} y2={bottom} />
      ))}
      <line className="tc-band-edge" x1={x(clock.end)} x2={x(clock.end)} y1={top} y2={bottom} />
      {cells.map(c => (
        <text key={`${c.label}-text`} className="tc-band-label" x={centre(c.from, c.to, c.label)} y={top + 14 + c.row * 15}>
          {c.label}
        </text>
      ))}
    </g>
  )
}

export default function TripChart ({ model, match, minute }) {
  const curve = actualCurve(match)
  const band = alternateBand(match)
  if (!curve) return null
  const peak = Math.max(curve[curve.length - 1].v, band ? band.total : 0, match.instant ?? 0)
  const max = peak > 0 ? peak * 1.12 : 1
  const y = yFor(max)
  const here = valueAt(curve, minute)
  const ticks = []
  for (let t = DAY_START; t <= DAY_END; t += 120) ticks.push(t)

  const summary = `Cumulative fan degree-hours across the match day. The trip as played reaches ${n0(
    curve[curve.length - 1].v
  )} by ${clockLabel(curve[curve.length - 1].t)}, against a kickoff instant figure of ${n0(match.instant)}.${
    band ? ` The same date moved to a ${model.alternateHour}:00 kickoff reaches ${n0(band.total)}, not zero.` : ''
  }`

  return (
    <figure className="trip-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        <g className="tc-grid" aria-hidden="true">
          {ticks.map(t => (
            <line key={t} x1={x(t)} x2={x(t)} y1={T} y2={H - B} />
          ))}
          <line className="tc-axis" x1={L} x2={W - R} y1={H - B} y2={H - B} />
        </g>

        <g className="tc-legend" aria-hidden="true">
          <line className="tc-key-line" x1={L} x2={L + 20} y1={13} y2={13} />
          <text x={L + 28} y={17}>
            solid line, the trip as played at {match.hour}:00, ending at {n0(curve[curve.length - 1].v)}
          </text>
          {band ? (
            <>
              <rect className="tc-key-band" x={L} y={30} width={20} height={10} />
              <text x={L + 28} y={39}>
                shaded band, the same date moved to {model.alternateHour}:00, ending at {n0(band.total)} and not at zero
              </text>
            </>
          ) : (
            <text x={L} y={39}>
              this match was already played at {model.alternateHour}:00, so there is no alternative to draw against it
            </text>
          )}
        </g>

        <Bands clock={match.clock} window={model.window} delay={model.delay} pulse={model.pulse} />

        {Number.isFinite(match.instant) ? (
          <g className="tc-instant">
            <line x1={L} x2={W - R} y1={y(match.instant)} y2={y(match.instant)} />
            <text x={W - R - 4} y={y(match.instant) - 7}>
              kickoff instant basis, {n0(match.instant)}
            </text>
          </g>
        ) : null}

        {band ? (
          <g className="tc-alt">
            <path className="tc-alt-fill" d={area(band.upper, band.lower, y)} />
            <path className="tc-alt-edge" d={line(band.upper, y)} />
            <path className="tc-alt-edge" d={line(band.lower, y)} />
            <circle className="tc-alt-dot" cx={x(band.clock.end)} cy={y(band.total)} r="3.5" />
          </g>
        ) : null}

        <path className="tc-line" d={line(curve, y)} />
        <circle className="tc-dot" cx={x(curve[curve.length - 1].t)} cy={y(curve[curve.length - 1].v)} r="3.5" />

        <g className="tc-cursor">
          <line x1={x(minute)} x2={x(minute)} y1={T} y2={H - B} />
          {minute >= match.clock.start && minute <= match.clock.end ? <circle cx={x(minute)} cy={y(here)} r="4.5" /> : null}
        </g>

        <g className="tc-ticks" aria-hidden="true">
          {ticks.map(t => (
            <text key={t} x={x(t)} y={H - B + 18}>
              {clockLabel(t)}
            </text>
          ))}
          <text className="tc-yl" x={L - 8} y={H - B + 4}>
            0
          </text>
          <text className="tc-yl" x={L - 8} y={T + 10}>
            {n0(max)}
          </text>
        </g>
      </svg>
      <figcaption className="label">
        Cumulative fan degree-hours above WBGT {n0(model.threshold)} C, clock time across the bottom. The three shaded columns are
        the modelled trip structure, and their durations are assumptions read from the shipped payload rather than observations.{' '}
        {band
          ? `The alternative is drawn as a band and not as a line because the payload publishes one number for the ${model.alternateHour}:00 counterfactual on this date, ${n0(band.total)}, and does not publish how it splits between walking in and walking out. Every path inside the band ends at that number: the upper edge puts all of it on the way in, the lower edge puts all of it on the way out, and the truth is somewhere between. What the band cannot do is reach zero. A ${model.alternateHour}:00 kickoff still has an arrival window, and it falls in the late afternoon.`
          : `This match was already played at ${model.alternateHour}:00, so the counterfactual leaves it unchanged and there is no second path to draw.`}
      </figcaption>
    </figure>
  )
}

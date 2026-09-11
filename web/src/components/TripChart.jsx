import { DAY_END, DAY_START, actualCurve, alternateBand, clockLabel, valueAt } from '../lib/trip.js'
import { n0 } from '../lib/format.js'

const W = 1000
const H = 320
const L = 66
const R = 14
const T = 18
const B = 46

const x = t => L + ((t - DAY_START) / (DAY_END - DAY_START)) * (W - L - R)
const yFor = max => v => H - B - (max > 0 ? v / max : 0) * (H - T - B)

const line = (pts, y) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ')

const area = (upper, lower, y) =>
  `${line(upper, y)} ${lower
    .slice()
    .reverse()
    .map(p => `L${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join(' ')} Z`

function Bands ({ clock, y, kind, window, delay, pulse, shape, labelled }) {
  const top = T
  const bottom = H - B
  const cells = [
    { from: clock.start, to: clock.kickoff, label: `arrival ${n0(window)} min, ${shape}`, fill: 'tc-band-in', show: true },
    { from: clock.kickoff, to: clock.whistle, label: `in stadium ${n0(delay)} min assumed`, fill: 'tc-band-hold', show: labelled },
    { from: clock.whistle, to: clock.end, label: `egress ${n0(pulse)} min, ${shape}`, fill: 'tc-band-out', show: labelled }
  ]
  return (
    <g className={`tc-bands ${kind}`} aria-hidden="true">
      {cells.map(c => (
        <rect key={c.label} className={c.fill} x={x(c.from)} y={top} width={Math.max(1, x(c.to) - x(c.from))} height={bottom - top} />
      ))}
      {cells.map(c => (
        <line key={`${c.label}-edge`} className="tc-band-edge" x1={x(c.from)} x2={x(c.from)} y1={top} y2={bottom} />
      ))}
      <line className="tc-band-edge" x1={x(clock.end)} x2={x(clock.end)} y1={top} y2={bottom} />
      {cells
        .filter(c => c.show)
        .map(c => (
          <text key={`${c.label}-text`} className="tc-band-label" transform={`translate(${x(c.from) + 12} ${bottom - 8}) rotate(-90)`}>
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
  const shape = model.arrivalShape === model.egressShape ? `assumed ${model.arrivalShape}` : 'assumed shape'
  const peak = Math.max(curve[curve.length - 1].v, band ? band.total : 0, match.instant ?? 0)
  const max = peak > 0 ? peak * 1.12 : 1
  const y = yFor(max)
  const here = valueAt(curve, minute)
  const ticks = []
  for (let t = DAY_START; t <= DAY_END; t += 120) ticks.push(t)

  const alt = band ? band.clock : null
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

        {alt ? (
          <Bands clock={alt} y={y} kind="is-alt" window={model.window} delay={model.delay} pulse={model.pulse} shape={shape} labelled={false} />
        ) : null}
        <Bands
          clock={match.clock}
          y={y}
          kind="is-actual"
          window={model.window}
          delay={model.delay}
          pulse={model.pulse}
          shape={shape}
          labelled
        />

        {Number.isFinite(match.instant) ? (
          <g className="tc-instant">
            <line x1={L} x2={W - R} y1={y(match.instant)} y2={y(match.instant)} />
            <text x={W - R - 4} y={y(match.instant) - 7}>
              kickoff instant figure, {n0(match.instant)}
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

        <g className="tc-notes" aria-hidden="true">
          <text x={x(match.clock.start) + 5} y={T + 14}>
            trip as played, {match.hour}:00 kickoff
          </text>
          {alt ? (
            <text x={x(alt.start) + 5} y={T + 14}>
              same date at {model.alternateHour}:00, total published, leg split not
            </text>
          ) : null}
          {!alt && match.evening ? (
            <text x={L + 6} y={T + 14}>
              no counterfactual, this match was already played at {model.alternateHour}:00
            </text>
          ) : null}
        </g>
      </svg>
      <figcaption className="label">
        Cumulative fan degree-hours above WBGT {n0(model.threshold)} C, clock time on the horizontal axis. The three bands are the
        modelled trip structure and their durations are assumptions read from the shipped payload, not observations.{' '}
        {band
          ? `The shaded wedge is every cumulative path consistent with the published ${model.alternateHour}:00 counterfactual total for this same date, because that block publishes the total and not its split between the two legs. Its lowest possible path still ends far above zero.`
          : `This match was already played at ${model.alternateHour}:00, so the counterfactual leaves it unchanged and there is no second curve to draw.`}
      </figcaption>
    </figure>
  )
}

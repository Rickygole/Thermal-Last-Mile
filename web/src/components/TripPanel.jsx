import { useEffect, useMemo, useRef, useState } from 'react'
import TripChart from './TripChart.jsx'
import TripReadout from './TripReadout.jsx'
import TripSurface from './TripSurface.jsx'
import { arrowSelect } from '../lib/keys.js'
import { reducedMotion } from '../lib/motion.js'
import { longDate, shortDate } from '../lib/retro.js'
import { DAY_END, DAY_START, actualCurve, clockLabel, hourOf } from '../lib/trip.js'
import { n0, n1, n2, pct1 } from '../lib/format.js'

const RATE = 40
const STEP = 5

export default function TripPanel ({ model, data, instantSix }) {
  const [date, setDate] = useState(model.defaultDate)
  const [minute, setMinute] = useState(DAY_START)
  const [playing, setPlaying] = useState(false)
  const refs = useRef([])
  const frame = useRef(0)
  const minuteRef = useRef(minute)
  minuteRef.current = minute

  const match = useMemo(() => model.matches.find(m => m.date === date) || model.playable[0], [model, date])
  const curve = useMemo(() => actualCurve(match), [match])

  useEffect(() => {
    setMinute(match && match.available ? match.clock.start : DAY_START)
    setPlaying(false)
  }, [match])

  useEffect(() => {
    if (!playing) return undefined
    let last = performance.now()
    const tick = now => {
      const next = minuteRef.current + ((now - last) / 1000) * RATE
      last = now
      if (next >= DAY_END) {
        minuteRef.current = DAY_END
        setMinute(DAY_END)
        setPlaying(false)
        return
      }
      minuteRef.current = next
      setMinute(next)
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [playing])

  const dates = model.playable.map(m => m.date)
  const hour = hourOf(minute)
  const tournament = model.tournament
  const cfTotals = model.counterfactual?.totals || null
  const shape = model.arrivalShape === model.egressShape ? model.arrivalShape : 'stated'

  const jump = target => {
    setPlaying(false)
    setMinute(target)
  }

  return (
    <section className="panel trip-panel" aria-label="The whole trip, arrival window through egress">
      <div className="trip-head">
        <h3>The trip, not the instant</h3>
        <p>
          The figures above stop the clock at kickoff. Fans do not. They walk in across an arrival window and they walk back out
          after the final whistle, and for a noon kickoff that walk out lands in the hottest part of the afternoon. The chart below
          runs the whole match day.
        </p>
      </div>

      {tournament ? (
        <div className="notice trip-reconcile">
          <strong>
            Across the {n0(tournament.n_matches_included)} of {n0(tournament.n_matches_total)} matches with a complete trip
            computation, fans carried {n0(tournament.trip_total_fan_degree_hours_above_threshold)} fan degree-hours, against{' '}
            {n0(tournament.kickoff_instant_total_for_same_matches)} at the kickoff instant for the same{' '}
            {n0(tournament.n_matches_included)}. A factor of {n2(tournament.ratio_trip_to_kickoff_instant_tournament)}.
          </strong>{' '}
          {instantSix && cfTotals ? (
            <>
              That changes the schedule answer, not just its size. On those same {n0(instantSix.dates)} matches the evening
              counterfactual removes {pct1((instantSix.fraction ?? 0) * 100)} of the kickoff instant exposure but only{' '}
              {pct1((cfTotals.removed_fraction ?? 0) * 100)} of the trip exposure. Same dates, same observed weather, same
              alternate hour. The gap is the legs: a {n0(model.alternateHour)}:00 kickoff still has an arrival window, and it falls
              in the hot late afternoon. The {pct1((instantSix.fraction ?? 0) * 100)} figure and the{' '}
              {pct1(((data.retrospective?.counterfactual_evening_kickoff?.totals?.removed_fraction) ?? 0) * 100)} shown further down
              this screen are both kickoff instant measures and neither is the trip answer.
            </>
          ) : null}
        </div>
      ) : null}

      <div className="trip-picker">
        <div className="pane-head">
          <h4>Pick a match</h4>
          <span className="label">arrow keys move</span>
        </div>
        <ul className="trip-matches">
          {model.matches.map(m => {
            const i = dates.indexOf(m.date)
            if (!m.available) {
              return (
                <li key={m.date} className="trip-match is-excluded">
                  <span className="tm-date">{shortDate(m.date)}</span>
                  <span className="tm-kick">{n0(m.hour)}:00</span>
                  <span className="tm-val">no trip total</span>
                  <span className="tm-why">
                    Excluded. The archive returns no usable observation for {m.missing.join(' and ')}, so the arrival leg cannot be
                    evaluated and no trip total is published for this date. Its kickoff instant figure,{' '}
                    {n0(m.instant)} fan degree-hours, still stands and is still counted everywhere else on this screen.
                  </span>
                </li>
              )
            }
            return (
              <li key={m.date}>
                <button
                  type="button"
                  className="trip-match"
                  ref={el => {
                    refs.current[i] = el
                  }}
                  aria-pressed={m.date === date}
                  tabIndex={m.date === date ? 0 : -1}
                  onKeyDown={e => arrowSelect(e, dates, date, setDate, refs)}
                  onClick={() => setDate(m.date)}
                >
                  <span className="tm-date">{shortDate(m.date)}</span>
                  <span className="tm-kick">{n0(m.hour)}:00</span>
                  <span className="tm-val">{n0(m.total)}</span>
                  <span className="tm-why">
                    {m.ratio === null
                      ? `kickoff instant measured exactly ${n0(m.instant)}, so there is no multiple to state, read the trip total straight`
                      : `${n2(m.ratio)} times its kickoff instant figure of ${n0(m.instant)}`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {match && match.available ? (
        <>
          <div className="trip-stage">
            <div className="trip-chart-hold">
              <div className="trip-title">
                <span>
                  {longDate(match.date)}, {n0(match.hour)}:00 kickoff, {match.label}
                </span>
                <span className="label">
                  showing {clockLabel(minute)} local, hour {hour}:00 surface
                </span>
              </div>
              <TripChart model={model} match={match} minute={minute} />
              <div className="trip-transport">
                <button type="button" className="ghost" onClick={() => setPlaying(p => !p)} aria-pressed={playing}>
                  {playing ? 'Pause' : 'Play the match day'}
                </button>
                <input
                  type="range"
                  min={DAY_START}
                  max={DAY_END}
                  step={STEP}
                  value={Math.round(minute)}
                  onChange={e => {
                    setPlaying(false)
                    setMinute(Number(e.target.value))
                  }}
                  aria-label="Clock time on the match day"
                  aria-valuetext={`${clockLabel(minute)} local, hour ${hour}:00 surface`}
                />
                <button type="button" className="ghost" onClick={() => jump(match.clock.whistle)}>
                  Final whistle
                </button>
                <button type="button" className="ghost" onClick={() => jump(match.clock.end)}>
                  End of egress
                </button>
              </div>
              {reducedMotion() ? (
                <p className="label">
                  Reduced motion is set, so nothing plays on its own. The slider moves the clock and every number and colour
                  follows it.
                </p>
              ) : null}
            </div>
            <div className="trip-side">
              <TripReadout model={model} match={match} minute={minute} curve={curve} />
              <TripSurface data={data} hour={hour} label={`Modelled exposure surface at ${hour}:00 with the walking corridor`} />
              <p className="label">
                The surface is the modelled hour field used everywhere else in this application, one raster per hour from{' '}
                {n0(10)}:00 to {n0(21)}:00. It shows which hour each leg lands in. It is not a rebake of this date's own weather.
                The numbers in the chart and the counter are.
              </p>
            </div>
          </div>

          <div className="notice trip-assume">
            <strong>The trip shape is assumed, the exposure is not.</strong> The {n0(model.window)} minute arrival window, the{' '}
            {n0(model.delay)} minute in stadium period, the {n0(model.pulse)} minute egress pulse and the {shape} density across
            both legs are modelled constants, not counts. No gate arrival survey or turnstile egress record for this venue exists
            anywhere in this project, so a flat shape was chosen over an invented curve. The exposure each leg accumulates is
            recomputed from that match's own observed weather at three airport stations with the shade mask rebaked for that date
            and hour. A rising toward kickoff arrival curve is plausibly more realistic and was deliberately not used, because no
            citation for one was found.{' '}
            {model.sensitivity.length
              ? `The payload carries the same computation at ${model.sensitivity.join(' and ')} minute arrival windows as a sensitivity check.`
              : ''}
          </div>
        </>
      ) : (
        <p className="label">This match has no published trip total, so there is nothing to play. See the exclusion note above.</p>
      )}
    </section>
  )
}

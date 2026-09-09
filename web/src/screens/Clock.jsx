import { useMemo, useState } from 'react'
import EmptyState from '../components/EmptyState.jsx'
import ClockTable from '../components/ClockTable.jsx'
import MatchTable from '../components/MatchTable.jsx'
import EveningControl from '../components/EveningControl.jsx'
import FreeVersusCapital from '../components/FreeVersusCapital.jsx'
import { APPROACH_LABEL } from '../lib/venues.js'
import { buildRetro, longDate, shortDate } from '../lib/retro.js'
import { setScreen, useStore } from '../store.js'
import { n0, n1, n2, pct1 } from '../lib/format.js'

function buildRows (clock) {
  const baselineHour = String(clock.summary?.baseline_hour ?? '15')
  const bestHour = String(clock.summary?.best_hour ?? '')
  const worstHour = String(clock.summary?.worst_hour ?? '')
  const baselineValue = clock.hours?.[baselineHour]?.fan_hours_above_threshold ?? 0
  const rows = (clock.modeled_hours || Object.keys(clock.hours || {})).map(h => {
    const entry = clock.hours[h] || {}
    const byApproach = entry.fans_crossing_extreme?.by_approach || {}
    const peak = Object.values(byApproach).reduce((m, a) => Math.max(m, a.peak_segment_wbgt_c ?? 0), 0)
    const value = entry.fan_hours_above_threshold ?? 0
    return {
      hour: String(h),
      value,
      removed: baselineValue - value,
      share: entry.exposure_removed_vs_1500 ?? 0,
      peak,
      crossesExtreme: (entry.fans_crossing_extreme?.total ?? 0) > 0,
      fansCrossing: entry.fans_crossing_extreme?.total ?? 0,
      byApproach: entry.degmin_per_trip_by_approach || {},
      equivalence: entry.equivalent_tree_spend_usd || null,
      best: String(h) === bestHour,
      worst: String(h) === worstHour
    }
  })
  const improving = rows.filter(r => r.removed > 0).sort((a, b) => a.removed - b.removed)
  return {
    rows,
    baseline: { hour: baselineHour, value: baselineValue },
    best: rows.find(r => r.hour === bestHour) || null,
    worst: rows.find(r => r.hour === worstHour) || null,
    smallest: improving[0] || null,
    max: rows.reduce((m, r) => Math.max(m, r.value), 0)
  }
}

function MatchDetail ({ match, model }) {
  if (!match) return null
  return (
    <section className="panel pane" aria-label={`Detail for the match on ${longDate(match.date)}`}>
      <div className="pane-head">
        <h3>
          {shortDate(match.date)}, {n0(match.hour)}:00, {match.label}
        </h3>
        <span className="label">degree-minutes per fan trip</span>
      </div>
      <div className="detail">
        {Object.entries(match.byApproach).map(([k, v]) => (
          <div className="row" key={k}>
            <span>
              {APPROACH_LABEL[k] || k}, {n0(match.fansByApproach[k])} fans
            </span>
            <span>{n2(v)}</span>
          </div>
        ))}
        <div className="row">
          <span>Hottest segment on any approach</span>
          <span>{n2(match.peak)} C WBGT</span>
        </div>
        <div className="row">
          <span>Fans on an approach whose peak crosses {n1(model.extreme)} C</span>
          <span>{n0(match.fansCrossing)}</span>
        </div>
        <div className="row">
          <span>Sun elevation at kickoff</span>
          <span>{n1(match.sunElevation)} deg</span>
        </div>
        <div className="row">
          <span>Route in shade at kickoff</span>
          <span>{pct1((match.shadedRoute ?? 0) * 100)}</span>
        </div>
      </div>
      <p className="label">
        Every figure in this panel comes from that match's own observed weather at {n0(match.stationCount)} airport stations, its
        own date's sun geometry, and a shade mask rebaked for that date and hour rather than reused from another match.
      </p>
    </section>
  )
}

export default function Clock ({ data }) {
  const clock = data.clock
  const hour = useStore(s => s.hour)
  const model = useMemo(() => (clock ? buildRows(clock) : null), [clock])
  const retro = useMemo(() => buildRetro(data.retrospective), [data.retrospective])
  const [match, setMatch] = useState(null)

  if ((!clock || !model || !model.rows.length) && !retro) {
    return (
      <EmptyState
        title="No kickoff data"
        body="Neither retrospective.json nor kickoff_clock.json loaded, so there is nothing measured to show. Nothing on this screen is computed in the browser."
        hint="npm run data"
      />
    )
  }

  const rmse = data.meta?.validation?.rmse_c ?? null
  const selectedMatch = retro ? retro.matches.find(m => m.date === match) || retro.worst : null
  const head = retro?.headline || null
  const perFanApproach = head ? APPROACH_LABEL[head.perFan.key] || head.perFan.key : ''
  const total = retro?.total || null
  const removedShare = retro?.counterfactual?.totals?.removed_fraction ?? null

  return (
    <div className="clock">
      {retro ? (
        <>
          <div className="clock-head">
            <h2>
              Walking to the {longDate(head.date)} kickoff cost one fan on the {perFanApproach} {n2(head.perFan.value)}{' '}
              degree-minutes above WBGT {n1(retro.threshold)} C, measured end to end.
            </h2>
            <p>
              That is a measured quantity: this match's own observed weather at three airport stations, this date's own sun
              geometry, a shade mask rebaked for this date and hour, walked along the same last mile route used everywhere else in
              this application. {n0(retro.measured.length)} matches were played at this stadium between{' '}
              {longDate(retro.range.from)} and {longDate(retro.range.to)}, {n0(retro.noon.length)} of them at noon and{' '}
              {n0(retro.measured.length - retro.noon.length)} in the evening. All {n0(retro.measured.length)} returned usable
              observed weather.
            </p>
            {total ? (
              <div className="notice clock-conditional">
                <strong>Conditional on the arrival split.</strong> Multiplying those per fan measurements by the assumed split of
                fans across the four approaches gives {n0(total.tournament_total_fan_degree_hours_above_threshold)} fan
                degree-hours for the tournament, of which {pct1((removedShare ?? 0) * 100)} traces to the noon kickoffs. The per
                fan degree-minutes are measured. The arrival split is an assumption this project states rather than a count, so the
                tournament total inherits it and the per fan figure does not.
              </div>
            ) : null}
          </div>

          <div className="clock-top">
            <MatchTable model={retro} selected={selectedMatch?.date ?? null} onSelect={setMatch} />
            <div className="clock-side">
              <MatchDetail match={selectedMatch} model={retro} />
              <div className="controls-row">
                <button type="button" className="ghost" onClick={() => setScreen('walk')}>
                  See the walk itself
                </button>
                <button type="button" className="ghost" onClick={() => setScreen('map')}>
                  See what the city can fix
                </button>
              </div>
            </div>
          </div>

          <EveningControl model={retro} rmse={rmse} />

          <section className="panel method-note" aria-label="How the seven matches were measured">
            <h3>What the measurement is, and what it approximates.</h3>
            <div className="mn-grid">
              <div>
                <div className="k">Fixtures</div>
                <p>
                  {retro.fixturesSource}
                  {retro.fixturesVerified ? `, verified ${retro.fixturesVerified}` : ''}.
                </p>
              </div>
              <div>
                <div className="k">Method</div>
                <p>{retro.notes.method}</p>
              </div>
              <div>
                <div className="k">Shade rebaked per match</div>
                <p>{retro.notes.shade}</p>
              </div>
              <div>
                <div className="k">The surface temperature field</div>
                <p>{retro.notes.lst}</p>
              </div>
              <div>
                <div className="k">If weather was missing</div>
                <p>{retro.notes.unavailable}</p>
              </div>
            </div>
          </section>
        </>
      ) : (
        <div className="clock-head">
          <h2>The measured tournament is not loaded.</h2>
          <p>
            retrospective.json did not load, so the seven played matches cannot be shown and this screen falls back to the hour
            sweep below, which is a design condition tool rather than a measurement of what fans absorbed.
          </p>
        </div>
      )}

      {model && model.rows.length ? (
        <section className="panel sweep" aria-label="Forward looking kickoff hour sweep">
          <div className="sweep-head">
            <h3>Separately: the hour sweep, for a venue whose kickoff is still open</h3>
            <p>
              {retro ? 'Everything above is Houston 2026, already played. This is the other question. ' : ''}Every hour of the
              plausible kickoff window was modelled end to end, {n0((model.rows || []).length)} of them, each on its own hottest
              available match date rather than on a single match. It compares hours in general. It is not a measurement of any
              match, and the rest of this application follows whichever hour is selected here.
            </p>
            {clock.fixture_binding_note ? <p className="label sweep-note">{clock.fixture_binding_note}</p> : null}
          </div>
          <div className="clock-top">
            <ClockTable
              rows={model.rows}
              baseline={model.baseline}
              max={model.max}
              threshold={clock.wbgt_threshold_c}
              extreme={clock.wbgt_extreme_c}
            />
            <div className="clock-side">
              <FreeVersusCapital
                baseline={model.baseline}
                best={model.best}
                smallest={model.smallest}
                selected={model.rows.find(r => r.hour === hour) || null}
                ceiling={clock.summary?.tree_only_ceiling_at_1500 || null}
                note={[model.smallest, model.rows.find(r => r.hour === hour), model.best].find(
                  r => r && r.equivalence && r.equivalence.usd === null
                )?.equivalence?.note || null}
              />
            </div>
          </div>
          <div className="mn-grid sweep-notes">
            <div>
              <div className="k">Fan degree-hours in the sweep</div>
              <p>{clock.method_note}</p>
            </div>
            <div>
              <div className="k">The tree equivalence</div>
              <p>{clock.tree_equivalence_note}</p>
            </div>
            <div>
              <div className="k">Which canopy the trees are credited with</div>
              <p>{clock.coverage_horizon_note}</p>
            </div>
          </div>
        </section>
      ) : null}

      <div className="clock-foot">
        <button type="button" className="continue" onClick={() => setScreen('map')}>
          Take this to the map, where the {n0(data.segments.length)} segments are the city's to fix
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  )
}

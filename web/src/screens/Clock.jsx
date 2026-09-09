import { useMemo } from 'react'
import EmptyState from '../components/EmptyState.jsx'
import ClockTable from '../components/ClockTable.jsx'
import FreeVersusCapital from '../components/FreeVersusCapital.jsx'
import OrganiserData from '../components/OrganiserData.jsx'
import { APPROACH_LABEL } from '../lib/venues.js'
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

export default function Clock ({ data }) {
  const clock = data.clock
  const hour = useStore(s => s.hour)
  const model = useMemo(() => (clock ? buildRows(clock) : null), [clock])

  if (!clock || !model || !model.rows.length) {
    return (
      <EmptyState
        title="No kickoff clock"
        body="kickoff_clock.json did not load, so the hour sweep cannot be shown. Nothing on this screen is computed in the browser."
        hint="npm run data"
      />
    )
  }

  const { rows, baseline, best, worst, smallest, max } = model
  const selected = rows.find(r => r.hour === hour) || null
  const ceiling = clock.summary?.tree_only_ceiling_at_1500 || null
  const nullSource = [smallest, selected, best].find(r => r && r.equivalence && r.equivalence.usd === null)
  const nullNote = nullSource?.equivalence?.note || null

  return (
    <div className="clock">
      <div className="clock-head">
        <h2>
          A {baseline.hour}:00 kickoff makes fans carry {n0(baseline.value)} fan degree-hours above WBGT {n1(clock.wbgt_threshold_c)} C
          on the last mile. Moving kickoff to {best?.hour}:00 removes {pct1((best?.share ?? 0) * 100)} of it and costs nothing.
        </h2>
        <p>
          Every hour of the plausible kickoff window was modelled end to end, {n0((clock.modeled_hours || []).length)} of them.{' '}
          {worst?.hour}:00 is the worst of them at {n0(worst?.value)}{' '}
          fan degree-hours, {pct1(Math.abs(worst?.share ?? 0) * 100)} worse than the {baseline.hour}:00 baseline. The rest of this
          application follows whichever hour is selected here.
        </p>
        <div className="notice clock-fixture">
          <strong>These hours are not bound to real matches.</strong> {clock.fixture_binding_note}
        </div>
      </div>

      <div className="clock-top">
        <ClockTable
          rows={rows}
          baseline={baseline}
          max={max}
          threshold={clock.wbgt_threshold_c}
          extreme={clock.wbgt_extreme_c}
        />
        <div className="clock-side">
          <FreeVersusCapital
            baseline={baseline}
            best={best}
            smallest={smallest}
            selected={selected}
            ceiling={ceiling}
            note={nullNote}
          />
          {selected ? (
            <section className="panel pane" aria-label={`Detail for the ${selected.hour}:00 kickoff`}>
              <div className="pane-head">
                <h3>{selected.hour}:00, the hour every screen is showing</h3>
                <span className="label">degree-minutes per fan trip</span>
              </div>
              <div className="detail">
                {Object.entries(selected.byApproach).map(([k, v]) => (
                  <div className="row" key={k}>
                    <span>{APPROACH_LABEL[k] || k}</span>
                    <span>{n2(v)}</span>
                  </div>
                ))}
                <div className="row">
                  <span>Fans on an approach whose peak crosses {n1(clock.wbgt_extreme_c)} C</span>
                  <span>{n0(selected.fansCrossing)}</span>
                </div>
                <div className="row">
                  <span>Capital equivalent of this shift</span>
                  <span>
                    {selected.equivalence && selected.equivalence.usd === null
                      ? 'no modelled spend matches it'
                      : selected.removed > 0
                        ? `$${n0(selected.equivalence?.usd ?? 0)}`
                        : 'nothing to price'}
                  </span>
                </div>
              </div>
              <div className="controls-row">
                <button type="button" className="ghost" onClick={() => setScreen('walk')}>
                  See this hour on the walk
                </button>
                <button type="button" className="ghost" onClick={() => setScreen('map')}>
                  See this hour on the map
                </button>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <section className="panel method-note" aria-label="How the kickoff clock is computed">
        <h3>What the numbers on this screen are, and are not.</h3>
        <div className="mn-grid">
          <div>
            <div className="k">Fan degree-hours</div>
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
        {ceiling?.note ? <p className="label">{ceiling.note}</p> : null}
      </section>

      <OrganiserData uhi={data.uhi} fanVolumes={data.fanVolumes} />

      <div className="clock-foot">
        <button type="button" className="continue" onClick={() => setScreen('map')}>
          Take the selected hour to the map and rank every segment
          <span aria-hidden="true">&rarr;</span>
        </button>
      </div>
    </div>
  )
}

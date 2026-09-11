import { n0, n2, pct1, usdExact } from '../lib/format.js'

function Bar ({ label, basis, cost, value, scale, kind, foot }) {
  const w = scale > 0 ? Math.max(1, (value / scale) * 100) : 0
  return (
    <div className="fvc-item">
      <div className="fvc-top">
        <span className="fvc-label">{label}</span>
        <span className={`fvc-cost${kind === 'free' ? ' is-free' : ''}`}>{cost}</span>
      </div>
      <div className="fvc-basis label">{basis}</div>
      <div className="bar-track fvc-track">
        <span className={`bar-fill fvc-fill ${kind}`} style={{ width: `${w}%` }} />
      </div>
      <div className="fvc-foot">
        <span className="fvc-value">{n0(value)}</span>
        <span className="label">{foot}</span>
      </div>
    </div>
  )
}

export default function FreeVersusCapital ({ trip, ceiling, noonHour }) {
  const totals = trip?.counterfactual?.totals || null
  if (!totals) return null
  const removed = totals.removed_trip_fan_degree_hours ?? 0
  const measured = totals.actual_total_trip_fan_degree_hours_above_threshold ?? 0
  const fraction = totals.removed_fraction ?? 0
  const alternate = trip.alternateHour
  const treeRemoved = ceiling?.max_fan_hours_removable_at_15_00 ?? 0
  const treeSpend = ceiling?.max_tree_only_spend_usd ?? 0
  const ratio = trip.tournament?.ratio_trip_to_kickoff_instant_tournament ?? null
  const treeScaled = Number.isFinite(ratio) ? treeRemoved * ratio : null
  const scale = Math.max(removed, treeRemoved, treeScaled ?? 0)
  const shareOfFree = removed > 0 ? (treeRemoved / removed) * 100 : null
  const scaledShare = removed > 0 && treeScaled !== null ? (treeScaled / removed) * 100 : null

  return (
    <section className="panel pane fvc" aria-label="What the clock removes against what the corridor can be made to buy">
      <div className="pane-head">
        <h3>The clock against everything the corridor can be made to hold</h3>
        <span className="label">fan degree-hours removed</span>
      </div>
      <Bar
        label={`Move the ${noonHour}:00 kickoffs to ${n0(alternate)}:00`}
        basis={`measured, whole trip, ${n0(totals.n_matches_included)} matches on their own observed weather`}
        cost="no capital cost"
        kind="free"
        value={removed}
        scale={scale}
        foot={`${pct1(fraction * 100)} of the ${n0(measured)} fans actually carried`}
      />
      <Bar
        label="Plant every eligible segment, kickoff left where it was"
        basis="modelled ceiling of the tree only curve, kickoff instant basis at 15:00 design conditions"
        cost={usdExact(treeSpend)}
        kind="capital"
        value={treeRemoved}
        scale={scale}
        foot="one tree on every segment that can take one, and no larger budget moves it"
      />
      <p className="fvc-read">
        {usdExact(treeSpend)} buys every street tree the corridor has room for, and a segment cannot be planted twice, so{' '}
        {n0(treeRemoved)} fan degree-hours is the ceiling rather than a budget choice. That is{' '}
        {shareOfFree === null ? '--' : pct1(shareOfFree)} of what changing the hour removes for nothing.
        {treeScaled !== null
          ? ` The two bars are not on one basis: the payload publishes the planting ceiling at the kickoff instant only. Credited the full ${n2(ratio)} trip to instant factor measured on this tournament, it would be about ${n0(treeScaled)}, still ${pct1(scaledShare)} of the free bar.`
          : ''}
      </p>
    </section>
  )
}

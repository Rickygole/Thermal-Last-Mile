import { n0, usdExact } from '../lib/format.js'

function Bar ({ label, cost, value, scale, kind, foot }) {
  const w = scale > 0 ? Math.max(1, (value / scale) * 100) : 0
  return (
    <div className="fvc-item">
      <div className="fvc-top">
        <span className="fvc-label">{label}</span>
        <span className={`fvc-cost${kind === 'free' ? ' is-free' : ''}`}>{cost}</span>
      </div>
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

export default function FreeVersusCapital ({ baseline, best, smallest, selected, ceiling, note }) {
  const treeRemoved = ceiling?.max_fan_hours_removable_at_15_00 ?? 0
  const treeSpend = ceiling?.max_tree_only_spend_usd ?? 0
  const scale = Math.max(best?.removed ?? 0, smallest?.removed ?? 0, treeRemoved, selected?.removed ?? 0)
  const showSelected = selected && selected.removed > 0 && selected.hour !== best?.hour && selected.hour !== smallest?.hour

  return (
    <section className="panel pane fvc" aria-label="Free schedule change against the largest purchasable tree deployment">
      <div className="pane-head">
        <h3>A schedule change against every tree money can buy</h3>
        <span className="label">fan degree-hours removed from the {baseline.hour}:00 baseline</span>
      </div>
      {best ? (
        <Bar
          label={`Move kickoff to ${best.hour}:00`}
          cost="no capital cost"
          kind="free"
          value={best.removed}
          scale={scale}
          foot={`the whole ${n0(baseline.value)} carried at ${baseline.hour}:00, gone`}
        />
      ) : null}
      {smallest ? (
        <Bar
          label={`Move kickoff to ${smallest.hour}:00, the smallest shift that helps at all`}
          cost="no capital cost"
          kind="free"
          value={smallest.removed}
          scale={scale}
          foot="one hour later, nothing built, nothing bought"
        />
      ) : null}
      <Bar
        label={`Plant every eligible segment, kickoff left at ${baseline.hour}:00`}
        cost={usdExact(treeSpend)}
        kind="capital"
        value={treeRemoved}
        scale={scale}
        foot="one tree on every segment that can take one, the ceiling of the tree only curve"
      />
      {showSelected ? (
        <Bar
          label={`Move kickoff to ${selected.hour}:00, the hour currently selected`}
          cost="no capital cost"
          kind="free"
          value={selected.removed}
          scale={scale}
          foot="the hour every other screen is now showing"
        />
      ) : null}
      <p className="fvc-read">
        {usdExact(treeSpend)} of street trees is the most relief planting can buy at {baseline.hour}:00, {n0(treeRemoved)} fan
        degree-hours, and no larger budget moves it, because a segment cannot be planted twice.
        {smallest ? ` Moving kickoff one hour to ${smallest.hour}:00 removes ${n0(smallest.removed)}, more than the ceiling, at no cost.` : ''}
        {best ? ` Moving it to ${best.hour}:00 removes ${n0(best.removed)}.` : ''}
      </p>
      {note ? (
        <div className="notice">
          <strong>The null is the result.</strong> equivalent_tree_spend_usd is null for every hour that improves on{' '}
          {baseline.hour}:00. The pipeline reports it that way rather than inventing a number past the modelled cap: {note}
        </div>
      ) : null}
    </section>
  )
}

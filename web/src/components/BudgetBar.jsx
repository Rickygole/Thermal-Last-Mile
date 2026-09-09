import TradeoffCurve from './TradeoffCurve.jsx'
import { setBudget, useStore } from '../store.js'
import { n0, n1, n2, usd } from '../lib/format.js'

export default function BudgetBar ({ solution, levels, points }) {
  const budget = useStore(s => s.budget)
  if (!levels.length) {
    return (
      <section className="panel pane" aria-label="Shade budget">
        <div className="pane-head">
          <h3>Shade budget</h3>
        </div>
        <p className="label">solutions.json carries no budget path, so no allocation can be shown.</p>
      </section>
    )
  }
  let index = levels.findIndex(l => l >= budget)
  if (index < 0) index = levels.length - 1
  const level = levels[index]
  const applyIndex = i => setBudget(levels[Math.max(0, Math.min(levels.length - 1, i))])
  const treated = solution && Array.isArray(solution.set) ? solution.set.length : 0

  return (
    <section className="panel pane budget-rail" aria-label="Shade budget">
      <div className="br-main">
      <div className="pane-head">
        <h3>Shade budget</h3>
        <span className="label">
          level {index + 1} of {levels.length}
        </span>
      </div>
      <div className="stat">
        <div className="k">Capital committed</div>
        <div className="v big">
          {usd(level)} <span className="label">of {usd(levels[levels.length - 1])} ceiling</span>
        </div>
      </div>
      <input
        type="range"
        min="0"
        max={levels.length - 1}
        step="1"
        value={index}
        aria-label="Shade budget level"
        aria-valuetext={`${usd(level)}, level ${index + 1} of ${levels.length}`}
        onChange={e => applyIndex(Number(e.target.value))}
        onKeyDown={e => {
          if (e.key === 'PageUp') {
            e.preventDefault()
            applyIndex(index + 4)
          }
          if (e.key === 'PageDown') {
            e.preventDefault()
            applyIndex(index - 4)
          }
        }}
      />
      </div>
      <div className="stat-grid br-stats">
        <div className="stat">
          <div className="k">Averted per fan</div>
          <div className="v">{n1(solution?.averted_per_fan ?? 0)} degmin</div>
        </div>
        <div className="stat">
          <div className="k">Cost per degmin averted</div>
          <div className="v">${n2(solution?.cost_per_degmin ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="k">Fans held under threshold</div>
          <div className="v">{n0(solution?.fans_below_threshold ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="k">Segments treated</div>
          <div className="v">
            {n0(treated)} <span className="label">for {usd(solution?.spent ?? 0)}</span>
          </div>
        </div>
      </div>
      <div className="br-curve">
        <TradeoffCurve points={points} index={index} onPick={applyIndex} />
      </div>
    </section>
  )
}

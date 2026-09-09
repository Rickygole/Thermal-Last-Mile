import { BUDGET_CAP, BUDGET_STEP, setBudget, useStore } from '../store.js'
import { n0, n1, n2, usd } from '../lib/format.js'

export default function BudgetBar ({ solution, cap, step }) {
  const budget = useStore(s => s.budget)
  const max = cap || BUDGET_CAP
  const inc = step || BUDGET_STEP
  return (
    <section className="panel pane" aria-label="Shade budget">
      <div className="pane-head">
        <h3>Shade budget</h3>
        <span className="label">{usd(budget)}</span>
      </div>
      <input
        type="range"
        min="0"
        max={max}
        step={inc}
        value={budget}
        aria-label="Shade budget in dollars"
        aria-valuetext={`${usd(budget)} of ${usd(max)}`}
        onChange={e => setBudget(Number(e.target.value))}
      />
      <div className="stat-grid">
        <div className="stat">
          <div className="k">Averted per fan</div>
          <div className="v">{n1(solution?.averted_per_fan ?? 0)} degmin</div>
        </div>
        <div className="stat">
          <div className="k">Cost per degmin</div>
          <div className="v">${n2(solution?.cost_per_degmin ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="k">Fans under threshold</div>
          <div className="v">{n0(solution?.fans_below_threshold ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="k">Committed</div>
          <div className="v">{usd(solution?.spent ?? 0)}</div>
        </div>
      </div>
      <div className="bar-track" aria-hidden="true">
        <div
          className="bar-fill"
          style={{ width: `${Math.round((budget / max) * 100)}%`, background: 'var(--accent)', transition: 'width 150ms ease-out' }}
        />
      </div>
      <p className="label">
        {solution ? `${solution.set.length} segments treated, greedy submodular order, precomputed` : 'No solution path loaded'}
      </p>
    </section>
  )
}

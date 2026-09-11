import { useEffect } from 'react'
import TradeoffCurve from './TradeoffCurve.jsx'
import { setBudget, setHorizon, useStore } from '../store.js'
import { n0, n1, n2, perDegmin, usd } from '../lib/format.js'

function clampIndex (levels, budget) {
  if (!levels.length) return -1
  if (!Number.isFinite(budget)) return 0
  if (budget <= levels[0]) return 0
  if (budget >= levels[levels.length - 1]) return levels.length - 1
  let index = 0
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] <= budget) index = i
  }
  return index
}

export default function BudgetBar ({ solution, other, levels, points, horizons, maturityYears, extreme, threshold, note }) {
  const budget = useStore(s => s.budget)
  const horizon = useStore(s => s.horizon)
  const index = clampIndex(levels, budget)
  const level = index < 0 ? null : levels[index]
  useEffect(() => {
    if (level !== null && level !== budget) setBudget(level)
  }, [level, budget])
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
  const applyIndex = i => setBudget(levels[Math.max(0, Math.min(levels.length - 1, i))])
  const treated = solution && Array.isArray(solution.set) ? solution.set.length : 0
  const mature = horizon === 'mature'
  const years = Number.isFinite(maturityYears) ? maturityYears : 15
  const activeWords = mature ? `mature canopy, about ${n0(years)} years out` : 'near term, the 2026 tournament'
  const otherWords = mature ? 'near term, the 2026 tournament' : `mature canopy, about ${n0(years)} years out`

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
          min="1"
          max={levels.length}
          step="1"
          value={index + 1}
          aria-label="Shade budget level"
          aria-valuetext={`${usd(level)}, level ${index + 1} of ${levels.length}`}
          onChange={e => applyIndex(Number(e.target.value) - 1)}
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
        {horizons ? (
          <div className="horizon">
            <div className="label" id="horizon-label">
              What the trees have grown into when the exposure is counted
            </div>
            <div className="seg" role="group" aria-labelledby="horizon-label">
              <button type="button" aria-pressed={!mature} onClick={() => setHorizon('near')}>
                Near term, 2026
              </button>
              <button type="button" aria-pressed={mature} onClick={() => setHorizon('mature')}>
                Mature, {n0(years)} years
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="stat-grid br-stats">
        <div className="stat">
          <div className="k">Averted per fan, {activeWords}</div>
          <div className="v">{n1(solution?.averted_per_fan ?? 0)} degmin</div>
          {other ? (
            <div className="label">
              {n1(other.averted_per_fan ?? 0)} degmin on the {otherWords} horizon
            </div>
          ) : null}
        </div>
        <div className="stat">
          <div className="k">Cost per degmin averted</div>
          <div className="v">{perDegmin(solution?.cost_per_degmin) || 'nothing funded yet'}</div>
          {other ? (
            <div className="label">{perDegmin(other.cost_per_degmin) || 'nothing funded'} on the {otherWords} horizon</div>
          ) : null}
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
        {note ? <p className="label">{note}</p> : null}
      </div>
    </section>
  )
}

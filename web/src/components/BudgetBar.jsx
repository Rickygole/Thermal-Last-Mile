import TradeoffCurve from './TradeoffCurve.jsx'
import { setBudget, setHorizon, useStore } from '../store.js'
import { fansClearOfExtreme } from '../lib/data.js'
import { n0, n1, n2, usd } from '../lib/format.js'

export default function BudgetBar ({ solution, other, levels, points, horizons, maturityYears, extreme, threshold, note }) {
  const budget = useStore(s => s.budget)
  const horizon = useStore(s => s.horizon)
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
          <div className="v">${n2(solution?.cost_per_degmin ?? 0)}</div>
          {other ? <div className="label">${n2(other.cost_per_degmin ?? 0)} on the {otherWords} horizon</div> : null}
        </div>
        <div className="stat">
          <div className="k">Fans clear of the extreme tier</div>
          <div className="v">{n0(fansClearOfExtreme(solution))}</div>
          <div className="label">measured at WBGT {n1(extreme)} C, not at the {n1(threshold)} C exposure threshold</div>
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

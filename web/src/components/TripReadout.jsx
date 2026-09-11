import { memo } from 'react'
import { PHASE_LABEL, clockLabel, phaseAt, valueAt } from '../lib/trip.js'
import { n0, n1, pct1 } from '../lib/format.js'

function Readout ({ model, match, minute, curve }) {
  const phase = phaseAt(match, minute)
  const carried = valueAt(curve, minute)
  const end = curve[curve.length - 1].v
  const rate = phase === 'arrival' ? match.inRate : phase === 'egress' ? match.outRate : 0
  const surge = Number.isFinite(match.inRate) && match.inRate > 0 && Number.isFinite(match.outRate)
    ? match.outRate / match.inRate
    : null

  return (
    <div className="trip-readout" role="status" aria-live="off">
      <div className="stat">
        <div className="k">Carried by {clockLabel(minute)} local</div>
        <div className="v big">{n0(carried)}</div>
        <div className="label">
          fan degree-hours above WBGT {n0(model.threshold)} C, {pct1(end > 0 ? (carried / end) * 100 : 0)} of this trip
        </div>
      </div>
      <div className="detail">
        <div className="row">
          <span>Where the day is</span>
          <span>{PHASE_LABEL[phase]}</span>
        </div>
        <div className="row">
          <span>Accumulating at</span>
          <span>{rate > 0 ? `${n0(rate)} per minute` : 'nothing, no one is on the corridor'}</span>
        </div>
        <div className="row">
          <span>Arrival leg, {n0(model.window)} min</span>
          <span>{match.inbound.value === null ? 'unavailable' : n0(match.inbound.value)}</span>
        </div>
        <div className="row">
          <span>Egress leg, {n0(model.pulse)} min</span>
          <span>{match.outbound.value === null ? 'unavailable' : n0(match.outbound.value)}</span>
        </div>
        <div className="row">
          <span>Egress against arrival, per minute</span>
          <span>{surge === null ? 'not defined' : `${n1(surge)} times`}</span>
        </div>
      </div>
    </div>
  )
}

export default memo(Readout, (a, b) => a.match === b.match && a.model === b.model && Math.round(a.minute) === Math.round(b.minute))

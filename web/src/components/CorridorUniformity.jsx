import { useMemo } from 'react'
import { corridorSpread } from '../lib/context.js'
import { n0, n1, n2, pct1, usdExact } from '../lib/format.js'

export default function CorridorUniformity ({ segments, hour, shade, lever }) {
  const spread = useMemo(() => corridorSpread(segments, hour), [segments, hour])
  if (!spread) return null
  const tight = spread.wbgtSpan < 1.5
  const shadeApplies = shade?.allZeroAtHour && Number(hour) === shade.hour

  return (
    <section className="panel map-lede" aria-label="What this map can and cannot change">
      {lever ? (
        <div className="display-block">
          <span className="display">{n1(lever.multiple)}x</span>
          <span className="label">the free schedule change against every tree this corridor has room for</span>
        </div>
      ) : null}
      <div className="ml-text">
        <h2>Kickoff hour belongs to the tournament. These {n0(spread.n)} segments belong to the city.</h2>
        <p className="map-lede-body">
          <strong>
            {tight
              ? 'The corridor is uniformly hot, so there is no hotspot to target.'
              : 'The corridor spreads out at this hour, so the ranking below separates segments.'}
          </strong>{' '}
          WBGT spans {n2(spread.wbgtSpan)} C across all {n0(spread.n)} segments at {hour}:00 and exposure per metre varies{' '}
          {pct1(spread.cvPct)} about the mean, worst to best {n2(spread.ratio)} to 1.{' '}
          {tight
            ? 'A ranking cannot separate what is not separated.'
            : 'The ranking below carries more information at this hour than it does when the sun is overhead.'}
          {shadeApplies
            ? ` Shade is not the missing variable either: zero shaded route at all ${n0(shade.atHour)} measured ${n0(shade.hour)}:00 kickoffs.`
            : ''}
        </p>
        {lever ? (
          <p className="map-lede-body">
            Moving the measured kickoffs to {n0(lever.alternateHour)}:00 removes {n0(lever.removed)} fan degree-hours at no
            capital cost. {usdExact(lever.spend)} buys every tree this corridor has room for: {n0(lever.ceiling)} at the kickoff
            instant, about {n0(lever.scaled)} credited the measured {n2(lever.ratio)} trip factor. Everything below this line is
            that smaller number, and it is still worth funding.
          </p>
        ) : null}
      </div>
    </section>
  )
}

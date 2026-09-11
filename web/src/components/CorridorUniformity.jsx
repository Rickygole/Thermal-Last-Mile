import { useMemo } from 'react'
import { corridorSpread } from '../lib/context.js'
import { n0, n2, pct1 } from '../lib/format.js'

export default function CorridorUniformity ({ segments, hour, shade }) {
  const spread = useMemo(() => corridorSpread(segments, hour), [segments, hour])
  if (!spread) return null
  const tight = spread.wbgtSpan < 1.5
  const shadeApplies = shade?.allZeroAtHour && Number(hour) === shade.hour

  return (
    <p className="label finding">
      <strong>
        {tight ? 'The corridor is uniform. There is no hotspot to find.' : 'The corridor spreads out at this hour.'}
      </strong>{' '}
      {`WBGT spans ${n2(spread.wbgtSpan)} C across all ${n0(spread.n)} segments at ${hour}:00 and exposure per metre varies ${pct1(
        spread.cvPct
      )} about the mean, worst to best ${n2(spread.ratio)} to 1.`}{' '}
      {tight
        ? 'The ranking below is real but discriminates very little. What moves the number is the kickoff hour, not the segment.'
        : 'The ranking below separates segments more here than when the sun is overhead.'}
      {shadeApplies
        ? ` Shade is not the cause: the shadow model returns zero shaded route at all ${n0(shade.atHour)} measured ${n0(
            shade.hour
          )}:00 kickoffs.`
        : ''}
    </p>
  )
}

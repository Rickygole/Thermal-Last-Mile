import { useCallback, useEffect, useMemo, useState } from 'react'
import { AmbientLight, DirectionalLight, LightingEffect } from '@deck.gl/core'
import DeckMap from '../components/DeckMap.jsx'
import RankedList from '../components/RankedList.jsx'
import BudgetBar from '../components/BudgetBar.jsx'
import HourScrubber from '../components/HourScrubber.jsx'
import MethodsPanel from '../components/MethodsPanel.jsx'
import SegmentDetail from '../components/SegmentDetail.jsx'
import MapControls from '../components/MapControls.jsx'
import EquityPanel from '../components/EquityPanel.jsx'
import OrganiserData from '../components/OrganiserData.jsx'
import HoverCard from '../components/HoverCard.jsx'
import Legend from '../components/Legend.jsx'
import { curvePoints } from '../components/TradeoffCurve.jsx'
import { buildingLayer, exposureLayer, fundedLayer, pathCasingLayer, shadeLayers } from '../lib/layers.js'
import { heatLayers, useRasterWindow } from '../lib/heat.js'
import { budgetLevels, expoUrl, hasMaturePath, interventionPoints, solutionAt, worstApproach } from '../lib/data.js'
import { downloadCsv, segmentsToCsv } from '../lib/csv.js'
import { HOURS, setScreen, setSelected, useStore, useThemeName } from '../store.js'
import { tokens } from '../lib/theme.js'
import { VENUE_VIEWS } from '../lib/venues.js'
import { lightDirection, sunFor } from '../lib/sun.js'
import { n0, pct1 } from '../lib/format.js'

export default function MapScreen ({ data }) {
  const hour = useStore(s => s.hour)
  const budget = useStore(s => s.budget)
  const selected = useStore(s => s.selected)
  const heat = useStore(s => s.heat)
  const pitch = useStore(s => s.pitch)
  const horizon = useStore(s => s.horizon)
  const theme = useThemeName()
  const [hover, setHover] = useState(null)
  const mountedHours = useRasterWindow(hour)

  const levels = useMemo(() => budgetLevels(data.solutions, horizon), [data.solutions, horizon])
  const points = useMemo(() => curvePoints(data.solutions, levels, horizon), [data.solutions, levels, horizon])
  const solution = useMemo(() => solutionAt(data.solutions, budget, horizon), [data.solutions, budget, horizon])
  const otherSolution = useMemo(
    () => solutionAt(data.solutions, budget, horizon === 'mature' ? 'near' : 'mature'),
    [data.solutions, budget, horizon]
  )
  const funded = useMemo(() => interventionPoints(solution?.set, data.segments), [solution, data.segments])
  const treated = useMemo(() => new Set(funded.map(p => p.id)), [funded])
  const tree = data.solutions?.intervention_effectiveness?.tree || null
  const horizonNote =
    horizon === 'mature'
      ? `Mature is the same allocation counted about ${n0(tree?.maturity_years ?? 15)} years out, once the trees have grown in. It is the legacy value of this spend, not what a fan walking to a 2026 match will feel.`
      : `Near term is what the 2026 tournament actually gets. A newly planted street tree carries about ${pct1((tree?.canopy_fraction_year5 ?? 0.45) * 100)} of its mature canopy at year five, so it is credited with ${pct1((tree?.coverage_fraction_near_term_2026 ?? 0) * 100)} segment coverage here rather than ${pct1((tree?.coverage_fraction_mature ?? 0) * 100)}. Sails and awnings reach full effect immediately, so they are unchanged between the two horizons.`
  const rasterBounds = data.heat.bounds || data.meta?.raster_bounds || data.bounds
  const segment = useMemo(() => data.segments.find(s => s.id === selected) || null, [data.segments, selected])
  const onHover = useCallback(info => setHover(info), [])
  const sun = useMemo(() => sunFor(hour, data.heat), [hour, data.heat])
  const effects = useMemo(() => {
    const light = tokens().map
    return [
      new LightingEffect({
        ambient: new AmbientLight({ color: light.ambient.color, intensity: light.ambient.intensity }),
        sun: new DirectionalLight({
          color: light.sun.color,
          intensity: sun.elev > 0 ? light.sun.intensity : light.sun.night,
          direction: lightDirection(sun)
        })
      })
    ]
  }, [sun, theme])

  const corridor = useMemo(() => {
    const lo = {}
    const hi = {}
    const wbgt = {}
    const shade = {}
    for (const h of HOURS) {
      lo[h] = data.stats[h].lo
      hi[h] = data.stats[h].hi
      wbgt[h] = data.stats[h].peak_wbgt
      shade[h] = data.stats[h].shade_mean
    }
    return { degmin: data.totals, lo, hi, wbgt, shade_frac: shade }
  }, [data])

  const layers = useMemo(() => {
    const stack = data.heat.available
      ? heatLayers({ hour, hours: mountedHours, heat, urlFor: expoUrl, bounds: rasterBounds, domain: data.heat.domain, anchors: data.heat.anchors })
      : shadeLayers(hour, rasterBounds, 0.35, mountedHours)
    const fundedPaths = fundedLayer({ segments: data.segments, treated })
    const buildings = buildingLayer({ buildings: data.buildings, pitch, onHover })
    return [
      ...stack,
      ...(buildings ? [buildings] : []),
      ...(fundedPaths ? [fundedPaths] : []),
      pathCasingLayer({ segments: data.segments, selected }),
      exposureLayer({
        segments: data.segments,
        hour,
        max: data.max.all,
        selected,
        onSelect: setSelected,
        onHover
      })
    ]
  }, [hour, mountedHours, heat, pitch, rasterBounds, data, selected, treated, onHover, theme])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const exportCsv = () => {
    const ranked = data.segments.slice().sort((a, b) => (b.degmin[hour] ?? 0) - (a.degmin[hour] ?? 0))
    downloadCsv(`thermal_last_mile_segments_${hour}00.csv`, segmentsToCsv(ranked))
  }

  return (
    <div className="map-screen">
      <div className="col">
        <HourScrubber totals={data.totals} stats={data.stats} walk={data.walk} threshold={data.threshold} clock={data.clock} />
        <RankedList segments={data.segments} hour={hour} max={data.max.all} treated={treated} solution={solution} />
        <button type="button" className="continue" onClick={exportCsv}>
          Download ranked segments CSV
        </button>
      </div>
      <div className="col center">
        <div className="map-hold">
          <DeckMap
            view={VENUE_VIEWS.houston}
            bounds={data.bounds}
            layers={layers}
            effects={effects}
            pitch={pitch}
            label="Segment exposure map over the modelled heat surface"
          >
            <MapControls buildings={data.buildings} sun={sun} hour={hour} />
            <HoverCard hover={hover} hour={hour} max={data.max.all} treated={treated} anchors={data.heat.anchors} />
          </DeckMap>
        </div>
        <Legend max={data.max.all} hour={hour} heat={data.heat} threshold={data.threshold} />
        <BudgetBar
          solution={solution}
          other={otherSolution}
          levels={levels}
          points={points}
          horizons={hasMaturePath(data.solutions)}
          maturityYears={data.solutions?.intervention_effectiveness?.tree?.maturity_years}
          extreme={data.clock?.wbgt_extreme_c}
          threshold={data.threshold}
          note={horizonNote}
        />
      </div>
      <div className="col right">
        <SegmentDetail
          segment={segment}
          hour={hour}
          max={data.max.all}
          treated={segment ? treated.has(segment.id) : false}
          corridor={corridor}
          anchors={data.heat.anchors}
          threshold={data.threshold}
          worst={worstApproach(data.approaches, hour)}
          corridorLabel={`${data.segments.length} segments on ${data.approaches.length} approaches`}
        />
        <MethodsPanel meta={data.meta} solutionMethod={data.solutions?.meta?.method} heat={data.heat} />
        <EquityPanel equity={data.equity} />
        <OrganiserData uhi={data.uhi} fanVolumes={data.fanVolumes} />
        <button type="button" className="ghost" onClick={() => setScreen('ledger')}>
          Compare host cities
        </button>
      </div>
    </div>
  )
}

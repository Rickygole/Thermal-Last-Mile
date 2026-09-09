import { useCallback, useEffect, useMemo, useState } from 'react'
import { AmbientLight, DirectionalLight, LightingEffect } from '@deck.gl/core'
import DeckMap from '../components/DeckMap.jsx'
import RankedList from '../components/RankedList.jsx'
import BudgetBar from '../components/BudgetBar.jsx'
import HourScrubber from '../components/HourScrubber.jsx'
import MethodsPanel from '../components/MethodsPanel.jsx'
import SegmentDetail from '../components/SegmentDetail.jsx'
import MapControls from '../components/MapControls.jsx'
import HoverCard from '../components/HoverCard.jsx'
import Legend from '../components/Legend.jsx'
import { curvePoints } from '../components/TradeoffCurve.jsx'
import { buildingLayer, exposureLayer, fundedLayer, pathCasingLayer, shadeLayers } from '../lib/layers.js'
import { heatLayers } from '../lib/heat.js'
import { budgetLevels, expoUrl, interventionPoints, solutionAt, worstApproach } from '../lib/data.js'
import { downloadCsv, segmentsToCsv } from '../lib/csv.js'
import { HOURS, setScreen, setSelected, useStore } from '../store.js'
import { VENUE_VIEWS } from '../lib/venues.js'
import { lightDirection, sunFor } from '../lib/sun.js'

export default function MapScreen ({ data }) {
  const hour = useStore(s => s.hour)
  const budget = useStore(s => s.budget)
  const selected = useStore(s => s.selected)
  const heat = useStore(s => s.heat)
  const pitch = useStore(s => s.pitch)
  const [hover, setHover] = useState(null)

  const levels = useMemo(() => budgetLevels(data.solutions), [data.solutions])
  const points = useMemo(() => curvePoints(data.solutions, levels), [data.solutions, levels])
  const solution = useMemo(() => solutionAt(data.solutions, budget), [data.solutions, budget])
  const funded = useMemo(() => interventionPoints(solution?.set, data.segments), [solution, data.segments])
  const treated = useMemo(() => new Set(funded.map(p => p.id)), [funded])
  const rasterBounds = data.heat.bounds || data.meta?.raster_bounds || data.bounds
  const segment = useMemo(() => data.segments.find(s => s.id === selected) || null, [data.segments, selected])
  const onHover = useCallback(info => setHover(info), [])
  const sun = useMemo(() => sunFor(hour, data.heat), [hour, data.heat])
  const effects = useMemo(
    () => [
      new LightingEffect({
        ambient: new AmbientLight({ color: [190, 200, 215], intensity: 1.5 }),
        sun: new DirectionalLight({
          color: [255, 240, 214],
          intensity: sun.elev > 0 ? 1.9 : 0.5,
          direction: lightDirection(sun)
        })
      })
    ],
    [sun]
  )

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
      ? heatLayers({ hour, heat, urlFor: expoUrl, bounds: rasterBounds, domain: data.heat.domain, anchors: data.heat.anchors })
      : shadeLayers(hour, rasterBounds, 0.35)
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
  }, [hour, heat, pitch, rasterBounds, data, selected, treated, onHover])

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
        <HourScrubber totals={data.totals} stats={data.stats} walk={data.walk} threshold={data.threshold} />
        <RankedList segments={data.segments} hour={hour} max={data.max.all} treated={treated} />
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
            <MapControls buildings={data.buildings.length} sun={sun} hour={hour} />
            <HoverCard hover={hover} hour={hour} max={data.max.all} treated={treated} anchors={data.heat.anchors} />
          </DeckMap>
        </div>
        <Legend max={data.max.all} hour={hour} heat={data.heat} />
        <BudgetBar solution={solution} levels={levels} points={points} />
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
        <button type="button" className="ghost" onClick={() => setScreen('ledger')}>
          Compare host cities
        </button>
      </div>
    </div>
  )
}

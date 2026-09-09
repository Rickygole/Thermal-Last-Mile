import { useEffect, useMemo } from 'react'
import DeckMap from '../components/DeckMap.jsx'
import RankedList from '../components/RankedList.jsx'
import BudgetBar from '../components/BudgetBar.jsx'
import HourScrubber from '../components/HourScrubber.jsx'
import MethodsPanel from '../components/MethodsPanel.jsx'
import SegmentDetail from '../components/SegmentDetail.jsx'
import { exposureLayer, interventionLayer, shadeLayers } from '../lib/layers.js'
import { interventionPoints, solutionAt } from '../lib/data.js'
import { downloadCsv, segmentsToCsv } from '../lib/csv.js'
import { usePulse } from '../lib/useClock.js'
import { setScreen, setSelected, useStore } from '../store.js'
import { VENUE_VIEWS } from '../lib/venues.js'
import { exposureCss } from '../lib/color.js'

export default function MapScreen ({ data }) {
  const hour = useStore(s => s.hour)
  const budget = useStore(s => s.budget)
  const selected = useStore(s => s.selected)

  const solution = useMemo(() => solutionAt(data.solutions, budget), [data.solutions, budget])
  const points = useMemo(() => interventionPoints(solution?.set, data.segments), [solution, data.segments])
  const treated = useMemo(() => new Set(points.map(p => p.id)), [points])
  const scale = usePulse(points.length)
  const bounds = data.meta?.raster_bounds || data.bounds
  const segment = useMemo(() => data.segments.find(s => s.id === selected) || null, [data.segments, selected])

  const layers = useMemo(
    () => [
      ...shadeLayers(hour, bounds),
      exposureLayer({
        segments: data.segments,
        hour,
        max: data.max.all,
        selected,
        onSelect: setSelected
      }),
      interventionLayer({ points, scale, onSelect: setSelected })
    ],
    [hour, bounds, data, selected, points, scale]
  )

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
        <RankedList segments={data.segments} hour={hour} max={data.max.all} treated={treated} />
        <button type="button" className="continue" onClick={exportCsv}>
          Download ranked segments CSV
        </button>
      </div>
      <div className="col center">
        <div className="map-hold">
          <DeckMap view={VENUE_VIEWS.houston} bounds={data.bounds} layers={layers} label="Segment exposure map" />
        </div>
        <div className="legend panel pane" aria-label="Legend">
          <span className="item">
            <span className="swatch" style={{ background: exposureCss(0.05) }} aria-hidden="true" /> Low
          </span>
          <span className="item">
            <span className="swatch" style={{ background: exposureCss(0.5) }} aria-hidden="true" /> Moderate
          </span>
          <span className="item">
            <span className="swatch" style={{ background: exposureCss(1) }} aria-hidden="true" /> Severe
          </span>
          <span className="item">
            <span className="swatch" style={{ background: 'var(--accent)' }} aria-hidden="true" /> Funded intervention
          </span>
          <span className="spacer" />
          <button type="button" className="ghost" onClick={() => setScreen('ledger')}>
            Compare host cities
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--gap)' }}>
          <HourScrubber totals={data.totals} />
          <BudgetBar solution={solution} cap={data.solutions?.meta?.cap} step={data.solutions?.meta?.step} />
        </div>
      </div>
      <div className="col" style={{ overflowY: 'auto' }}>
        <SegmentDetail segment={segment} hour={hour} max={data.max.all} treated={segment ? treated.has(segment.id) : false} />
        <MethodsPanel meta={data.meta} solutionMethod={data.solutions?.meta?.method} />
      </div>
    </div>
  )
}

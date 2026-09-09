import { useData } from './lib/data.js'
import { useStore } from './store.js'
import ScreenNav from './components/ScreenNav.jsx'
import { ProvenanceChip, ProvisionalChip } from './components/Chips.jsx'
import EmptyState from './components/EmptyState.jsx'
import Skeleton from './components/Skeleton.jsx'
import Walk from './screens/Walk.jsx'
import MapScreen from './screens/MapScreen.jsx'
import Ledger from './screens/Ledger.jsx'
import Transfer from './screens/Transfer.jsx'
import { provenanceFor } from './lib/provenance.js'
import { n0, tempC } from './lib/format.js'

export default function App () {
  const { status, data, errors } = useData()
  const screen = useStore(s => s.screen)
  const hour = useStore(s => s.hour)

  const body = () => {
    if (status === 'loading') {
      return <Skeleton label="Reading baked pipeline products, nothing on this page is computed in the browser." />
    }
    if (!data || !data.segments.length) {
      return (
        <EmptyState
          title="No segment data found"
          body={
            errors.length
              ? `The client could not read ${errors.join(', ')}. Nothing on this screen is computed in the browser, so there is nothing to show until those files exist.`
              : 'segments.geojson loaded but contained no usable LineString features.'
          }
          hint="npm run data"
        />
      )
    }
    if (screen === 'walk') return <Walk data={data} />
    if (screen === 'map') return <MapScreen data={data} />
    if (screen === 'ledger') return <Ledger data={data} />
    return <Transfer data={data} />
  }

  const ready = Boolean(data && data.segments.length)
  const houstonScreen = screen === 'walk' || screen === 'map'
  const provenance = ready ? provenanceFor(screen, data) : null

  const topline = () => {
    if (!ready) return null
    if (houstonScreen) {
      return (
        <div className="topline" aria-label="Current view">
          <span>{hour}:00 kickoff</span>
          <span className="sep" aria-hidden="true" />
          <span>WBGT {tempC(data.threshold)} threshold</span>
          <span className="sep" aria-hidden="true" />
          <span>{n0(data.segments.length)} Houston segments</span>
        </div>
      )
    }
    if (screen === 'ledger') {
      return (
        <div className="topline" aria-label="Current view">
          <span>{n0(data.cities.length)} host cities</span>
          <span className="sep" aria-hidden="true" />
          <span>canopy and surface temperature only</span>
        </div>
      )
    }
    return (
      <div className="topline" aria-label="Current view">
        <span>Houston modelled, Los Angeles not modelled</span>
      </div>
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>Thermal Last Mile</h1>
          <span>Rail platform to stadium gate, Houston 2026</span>
        </div>
        {topline()}
        <div className="spacer" />
        <ProvenanceChip state={provenance} />
        {ready && houstonScreen && data.heat.available && data.heat.provisional ? (
          <ProvisionalChip
            label="SURFACE PROVISIONAL"
            title="The continuous surface is a placeholder field calibrated to pipeline segment output, not a pipeline raster"
          />
        ) : null}
        <ScreenNav />
      </header>
      <main className="screen">{body()}</main>
    </div>
  )
}

import { SCREENS, setScreen, useStore } from '../store.js'

const LABEL = { walk: 'The Walk', clock: 'The Clock', map: 'The Map', ledger: 'The Ledger', transfer: 'The Transfer' }

export default function ScreenNav () {
  const screen = useStore(s => s.screen)
  return (
    <nav className="nav" aria-label="Sections">
      {SCREENS.map((s, i) => (
        <button key={s} type="button" aria-current={screen === s} onClick={() => setScreen(s)}>
          {i + 1}. {LABEL[s]}
        </button>
      ))}
    </nav>
  )
}

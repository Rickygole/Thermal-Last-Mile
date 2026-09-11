import { create } from 'zustand'
import { applyTheme, resolveInitialTheme, writeStoredTheme } from './lib/theme.js'

export const SCREENS = ['walk', 'clock', 'map', 'ledger', 'transfer']

const fromHash = () => {
  if (typeof window === 'undefined') return 'walk'
  const id = window.location.hash.replace('#', '')
  return SCREENS.includes(id) ? id : 'walk'
}

const bootTheme = applyTheme(resolveInitialTheme())

export const DEFAULT_HOUR = '12'
export const DEFAULT_BUDGET = 50000

export const useStore = create(() => ({
  theme: bootTheme,
  screen: fromHash(),
  hour: DEFAULT_HOUR,
  budget: DEFAULT_BUDGET,
  selected: null,
  heat: 0.45,
  pitch: 0,
  horizon: 'near'
}))

export const setScreen = screen => {
  if (typeof window !== 'undefined' && fromHash() !== screen) window.location.hash = screen
  useStore.setState({ screen })
}

export const syncScreenFromHash = () => useStore.setState({ screen: fromHash() })
export const setHour = hour => useStore.setState({ hour })
export const setBudget = budget => useStore.setState({ budget })
export const setSelected = selected => useStore.setState({ selected })
export const setHeat = heat => useStore.setState({ heat })
export const setPitch = pitch => useStore.setState({ pitch })
export const setHorizon = horizon => useStore.setState({ horizon })

export const setTheme = name => {
  const applied = applyTheme(name)
  writeStoredTheme(applied)
  useStore.setState({ theme: applied })
}

export const useThemeName = () => useStore(s => s.theme)

export const useThemeRepaint = () => useStore(s => s.theme)

export const HOURS = ['12', '13', '14', '15', '16', '17', '18', '19', '20', '21']
export const BASELINE_HOUR = '15'
export const HORIZONS = ['near', 'mature']
export const PITCH_PLAN = 0
export const PITCH_OBLIQUE = 52

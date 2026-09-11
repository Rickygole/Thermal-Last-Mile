import { create } from 'zustand'
import { applyTheme, resolveInitialTheme, writeStoredTheme } from './lib/theme.js'
import { RASTER_HOURS } from './lib/hours.js'

export const NAV_SCREENS = ['walk', 'clock', 'map', 'transfer']
export const SCREENS = [...NAV_SCREENS, 'ledger']

const fromHash = () => {
  if (typeof window === 'undefined') return 'walk'
  const id = window.location.hash.replace('#', '')
  if (SCREENS.includes(id)) return id
  if (id) window.location.replace(`${window.location.pathname}${window.location.search}#walk`)
  return 'walk'
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

export const HOURS = RASTER_HOURS
export const BASELINE_HOUR = '15'
export const HORIZONS = ['near', 'mature']
export const PITCH_PLAN = 0
export const PITCH_OBLIQUE = 52

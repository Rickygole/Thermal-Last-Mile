import { create } from 'zustand'

export const useStore = create(() => ({
  screen: 'walk',
  hour: '17',
  budget: 750000,
  selected: null,
  heat: 0.45,
  pitch: 0
}))

export const setScreen = screen => useStore.setState({ screen })
export const setHour = hour => useStore.setState({ hour })
export const setBudget = budget => useStore.setState({ budget })
export const setSelected = selected => useStore.setState({ selected })
export const setHeat = heat => useStore.setState({ heat })
export const setPitch = pitch => useStore.setState({ pitch })

export const SCREENS = ['walk', 'map', 'ledger', 'transfer']
export const HOURS = ['15', '17', '19', '21']
export const BUDGET_STEP = 25000
export const BUDGET_CAP = 2000000
export const PITCH_PLAN = 0
export const PITCH_OBLIQUE = 52

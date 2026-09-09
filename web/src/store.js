import { create } from 'zustand'

export const useStore = create(() => ({
  screen: 'walk',
  hour: '17',
  budget: 750000,
  selected: null
}))

export const setScreen = screen => useStore.setState({ screen })
export const setHour = hour => useStore.setState({ hour })
export const setBudget = budget => useStore.setState({ budget })
export const setSelected = selected => useStore.setState({ selected })

export const SCREENS = ['walk', 'map', 'ledger', 'transfer']
export const HOURS = ['15', '17', '19', '21']
export const BUDGET_STEP = 25000
export const BUDGET_CAP = 2000000

export const THEMES = ['dark', 'light']

export const STORAGE_KEY = 'tlm.theme'

export const THEME_LABEL = { dark: 'Dark', light: 'Light' }

const DARK = {
  name: 'dark',
  basemap: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  fallbackBackground: '#15171B',
  exposure: {
    low: [151, 196, 89],
    moderate: [239, 159, 39],
    severe: [226, 75, 74]
  },
  accent: [45, 162, 187],
  field: {
    alphaFloor: 0.28,
    alphaGain: 0.72,
    alphaGamma: 1.0,
    vignette: 0.075
  },
  map: {
    buildingMeasured: [50, 57, 67, 235],
    buildingAssumed: [37, 42, 50, 190],
    buildingLine: [66, 74, 86, 170],
    buildingSpecular: [32, 36, 42],
    casing: [17, 19, 23, 205],
    highlight: [231, 233, 236, 120],
    fundedAlpha: 125,
    shadeTint: [255, 255, 255],
    trailShift: 0.35,
    ambient: { color: [190, 200, 215], intensity: 1.5 },
    sun: { color: [255, 240, 214], intensity: 1.9, night: 0.5 }
  }
}

const LIGHT = {
  name: 'light',
  basemap: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
  fallbackBackground: '#EFF1F4',
  exposure: {
    low: [78, 128, 32],
    moderate: [210, 112, 26],
    severe: [150, 18, 47]
  },
  accent: [11, 110, 133],
  field: {
    alphaFloor: 0.5,
    alphaGain: 0.45,
    alphaGamma: 0.85,
    vignette: 0.11
  },
  map: {
    buildingMeasured: [148, 155, 166, 232],
    buildingAssumed: [190, 196, 204, 188],
    buildingLine: [110, 118, 130, 180],
    buildingSpecular: [226, 230, 236],
    casing: [20, 24, 29, 216],
    highlight: [22, 26, 32, 96],
    fundedAlpha: 170,
    shadeTint: [28, 33, 41],
    trailShift: -0.22,
    ambient: { color: [225, 230, 238], intensity: 1.25 },
    sun: { color: [255, 246, 228], intensity: 1.45, night: 0.4 }
  }
}

const TABLE = { dark: DARK, light: LIGHT }

let active = DARK

export const tokens = () => active
export const activeThemeName = () => active.name
export const isTheme = value => THEMES.includes(value)

export function readStoredTheme () {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch (ignored) {
    return null
  }
}

export function writeStoredTheme (name) {
  try {
    window.localStorage.setItem(STORAGE_KEY, name)
  } catch (ignored) {
    return false
  }
  return true
}

export function preferredTheme () {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export function resolveInitialTheme () {
  if (typeof window === 'undefined') return 'dark'
  return readStoredTheme() || preferredTheme()
}

export function applyTheme (name) {
  active = TABLE[isTheme(name) ? name : 'dark']
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', active.name)
  }
  return active.name
}

export const SUN_FALLBACK = {
  10: { elev: 44.0, az: 85.41 },
  11: { elev: 57.01, az: 92.59 },
  12: { elev: 69.9, az: 103.78 },
  13: { elev: 80.98, az: 138.01 },
  14: { elev: 79.77, az: 229.83 },
  15: { elev: 67.92, az: 257.43 },
  16: { elev: 55.0, az: 267.94 },
  17: { elev: 41.99, az: 275.02 },
  18: { elev: 29.11, az: 281.16 },
  19: { elev: 16.5, az: 287.27 },
  20: { elev: 4.43, az: 293.88 },
  21: { elev: -7.29, az: 301.5 }
}

export function sunFor (hour, heat) {
  const stat = heat && heat.stats ? heat.stats[hour] : null
  if (stat && Number.isFinite(stat.sun_elevation_deg)) {
    return { elev: stat.sun_elevation_deg, az: stat.sun_azimuth_deg, stated: true }
  }
  return { ...(SUN_FALLBACK[hour] || SUN_FALLBACK[17]), stated: false }
}

export function lightDirection (sun) {
  const elev = Math.max(4, sun.elev)
  const az = (sun.az * Math.PI) / 180
  const e = (elev * Math.PI) / 180
  return [-Math.sin(az) * Math.cos(e), Math.cos(az) * Math.cos(e), -Math.sin(e)]
}

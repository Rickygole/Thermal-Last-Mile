export const SUN_FALLBACK = {
  15: { elev: 55, az: 245 },
  17: { elev: 33, az: 264 },
  19: { elev: 10, az: 283 },
  21: { elev: -6, az: 300 }
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

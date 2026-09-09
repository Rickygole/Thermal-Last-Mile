const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function longDate (iso) {
  if (typeof iso !== 'string' || iso.length < 10) return '--'
  const y = Number(iso.slice(0, 4))
  const m = Number(iso.slice(5, 7))
  const d = Number(iso.slice(8, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return iso
  return `${d} ${MONTHS[m - 1] || ''} ${y}`.trim()
}

export function shortDate (iso) {
  const long = longDate(iso)
  return long === '--' ? long : long.replace(/ \d{4}$/, '')
}

export const STAGE_LABEL = {
  group: 'Group stage',
  round_of_32: 'Round of 32',
  round_of_16: 'Round of 16',
  quarter_final: 'Quarter final',
  semi_final: 'Semi final',
  final: 'Final'
}

function peakOf (match) {
  const by = match.fans_crossing_extreme?.by_approach || {}
  return Object.values(by).reduce((m, a) => Math.max(m, a.peak_segment_wbgt_c ?? 0), 0)
}

function worstApproachOf (match) {
  const degmin = match.degmin_per_trip_by_approach || {}
  let key = null
  let value = 0
  for (const [k, v] of Object.entries(degmin)) {
    if (v >= value) {
      key = k
      value = v
    }
  }
  return { key, value }
}

export function buildRetro (retro) {
  const raw = Array.isArray(retro?.matches) ? retro.matches : []
  if (!raw.length) return null
  const matches = raw
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(m => {
      const stations = m.stations || {}
      const winds = Object.values(stations).map(s => s.wind_ms ?? null).filter(v => Number.isFinite(v))
      return {
        date: m.date,
        hour: m.kickoff_local_hour,
        stage: STAGE_LABEL[m.stage] || m.stage,
        label: m.label,
        status: m.weather_status,
        tair: m.observed_conditions_mean?.tair_c ?? null,
        tdew: m.observed_conditions_mean?.tdew_c ?? null,
        wind: m.observed_conditions_mean?.wind_ms ?? null,
        calm: winds.length > 0 && winds.every(v => v === 0),
        stationCount: Object.keys(stations).length,
        fanHours: m.fan_degree_hours_above_threshold ?? 0,
        perFan: worstApproachOf(m),
        byApproach: m.degmin_per_trip_by_approach || {},
        fansByApproach: m.fans_by_approach || {},
        fansCrossing: m.fans_crossing_extreme?.total ?? 0,
        peak: peakOf(m),
        sunElevation: m.sun_elevation_deg ?? null,
        ghi: m.ghi_full_sun_wm2 ?? null,
        shadedRoute: m.shaded_fraction_route ?? null,
        evening: m.kickoff_local_hour >= 17
      }
    })
  const measured = matches.filter(m => m.status === 'observed')
  const noon = measured.filter(m => !m.evening)
  const values = noon.map(m => m.fanHours)
  const worst = measured.reduce((a, b) => (b.fanHours > (a?.fanHours ?? -1) ? b : a), null)
  const control = matches.find(m => m.evening) || null
  const headline = measured.reduce(
    (a, m) => (m.perFan.value > (a?.perFan.value ?? -1) ? m : a),
    null
  )
  const cf = retro.counterfactual_evening_kickoff || null
  const cfRows = Array.isArray(cf?.per_match) ? cf.per_match.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))) : []
  const cfNonZero = cfRows.filter(r => (r.counterfactual_evening_fan_degree_hours_above_threshold ?? 0) > 0)
  return {
    matches,
    measured,
    noon,
    control,
    worst,
    headline,
    max: matches.reduce((m, r) => Math.max(m, r.fanHours), 0),
    spread: values.length ? { lo: Math.min(...values), hi: Math.max(...values) } : null,
    threshold: retro.wbgt_threshold_c ?? null,
    extreme: retro.wbgt_extreme_c ?? null,
    total: retro.tournament_total || null,
    counterfactual: cf ? { ...cf, rows: cfRows, nonZero: cfNonZero } : null,
    fixturesSource: retro.fixtures_source || null,
    fixturesVerified: retro.fixtures_verified_utc || null,
    notes: {
      method: retro.method_note || null,
      shade: retro.shade_rebake_note || null,
      lst: retro.lst_proxy_note || null,
      unavailable: retro.weather_unavailable_note || null
    },
    range: matches.length ? { from: matches[0].date, to: matches[matches.length - 1].date } : null
  }
}

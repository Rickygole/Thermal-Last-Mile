export const DAY_START = 600
export const DAY_END = 1320

const toHourList = weights => Object.keys(weights || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b)

function leg (raw) {
  if (!raw) return { status: 'absent', value: null, hours: [] }
  return {
    status: raw.status || 'absent',
    value: Number.isFinite(raw.fan_degree_hours) ? raw.fan_degree_hours : null,
    hours: toHourList(raw.hours_weights),
    weights: raw.hours_weights || {},
    missing: raw.missing_hours || null
  }
}

function missingText (m) {
  const parts = []
  for (const side of ['inbound', 'outbound']) {
    const missing = m[side]?.missing_hours
    if (!missing) continue
    for (const [hour, stations] of Object.entries(missing)) {
      parts.push(`${hour}:00 at ${(stations || []).join(' and ')}`)
    }
  }
  return parts
}

export function legsOf (model, kickoffHour) {
  const start = kickoffHour * 60 - model.window
  const kickoff = kickoffHour * 60
  const whistle = kickoff + model.delay
  return { start, kickoff, whistle, end: whistle + model.pulse }
}

export function buildTripModel (raw) {
  if (!raw || !Array.isArray(raw.matches) || !raw.matches.length) return null
  const window = Number(raw.arrival_window_minutes) || 120
  const delay = Number(raw.egress_delay_minutes) || 120
  const pulse = Number(raw.egress_pulse_minutes) || 45
  const base = { window, delay, pulse }
  const cfRows = raw.counterfactual_evening_kickoff_trip?.primary?.per_match || []
  const alternateHour = Number(raw.counterfactual_evening_kickoff_trip?.primary?.alternate_hour) || 19
  const cfBy = new Map(cfRows.map(r => [r.date, r]))

  const matches = raw.matches
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .map(m => {
      const inbound = leg(m.inbound)
      const outbound = leg(m.outbound)
      const hour = Number(m.kickoff_local_hour)
      const cf = cfBy.get(m.date) || null
      const cfTotal = Number.isFinite(cf?.counterfactual_evening_trip_total_fan_degree_hours_above_threshold)
        ? cf.counterfactual_evening_trip_total_fan_degree_hours_above_threshold
        : null
      return {
        date: m.date,
        hour,
        label: m.label,
        stage: m.stage,
        instant: Number.isFinite(m.kickoff_instant_fan_degree_hours_above_threshold)
          ? m.kickoff_instant_fan_degree_hours_above_threshold
          : null,
        inbound,
        outbound,
        available: m.trip_status === 'observed',
        total: Number.isFinite(m.trip_total_fan_degree_hours_above_threshold)
          ? m.trip_total_fan_degree_hours_above_threshold
          : null,
        ratio: Number.isFinite(m.ratio_trip_to_kickoff_instant) ? m.ratio_trip_to_kickoff_instant : null,
        ratioNote: m.ratio_note || null,
        reason: m.unavailable_reason || null,
        missing: missingText(m),
        evening: hour >= 17,
        inRate: leg(m.inbound).value === null ? null : leg(m.inbound).value / window,
        outRate: leg(m.outbound).value === null ? null : leg(m.outbound).value / pulse,
        clock: legsOf(base, hour),
        alternateClock: legsOf(base, alternateHour),
        alternateTotal: hour === alternateHour ? null : cfTotal,
        alternateInstant: null
      }
    })

  const playable = matches.filter(m => m.available)
  const best = playable.reduce((a, m) => ((m.total ?? 0) > (a?.total ?? -1) ? m : a), null)

  return {
    ...base,
    alternateHour,
    matches,
    playable,
    excluded: matches.filter(m => !m.available),
    defaultDate: best ? best.date : playable[0]?.date || matches[0].date,
    threshold: Number.isFinite(raw.wbgt_threshold_c) ? raw.wbgt_threshold_c : null,
    arrivalShape: raw.arrival_density_shape || null,
    egressShape: raw.egress_density_shape || null,
    sensitivity: Array.isArray(raw.arrival_window_sensitivity_minutes) ? raw.arrival_window_sensitivity_minutes : [],
    tournament: raw.tournament_trip_total || null,
    counterfactual: raw.counterfactual_evening_kickoff_trip?.primary || null,
    counterfactualNote: raw.counterfactual_evening_kickoff_trip?.note || null,
    notes: {
      assumption: raw.assumption_note || null,
      method: raw.method_note || null,
      unavailable: raw.weather_unavailable_note || null
    },
    generated: raw.generated_utc || null
  }
}

export function actualCurve (match) {
  if (!match || !match.available) return null
  const c = match.clock
  const inbound = match.inbound.value ?? 0
  const outbound = match.outbound.value ?? 0
  return [
    { t: c.start, v: 0 },
    { t: c.kickoff, v: inbound },
    { t: c.whistle, v: inbound },
    { t: c.end, v: inbound + outbound }
  ]
}

export function alternateBand (match) {
  if (!match || !Number.isFinite(match.alternateTotal)) return null
  const c = match.alternateClock
  const total = match.alternateTotal
  return {
    total,
    clock: c,
    upper: [
      { t: c.start, v: 0 },
      { t: c.kickoff, v: total },
      { t: c.whistle, v: total },
      { t: c.end, v: total }
    ],
    lower: [
      { t: c.start, v: 0 },
      { t: c.kickoff, v: 0 },
      { t: c.whistle, v: 0 },
      { t: c.end, v: total }
    ]
  }
}

export function valueAt (curve, minute) {
  if (!curve || !curve.length) return null
  if (minute <= curve[0].t) return 0
  const last = curve[curve.length - 1]
  if (minute >= last.t) return last.v
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1]
    const b = curve[i]
    if (minute <= b.t) {
      const span = b.t - a.t
      return span > 0 ? a.v + ((b.v - a.v) * (minute - a.t)) / span : b.v
    }
  }
  return last.v
}

export function phaseAt (match, minute) {
  const c = match.clock
  if (minute < c.start) return 'before'
  if (minute < c.kickoff) return 'arrival'
  if (minute < c.whistle) return 'stadium'
  if (minute <= c.end) return 'egress'
  return 'after'
}

export const PHASE_LABEL = {
  before: 'before the arrival window',
  arrival: 'arrival window, walking in',
  stadium: 'in the stadium, corridor empty',
  egress: 'egress pulse, walking out',
  after: 'after the egress pulse'
}

export function clockLabel (minute) {
  const total = Math.max(0, Math.round(minute))
  const h = Math.floor(total / 60)
  const m = total - h * 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function hourOf (minute) {
  return String(Math.min(21, Math.max(10, Math.floor(minute / 60))))
}

export function sameSixInstant (retrospective, tripModel) {
  const rows = retrospective?.counterfactual_evening_kickoff?.per_match
  if (!Array.isArray(rows) || !tripModel) return null
  const included = new Set(tripModel.playable.map(m => m.date))
  const kept = rows.filter(r => included.has(r.date))
  if (!kept.length) return null
  const held = tripModel.playable.filter(m => !kept.some(r => r.date === m.date))
  const actual = kept.reduce((a, r) => a + (r.actual_fan_degree_hours_above_threshold ?? 0), 0) +
    held.reduce((a, m) => a + (m.instant ?? 0), 0)
  const alternate = kept.reduce((a, r) => a + (r.counterfactual_evening_fan_degree_hours_above_threshold ?? 0), 0) +
    held.reduce((a, m) => a + (m.instant ?? 0), 0)
  return {
    dates: kept.length + held.length,
    actual,
    alternate,
    removed: actual - alternate,
    fraction: actual > 0 ? (actual - alternate) / actual : null
  }
}

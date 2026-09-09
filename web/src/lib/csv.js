import { BASELINE_HOUR, HOURS } from '../store.js'

const cell = v => {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function segmentsToCsv (segments) {
  const head = [
    'rank_at_hour',
    'id',
    'name',
    'approach',
    'len_m',
    'fans',
    'canopy_pct',
    'svi',
    'treatable',
    ...HOURS.flatMap(h => [`degmin_${h}`, `degmin_lo_${h}`, `degmin_hi_${h}`, `wbgt_${h}`, `shade_frac_${h}`]),
    `fan_degmin_${BASELINE_HOUR}00`
  ]
  const rows = segments.map((s, i) => [
    i + 1,
    s.id,
    s.name,
    s.approach,
    s.len_m,
    s.fans,
    s.canopy_pct,
    s.svi,
    (s.treatable || []).join(' '),
    ...HOURS.flatMap(h => [s.degmin[h], s.degmin_lo?.[h], s.degmin_hi?.[h], s.wbgt?.[h], s.shade_frac?.[h]]),
    Math.round((s.degmin[BASELINE_HOUR] ?? 0) * s.fans)
  ])
  return `${[head, ...rows].map(r => r.map(cell).join(',')).join('\n')}\n`
}

export function downloadCsv (filename, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

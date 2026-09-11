const SERIES_KEYS = [
  'dollar_weighted_mean_svi_curve',
  'dollar_weighted_mean_svi_by_budget',
  'dollar_weighted_svi_by_budget',
  'dollar_weighted_mean_svi_series',
  'dollar_weighted_series',
  'svi_by_budget',
  'series',
  'curve',
  'by_budget_usd'
]

const BUDGET_KEYS = ['budget_usd', 'budget', 'usd', 'level_usd', 'level', 'cap_usd']
const SPENT_KEYS = ['spent', 'spent_usd', 'dollars_allocated']
const WEIGHTED_KEYS = ['dollar_weighted_mean_svi', 'dollar_weighted_svi', 'mean_svi_dollar_weighted', 'dollar_weighted_mean_svi_funded']
const MEMBERSHIP_KEYS = ['mean_svi_funded', 'mean_svi', 'value']

const firstFinite = values => values.find(v => Number.isFinite(v))
const firstString = values => values.find(v => typeof v === 'string' && v.trim().length > 0)

function pick (row, keys) {
  for (const k of keys) {
    if (Number.isFinite(row?.[k])) return row[k]
  }
  return null
}

function entriesOf (container) {
  if (Array.isArray(container)) return container.map(v => [null, v])
  if (container && typeof container === 'object') return Object.entries(container)
  return []
}

function baselineOf (opt) {
  const explicit = firstFinite([
    opt.baseline_mean_svi,
    opt.baseline_mean_svi_all_segments,
    opt.baseline_mean_svi_all_172_segments,
    opt.baseline
  ])
  if (Number.isFinite(explicit)) return explicit
  for (const [k, v] of Object.entries(opt)) {
    if (Number.isFinite(v) && /^baseline/.test(k) && /svi/.test(k) && /mean/.test(k)) return v
  }
  return null
}

export function equitySeries (equity) {
  const opt = equity?.optimizer_equity && typeof equity.optimizer_equity === 'object' ? equity.optimizer_equity : equity
  if (!opt || typeof opt !== 'object') return null
  let rows = []
  let weighted = false
  for (const key of SERIES_KEYS) {
    const entries = entriesOf(opt[key])
    if (!entries.length) continue
    const built = []
    let usedWeighted = false
    for (const [k, raw] of entries) {
      const row = typeof raw === 'number' ? { value: raw } : raw
      if (!row || typeof row !== 'object') continue
      const budget = pick(row, BUDGET_KEYS) ?? (k === null ? null : Number(k))
      if (!Number.isFinite(budget)) continue
      const w = pick(row, WEIGHTED_KEYS)
      const value = Number.isFinite(w) ? w : pick(row, MEMBERSHIP_KEYS)
      if (!Number.isFinite(value)) continue
      if (Number.isFinite(w)) usedWeighted = true
      built.push({
        budget,
        value,
        spent: pick(row, SPENT_KEYS),
        funded: pick(row, ['n_unique_segments_funded', 'n_segments_funded', 'n_funded']),
        total: pick(row, ['n_total_segments', 'n_segments'])
      })
    }
    if (built.length) {
      rows = built.sort((a, b) => a.budget - b.budget)
      weighted = usedWeighted
      break
    }
  }
  const baseline = baselineOf(opt)
  const saturation = firstFinite([
    opt.saturation_budget_usd,
    opt.saturation?.budget_usd,
    opt.saturation_budget,
    opt.saturation_usd
  ])
  const note = firstString([
    opt.comparison_validity_note,
    opt.below_saturation_note,
    opt.series_note,
    opt.curve_note,
    opt.saturation_note
  ])
  if (!rows.length) {
    return {
      rows: [],
      weighted: false,
      baseline,
      saturation,
      note,
      point: firstFinite([opt.dollar_weighted_mean_svi_at_full_cap, opt.dollar_weighted_mean_svi]),
      verdict: firstString([opt.verdict]),
      method: firstString([opt.method])
    }
  }
  const below = Number.isFinite(saturation) ? rows.filter(r => r.budget <= saturation) : rows
  const scope = below.length > 1 ? below : rows
  const values = scope.map(r => r.value)
  const gaps = Number.isFinite(baseline) ? values.map(v => v - baseline) : []
  const gapLo = gaps.length ? Math.min(...gaps) : null
  const gapHi = gaps.length ? Math.max(...gaps) : null
  return {
    rows,
    below,
    scope,
    weighted,
    baseline,
    saturation,
    note,
    first: scope[0],
    last: scope[scope.length - 1],
    min: Math.min(...values),
    max: Math.max(...values),
    gapLo,
    gapHi,
    gapFactor: gapLo !== null && gapLo > 0 ? gapHi / gapLo : null,
    scopedBelow: below.length > 1 && below.length !== rows.length,
    crossesBaseline: gapLo !== null && gapLo < 0 && gapHi > 0,
    point: firstFinite([opt.dollar_weighted_mean_svi_at_full_cap, opt.dollar_weighted_mean_svi]),
    verdict: firstString([opt.verdict]),
    method: firstString([opt.method])
  }
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function methodCounts (citiesMethod) {
  const cities = citiesMethod && citiesMethod.cities ? Object.values(citiesMethod.cities) : []
  const fields = new Map()
  for (const city of cities) {
    for (const [key, value] of Object.entries(city)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      if (!('is_proxy' in value)) continue
      const row = fields.get(key) || { field: key, measured: 0, proxy: 0, unstated: 0 }
      if (value.is_proxy === true) row.proxy += 1
      else if (value.is_proxy === false) row.measured += 1
      else row.unstated += 1
      fields.set(key, row)
    }
  }
  return { total: cities.length, fields: [...fields.values()] }
}

function houstonState (data) {
  const meta = data.meta
  if (!meta || !Array.isArray(meta.sources) || !meta.sources.length) {
    return {
      tone: 'unverified',
      label: 'PROVENANCE UNSTATED',
      detail: 'meta.json lists no input products, so nothing on this screen can be traced back to a source.'
    }
  }
  if (meta.provisional === true) {
    return {
      tone: 'proxy',
      label: 'PROVISIONAL PIPELINE OUTPUT',
      detail: 'meta.json marks this run as provisional, so the numbers are not final pipeline output.'
    }
  }
  const substituted = meta.sources.filter(s => s.substitution_note).length
  const detail = substituted
    ? `${plural(meta.sources.length, 'input product', 'input products')} listed in meta.json, ${plural(substituted, 'one carries', 'carry')} a documented substitution. Open the methods panel on the map screen.`
    : `${plural(meta.sources.length, 'input product', 'input products')} listed in meta.json with provider and licence for each.`
  return { tone: 'observed', label: 'OBSERVED INPUTS', detail }
}

function ledgerState (data) {
  const method = data.citiesMethod
  if (!method) {
    return {
      tone: 'unverified',
      label: 'LEDGER METHOD UNPUBLISHED',
      detail: 'cities_method.json did not load, so the per field provenance of this table cannot be shown.'
    }
  }
  const counts = methodCounts(method)
  const proxied = counts.fields.filter(f => f.proxy > 0).map(f => f.field.replace(/_/g, ' '))
  return {
    tone: 'proxy',
    label: 'PROXY METHOD, NOT THE HOUSTON MODEL',
    detail: proxied.length
      ? `Fields carrying proxy or assumed values: ${proxied.join(', ')}. Full per field sources and limitations are at the bottom of this screen.`
      : 'Per field sources and limitations are listed at the bottom of this screen.'
  }
}

function transferState (data) {
  if (data.laSegments.length) {
    return {
      tone: 'observed',
      label: 'LOS ANGELES CORRIDOR EXTRACTED',
      detail: data.laSource ? `Los Angeles geometry source: ${data.laSource}` : 'Los Angeles geometry loaded from a committed extraction.'
    }
  }
  return {
    tone: 'illustrative',
    label: 'ILLUSTRATIVE, NO MEASURED LOS ANGELES DATA',
    detail: 'No Los Angeles corridor has been extracted or modelled. The right hand panel is deliberately empty rather than drawn from invented geometry.'
  }
}

function clockState (data) {
  const retro = data.retrospective
  const measured = Array.isArray(retro?.matches) ? retro.matches.filter(m => m.weather_status === 'observed').length : 0
  if (measured) {
    return {
      tone: 'observed',
      label: 'MEASURED ON PLAYED FIXTURES',
      detail: `${plural(measured, 'match', 'matches')} measured on their own observed weather and own date sun geometry. Fixtures: ${
        retro.fixtures_source || 'source unstated'
      }${retro.fixtures_verified_utc ? `, verified ${retro.fixtures_verified_utc}` : ''}. The hour sweep lower down the screen is a separate forward looking tool.`
    }
  }
  if (!data.clock) {
    return {
      tone: 'unverified',
      label: 'NO MEASURED MATCHES, NO SWEEP',
      detail: 'Neither retrospective.json nor kickoff_clock.json loaded, so this screen has nothing to show.'
    }
  }
  return {
    tone: 'illustrative',
    label: 'HOURS SWEPT, MATCHES NOT LOADED',
    detail: `retrospective.json did not load, so only the generalized hour sweep is available. ${data.clock.fixture_binding_note}`
  }
}

export function provenanceFor (screen, data) {
  if (!data) return null
  if (screen === 'clock') return clockState(data)
  if (screen === 'ledger') return ledgerState(data)
  if (screen === 'transfer') return transferState(data)
  return houstonState(data)
}

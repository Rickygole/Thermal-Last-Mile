export function ObservedChip () {
  return (
    <span className="chip observed">
      <span className="dot" aria-hidden="true" />
      OBSERVED INPUTS
    </span>
  )
}

export function ProvisionalChip ({ label = 'PROVISIONAL DATA', title }) {
  return (
    <span className="chip provisional" title={title || 'Placeholder values, pipeline output pending'}>
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  )
}

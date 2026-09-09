export function ObservedChip () {
  return (
    <span className="chip observed">
      <span className="dot" aria-hidden="true" />
      OBSERVED
    </span>
  )
}

export function ProvisionalChip () {
  return (
    <span className="chip provisional" title="Placeholder geometry and values, pipeline output pending">
      <span className="dot" aria-hidden="true" />
      PROVISIONAL DATA
    </span>
  )
}

export function ProvisionalChip ({ label = 'PROVISIONAL DATA', title }) {
  return (
    <span className="chip provisional" title={title || 'Placeholder values, pipeline output pending'}>
      <span className="dot" aria-hidden="true" />
      {label}
    </span>
  )
}

export function ProvenanceChip ({ state, className = '', quiet = false }) {
  if (!state) return null
  return (
    <span className={`chip ${state.tone} ${className}`.trim()} title={state.detail}>
      <span className="dot" aria-hidden="true" />
      {state.label}
      {quiet ? null : <span className="sr-only">. {state.detail}</span>}
    </span>
  )
}

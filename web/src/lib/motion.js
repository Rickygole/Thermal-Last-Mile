const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

export const reducedMotion = () => Boolean(query && query.matches)

export const ms = value => (reducedMotion() ? 0 : value)

export function arrowSelect (event, values, current, apply, refs) {
  const i = values.indexOf(current)
  if (i < 0) return
  let next = null
  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = Math.min(values.length - 1, i + 1)
  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = Math.max(0, i - 1)
  if (event.key === 'Home') next = 0
  if (event.key === 'End') next = values.length - 1
  if (next === null || next === i) return
  event.preventDefault()
  apply(values[next])
  const node = refs && refs.current ? refs.current[next] : null
  if (node && node.focus) node.focus()
}

import { useCallback, useEffect, useRef, useState } from 'react'

export function useOverflow () {
  const ref = useRef(null)
  const [more, setMore] = useState(false)

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    setMore(el.scrollHeight - el.clientHeight - el.scrollTop > 12)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    let ro = null
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(measure)
      ro.observe(el)
      for (const child of el.children) ro.observe(child)
    }
    return () => {
      el.removeEventListener('scroll', measure)
      window.removeEventListener('resize', measure)
      if (ro) ro.disconnect()
    }
  }, [measure])

  return [ref, more]
}

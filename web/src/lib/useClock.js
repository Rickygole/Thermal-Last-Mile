import { useEffect, useRef, useState } from 'react'

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function useLoopClock (duration, active) {
  const [time, setTime] = useState(0)
  const frame = useRef(0)
  useEffect(() => {
    if (!active) return undefined
    if (reduced()) {
      setTime(duration * 0.35)
      return undefined
    }
    const start = performance.now()
    const tick = now => {
      setTime((now - start) % duration)
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame.current)
  }, [duration, active])
  return time
}

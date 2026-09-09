import { useMemo, useRef } from 'react'
import { HOURS, setSelected, useStore } from '../store.js'
import { BAND_LABEL, exposureBand, exposureCss } from '../lib/color.js'
import { n0, n1, n2 } from '../lib/format.js'

function MicroHours ({ segment, max }) {
  return (
    <span className="micro" aria-hidden="true">
      {HOURS.map(h => {
        const v = segment.degmin[h] ?? 0
        const t = max > 0 ? v / max : 0
        return (
          <span key={h} className="mh">
            <span style={{ height: `${Math.max(8, Math.round(t * 100))}%`, background: v > 0 ? exposureCss(t) : '#39414C' }} />
          </span>
        )
      })}
    </span>
  )
}

export default function RankedList ({ segments, hour, max, treated }) {
  const selected = useStore(s => s.selected)
  const listRef = useRef(null)
  const exceeded = useMemo(() => segments.some(s => (s.degmin[hour] ?? 0) > 0), [segments, hour])
  const ranked = useMemo(() => {
    const copy = segments.slice()
    copy.sort((a, b) =>
      exceeded
        ? (b.degmin[hour] ?? 0) - (a.degmin[hour] ?? 0)
        : (b.wbgt?.[hour] ?? 0) - (a.wbgt?.[hour] ?? 0)
    )
    return copy
  }, [segments, hour, exceeded])

  if (!ranked.length) {
    return (
      <section className="panel pane" aria-label="Ranked segments">
        <div className="pane-head">
          <h3>Ranked segments</h3>
        </div>
        <p className="label">segments.geojson loaded no usable LineString features, so there is nothing to rank.</p>
      </section>
    )
  }

  const onKeyDown = e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const nodes = [...listRef.current.querySelectorAll('button')]
    const i = nodes.indexOf(document.activeElement)
    if (i < 0) return
    e.preventDefault()
    const next = nodes[Math.max(0, Math.min(nodes.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))]
    if (next) next.focus()
  }

  return (
    <section className="panel pane ranked-pane" aria-label="Ranked segments">
      <div className="pane-head">
        <h3>Worst segments at {hour}:00</h3>
        <span className="label">{exceeded ? 'degmin per fan' : 'WBGT C'}</span>
      </div>
      {exceeded ? null : (
        <p className="notice">
          Degree-minutes are zero for every segment at {hour}:00, so there is nothing to rank on the exposure metric. The list falls
          back to modelled WBGT so the order still carries information.
        </p>
      )}
      <ul className="ranked" ref={listRef} onKeyDown={onKeyDown}>
        {ranked.map((s, i) => {
          const v = s.degmin[hour] ?? 0
          const t = v / max
          const band = exposureBand(t)
          const isTreated = treated.has(s.id)
          return (
            <li key={s.id}>
              <button
                type="button"
                className="rank-row"
                aria-pressed={selected === s.id}
                onClick={() => setSelected(selected === s.id ? null : s.id)}
              >
                <span className="idx">{i + 1}</span>
                <span className="who">
                  <span className="name">{s.name}</span>
                  <span className="sub">
                    {exceeded ? BAND_LABEL[band] : `${n1(s.wbgt?.[hour] ?? 0)} C`}, {n0(s.fans)} fans, {n0(s.len_m)} m
                    {isTreated ? ', funded' : ''}
                  </span>
                </span>
                <MicroHours segment={s} max={max} />
                <span className="val">
                  {exceeded ? n2(v) : n1(s.wbgt?.[hour] ?? 0)}
                  <span className="swatch" style={{ background: exposureCss(t) }} aria-hidden="true" />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <p className="label">
        {ranked.length} segments, {exceeded ? 'ranked by degree-minutes' : 'ranked by WBGT'}. Four ticks per row are the four kickoff
        hours.
      </p>
    </section>
  )
}

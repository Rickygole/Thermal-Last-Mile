import { useMemo } from 'react'
import { setSelected, useStore } from '../store.js'
import { BAND_LABEL, exposureBand, exposureCss } from '../lib/color.js'
import { n0, n2 } from '../lib/format.js'

export default function RankedList ({ segments, hour, max, treated }) {
  const selected = useStore(s => s.selected)
  const ranked = useMemo(
    () => segments.slice().sort((a, b) => (b.degmin[hour] ?? 0) - (a.degmin[hour] ?? 0)),
    [segments, hour]
  )

  if (!ranked.length) {
    return (
      <section className="panel pane" aria-label="Ranked segments">
        <h3>Worst segments</h3>
        <p className="label">No segments loaded.</p>
      </section>
    )
  }

  return (
    <section className="panel pane" aria-label="Ranked segments" style={{ minHeight: 0, flex: 1 }}>
      <div className="pane-head">
        <h3>Worst segments at {hour}:00</h3>
        <span className="label">degmin per fan</span>
      </div>
      <ul className="ranked">
        {ranked.slice(0, 40).map((s, i) => {
          const t = (s.degmin[hour] ?? 0) / max
          const band = exposureBand(t)
          return (
            <li key={s.id}>
              <button
                type="button"
                className="rank-row"
                aria-pressed={selected === s.id}
                onClick={() => setSelected(selected === s.id ? null : s.id)}
              >
                <span className="idx">{i + 1}</span>
                <span>
                  <span className="name">{s.name}</span>
                  <br />
                  <span className="sub">
                    {BAND_LABEL[band]}, {n0(s.fans)} fans{treated.has(s.id) ? ', treated' : ''}
                  </span>
                </span>
                <span className="val">
                  {n2(s.degmin[hour] ?? 0)}
                  <span className="swatch" style={{ background: exposureCss(t) }} aria-hidden="true" />
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

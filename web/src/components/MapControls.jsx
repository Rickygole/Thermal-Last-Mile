import { useRef } from 'react'
import { PITCH_OBLIQUE, PITCH_PLAN, setHeat, setPitch, useStore } from '../store.js'
import { arrowSelect } from '../lib/keys.js'
import { pct } from '../lib/format.js'

const VIEWS = [
  { value: PITCH_PLAN, label: 'Plan' },
  { value: PITCH_OBLIQUE, label: 'Oblique' }
]

export default function MapControls ({ buildings }) {
  const heat = useStore(s => s.heat)
  const pitch = useStore(s => s.pitch)
  const refs = useRef([])
  const values = VIEWS.map(v => v.value)

  return (
    <section className="panel map-controls" aria-label="Map view controls">
      <div className="mc-row">
        <label htmlFor="heat-opacity">Heat surface</label>
        <span className="label">{pct(heat * 100)}</span>
      </div>
      <input
        id="heat-opacity"
        type="range"
        min="0"
        max="100"
        step="5"
        value={Math.round(heat * 100)}
        aria-valuetext={`${Math.round(heat * 100)} percent opacity`}
        onChange={e => setHeat(Number(e.target.value) / 100)}
      />
      <div className="mc-row">
        <span className="label" id="camera-label">
          Camera
        </span>
        <span className="label">{pitch > 2 ? `${pitch} degrees` : 'plan'}</span>
      </div>
      <div className="seg" role="group" aria-labelledby="camera-label" onKeyDown={e => arrowSelect(e, values, pitch, setPitch, refs)}>
        {VIEWS.map((v, i) => (
          <button
            key={v.label}
            type="button"
            ref={el => {
              refs.current[i] = el
            }}
            aria-pressed={pitch === v.value}
            onClick={() => setPitch(v.value)}
          >
            {v.label}
          </button>
        ))}
      </div>
      <p className="label">
        {buildings
          ? `${buildings} building footprints extruded from height, the physical cause of the shade pattern below.`
          : 'No building footprints loaded, so extrusion is unavailable.'}
      </p>
    </section>
  )
}

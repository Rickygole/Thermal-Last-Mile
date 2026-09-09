import { methodCounts } from '../lib/provenance.js'
import { n0 } from '../lib/format.js'

const humanise = key => key.replace(/_/g, ' ').replace(/\bpct\b/, 'percent').replace(/\bc\b/, 'celsius')

const isScalar = v => typeof v === 'string' || typeof v === 'number'

function StatusTag ({ isProxy }) {
  if (isProxy === false) return <span className="tag measured">Measured</span>
  if (isProxy === true) return <span className="tag assumed">Proxy or assumed</span>
  return <span className="tag unstated">Not stated</span>
}

function ScalarRows ({ value }) {
  const rows = Object.entries(value).filter(([k, v]) => k !== 'is_proxy' && isScalar(v))
  if (!rows.length) return null
  return (
    <dl className="field-rows">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{humanise(k)}</dt>
          <dd>{String(v)}</dd>
        </div>
      ))}
    </dl>
  )
}

function ListRows ({ value }) {
  const lists = Object.entries(value).filter(([, v]) => Array.isArray(v) && v.length)
  if (!lists.length) return null
  return (
    <>
      {lists.map(([k, items]) => (
        <details key={k} className="scenes">
          <summary>
            {n0(items.length)} {humanise(k)}
          </summary>
          <ul>
            {items.map((item, i) => (
              <li key={i}>
                {item && typeof item === 'object'
                  ? Object.entries(item)
                      .filter(([, v]) => isScalar(v))
                      .map(([ik, iv]) => `${humanise(ik)} ${iv}`)
                      .join(', ')
                  : String(item)}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </>
  )
}

function CityBlock ({ id, city, name }) {
  const fields = Object.entries(city).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && 'is_proxy' in v)
  const other = Object.entries(city).filter(([, v]) => isScalar(v))
  const nested = Object.entries(city).filter(([, v]) => v && typeof v === 'object' && !Array.isArray(v) && !('is_proxy' in v))
  return (
    <details className="city-method">
      <summary>
        <span className="cm-name">{name || humanise(id)}</span>
        <span className="cm-tags">
          {fields.map(([k, v]) => (
            <span key={k} className="cm-pair">
              {humanise(k)} <StatusTag isProxy={v.is_proxy} />
            </span>
          ))}
        </span>
      </summary>
      {other.length || nested.length ? (
        <dl className="field-rows">
          {other.map(([k, v]) => (
            <div key={k}>
              <dt>{humanise(k)}</dt>
              <dd>{String(v)}</dd>
            </div>
          ))}
          {nested.map(([k, v]) => (
            <div key={k}>
              <dt>{humanise(k)}</dt>
              <dd>
                {Object.entries(v)
                  .filter(([, iv]) => isScalar(iv))
                  .map(([ik, iv]) => `${humanise(ik)} ${iv}`)
                  .join(', ')}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {fields.map(([k, v]) => (
        <section key={k} className="field">
          <div className="field-head">
            <h5>{humanise(k)}</h5>
            <StatusTag isProxy={v.is_proxy} />
          </div>
          <ScalarRows value={v} />
          <ListRows value={v} />
        </section>
      ))}
    </details>
  )
}

export default function CityMethods ({ method, cities }) {
  if (!method) {
    return (
      <section className="panel pane city-methods" aria-label="Ledger methods and limitations">
        <div className="pane-head">
          <h3>Methods and limitations</h3>
        </div>
        <p className="label">
          cities_method.json did not load. Without it there is no per field record of which of these numbers were measured and
          which were assumed, so treat the whole table as unverified.
        </p>
      </section>
    )
  }
  const counts = methodCounts(method)
  const nameOf = id => (cities || []).find(c => c.id === id)?.name || null
  const summary = method.method_summary || {}
  const limits = Array.isArray(method.known_limitations) ? method.known_limitations : []
  const entries = Object.entries(method.cities || {})

  return (
    <section className="panel pane city-methods" aria-label="Ledger methods and limitations">
      <div className="pane-head">
        <h3>Methods and limitations, field by field</h3>
        <span className="label">from cities_method.json, rendered verbatim</span>
      </div>
      {method.purpose ? <p className="lede">{method.purpose}</p> : null}

      {counts.fields.length ? (
        <table className="coverage">
          <caption className="label">What was measured and what was assumed, across {n0(counts.total)} cities</caption>
          <thead>
            <tr>
              <th scope="col">Field</th>
              <th scope="col">Measured</th>
              <th scope="col">Proxy or assumed</th>
              <th scope="col">Not stated</th>
            </tr>
          </thead>
          <tbody>
            {counts.fields.map(f => (
              <tr key={f.field}>
                <th scope="row">{humanise(f.field)}</th>
                <td>{n0(f.measured)}</td>
                <td className={f.proxy ? 'warn' : ''}>{n0(f.proxy)}</td>
                <td className={f.unstated ? 'warn' : ''}>{n0(f.unstated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {Object.keys(summary).length ? (
        <div className="src">
          <div className="label">How each field was produced</div>
          <dl className="field-rows">
            {Object.entries(summary)
              .filter(([, v]) => isScalar(v))
              .map(([k, v]) => (
                <div key={k}>
                  <dt>{humanise(k)}</dt>
                  <dd>{String(v)}</dd>
                </div>
              ))}
          </dl>
        </div>
      ) : null}

      {limits.length ? (
        <div className="src">
          <div className="label">What this method does not do, uncorrected</div>
          <ul className="limits">
            {limits.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {entries.length ? (
        <div className="src">
          <div className="label">Per city record, expand any city for its sources and caveats</div>
          <div className="city-methods-list">
            {entries.map(([id, city]) => (
              <CityBlock key={id} id={id} city={city} name={nameOf(id)} />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}

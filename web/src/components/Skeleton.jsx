export default function Skeleton ({ label }) {
  return (
    <div className="skeleton" role="status" aria-live="polite">
      <div className="sk-col">
        <div className="panel sk-panel tall">
          <span className="sk-line w40" />
          <span className="sk-line w70" />
          <span className="sk-line w55" />
          <span className="sk-line w80" />
          <span className="sk-line w60" />
        </div>
      </div>
      <div className="sk-col">
        <div className="panel sk-panel map" />
        <div className="panel sk-panel short" />
        <div className="sk-row">
          <div className="panel sk-panel mid" />
          <div className="panel sk-panel mid" />
        </div>
      </div>
      <div className="sk-col">
        <div className="panel sk-panel tall">
          <span className="sk-line w60" />
          <span className="sk-line w80" />
          <span className="sk-line w45" />
        </div>
      </div>
      <p className="sk-label">{label}</p>
    </div>
  )
}

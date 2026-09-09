export default function EmptyState ({ title, body, hint }) {
  return (
    <div className="empty" role="status">
      <h3>{title}</h3>
      {body ? <p>{body}</p> : null}
      {hint ? <code>{hint}</code> : null}
    </div>
  )
}

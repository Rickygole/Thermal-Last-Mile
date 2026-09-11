import { Component } from 'react'

export default class ScreenBoundary extends Component {
  constructor (props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError (error) {
    return { error }
  }

  componentDidUpdate (prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }

  render () {
    if (!this.state.error) return this.props.children
    return (
      <div className="empty" role="alert">
        <h3>This section could not be drawn</h3>
        <p>
          Something in this screen failed while rendering, so it has been replaced rather than taking the rest of the application
          with it. The navigation, the theme control and every other screen still work. Nothing was recomputed and no data was
          changed.
        </p>
        <code>{String(this.state.error?.message || this.state.error)}</code>
        <button type="button" className="ghost" onClick={() => this.setState({ error: null })}>
          Try drawing it again
        </button>
      </div>
    )
  }
}

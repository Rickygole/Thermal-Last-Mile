export default function Disclaimer () {
  return (
    <footer className="disclaimer">
      <p className="dc-lead">
        Student research prototype. Modelled estimates from public data, not an engineering assessment and not a basis for safety
        or capital decisions.
      </p>
      <details className="dc-more">
        <summary>Full limitations and affiliation notice</summary>
        <div className="dc-body">
          <p>
            Figures are modelled estimates from public data with stated substitutions and uncertainties, and are not validated
            against field measurement of wet bulb globe temperature. Segment rankings indicate modelled relative exposure only and
            do not establish that any location is or is not safe. Verify independently before acting. No warranty.
          </p>
          <p>
            Wet bulb globe temperature thresholds are population level occupational guidance. Nothing here is medical advice and
            nothing here describes any individual's heat risk.
          </p>
          <p>
            Not affiliated with, authorised by, or endorsed by FIFA, NRG Park, Houston METRO, or any host city. Venue and
            competition names are used descriptively to identify the places and events analysed.
          </p>
        </div>
      </details>
    </footer>
  )
}

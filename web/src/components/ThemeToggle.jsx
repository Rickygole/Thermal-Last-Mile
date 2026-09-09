import { useRef } from 'react'
import { setTheme, useThemeName } from '../store.js'
import { THEMES, THEME_LABEL } from '../lib/theme.js'
import { arrowSelect } from '../lib/keys.js'

export default function ThemeToggle () {
  const theme = useThemeName()
  const refs = useRef([])

  return (
    <div
      className="seg theme-toggle"
      role="group"
      aria-label="Colour theme"
      onKeyDown={e => arrowSelect(e, THEMES, theme, setTheme, refs)}
    >
      {THEMES.map((name, i) => (
        <button
          key={name}
          type="button"
          ref={el => {
            refs.current[i] = el
          }}
          aria-pressed={theme === name}
          onClick={() => setTheme(name)}
        >
          <span className={`theme-mark ${name}`} aria-hidden="true" />
          {THEME_LABEL[name]}
        </button>
      ))}
    </div>
  )
}

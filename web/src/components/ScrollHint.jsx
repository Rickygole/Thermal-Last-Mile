import { createElement } from 'react'

export default function ScrollHint ({ show, tag = 'div', tone = 'page' }) {
  return createElement(
    tag,
    { className: `scroll-hint on-${tone}${show ? ' is-on' : ''}`, 'aria-hidden': 'true' },
    createElement('span', { className: 'sh-pill' }, 'more below')
  )
}

import { readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import Ledger from './src/screens/Ledger.jsx'
import MethodsPanel from './src/components/MethodsPanel.jsx'
import { provenanceFor } from './src/lib/provenance.js'

const read = n => JSON.parse(readFileSync(`public/data/${n}`, 'utf8'))
const cities = read('cities.json')
const method = read('cities_method.json')
const meta = read('meta.json')

const data = {
  segments: [{ id: 'a' }],
  cities,
  citiesMethod: method,
  meta,
  threshold: meta.wbgt_threshold_c,
  laSegments: [],
  laSource: null
}

const html = renderToString(<Ledger data={data} />)
console.log('LEDGER OK', html.length)
console.log(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 20000))
console.log('---METHODS---')
console.log(renderToString(<MethodsPanel meta={meta} solutionMethod="greedy" heat={null} />).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 20000))
console.log('---PROVENANCE---')
for (const s of ['walk', 'ledger', 'transfer']) console.log(s, JSON.stringify(provenanceFor(s, data)))

import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(here, '..', '..', 'data', 'out')
const DEST = resolve(here, '..', 'public', 'data')
const KEEP = ['buildings.geojson']

function listFiles (dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter(name => !name.startsWith('.') && statSync(resolve(dir, name)).isFile())
}

function main () {
  if (!existsSync(SRC)) {
    process.stderr.write(`no pipeline output at ${SRC}, run the pipeline first\n`)
    process.exit(1)
  }
  mkdirSync(DEST, { recursive: true })
  const source = listFiles(SRC)
  const existing = listFiles(DEST)
  const copied = []
  const removed = []

  for (const name of source) {
    copyFileSync(resolve(SRC, name), resolve(DEST, name))
    copied.push(name)
  }
  for (const name of existing) {
    if (source.includes(name) || KEEP.includes(name)) continue
    rmSync(resolve(DEST, name))
    removed.push(name)
  }

  process.stdout.write(`copied ${copied.length} files from data/out\n`)
  if (removed.length) process.stdout.write(`removed ${removed.length} file(s) with no pipeline source: ${removed.join(', ')}\n`)
  process.stdout.write(`kept locally fetched ${KEEP.join(', ')}, refresh with npm run buildings\n`)
}

main()

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const METHOD_FILE = 'cities_method.json'
const pipelineCopy = resolve(process.cwd(), '..', 'data', 'out', METHOD_FILE)
const publicCopy = resolve(process.cwd(), 'public', 'data', METHOD_FILE)

function methodFallback () {
  return {
    name: 'cities-method-fallback',
    configureServer (server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith(`/data/${METHOD_FILE}`)) return next()
        if (existsSync(publicCopy) || !existsSync(pipelineCopy)) return next()
        res.setHeader('Content-Type', 'application/json')
        res.end(readFileSync(pipelineCopy))
      })
    },
    generateBundle () {
      if (existsSync(publicCopy) || !existsSync(pipelineCopy)) return
      this.emitFile({ type: 'asset', fileName: `data/${METHOD_FILE}`, source: readFileSync(pipelineCopy) })
    }
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), methodFallback()],
  build: { target: 'es2022', assetsInlineLimit: 0 }
})

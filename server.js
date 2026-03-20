#!/usr/bin/env node
import { createServer } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { execFile } from 'node:child_process'
import { readFile, stat } from 'node:fs/promises'
import { join, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import tls from 'node:tls'

// Self-signed PVE certs akzeptieren
tls.DEFAULT_REJECT_UNAUTHORIZED = 0

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const DIST = join(__dirname, 'dist')
const PORT = parseInt(process.argv[2] || process.env.PORT || '8080', 10)

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.ico':  'image/x-icon',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
}

// ── Static file serving ──
async function serveStatic(req, res) {
  let url = req.url.split('?')[0]
  // Strip base path /proxarr/ if present
  url = url.replace(/^\/proxarr/, '')
  if (url === '' || url === '/') url = '/index.html'

  const filePath = join(DIST, url)
  // Prevent path traversal
  if (!filePath.startsWith(DIST)) { res.writeHead(403); return res.end() }

  try {
    const s = await stat(filePath)
    if (!s.isFile()) throw new Error('not a file')
    const data = await readFile(filePath)
    res.writeHead(200, { 'content-type': MIME[extname(filePath)] || 'application/octet-stream', 'cache-control': url === '/index.html' ? 'no-cache' : 'public, max-age=31536000, immutable' })
    res.end(data)
  } catch {
    // SPA fallback → index.html
    try {
      const html = await readFile(join(DIST, 'index.html'))
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' })
      res.end(html)
    } catch {
      res.writeHead(404); res.end('Not Found')
    }
  }
}

// ── pct mountpoints endpoint ──
function handlePctMountpoints(req, res) {
  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    let body
    try { body = JSON.parse(Buffer.concat(chunks).toString()) } catch { res.writeHead(400); return res.end('{"error":"invalid json"}') }
    const vmid = Number(body.vmid)
    if (!vmid || vmid < 100 || vmid > 999999999) { res.writeHead(400); return res.end('{"error":"invalid vmid"}') }
    const args = ['set', String(vmid)]
    for (const [k, v] of Object.entries(body)) {
      if (/^mp\d$/.test(k) && typeof v === 'string' && v.length < 500) {
        args.push(`-${k}`, v)
      }
    }
    if (args.length <= 2) { res.writeHead(400); return res.end('{"error":"no mount points"}') }
    const rh = { 'content-type': 'application/json', 'access-control-allow-origin': '*' }
    execFile('/usr/sbin/pct', args, { timeout: 15000 }, (err, stdout, stderr) => {
      if (err) { res.writeHead(500, rh); return res.end(JSON.stringify({ error: stderr || err.message })) }
      res.writeHead(200, rh); res.end(JSON.stringify({ ok: true, stdout }))
    })
  })
}

// ── PVE API Proxy ──
function handlePveProxy(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
      'access-control-max-age': '86400',
    })
    return res.end()
  }

  const target = req.headers['x-pve-target']
  if (!target) {
    res.writeHead(400, { 'content-type': 'application/json' })
    return res.end('{"error":"X-PVE-Target header missing"}')
  }

  const [host, port = '8006'] = target.split(':')
  const apiPath = req.url.replace(/^\/pve-api/, '/api2/json')

  const chunks = []
  req.on('data', c => chunks.push(c))
  req.on('end', () => {
    const body = Buffer.concat(chunks)
    const fwdHeaders = { accept: 'application/json' }
    for (const h of ['authorization', 'content-type', 'cookie', 'csrfpreventiontoken']) {
      if (req.headers[h]) fwdHeaders[h] = req.headers[h]
    }
    if (body.length) fwdHeaders['content-length'] = String(body.length)

    const proxyReq = httpsRequest({
      hostname: host,
      port: Number(port),
      path: apiPath,
      method: req.method,
      headers: fwdHeaders,
      rejectUnauthorized: false,
      requestCert: false,
      agent: false,
    }, proxyRes => {
      const rh = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': '*',
      }
      if (proxyRes.headers['content-type']) rh['content-type'] = proxyRes.headers['content-type']
      if (proxyRes.headers['set-cookie'])   rh['set-cookie']   = proxyRes.headers['set-cookie']
      res.writeHead(proxyRes.statusCode, rh)
      proxyRes.pipe(res)
    })

    proxyReq.on('error', err => {
      if (!res.headersSent) {
        res.writeHead(502, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: err.message }))
      }
    })

    if (body.length) proxyReq.write(body)
    proxyReq.end()
  })
}

// ── Router ──
const server = createServer((req, res) => {
  const url = req.url.split('?')[0]
  if (url === '/pve-local/pct-mountpoints' && req.method === 'POST') return handlePctMountpoints(req, res)
  if (url.startsWith('/pve-api')) return handlePveProxy(req, res)
  return serveStatic(req, res)
})

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🚀 proxarr running at http://0.0.0.0:${PORT}\n`)
})

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Explicit allowlist prevents serving repository files, credentials, or traversal paths.
const routes = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/styles.css', ['styles.css', 'text/css']], ['/src/app.js', ['src/app.js', 'text/javascript']],
  ['/src/exact.js', ['src/exact.js', 'text/javascript']], ['/src/calculator.js', ['src/calculator.js', 'text/javascript']],
  ['/data/demo.js', ['data/demo.js', 'text/javascript']]
]);
export function makeServer() {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return;
    }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
    const asset = routes.get(pathname);
    if (!asset) { res.writeHead(404); res.end('Not found'); return; }
    try {
      const data = await readFile(new URL(asset[0], import.meta.url));
      res.writeHead(200, { 'Content-Type': `${asset[1]}; charset=utf-8` });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { res.writeHead(500); res.end('Unable to load page'); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  makeServer().listen(port, '127.0.0.1', () => console.log(`Prototype available at http://localhost:${port}`));
}

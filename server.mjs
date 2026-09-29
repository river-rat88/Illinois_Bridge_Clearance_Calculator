import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildDirectory } from './src/directory.js';
import { createMorrisService } from './src/morris-service.js';
import { createEjeService } from './src/eje-service.js';
import { createHenryService } from './src/henry-service.js';
import { createLincolnService } from './src/lincoln-service.js';
import { createLaSalleGroupServices } from './src/lasalle-group-service.js';

const readJson = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const [inventory, extension, henryReference, morrisReference, ejeReference, lincolnReference, centralReference, lasalleReference, peruReference, sources, coveragePlan] = await Promise.all(['./data/research/bridge-inventory.json','./data/research/scope-extension.json','./data/henry-bridge-reference.json','./data/morris-bridge-reference.json','./data/eje-bridge-reference.json','./data/lincoln-bridge-reference.json','./data/il-illinois-central-lasalle-bridge-reference.json','./data/il-lasalle-bridge-reference.json','./data/il-peru-bridge-reference.json','./data/research/sources.json','./data/bridge-coverage-plan.json'].map(readJson));
const directory = buildDirectory(inventory, extension, [henryReference, morrisReference, ejeReference, lincolnReference, centralReference, lasalleReference, peruReference], sources, coveragePlan);

// Explicit allowlist prevents serving repository files, credentials, or traversal paths.
const routes = new Map([
  ['/', ['index.html', 'text/html']], ['/index.html', ['index.html', 'text/html']],
  ['/demo', ['demo.html', 'text/html']], ['/demo.html', ['demo.html', 'text/html']],
  ['/directory.css', ['directory.css', 'text/css']], ['/src/directory.js', ['src/directory.js', 'text/javascript']], ['/src/coverage.js', ['src/coverage.js', 'text/javascript']], ['/src/directory-page.js', ['src/directory-page.js', 'text/javascript']],
  ['/styles.css', ['styles.css', 'text/css']], ['/src/app.js', ['src/app.js', 'text/javascript']],
  ['/src/exact.js', ['src/exact.js', 'text/javascript']], ['/src/calculator.js', ['src/calculator.js', 'text/javascript']],
  ['/data/demo.js', ['data/demo.js', 'text/javascript']],
  ['/henry', ['henry.html', 'text/html']], ['/henry.html', ['henry.html', 'text/html']],
  ['/henry.css', ['henry.css', 'text/css']], ['/src/henry-page.js', ['src/henry-page.js', 'text/javascript']]
]);
export function makeServer({ henryService = createHenryService({ ...(process.env.HENRY_DATA_DIR ? { directory: process.env.HENRY_DATA_DIR } : {}) }) , morrisService = createMorrisService({ ...(process.env.MORRIS_DATA_DIR ? {directory:process.env.MORRIS_DATA_DIR} : {}) }), ejeService = createEjeService({ ...(process.env.EJE_DATA_DIR ? {directory:process.env.EJE_DATA_DIR} : {}) }), lincolnService = createLincolnService({ ...(process.env.LINCOLN_DATA_DIR ? {directory:process.env.LINCOLN_DATA_DIR} : {}) }) } = {}) {
  const group = createLaSalleGroupServices(lincolnService);
  const services = {'/api/henry':henryService,'/api/morris':morrisService,'/api/eje':ejeService,'/api/lincoln':lincolnService,
    '/api/illinois-central-lasalle':group['il-illinois-central-lasalle'], '/api/lasalle':group['il-lasalle'], '/api/peru':group['il-peru']};
  if (directory.pilots.length !== Object.keys(services).length || directory.pilots.some(p=>!services[p.endpoint])) throw new Error('PILOT_SERVICE_REGISTRY_MISMATCH');
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }); res.end('Method not allowed'); return;
    }
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/api/bridges') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify(directory)); return;
    }
    if (services[pathname]) {
      try {
        const receipt = await services[pathname].get();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify(receipt));
      } catch {
        res.writeHead(503, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ error: 'Gauge source record unavailable' }));
      }
      return;
    }
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

/** Servidor estático mínimo para ver la página en local: npm run dev */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, normalize } from 'node:path';
import { leerMarcas, guardarMarca, modoAlmacen, MARCAS_VALIDAS } from '../lib/almacen.mjs';

const RAIZ = resolve(import.meta.dirname, '../public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };

const json = (res, codigo, cuerpo) => {
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(cuerpo));
};

createServer(async (req, res) => {
  const ruta = normalize(decodeURIComponent(req.url.split('?')[0]));

  // Misma API que en Vercel, para poder probar las marcas compartidas en local.
  if (ruta === '/api/marcas') {
    try {
      if (req.method === 'GET') return json(res, 200, { modo: modoAlmacen(), marcas: await leerMarcas() });
      if (req.method === 'POST') {
        const trozos = [];
        for await (const t of req) trozos.push(t);
        const { codigo, marca = null, por = '' } = JSON.parse(Buffer.concat(trozos).toString() || '{}');
        if (!codigo) return json(res, 400, { error: 'Falta el código.' });
        if (marca !== null && !MARCAS_VALIDAS.has(marca)) return json(res, 400, { error: 'Marca desconocida.' });
        return json(res, 200, { ok: true, codigo, registro: await guardarMarca(codigo, marca, por) });
      }
      return json(res, 405, { error: 'Método no permitido.' });
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }

  const archivo = join(RAIZ, ruta === '/' ? 'index.html' : ruta);
  if (!archivo.startsWith(RAIZ)) { res.writeHead(403).end('No'); return; }
  try {
    const cuerpo = await readFile(archivo);
    res.writeHead(200, { 'Content-Type': TIPOS[extname(archivo)] ?? 'application/octet-stream' });
    res.end(cuerpo);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No existe');
  }
}).listen(3000, () => console.log('http://localhost:3000'));

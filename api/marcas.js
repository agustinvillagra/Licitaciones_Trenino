/**
 * API de marcas compartidas.
 *
 *   GET  /api/marcas            → { modo, marcas: { codigo: {marca, por, cuando} } }
 *   POST /api/marcas            → body { codigo, marca, por }   (marca null = borrar)
 *
 * Vercel toma cualquier archivo de /api como función serverless sin
 * configuración extra. No hay framework.
 */

import { leerMarcas, guardarMarca, modoAlmacen, MARCAS_VALIDAS } from '../lib/almacen.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  try {
    if (req.method === 'GET') {
      return res.status(200).json({ modo: modoAlmacen(), marcas: await leerMarcas() });
    }

    if (req.method === 'POST') {
      const cuerpo = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body ?? {});
      const { codigo, marca = null, por = '' } = cuerpo;

      if (!codigo) return res.status(400).json({ error: 'Falta el código de la licitación.' });
      if (marca !== null && !MARCAS_VALIDAS.has(marca)) {
        return res.status(400).json({ error: `Marca desconocida: ${marca}` });
      }

      const registro = await guardarMarca(codigo, marca, por);
      return res.status(200).json({ ok: true, codigo, registro });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (e) {
    console.error('Error en /api/marcas:', e);
    return res.status(500).json({ error: e.message });
  }
}

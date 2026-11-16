/**
 * Almacén compartido de las marcas (favorita, postulada, descartada).
 *
 * Usa Upstash Redis por su API REST, que es la base que Vercel ofrece gratis
 * en su marketplace. Al conectarla, Vercel inyecta solo estas dos variables:
 *
 *   KV_REST_API_URL
 *   KV_REST_API_TOKEN
 *
 * Si no están configuradas, el almacén cae a un archivo local. Eso permite
 * desarrollar sin base de datos y que la página siga funcionando aunque la
 * base no esté conectada todavía.
 *
 * Los datos viven en un hash de Redis: clave = código de licitación,
 * valor = JSON con la marca, quién la puso y cuándo.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const HASH = 'trenino:marcas';
const ARCHIVO_LOCAL = resolve(import.meta.dirname, '../.datos-locales/marcas.json');

export const MARCAS_VALIDAS = new Set(['favorita', 'postulada', 'descartada']);

const hayRedis = () => Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function redis(comando) {
  const res = await fetch(process.env.KV_REST_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.KV_REST_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(comando),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Redis respondió ${res.status}: ${await res.text()}`);
  const { result, error } = await res.json();
  if (error) throw new Error(`Redis: ${error}`);
  return result;
}

/* ---------- respaldo en archivo, para desarrollo local ---------- */

async function leerArchivo() {
  try {
    return JSON.parse(await readFile(ARCHIVO_LOCAL, 'utf8'));
  } catch {
    return {};
  }
}

async function escribirArchivo(datos) {
  await mkdir(dirname(ARCHIVO_LOCAL), { recursive: true });
  await writeFile(ARCHIVO_LOCAL, JSON.stringify(datos, null, 2), 'utf8');
}

/** El error que se devuelve cuando no hay dónde guardar de verdad. */
export class SinAlmacen extends Error {
  constructor() {
    super(
      'No hay base de datos conectada. Conecta Upstash for Redis en el panel ' +
        'de Vercel (Storage → Create Database) para que las marcas se compartan.'
    );
    this.name = 'SinAlmacen';
  }
}

/* ---------- interfaz pública ---------- */

/** Todas las marcas: { codigo: { marca, por, cuando } }. */
export async function leerMarcas() {
  if (!hayRedis()) return leerArchivo();

  // HGETALL devuelve un arreglo plano [campo, valor, campo, valor, …]
  const plano = (await redis(['HGETALL', HASH])) ?? [];
  const salida = {};
  for (let i = 0; i < plano.length; i += 2) {
    try {
      salida[plano[i]] = JSON.parse(plano[i + 1]);
    } catch {
      salida[plano[i]] = { marca: plano[i + 1] };
    }
  }
  return salida;
}

/**
 * Pone o quita una marca.
 * Si `marca` es null, la borra. Devuelve el registro resultante o null.
 */
export async function guardarMarca(codigo, marca, por = '') {
  if (!codigo) throw new Error('Falta el código de la licitación.');
  if (marca !== null && !MARCAS_VALIDAS.has(marca)) {
    throw new Error(`Marca desconocida: ${marca}`);
  }

  const registro = marca === null ? null : { marca, por: por.slice(0, 60), cuando: new Date().toISOString() };

  if (!hayRedis()) {
    // En desarrollo esto escribe un archivo. En producción el disco es de
    // solo lectura, así que falla y se avisa con claridad en vez de romper.
    const datos = await leerArchivo();
    if (registro) datos[codigo] = registro;
    else delete datos[codigo];
    try {
      await escribirArchivo(datos);
    } catch {
      throw new SinAlmacen();
    }
    return registro;
  }

  if (registro) await redis(['HSET', HASH, codigo, JSON.stringify(registro)]);
  else await redis(['HDEL', HASH, codigo]);
  return registro;
}

/** Para que la página sepa si está guardando compartido o solo en el navegador. */
export const modoAlmacen = () => (hayRedis() ? 'compartido' : 'local');

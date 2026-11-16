/**
 * Actualiza data/licitaciones.json con las licitaciones abiertas que interesan
 * a Trenino. Lo corre GitHub Actions una vez al día.
 *
 * Flujo:
 *   1. Pide a la API las licitaciones activas (una sola llamada, ~5.000).
 *   2. Filtra por nombre con las reglas de lib/filtros.mjs.
 *   3. Baja el detalle solo de las que no conocía: organismo, región, ítems.
 *   4. Marca cuáles son nuevas respecto de la corrida anterior.
 *   5. Guarda el JSON que lee la página.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { licitacionesActivas, detalle, enlacePublico } from '../lib/api.mjs';
import { clasificar, sector, diasParaCierre, TIPOS } from '../lib/filtros.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIVO = resolve(RAIZ, 'public/data/licitaciones.json');
const HILOS = 3; // más que esto y la API devuelve 429

/** Corre fn sobre cada elemento con como máximo `limite` en vuelo. */
async function enParalelo(elementos, limite, fn) {
  const resultados = [];
  let siguiente = 0;
  const trabajadores = Array.from({ length: Math.min(limite, elementos.length) }, async () => {
    while (siguiente < elementos.length) {
      const i = siguiente++;
      resultados[i] = await fn(elementos[i], i);
    }
  });
  await Promise.all(trabajadores);
  return resultados;
}

async function leerPrevio() {
  try {
    return JSON.parse(await readFile(ARCHIVO, 'utf8'));
  } catch {
    return { licitaciones: [] };
  }
}

/** Arma el registro que se guarda, mezclando el listado con el detalle. */
function construir(base, det, hoy) {
  const comprador = det?.Comprador ?? {};
  const organismo = comprador.NombreOrganismo ?? '';
  const { linea, motivo } = clasificar(base.Nombre, organismo);
  const items = (det?.Items?.Listado ?? []).map((it) => ({
    producto: it.NombreProducto ?? '',
    descripcion: (it.Descripcion ?? '').slice(0, 400),
    cantidad: it.Cantidad ?? null,
    unidad: it.UnidadMedida ?? '',
  }));
  return {
    codigo: base.CodigoExterno,
    nombre: base.Nombre ?? '',
    linea,
    motivo,
    organismo,
    unidad: comprador.NombreUnidad ?? '',
    sector: sector(organismo),
    region: comprador.RegionUnidad ?? '',
    comuna: comprador.ComunaUnidad ?? '',
    tipo: det?.Tipo ?? '',
    tipoDescripcion: TIPOS[det?.Tipo] ?? '',
    descripcion: (det?.Descripcion ?? '').slice(0, 600),
    fechaPublicacion: (det?.Fechas?.FechaPublicacion ?? '').slice(0, 10),
    fechaCierre: base.FechaCierre ?? det?.Fechas?.FechaCierre ?? null,
    montoEstimado: det?.MontoEstimado ?? null,
    moneda: det?.Moneda ?? 'CLP',
    items,
    enlace: enlacePublico(base.CodigoExterno),
    vistaPrimeraVez: hoy,
  };
}

async function main() {
  const inicio = Date.now();
  const hoy = new Date().toISOString().slice(0, 10);

  const previo = await leerPrevio();
  const conocidas = new Map((previo.licitaciones ?? []).map((l) => [l.codigo, l]));

  console.log('Consultando licitaciones activas…');
  const activas = await licitacionesActivas();
  if (!activas.length) throw new Error('La API no devolvió licitaciones activas.');
  console.log(`  ${activas.length} activas en todo ChileCompra`);

  // Primer filtro: solo por nombre, sin gastar llamadas de detalle.
  const candidatas = activas.filter((l) => clasificar(l.Nombre).linea !== null);
  console.log(`  ${candidatas.length} pasan el filtro de nombre`);

  // Solo bajamos el detalle de las que no conocíamos.
  const nuevas = candidatas.filter((l) => !conocidas.has(l.CodigoExterno));
  console.log(`  ${nuevas.length} nuevas, bajando su detalle…`);

  const detalles = await enParalelo(nuevas, HILOS, async (l, i) => {
    const d = await detalle(l.CodigoExterno);
    if ((i + 1) % 10 === 0) console.log(`    ${i + 1}/${nuevas.length}`);
    return d;
  });

  const registros = [];
  nuevas.forEach((l, i) => {
    const r = construir(l, detalles[i], hoy);
    // El detalle puede revelar que el organismo la descarta (salud, academia).
    if (r.linea !== null) registros.push(r);
  });

  // Las que ya conocíamos siguen vigentes mientras aparezcan en activas.
  for (const l of candidatas) {
    const anterior = conocidas.get(l.CodigoExterno);
    if (anterior) registros.push({ ...anterior, fechaCierre: l.FechaCierre ?? anterior.fechaCierre });
  }

  const ahora = new Date();
  for (const r of registros) {
    r.diasParaCierre = diasParaCierre(r.fechaCierre, ahora);
    r.nueva = r.vistaPrimeraVez === hoy;
  }
  registros.sort((a, b) => new Date(a.fechaCierre ?? 0) - new Date(b.fechaCierre ?? 0));

  const salida = {
    actualizado: ahora.toISOString(),
    totalActivasChileCompra: activas.length,
    resumen: {
      escolar: registros.filter((r) => r.linea === 'escolar').length,
      corporativo: registros.filter((r) => r.linea === 'corporativo').length,
      nuevasHoy: registros.filter((r) => r.nueva).length,
    },
    licitaciones: registros,
  };

  await mkdir(dirname(ARCHIVO), { recursive: true });
  await writeFile(ARCHIVO, `${JSON.stringify(salida, null, 2)}\n`, 'utf8');

  console.log(
    `\nListo en ${Math.round((Date.now() - inicio) / 1000)}s — ` +
      `${salida.resumen.escolar} escolares, ${salida.resumen.corporativo} corporativas, ` +
      `${salida.resumen.nuevasHoy} nuevas hoy.`
  );
}

main().catch((e) => {
  console.error('\nFalló la actualización:', e.message);
  process.exit(1);
});

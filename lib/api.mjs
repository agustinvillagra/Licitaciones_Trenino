/**
 * Cliente de la API pública de Mercado Público (ChileCompra).
 *
 * El ticket se lee de la variable de entorno TICKET_MERCADO_PUBLICO.
 * Nunca se escribe en el código ni se publica: vive en los secretos del
 * repositorio y solo lo usa el proceso que corre en GitHub Actions.
 */

const BASE = 'https://api.mercadopublico.cl/servicios/v1/publico/licitaciones.json';
const REINTENTOS = 6;

function ticket() {
  const t = process.env.TICKET_MERCADO_PUBLICO;
  if (!t) {
    throw new Error(
      'Falta la variable de entorno TICKET_MERCADO_PUBLICO. ' +
        'En local: exportála antes de correr. En GitHub: Settings > Secrets and variables > Actions.'
    );
  }
  return t;
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Hace una consulta con reintentos.
 * La API responde 429 cuando se la aprieta y un cuerpo con Codigo 10500
 * cuando detecta peticiones simultáneas. Ambos se reintentan con espera
 * creciente; el resto de los errores también, por si es un corte de red.
 */
async function consultar(query) {
  const url = `${BASE}?${query}&ticket=${ticket()}`;
  for (let intento = 0; intento < REINTENTOS; intento++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      if (res.status === 429 || res.status === 503) {
        await dormir(1500 * (intento + 1) + Math.random() * 500);
        continue;
      }
      const datos = await res.json();
      if (datos?.Codigo === 10500) {
        await dormir(1500 * (intento + 1) + Math.random() * 500);
        continue;
      }
      if (datos?.Codigo === 203) throw new Error('El ticket de Mercado Público no es válido.');
      return datos;
    } catch (error) {
      if (String(error.message).includes('ticket')) throw error;
      await dormir(1500 + 1500 * intento);
    }
  }
  return null;
}

/** Todas las licitaciones abiertas a postulación en este momento. */
export async function licitacionesActivas() {
  const datos = await consultar('estado=activas');
  return datos?.Listado ?? [];
}

/** Detalle completo de una licitación, por su código externo. */
export async function detalle(codigo) {
  const datos = await consultar(`codigo=${encodeURIComponent(codigo)}`);
  return datos?.Listado?.[0] ?? null;
}

/** Enlace a la ficha pública de la licitación. */
export function enlacePublico(codigo) {
  return `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${encodeURIComponent(codigo)}`;
}

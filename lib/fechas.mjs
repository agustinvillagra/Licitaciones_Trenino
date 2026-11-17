/**
 * Fechas de Mercado Público.
 *
 * La API devuelve las fechas sin zona horaria: `2026-11-17T17:00:00`. Son hora
 * de Chile, pero `new Date()` las interpreta en la zona de la máquina, así que
 * el mismo dato daba resultados distintos según dónde corriera el script: bien
 * en un computador en Chile, tres horas corrido en GitHub Actions, que trabaja
 * en UTC. Un cierre mal leído por tres horas puede costar una postulación.
 *
 * Acá se interpretan siempre como hora de Chile y se guardan con el desfase
 * explícito (`2026-11-17T17:00:00-03:00`), que es lo que después lee el
 * navegador sin ambigüedad.
 *
 * Chile cambia de hora dos veces al año, así que el desfase no es fijo: se
 * consulta con Intl, que conoce las reglas de la zona.
 */

const ZONA = 'America/Santiago';

const partes = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA,
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** Los componentes de fecha y hora que marca el reloj chileno en el instante t. */
function enChile(t) {
  const p = {};
  for (const { type, value } of partes.formatToParts(t)) p[type] = value;
  // Con hour12:false, la medianoche puede venir como "24".
  p.hour = String(Number(p.hour) % 24).padStart(2, '0');
  return p;
}

/** Desfase de Chile respecto de UTC, en milisegundos, en el instante t. */
function desfase(t) {
  const p = enChile(t);
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
}

/**
 * Convierte el texto de la API en el instante real.
 * Si el texto ya trae zona horaria, se respeta tal cual.
 */
export function aInstante(texto) {
  if (!texto) return null;

  if (/(?:Z|[+-]\d{2}:?\d{2})$/.test(texto)) {
    const d = new Date(texto);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const m = String(texto).match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/
  );
  if (!m) return null;
  const [, a, mes, dia, h = '0', min = '0', s = '0'] = m;

  // Se arma el instante como si los componentes fueran UTC y después se le
  // resta el desfase. Se hace dos veces porque la primera pasada usa el
  // desfase de un instante aproximado, que puede caer al otro lado de un
  // cambio de hora; la segunda ya lo calcula sobre el instante corregido.
  const comoUTC = Date.UTC(+a, +mes - 1, +dia, +h, +min, +s);
  let t = comoUTC;
  for (let i = 0; i < 2; i++) t = comoUTC - desfase(t);

  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * El mismo momento, escrito con el desfase explícito.
 * `2026-11-17T17:00:00` → `2026-11-17T17:00:00-03:00`
 */
export function aISO(texto) {
  const d = aInstante(texto);
  if (!d) return null;

  const off = desfase(d.getTime());
  const signo = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const hh = String(Math.floor(abs / 3_600_000)).padStart(2, '0');
  const mm = String(Math.floor((abs % 3_600_000) / 60_000)).padStart(2, '0');

  const p = enChile(d.getTime());
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}${signo}${hh}:${mm}`;
}

/** Para mostrar: "17 nov, 17:00", siempre en hora de Chile. */
export function formatear(texto, conHora = true) {
  const d = aInstante(texto);
  if (!d) return '—';
  const fecha = d.toLocaleDateString('es-CL', {
    timeZone: ZONA,
    day: '2-digit',
    month: 'short',
  });
  if (!conHora) return fecha;
  const hora = d.toLocaleTimeString('es-CL', {
    timeZone: ZONA,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${fecha}, ${hora}`;
}

/**
 * Diagnóstico de configuración: /api/diagnostico
 *
 * Dice qué variables de entorno relacionadas con bases de datos existen en el
 * despliegue, SIN mostrar sus valores. Sirve para saber si la base quedó
 * conectada y, si no, cuál se creó por error.
 */

const GRUPOS = {
  'Upstash Redis (la que necesita este proyecto)': [
    'KV_REST_API_URL',
    'KV_REST_API_TOKEN',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN',
  ],
  'Postgres o Neon': ['POSTGRES_URL', 'DATABASE_URL', 'NEON_DATABASE_URL', 'POSTGRES_PRISMA_URL'],
  'Vercel Blob': ['BLOB_READ_WRITE_TOKEN'],
  'Edge Config': ['EDGE_CONFIG'],
};

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const presentes = {};
  for (const [grupo, nombres] of Object.entries(GRUPOS)) {
    const hay = nombres.filter((n) => Boolean(process.env[n]));
    if (hay.length) presentes[grupo] = hay;
  }

  const listo = Boolean(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
  );

  res.status(200).json({
    baseConectada: listo,
    variablesEncontradas: presentes,
    queHacer: listo
      ? 'Todo en orden: las marcas se guardan compartidas.'
      : Object.keys(presentes).length
        ? 'Hay una base conectada, pero no es Upstash Redis. En Vercel: Storage → ' +
          'Create Database → Upstash for Redis (plan Free) → Connect to Project, y después redeploy.'
        : 'No hay ninguna base conectada, o falta redeployar después de conectarla. ' +
          'Las variables de entorno solo llegan a las funciones en un despliegue nuevo.',
    entorno: process.env.VERCEL_ENV ?? 'local',
    node: process.version,
  });
}

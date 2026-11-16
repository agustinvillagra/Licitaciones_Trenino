/**
 * Envía el resumen de las licitaciones nuevas del día.
 *
 * Corre después de actualizar.mjs y solo manda correo si hay novedades: si no
 * hay licitaciones nuevas, no molesta a nadie.
 *
 * Hay dos formas de enviar y elige sola la que esté configurada:
 *
 *   1. Gmail (recomendada). Manda desde una cuenta real de Gmail por SMTP, así
 *      que llega a cualquier destinatario sin verificar dominios.
 *        GMAIL_USUARIO    la cuenta, por ejemplo comunicaciones.trenino@gmail.com
 *        GMAIL_CLAVE_APP  contraseña de aplicación de 16 caracteres, no la del correo
 *
 *   2. Resend. Más prolija si algún día se verifica un dominio propio, pero
 *      mientras no lo haya solo deja enviar al dueño de la cuenta.
 *        RESEND_API_KEY
 *
 * Comunes:
 *   CORREO_DESTINO   uno o varios, separados por coma
 *   CORREO_ORIGEN    opcional; nombre y dirección del remitente
 *   SITIO_URL        opcional; el enlace "ver todas" del correo
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import nodemailer from 'nodemailer';

const RAIZ = resolve(import.meta.dirname, '..');
const porGmail = () => Boolean(process.env.GMAIL_USUARIO && process.env.GMAIL_CLAVE_APP);

const ORIGEN =
  process.env.CORREO_ORIGEN ||
  (porGmail()
    ? `Licitaciones Trenino <${process.env.GMAIL_USUARIO}>`
    : 'Licitaciones Trenino <onboarding@resend.dev>');
const SITIO = process.env.SITIO_URL || '';

const pesos = (n) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
    : null;

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function fecha(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) +
        ' ' +
        d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function tarjeta(l) {
  const monto = pesos(l.montoEstimado);
  const linea = l.linea === 'escolar' ? 'Uniforme escolar' : 'Vestuario corporativo';
  const color = l.linea === 'escolar' ? '#1f3864' : '#6b5b3e';
  return `
  <tr><td style="padding:0 0 12px">
    <table width="100%" cellpadding="0" cellspacing="0"
           style="border:1px solid #e4e6ea;border-radius:10px;border-collapse:separate">
      <tr><td style="padding:14px 16px">
        <div style="font:600 11px/1.4 system-ui,sans-serif;color:${color};text-transform:uppercase;letter-spacing:.04em">
          ${linea}
        </div>
        <div style="font:600 15px/1.4 system-ui,sans-serif;color:#111214;margin:4px 0 6px">
          ${escapar(l.nombre)}
        </div>
        <div style="font:13px/1.5 system-ui,sans-serif;color:#5b616b">
          ${escapar(l.organismo)}${l.comuna ? ` · ${escapar(l.comuna)}` : ''}<br />
          Cierra el <strong style="color:#b42318">${fecha(l.fechaCierre)}</strong>
          ${monto ? ` · ${monto} estimado` : ''}
          ${l.tipoDescripcion ? ` · ${escapar(l.tipo)} (${escapar(l.tipoDescripcion)})` : ''}
        </div>
        <div style="margin-top:10px">
          <a href="${escapar(l.enlace)}"
             style="font:600 13px system-ui,sans-serif;color:#1f3864;text-decoration:none">
            Ver la ficha en Mercado Público →
          </a>
        </div>
      </td></tr>
    </table>
  </td></tr>`;
}

function armarHtml(nuevas, resumen) {
  const esc = nuevas.filter((l) => l.linea === 'escolar');
  const corp = nuevas.filter((l) => l.linea === 'corporativo');
  const seccion = (titulo, lista) =>
    lista.length
      ? `<tr><td style="padding:18px 0 10px;font:600 13px system-ui,sans-serif;color:#5b616b;
           text-transform:uppercase;letter-spacing:.05em">${titulo} (${lista.length})</td></tr>
         ${lista.map(tarjeta).join('')}`
      : '';

  return `<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f6f7f9">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto">
    <tr><td style="padding-bottom:4px;font:650 20px system-ui,sans-serif;color:#111214">
      ${nuevas.length} licitación${nuevas.length === 1 ? '' : 'es'} nueva${nuevas.length === 1 ? '' : 's'}
    </td></tr>
    <tr><td style="padding-bottom:16px;font:14px/1.5 system-ui,sans-serif;color:#5b616b">
      Vestuario escolar y corporativo publicado en Mercado Público.
      Hoy hay ${resumen.escolar + resumen.corporativo} licitaciones abiertas en total.
    </td></tr>
    <table width="100%" cellpadding="0" cellspacing="0">
      ${seccion('Uniforme escolar', esc)}
      ${seccion('Vestuario corporativo', corp)}
    </table>
    ${
      SITIO
        ? `<tr><td style="padding:18px 0">
             <a href="${escapar(SITIO)}" style="display:inline-block;background:#1f3864;color:#fff;
                font:600 14px system-ui,sans-serif;text-decoration:none;padding:10px 18px;border-radius:8px">
               Ver todas las licitaciones abiertas
             </a></td></tr>`
        : ''
    }
    <tr><td style="padding-top:18px;border-top:1px solid #e4e6ea;font:12px/1.5 system-ui,sans-serif;color:#8b9099">
      Correo automático del buscador de licitaciones de Trenino. Filtra la API de
      ChileCompra con los criterios definidos por el equipo. Antes de postular,
      revisa siempre la ficha oficial y las bases.
    </td></tr>
  </table></body></html>`;
}

/* ─────────────────────────── envío ─────────────────────────── */

/** Manda por SMTP de Gmail. Llega a cualquier destinatario. */
async function enviarPorGmail({ destino, asunto, html }) {
  const transporte = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USUARIO, pass: process.env.GMAIL_CLAVE_APP },
  });
  const info = await transporte.sendMail({ from: ORIGEN, to: destino.join(', '), subject: asunto, html });
  console.log(`Correo enviado por Gmail a ${destino.join(', ')} (id ${info.messageId})`);
}

/** Manda por Resend. Sin dominio verificado solo acepta al dueño de la cuenta. */
async function enviarPorResend({ destino, asunto, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: ORIGEN, to: destino, subject: asunto, html }),
  });
  const cuerpo = await res.json().catch(() => ({}));

  if (res.status === 403 && cuerpo?.name === 'validation_error') {
    console.warn(
      '\nResend rechazó el envío porque la cuenta no tiene un dominio verificado.\n' +
        `  ${cuerpo.message}\n` +
        '  Lo más rápido es configurar GMAIL_USUARIO y GMAIL_CLAVE_APP y enviar por Gmail.\n' +
        '  La página sí quedó actualizada; solo no salió el correo.'
    );
    return;
  }
  if (!res.ok) throw new Error(`Resend respondió ${res.status}: ${JSON.stringify(cuerpo)}`);
  console.log(`Correo enviado por Resend a ${destino.join(', ')} (id ${cuerpo.id ?? '?'})`);
}

async function main() {
  const destino = (process.env.CORREO_DESTINO || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (!porGmail() && !process.env.RESEND_API_KEY) {
    console.log('No hay forma de enviar configurada (ni Gmail ni Resend): se omite el correo.');
    return;
  }
  if (!destino.length) {
    console.log('No hay CORREO_DESTINO: se omite el correo.');
    return;
  }

  const datos = JSON.parse(await readFile(resolve(RAIZ, 'public/data/licitaciones.json'), 'utf8'));
  const nuevas = datos.licitaciones.filter((l) => l.nueva);

  if (!nuevas.length) {
    console.log('Sin licitaciones nuevas hoy: no se envía correo.');
    return;
  }

  const asunto =
    nuevas.length === 1
      ? '1 licitación nueva de vestuario'
      : `${nuevas.length} licitaciones nuevas de vestuario`;
  const html = armarHtml(nuevas, datos.resumen);

  if (porGmail()) await enviarPorGmail({ destino, asunto, html });
  else await enviarPorResend({ destino, asunto, html });
}

main().catch((e) => {
  console.error('Falló el envío del correo:', e.message);
  process.exit(1);
});

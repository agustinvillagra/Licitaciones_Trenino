/**
 * Página de licitaciones.
 *
 * Lee public/data/licitaciones.json, que genera scripts/actualizar.mjs una vez
 * al día. Las marcas del usuario (favorita, postulada, descartada) se guardan
 * en localStorage: viven en el navegador de quien las puso.
 */

const $ = (sel) => document.querySelector(sel);
const CLAVE = 'trenino.licitaciones.marcas.v1';
const CLAVE_NOMBRE = 'trenino.licitaciones.nombre';

const MARCAS = { FAV: 'favorita', POST: 'postulada', DESC: 'descartada' };

const estado = {
  datos: null,
  marcas: {}, // codigo -> { marca, por, cuando }
  modo: 'local', // 'compartido' cuando la base responde
  nombre: '',
  vista: 'pendientes',
  texto: '',
  linea: '',
  region: '',
  orden: 'cierre',
  abiertas: new Set(),
};

/* ────────────────────────── persistencia ────────────────────────── */

/** Copia de respaldo en el navegador, por si la base no responde. */
function leerRespaldo() {
  try { return JSON.parse(localStorage.getItem(CLAVE) ?? '{}'); } catch { return {}; }
}
function guardarRespaldo() {
  try { localStorage.setItem(CLAVE, JSON.stringify(estado.marcas)); } catch { /* sin espacio */ }
}

/** Marca de una licitación, o undefined. */
const marcaDe = (codigo) => estado.marcas[codigo]?.marca;

/**
 * Carga las marcas. Primero intenta la base compartida; si no está
 * configurada o falla, usa lo que haya guardado este navegador.
 */
async function cargarMarcas() {
  estado.marcas = leerRespaldo();
  try {
    const res = await fetch('api/marcas', { cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    const { modo, marcas } = await res.json();
    // Si la API contesta, su copia manda: es la fuente de verdad, tanto si
    // está respaldada por la base compartida como por el archivo local de
    // desarrollo. El modo solo cambia lo que se le muestra al usuario.
    estado.modo = modo;
    estado.marcas = marcas ?? {};
    guardarRespaldo();
  } catch {
    estado.modo = 'local';
  }
}

/**
 * Pone o saca una marca. Son excluyentes entre sí.
 * Actualiza la pantalla al tiro y después confirma contra la base; si la base
 * falla, la marca igual queda guardada en este navegador.
 */
async function alternarMarca(codigo, marca) {
  const quitar = marcaDe(codigo) === marca;
  const registro = quitar
    ? null
    : { marca, por: estado.nombre, cuando: new Date().toISOString() };

  if (registro) estado.marcas[codigo] = registro;
  else delete estado.marcas[codigo];
  guardarRespaldo();
  pintarTodo();

  try {
    const res = await fetch('api/marcas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ codigo, marca: quitar ? null : marca, por: estado.nombre }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const { registro: guardado } = await res.json();
    if (guardado) estado.marcas[codigo] = guardado;
    guardarRespaldo();
    pintarTodo();
  } catch {
    avisar('No se pudo guardar en la base compartida. Quedó guardado solo en este navegador.');
  }
}

/** Nombre de quien marca, para que el resto sepa quién hizo qué. */
function cargarNombre() {
  estado.nombre = localStorage.getItem(CLAVE_NOMBRE) ?? '';
}
function pedirNombre() {
  const n = prompt('¿Con qué nombre quieres que aparezcan tus marcas?', estado.nombre || '');
  if (n === null) return;
  estado.nombre = n.trim().slice(0, 60);
  localStorage.setItem(CLAVE_NOMBRE, estado.nombre);
  pintarTodo();
  pintarIdentidad();
}

let avisoTimer;
function avisar(texto) {
  const a = $('#aviso');
  a.textContent = texto;
  a.classList.remove('oculto');
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => a.classList.add('oculto'), 6000);
}

/* ────────────────────────── formato ────────────────────────── */

const pesos = new Intl.NumberFormat('es-CL', {
  style: 'currency', currency: 'CLP', maximumFractionDigits: 0,
});

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

function fechaHora(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return (
    d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }) +
    ', ' +
    d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
  );
}

function plazo(dias) {
  if (dias === null || dias === undefined) return { texto: '—', clase: '' };
  if (dias < 0) return { texto: 'cerrada', clase: '' };
  if (dias === 0) return { texto: 'cierra hoy', clase: 'urge' };
  if (dias === 1) return { texto: 'queda 1 día', clase: 'urge' };
  if (dias <= 2) return { texto: `quedan ${dias} días`, clase: 'urge' };
  if (dias <= 7) return { texto: `quedan ${dias} días`, clase: 'semana' };
  return { texto: `quedan ${dias} días`, clase: '' };
}

/* ────────────────────────── selección ────────────────────────── */

function porVista(l) {
  const m = marcaDe(l.codigo);
  switch (estado.vista) {
    case 'pendientes': return !m;
    case 'favoritas': return m === MARCAS.FAV;
    case 'postuladas': return m === MARCAS.POST;
    case 'descartadas': return m === MARCAS.DESC;
    default: return true;
  }
}

function visibles() {
  const t = estado.texto.trim().toLowerCase();
  return estado.datos.licitaciones
    .filter(porVista)
    .filter((l) => !estado.linea || l.linea === estado.linea)
    .filter((l) => !estado.region || l.region === estado.region)
    .filter((l) =>
      !t ||
      `${l.nombre} ${l.organismo} ${l.comuna} ${l.region} ${l.codigo}`.toLowerCase().includes(t)
    )
    .sort((a, b) => {
      if (estado.orden === 'nuevas' && a.nueva !== b.nueva) return a.nueva ? -1 : 1;
      if (estado.orden === 'monto') return (b.montoEstimado ?? 0) - (a.montoEstimado ?? 0);
      return new Date(a.fechaCierre ?? 0) - new Date(b.fechaCierre ?? 0);
    });
}

const cuenta = (marca) =>
  estado.datos.licitaciones.filter((l) =>
    marca === null ? !marcaDe(l.codigo) : marcaDe(l.codigo) === marca
  ).length;

/* ────────────────────────── pintado ────────────────────────── */

function pintarResumen() {
  const { resumen, totalActivasChileCompra } = estado.datos;
  const celdas = [
    { n: resumen.escolar, e: 'uniforme escolar' },
    { n: resumen.corporativo, e: 'vestuario corporativo' },
    { n: resumen.nuevasHoy, e: 'nuevas hoy', acento: resumen.nuevasHoy > 0 },
    { n: cuenta(MARCAS.POST), e: 'postuladas' },
    { n: totalActivasChileCompra.toLocaleString('es-CL'), e: 'revisadas en ChileCompra' },
  ];
  $('#resumen').innerHTML = celdas
    .map((c) => `<div class="celda${c.acento ? ' acento' : ''}"><div class="n">${c.n}</div><div class="e">${c.e}</div></div>`)
    .join('');
}

function pintarSegmentos() {
  const n = {
    pendientes: cuenta(null),
    favoritas: cuenta(MARCAS.FAV),
    postuladas: cuenta(MARCAS.POST),
    descartadas: cuenta(MARCAS.DESC),
    todas: estado.datos.licitaciones.length,
  };
  const nombres = {
    pendientes: 'Por revisar', favoritas: 'Favoritas', postuladas: 'Postuladas',
    descartadas: 'Descartadas', todas: 'Todas',
  };
  for (const b of document.querySelectorAll('.seg')) {
    const v = b.dataset.vista;
    b.innerHTML = `${nombres[v]}<span class="pill">${n[v]}</span>`;
  }
}

function marcaBtn(codigo, marca, clase, simbolo, titulo) {
  const activa = marcaDe(codigo) === marca;
  return `<button class="marca-btn ${clase}" data-marca="${marca}" aria-pressed="${activa}"
            title="${titulo}" aria-label="${titulo}">${simbolo}</button>`;
}

/** Aviso sobre el plazo para hacer preguntas al comprador. */
function chipPreguntas(l) {
  if (!l.fechaPreguntas) return '';
  const d = new Date(l.fechaPreguntas);
  if (Number.isNaN(d.getTime())) return '';
  const cerrado = d < new Date();
  const txt = d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' });
  return cerrado
    ? `<span class="chip apagado" title="Ya no se pueden hacer preguntas al comprador">Preguntas cerradas</span>`
    : `<span class="chip">Preguntas hasta el ${txt}</span>`;
}

const etiquetaMarca = (m) =>
  ({ favorita: 'Favorita', postulada: 'Postulada', descartada: 'Descartada' })[m] ?? '';

/** "hace 2 horas", "ayer", "hace 3 días". */
function hace(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const min = Math.round((Date.now() - d) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const dd = Math.round(h / 24);
  return dd === 1 ? 'ayer' : `hace ${dd} días`;
}

function tarjeta(l) {
  const reg = estado.marcas[l.codigo];
  const m = reg?.marca;
  const p = plazo(l.diasParaCierre);
  const abierta = estado.abiertas.has(l.codigo);
  const clases = ['item', m ?? ''].filter(Boolean).join(' ');

  const items = l.items.length
    ? `<h4>Qué piden</h4>
       <ul class="items">
         ${l.items.slice(0, 10).map((it) => `
           <li><strong>${escapar(it.producto)}</strong>
             ${it.cantidad ? `<span class="q"> · ${it.cantidad} ${escapar(it.unidad)}</span>` : ''}
             ${it.descripcion ? `<span class="dd">${escapar(it.descripcion)}</span>` : ''}
           </li>`).join('')}
       </ul>
       ${l.items.length > 10 ? `<p class="q">y ${l.items.length - 10} ítems más en la ficha.</p>` : ''}`
    : '';

  return `
  <article class="${clases}" data-codigo="${escapar(l.codigo)}">
    <div class="fila">
      <div class="cuerpo" role="button" tabindex="0" aria-expanded="${abierta}">
        <p class="titulo">${escapar(l.nombre)}</p>
        <p class="meta">
          <b>${escapar(l.organismo)}</b> · ${escapar(l.comuna || l.region)}
          ${l.montoEstimado ? ` · ${pesos.format(l.montoEstimado)} estimado` : ''}
        </p>
        <div class="chips">
          ${l.nueva ? '<span class="chip nueva">Nueva</span>' : ''}
          <span class="chip linea ${l.linea}">${l.linea === 'escolar' ? 'Escolar' : 'Corporativo'}</span>
          ${l.tipoDescripcion ? `<span class="chip">${escapar(l.tipo)} · ${escapar(l.tipoDescripcion)}</span>` : ''}
          <span class="chip">${escapar(l.sector)}</span>
          ${chipPreguntas(l)}
        </div>
        ${reg ? `<p class="firma">${etiquetaMarca(reg.marca)}${reg.por ? ` por ${escapar(reg.por)}` : ''} · ${hace(reg.cuando)}</p>` : ''}
      </div>
      <div class="plazo ${p.clase}">
        <div class="d">${p.texto}</div>
        <div class="f">${fechaHora(l.fechaCierre)}</div>
      </div>
      <div class="marcas">
        ${marcaBtn(l.codigo, MARCAS.FAV, 'fav', '★', 'Marcar como favorita')}
        ${marcaBtn(l.codigo, MARCAS.POST, 'post', '✓', 'Marcar como postulada')}
        ${marcaBtn(l.codigo, MARCAS.DESC, 'desc', '✕', 'Descartar')}
      </div>
    </div>
    <div class="detalle${abierta ? '' : ' oculto'}">
      ${l.descripcion ? `<h4>Descripción</h4><p>${escapar(l.descripcion)}</p>` : ''}
      ${items}
      <h4>Cómo postular</h4>
      <div class="pasos">
        <a class="btn" href="https://www.mercadopublico.cl/Home/Login" target="_blank" rel="noopener">
          1 · Entrar como proveedor
        </a>
        <a class="btn secundario" href="${escapar(l.enlace)}" target="_blank" rel="noopener">
          2 · Abrir la ficha y ofertar
        </a>
        <button class="cod" data-copiar="${escapar(l.codigo)}" title="Copiar el código">
          ${escapar(l.codigo)}
        </button>
      </div>
      <p class="nota-postular">
        Mercado Público no permite enlazar directo al formulario de oferta. Hay
        que <b>iniciar sesión primero</b>; con la sesión abierta, el botón
        <b>Ofertar</b> aparece dentro de la misma ficha. Si no aparece, revisa
        que la empresa esté inscrita en el Registro de Proveedores.
      </p>
    </div>
  </article>`;
}

function pintarLista() {
  const lista = visibles();
  $('#lista').innerHTML = lista.map(tarjeta).join('');

  const vacio = $('#vacio');
  vacio.classList.toggle('oculto', lista.length > 0);
  if (!lista.length) {
    vacio.textContent =
      estado.vista === 'pendientes'
        ? 'No queda nada por revisar. Buen trabajo.'
        : 'No hay licitaciones que calcen con este filtro.';
  }

  const nuevas = lista.filter((l) => l.nueva).length;
  $('#conteo').textContent = lista.length
    ? `${lista.length} licitación${lista.length === 1 ? '' : 'es'}` +
      (nuevas ? ` · ${nuevas} nueva${nuevas === 1 ? '' : 's'}` : '')
    : '';

  conectarTarjetas();
}

function conectarTarjetas() {
  for (const cuerpo of document.querySelectorAll('.cuerpo')) {
    const abrir = () => {
      const art = cuerpo.closest('.item');
      const det = art.querySelector('.detalle');
      det.classList.toggle('oculto');
      const visible = !det.classList.contains('oculto');
      cuerpo.setAttribute('aria-expanded', String(visible));
      if (visible) estado.abiertas.add(art.dataset.codigo);
      else estado.abiertas.delete(art.dataset.codigo);
    };
    cuerpo.addEventListener('click', abrir);
    cuerpo.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(); }
    });
  }

  for (const btn of document.querySelectorAll('.marca-btn')) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const codigo = btn.closest('.item').dataset.codigo;
      alternarMarca(codigo, btn.dataset.marca);
      pintarTodo();
    });
  }

  for (const btn of document.querySelectorAll('[data-copiar]')) {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const original = btn.textContent;
      try {
        await navigator.clipboard.writeText(btn.dataset.copiar);
        btn.textContent = 'copiado ✓';
      } catch {
        btn.textContent = 'no se pudo copiar';
      }
      setTimeout(() => { btn.textContent = original; }, 1400);
    });
  }
}

function pintarTodo() {
  pintarResumen();
  pintarSegmentos();
  pintarLista();
}

/* ────────────────────────── arranque ────────────────────────── */

function pintarSello() {
  const d = new Date(estado.datos.actualizado);
  $('#sello').textContent =
    `Actualizado el ${d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long' })} ` +
    `a las ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
}

function pintarIdentidad() {
  const compartido = estado.modo === 'compartido';
  const quien = `<button class="como" id="cambiarNombre">${
    estado.nombre ? escapar(estado.nombre) : 'poner mi nombre'
  }</button>`;
  $('#identidad').innerHTML =
    `<span class="punto ${compartido ? 'ok' : 'solo'}"></span>` +
    (compartido
      ? `Marcas compartidas con el equipo · ${quien}`
      : `Base compartida sin conectar: las marcas quedan en este equipo · ${quien}`);
  $('#cambiarNombre')?.addEventListener('click', pedirNombre);
}

function llenarRegiones() {
  const regiones = [...new Set(estado.datos.licitaciones.map((l) => l.region).filter(Boolean))].sort();
  $('#region').insertAdjacentHTML(
    'beforeend',
    regiones.map((r) => `<option value="${escapar(r)}">${escapar(r)}</option>`).join('')
  );
}

function conectarControles() {
  for (const b of document.querySelectorAll('.seg')) {
    b.addEventListener('click', () => {
      document.querySelector('.seg.activa')?.classList.remove('activa');
      b.classList.add('activa');
      estado.vista = b.dataset.vista;
      pintarLista();
    });
  }
  $('#busqueda').addEventListener('input', (e) => { estado.texto = e.target.value; pintarLista(); });
  $('#linea').addEventListener('change', (e) => { estado.linea = e.target.value; pintarLista(); });
  $('#region').addEventListener('change', (e) => { estado.region = e.target.value; pintarLista(); });
  $('#orden').addEventListener('change', (e) => { estado.orden = e.target.value; pintarLista(); });
}

async function iniciar() {
  cargarNombre();
  await cargarMarcas();
  try {
    const res = await fetch(`data/licitaciones.json?v=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    estado.datos = await res.json();
  } catch (e) {
    $('#sello').textContent = 'No se pudo cargar';
    $('#lista').innerHTML =
      `<p class="vacio">No se pudo leer la lista (${escapar(e.message)}).<br>
       Si acabas de publicar el sitio, espera a que corra la primera actualización.</p>`;
    return;
  }
  pintarSello();
  pintarIdentidad();
  llenarRegiones();
  conectarControles();
  pintarTodo();
  if (estado.modo === 'compartido' && !estado.nombre) pedirNombre();
}

iniciar();

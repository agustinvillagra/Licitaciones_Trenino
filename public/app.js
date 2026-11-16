/**
 * Página de licitaciones. Lee data/licitaciones.json, que genera el script
 * scripts/actualizar.mjs una vez al día desde GitHub Actions.
 */

const $ = (sel) => document.querySelector(sel);

const estado = {
  datos: null,
  linea: 'todas',
  texto: '',
  region: '',
  orden: 'cierre',
  soloNuevas: false,
  abiertas: new Set(),
};

const pesos = new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
});

function fechaLarga(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
}

function horaCierre(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
}

function urgencia(dias) {
  if (dias === null) return '';
  if (dias <= 2) return 'urgente';
  if (dias <= 7) return 'pronto';
  return 'holgado';
}

function textoDias(dias) {
  if (dias === null) return '—';
  if (dias < 0) return 'cerrada';
  if (dias === 0) return 'hoy';
  if (dias === 1) return '1 día';
  return `${dias} días`;
}

const escapar = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );

/* ---------------------------------------------------------- filtrado */

function visibles() {
  const t = estado.texto.trim().toLowerCase();
  return estado.datos.licitaciones
    .filter((l) => estado.linea === 'todas' || l.linea === estado.linea)
    .filter((l) => !estado.region || l.region === estado.region)
    .filter((l) => !estado.soloNuevas || l.nueva)
    .filter((l) => {
      if (!t) return true;
      return `${l.nombre} ${l.organismo} ${l.comuna} ${l.region} ${l.codigo}`
        .toLowerCase()
        .includes(t);
    })
    .sort((a, b) => {
      if (estado.orden === 'nuevas' && a.nueva !== b.nueva) return a.nueva ? -1 : 1;
      if (estado.orden === 'monto') return (b.montoEstimado ?? 0) - (a.montoEstimado ?? 0);
      return new Date(a.fechaCierre ?? 0) - new Date(b.fechaCierre ?? 0);
    });
}

/* ---------------------------------------------------------- pintado */

function pintarTarjetas() {
  const { resumen, totalActivasChileCompra } = estado.datos;
  const tarjetas = [
    { n: resumen.escolar, e: 'uniforme escolar', destacada: false },
    { n: resumen.corporativo, e: 'vestuario corporativo', destacada: false },
    { n: resumen.nuevasHoy, e: 'nuevas hoy', destacada: resumen.nuevasHoy > 0 },
    { n: totalActivasChileCompra.toLocaleString('es-CL'), e: 'revisadas en ChileCompra', destacada: false },
  ];
  $('#tarjetas').innerHTML = tarjetas
    .map(
      (t) =>
        `<div class="tarjeta${t.destacada ? ' destacada' : ''}">
           <div class="n">${t.n}</div><div class="e">${t.e}</div>
         </div>`
    )
    .join('');
}

function filaItem(l) {
  const u = urgencia(l.diasParaCierre);
  const abierta = estado.abiertas.has(l.codigo);
  const items = l.items.length
    ? `<h4>Qué piden</h4>
       <ul class="items">
         ${l.items
           .slice(0, 12)
           .map(
             (it) =>
               `<li><strong>${escapar(it.producto)}</strong>
                ${it.cantidad ? `<span class="cant">· ${it.cantidad} ${escapar(it.unidad)}</span>` : ''}
                ${it.descripcion ? `<br><span class="cant">${escapar(it.descripcion)}</span>` : ''}</li>`
           )
           .join('')}
       </ul>
       ${l.items.length > 12 ? `<p class="cant">y ${l.items.length - 12} ítems más en la ficha.</p>` : ''}`
    : '';

  return `
  <article class="item${l.nueva ? ' nueva' : ''}" data-codigo="${escapar(l.codigo)}">
    <div class="item-cab" role="button" tabindex="0">
      <div>
        <p class="titulo">${escapar(l.nombre)}</p>
        <div class="meta">
          <span>${escapar(l.organismo)}</span>
          <span class="sep">·</span>
          <span>${escapar(l.comuna || l.region)}</span>
          ${l.montoEstimado ? `<span class="sep">·</span><span>${pesos.format(l.montoEstimado)} estimado</span>` : ''}
        </div>
        <div class="etiquetas">
          ${l.nueva ? '<span class="etiqueta nueva">Nueva</span>' : ''}
          <span class="etiqueta ${l.linea}">${l.linea === 'escolar' ? 'Uniforme escolar' : 'Corporativo'}</span>
          ${l.tipoDescripcion ? `<span class="etiqueta">${escapar(l.tipo)} · ${escapar(l.tipoDescripcion)}</span>` : ''}
          <span class="etiqueta">${escapar(l.sector)}</span>
        </div>
      </div>
      <div class="cierre">
        <div class="dias ${u}">${textoDias(l.diasParaCierre)}</div>
        <div class="fecha">${fechaLarga(l.fechaCierre)} ${horaCierre(l.fechaCierre)}</div>
      </div>
    </div>
    <div class="detalle${abierta ? '' : ' oculto'}">
      ${l.descripcion ? `<h4>Descripción</h4><p>${escapar(l.descripcion)}</p>` : ''}
      ${items}
      <div class="acciones">
        <a class="boton" href="${escapar(l.enlace)}" target="_blank" rel="noopener">
          Ver en Mercado Público
        </a>
        <span class="codigo">${escapar(l.codigo)}</span>
        ${l.fechaPublicacion ? `<span class="codigo">publicada ${fechaLarga(l.fechaPublicacion)}</span>` : ''}
      </div>
    </div>
  </article>`;
}

function pintar() {
  const lista = visibles();
  $('#lista').innerHTML = lista.map(filaItem).join('');
  $('#vacio').classList.toggle('oculto', lista.length > 0);
  const nuevas = lista.filter((l) => l.nueva).length;
  $('#conteo').textContent =
    lista.length === 0
      ? ''
      : `${lista.length} licitación${lista.length === 1 ? '' : 'es'} abierta${lista.length === 1 ? '' : 's'}` +
        (nuevas ? ` · ${nuevas} nueva${nuevas === 1 ? '' : 's'}` : '');

  for (const cab of document.querySelectorAll('.item-cab')) {
    const alternar = () => {
      const codigo = cab.closest('.item').dataset.codigo;
      const det = cab.nextElementSibling;
      det.classList.toggle('oculto');
      if (det.classList.contains('oculto')) estado.abiertas.delete(codigo);
      else estado.abiertas.add(codigo);
    };
    cab.addEventListener('click', alternar);
    cab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alternar(); }
    });
  }
}

/* ---------------------------------------------------------- arranque */

function pintarSello() {
  const d = new Date(estado.datos.actualizado);
  $('#sello').innerHTML =
    `Actualizado el ${d.toLocaleDateString('es-CL', { day: '2-digit', month: 'long' })}` +
    ` a las ${d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
}

function llenarRegiones() {
  const regiones = [...new Set(estado.datos.licitaciones.map((l) => l.region).filter(Boolean))].sort();
  $('#region').insertAdjacentHTML(
    'beforeend',
    regiones.map((r) => `<option value="${escapar(r)}">${escapar(r)}</option>`).join('')
  );
}

function conectarControles() {
  for (const b of document.querySelectorAll('.pestana')) {
    b.addEventListener('click', () => {
      document.querySelector('.pestana.activa').classList.remove('activa');
      b.classList.add('activa');
      estado.linea = b.dataset.linea;
      pintar();
    });
  }
  $('#busqueda').addEventListener('input', (e) => { estado.texto = e.target.value; pintar(); });
  $('#region').addEventListener('change', (e) => { estado.region = e.target.value; pintar(); });
  $('#orden').addEventListener('change', (e) => { estado.orden = e.target.value; pintar(); });
  $('#soloNuevas').addEventListener('change', (e) => { estado.soloNuevas = e.target.checked; pintar(); });
}

async function iniciar() {
  try {
    const res = await fetch(`data/licitaciones.json?v=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    estado.datos = await res.json();
  } catch (e) {
    $('#sello').textContent = 'No se pudo cargar';
    $('#lista').innerHTML =
      `<p class="vacio">No se pudo leer la lista de licitaciones (${escapar(e.message)}).<br>
       Si acabas de publicar el sitio, espera a que corra la primera actualización.</p>`;
    return;
  }
  pintarSello();
  pintarTarjetas();
  llenarRegiones();
  conectarControles();
  pintar();
}

iniciar();

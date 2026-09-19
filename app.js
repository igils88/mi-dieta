/* ============================================================
   app.js — Mi Dieta
   ------------------------------------------------------------
   Todo el estado vive en localStorage. No hay servidor: la app
   funciona offline y los datos no salen del dispositivo.
   Copia de seguridad en Ajustes → Datos.
   ============================================================ */

'use strict';

const APP_KEY = 'midieta.v1';
const APP_VER = '1.1.0';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
                      'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* ============================================================
   1. Utilidades
   ============================================================ */

const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const uid = (pre = 'x') => pre + '_' + Math.random().toString(36).slice(2, 9);
const pad2 = n => String(n).padStart(2, '0');

function lunesDe(fecha) {
  const d = new Date(fecha);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function claveSemana(fecha) {
  const d = lunesDe(fecha);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function fechaDeClave(clave) {
  const [a, m, d] = clave.split('-').map(Number);
  return new Date(a, m - 1, d);
}

function sumarDias(fecha, n) {
  const d = new Date(fecha);
  d.setDate(d.getDate() + n);
  return d;
}

function semanasEntre(claveA, claveB) {
  const ms = fechaDeClave(claveB) - fechaDeClave(claveA);
  return Math.round(ms / 604800000);
}

function rangoSemana(clave) {
  const ini = fechaDeClave(clave);
  const fin = sumarDias(ini, 6);
  return ini.getMonth() === fin.getMonth()
    ? `${ini.getDate()} – ${fin.getDate()} ${MESES[fin.getMonth()]}`
    : `${ini.getDate()} ${MESES[ini.getMonth()]} – ${fin.getDate()} ${MESES[fin.getMonth()]}`;
}

const esSemanaDeHoy = clave => clave === claveSemana(new Date());
const indiceHoy = () => (new Date().getDay() + 6) % 7;

function toast(mensaje) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = mensaje;
  $('#toastHost').appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .25s';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 260);
  }, 1900);
}

function vibrar(ms = 8) { try { navigator.vibrate && navigator.vibrate(ms); } catch (_) {} }

function seccionDe(ingrediente) {
  const n = String(ingrediente).toLowerCase().trim();
  for (const [seccion, palabras] of Object.entries(CLASIFICACION)) {
    if (palabras.some(pal => n === pal || n.includes(pal))) return seccion;
  }
  return 'otros';
}

/* ============================================================
   2. Estado
   ============================================================ */

const AJUSTES_POR_DEFECTO = {
  tema: 'auto',
  plan: null,              // {anclaClave, anclaIndice}
  modoDias: 'todos',       // 'todos' | 'hoy'  → qué días salen desplegados
  diasAbiertos: {},        // excepciones manuales por día: {0: true, 3: false…}
  compraDietaAbierta: false,
};

const estadoInicial = () => ({
  version: 2,
  dietas: structuredClone(DIETAS),
  semanas: {},
  ajustes: { ...AJUSTES_POR_DEFECTO },
});

let estado = cargar();
let vistaActual = 'semana';
let semanaVista = claveSemana(new Date());

function cargar() {
  try {
    const bruto = localStorage.getItem(APP_KEY);
    if (!bruto) return estadoInicial();
    const datos = JSON.parse(bruto);
    if (!datos || !Array.isArray(datos.dietas)) return estadoInicial();
    datos.semanas = datos.semanas || {};
    datos.ajustes = Object.assign({}, AJUSTES_POR_DEFECTO, datos.ajustes);
    datos.ajustes.diasAbiertos = datos.ajustes.diasAbiertos || {};
    return datos;
  } catch (e) {
    console.warn('No se pudo leer el almacenamiento:', e);
    return estadoInicial();
  }
}

function guardar() {
  try {
    localStorage.setItem(APP_KEY, JSON.stringify(estado));
  } catch (e) {
    console.error('No se pudo guardar:', e);
    toast('No se ha podido guardar. Revisa el espacio del navegador.');
  }
}

const getDieta = id => estado.dietas.find(d => d.id === id) || null;

/** Número de semana del plan (1…10) que corresponde a una semana natural. */
function indicePlan(clave) {
  const plan = estado.ajustes.plan;
  if (!plan) return null;
  const n = plan.anclaIndice + semanasEntre(plan.anclaClave, clave);
  return Math.min(Math.max(n, 1), SECUENCIA.length);
}

function dietaDeSecuencia(clave) {
  const n = indicePlan(clave);
  return n ? SECUENCIA[n - 1] : (estado.dietas[0] && estado.dietas[0].id) || null;
}

const planVacio = () => ({ comidas: Array(7).fill(null), cenas: Array(7).fill(null) });

/** Reparte los platos: primero los de día fijo, el resto de lunes en adelante. */
function planAuto(dieta) {
  const plan = planVacio();
  if (!dieta) return plan;
  ['comidas', 'cenas'].forEach(tipo => {
    const libres = [];
    (dieta[tipo] || []).forEach(m => {
      if (m.dia != null && plan[tipo][m.dia] == null) plan[tipo][m.dia] = m.id;
      else libres.push(m);
    });
    let d = 0;
    libres.forEach(m => {
      while (d < 7 && plan[tipo][d] != null) d++;
      if (d < 7) plan[tipo][d] = m.id;
    });
  });
  return plan;
}

function getSemana(clave, crear = true) {
  let s = estado.semanas[clave];
  if (!s && crear) {
    const dietaId = dietaDeSecuencia(clave);
    s = { dietaId, plan: planAuto(getDieta(dietaId)), hechos: {}, compra: {}, creada: Date.now() };
    estado.semanas[clave] = s;
    guardar();
  }
  return s || null;
}

function getPlato(dieta, id) {
  if (!dieta || !id) return null;
  return (dieta.comidas || []).find(m => m.id === id)
      || (dieta.cenas   || []).find(m => m.id === id)
      || null;
}

function progresoSemana(clave) {
  const s = getSemana(clave, false);
  if (!s) return { hechos: 0, total: 0 };
  const ids = [...s.plan.comidas, ...s.plan.cenas].filter(Boolean);
  return { hechos: ids.filter(id => s.hechos[id]).length, total: ids.length };
}

/** ¿Sale desplegado este día? Manda la excepción manual; si no, el modo. */
function diaAbierto(d) {
  const manual = estado.ajustes.diasAbiertos || {};
  if (manual[d] !== undefined) return !!manual[d];
  if (estado.ajustes.modoDias === 'hoy') return esSemanaDeHoy(semanaVista) && d === indiceHoy();
  return true;
}

/* ============================================================
   3. Vista: Semana
   ============================================================ */

function chipHTML(plato, tipo, dia, hecho, arrastrable = true) {
  const fijo = plato.dia != null;
  return `
    <div class="chip${hecho ? ' is-done' : ''}" data-plato="${esc(plato.id)}" data-tipo="${tipo}"${dia != null ? ` data-dia="${dia}"` : ''}${fijo ? ' data-fijo="1"' : ''}>
      <button class="tick" data-accion="toggle" data-plato="${esc(plato.id)}" aria-label="Marcar como hecha" aria-pressed="${hecho}">
        <svg viewBox="0 0 16 16"><path d="M3 8.6 6.2 12 13 4.6"/></svg>
      </button>
      <div class="chip-txt" data-accion="plato" data-plato="${esc(plato.id)}" data-tipo="${tipo}" data-dia="${dia == null ? '' : dia}">
        <b>${esc(plato.titulo)}</b>
        ${plato.detalle ? `<small>${esc(plato.detalle)}</small>` : ''}
      </div>
      ${!arrastrable ? '' : fijo
        ? '<span class="grip fijo" title="Día fijo" aria-hidden="true"></span>'
        : '<span class="grip" aria-hidden="true"></span>'}
    </div>`;
}

function slotHTML(dieta, semana, tipo, dia) {
  const plato = getPlato(dieta, semana.plan[tipo][dia]);
  const fijo = plato && plato.dia != null;
  const cuerpo = plato
    ? chipHTML(plato, tipo, dia, !!semana.hechos[plato.id])
    : '<span class="slot-vacio">—</span>';
  return `
    <div class="slot" data-tipo="${tipo}" data-dia="${dia}"${fijo ? ' data-fijo="1"' : ''}>
      <span class="slot-tipo">${tipo === 'comidas' ? 'Comida' : 'Cena'}</span>
      <div class="slot-cuerpo">${cuerpo}</div>
    </div>`;
}

function renderSemana() {
  const cont = $('#view-semana');
  const semana = getSemana(semanaVista);
  const dieta = getDieta(semana.dietaId);

  if (!dieta) {
    cont.innerHTML = `
      <div class="vacio">
        <div class="vacio-emoji">🥗</div>
        <h3>Sin dieta esta semana</h3>
        <p>Elige qué dieta te toca y se repartirá por días.</p>
        <button class="btn" data-accion="elegir-dieta-semana">Elegir dieta</button>
      </div>`;
    return;
  }

  const { hechos, total } = progresoSemana(semanaVista);
  const pct = total ? Math.round((hechos / total) * 100) : 0;
  const hoy = indiceHoy();
  const actual = esSemanaDeHoy(semanaVista);
  const ini = fechaDeClave(semanaVista);
  const nPlan = indicePlan(semanaVista);

  let html = `
    <div class="semana-head">
      <button class="semana-nav" data-accion="semana-prev" aria-label="Semana anterior">‹</button>
      <div class="semana-rango">
        ${esc(rangoSemana(semanaVista))}
        <small>${esc(dieta.nombre)}${nPlan ? ` · ${nPlan} de ${SECUENCIA.length}` : ''}</small>
      </div>
      <button class="semana-nav" data-accion="semana-next" aria-label="Semana siguiente">›</button>
    </div>`;

  if (!actual) {
    html += '<div class="btn-wrap"><button class="btn secundario" data-accion="ir-hoy">Volver a esta semana</button></div>';
  }

  html += `
    <div class="progreso">
      <div class="progreso-top">
        <span class="progreso-num">${hechos} de ${total} completadas</span>
        <span class="progreso-pct">${pct}%</span>
      </div>
      <div class="barra"><i style="width:${pct}%"></i></div>
    </div>`;

  if (dieta.notas) {
    html += `<div class="nota"><span>ℹ️</span><p>${esc(dieta.notas)}</p></div>`;
  }

  if (actual) {
    const cHoy = getPlato(dieta, semana.plan.comidas[hoy]);
    const nHoy = getPlato(dieta, semana.plan.cenas[hoy]);
    const fecha = sumarDias(ini, hoy);
    html += `
      <div class="tarjeta-hoy">
        <div class="hoy-head">
          <b>Hoy · ${esc(DIAS[hoy])}</b>
          <span>${fecha.getDate()} ${MESES[fecha.getMonth()]}</span>
        </div>
        ${(!cHoy && !nHoy) ? '<div class="slot"><span class="slot-tipo"></span><div class="slot-cuerpo"><span class="slot-vacio">Día libre 🎉</span></div></div>' : ''}
        ${cHoy ? `<div class="slot"><span class="slot-tipo">Comida</span><div class="slot-cuerpo">${chipHTML(cHoy, 'comidas', null, !!semana.hechos[cHoy.id], false)}</div></div>` : ''}
        ${nHoy ? `<div class="slot"><span class="slot-tipo">Cena</span><div class="slot-cuerpo">${chipHTML(nHoy, 'cenas', null, !!semana.hechos[nHoy.id], false)}</div></div>` : ''}
      </div>`;
  }

  const plegarTodos = estado.ajustes.modoDias !== 'hoy';
  html += `
    <div class="dias-toolbar">
      <button data-accion="modo-dias" data-modo="${plegarTodos ? 'hoy' : 'todos'}">
        ${plegarTodos ? 'Plegar todos menos hoy' : 'Desplegar todos los días'}
      </button>
    </div>`;

  for (let d = 0; d < 7; d++) {
    const fecha = sumarDias(ini, d);
    const platoC = getPlato(dieta, semana.plan.comidas[d]);
    const platoN = getPlato(dieta, semana.plan.cenas[d]);
    const delDia = [platoC, platoN].filter(Boolean);
    const libre = !delDia.length;
    const marcaHoy = actual && d === hoy;
    const abierto = diaAbierto(d);
    const hechosDia = delDia.filter(pl => semana.hechos[pl.id]).length;
    const resumen = libre
      ? 'Día libre'
      : delDia.map(pl => pl.titulo).join(' · ');

    html += `
      <div class="dia${marcaHoy ? ' is-hoy' : ''}${abierto ? '' : ' is-plegado'}">
        <button class="dia-head" data-accion="dia-toggle" data-d="${d}" aria-expanded="${abierto}">
          <span class="dia-nombre">${esc(DIAS[d])}</span>
          <span class="dia-fecha">${fecha.getDate()} ${MESES[fecha.getMonth()]}</span>
          ${marcaHoy ? '<span class="dia-badge hoy">Hoy</span>' : libre ? '<span class="dia-badge libre">Libre</span>' : ''}
          ${!abierto && delDia.length ? `<span class="dia-cuenta">${hechosDia}/${delDia.length}</span>` : ''}
          <span class="dia-chevron" aria-hidden="true"></span>
        </button>
        ${abierto
          ? slotHTML(dieta, semana, 'comidas', d) + slotHTML(dieta, semana, 'cenas', d)
          : `<p class="dia-resumen">${esc(resumen)}</p>`}
      </div>`;
  }

  const fijos = dieta.fijos || {};
  const filas = [
    ['Desayuno', fijos.desayuno],
    ['Media mañana', fijos.media_manana],
    ['Merienda', fijos.merienda],
  ].filter(([, v]) => v);

  if (filas.length) {
    html += `
      <div class="group" style="margin-top:14px">
        <p class="group-title">Todos los días</p>
        <div class="list">
          ${filas.map(([k, v]) => `
            <div class="row">
              <div class="row-main">
                <div class="row-title">${esc(k)}</div>
                <div class="row-sub">${esc(v)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>`;
  }

  html += `
    <div class="btn-wrap" style="margin-top:6px">
      <button class="btn secundario" data-accion="reordenar">Repartir automáticamente</button>
    </div>
    <p class="group-foot" style="margin-bottom:10px">
      Mantén pulsado un plato o usa el asa de la derecha para moverlo a otro día. Toca el texto para más opciones.
      Los platos con 🔒 están fijados por la dieta.
    </p>`;

  cont.innerHTML = html;
}

/* ============================================================
   4. Vista: Compra
   ============================================================ */

const claveSemanaSiguiente = () =>
  claveSemana(sumarDias(fechaDeClave(claveSemana(new Date())), 7));

function ingredientesDe(dieta) {
  const mapa = new Map();
  [...(dieta.comidas || []), ...(dieta.cenas || [])].forEach(plato => {
    (plato.ingredientes || []).forEach(ing => {
      const nombre = String(ing).trim();
      if (!nombre) return;
      const clave = nombre.toLowerCase();
      const previo = mapa.get(clave);
      if (previo) previo.veces++;
      else mapa.set(clave, { nombre, veces: 1, seccion: seccionDe(nombre) });
    });
  });
  return Array.from(mapa.values());
}

/** Desplegable con la dieta completa en texto, para la pestaña de Compra. */
function bloqueDietaHTML(dieta) {
  const abierto = !!estado.ajustes.compraDietaAbierta;
  const fijos = dieta.fijos || {};

  const seccion = (titulo, lineas) => !lineas.length ? '' : `
    <div class="dieta-bloque">
      <h4>${esc(titulo)}</h4>
      ${lineas.map(l => `<p>${esc(l)}</p>`).join('')}
    </div>`;

  const cuerpo = !abierto ? '' : `
    <div class="dieta-texto">
      ${seccion('Desayuno',     fijos.desayuno ? [fijos.desayuno] : [])}
      ${seccion('Media mañana', fijos.media_manana ? [fijos.media_manana] : [])}
      ${seccion('Comidas',      (dieta.comidas || []).map(pl => pl.titulo))}
      ${seccion('Merienda',     fijos.merienda ? [fijos.merienda] : [])}
      ${seccion('Cenas',        (dieta.cenas || []).map(pl => pl.titulo))}
      ${dieta.notas ? `<div class="dieta-bloque"><h4>Nota</h4><p>${esc(dieta.notas)}</p></div>` : ''}
    </div>`;

  return `
    <div class="group">
      <div class="list">
        <button class="row is-tappable" data-accion="compra-dieta-toggle" aria-expanded="${abierto}">
          <div class="row-main"><div class="row-title">Ver la dieta de esa semana</div></div>
          <span class="dia-chevron${abierto ? ' is-abierto' : ''}" aria-hidden="true"></span>
        </button>
        ${cuerpo}
      </div>
    </div>`;
}

function renderCompra() {
  const cont = $('#view-compra');
  const clave = claveSemanaSiguiente();
  const semana = getSemana(clave);
  const dieta = getDieta(semana.dietaId);

  if (!dieta) {
    cont.innerHTML = `
      <div class="vacio">
        <div class="vacio-emoji">🛒</div>
        <h3>Sin dieta asignada</h3>
        <p>Elige qué dieta toca la semana que viene y aquí sale la lista.</p>
        <button class="btn" data-accion="elegir-dieta-compra">Elegir dieta</button>
      </div>`;
    return;
  }

  const items = ingredientesDe(dieta);
  const porSeccion = {};
  items.forEach(it => { (porSeccion[it.seccion] ||= []).push(it); });
  const pendientes = items.filter(it => !semana.compra[it.nombre.toLowerCase()]).length;

  let html = `
    <div class="semana-head" style="padding-bottom:10px">
      <div class="semana-rango" style="text-align:left">
        Semana del ${esc(rangoSemana(clave))}
        <small>${esc(dieta.nombre)}</small>
      </div>
      <button class="semana-nav ancho" data-accion="elegir-dieta-compra">Cambiar</button>
    </div>

    ${bloqueDietaHTML(dieta)}

    <div class="progreso" style="margin-bottom:22px">
      <div class="progreso-top">
        <span class="progreso-num">${pendientes} por comprar</span>
        <span class="progreso-pct">${items.length - pendientes} en el carro</span>
      </div>
      <div class="barra"><i style="width:${items.length ? Math.round(((items.length - pendientes) / items.length) * 100) : 0}%"></i></div>
    </div>`;

  Object.keys(SECCIONES).forEach(clv => {
    const lista = porSeccion[clv];
    if (!lista || !lista.length) return;
    lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    html += `
      <div class="group">
        <p class="group-title">${SECCIONES[clv].icono} ${esc(SECCIONES[clv].nombre)}</p>
        <div class="list">
          ${lista.map(it => {
            const k = it.nombre.toLowerCase();
            const done = !!semana.compra[k];
            return `
              <button class="compra-item${done ? ' is-done' : ''}" data-accion="compra-toggle" data-item="${esc(k)}">
                <span class="tick"><svg viewBox="0 0 16 16"><path d="M3 8.6 6.2 12 13 4.6"/></svg></span>
                <span class="compra-nombre">${esc(it.nombre)}</span>
                ${it.veces > 1 ? `<span class="compra-veces">×${it.veces}</span>` : ''}
              </button>`;
          }).join('')}
        </div>
      </div>`;
  });

  if (!items.length) {
    html += '<div class="vacio"><div class="vacio-emoji">📝</div><h3>Sin ingredientes</h3><p>Los platos de esta dieta no tienen ingredientes anotados.</p></div>';
  }

  html += `
    <div class="btn-wrap"><button class="btn secundario" data-accion="compra-copiar">Copiar o compartir lista</button></div>
    <div class="btn-wrap"><button class="btn secundario" data-accion="compra-reset">Desmarcar todo</button></div>
    <p class="group-foot">La lista sale de la dieta de la semana que viene. Marca lo que ya tengas en casa.</p>`;

  cont.innerHTML = html;
}

function textoLista() {
  const clave = claveSemanaSiguiente();
  const semana = getSemana(clave);
  const dieta = getDieta(semana.dietaId);
  if (!dieta) return '';
  const items = ingredientesDe(dieta).filter(it => !semana.compra[it.nombre.toLowerCase()]);
  const porSeccion = {};
  items.forEach(it => { (porSeccion[it.seccion] ||= []).push(it.nombre); });
  let out = `Compra · semana del ${rangoSemana(clave)} (${dieta.nombre})\n`;
  Object.keys(SECCIONES).forEach(clv => {
    if (!porSeccion[clv]) return;
    out += `\n${SECCIONES[clv].nombre}\n`;
    porSeccion[clv].sort((a, b) => a.localeCompare(b, 'es')).forEach(n => { out += `· ${n}\n`; });
  });
  return out;
}

/* ============================================================
   5. Vista: Ajustes
   ============================================================ */

/** "Cambia a Dieta 2 el lunes 21 de septiembre" — el salto es siempre en lunes. */
function textoProximoCambio() {
  if (!estado.ajustes.plan) return 'Mueve el plan entero si te saltas o repites una semana';

  const claveHoy = claveSemana(new Date());
  const claveSig = claveSemanaSiguiente();
  const actual = getDieta(dietaDeSecuencia(claveHoy));
  const siguiente = getDieta(dietaDeSecuencia(claveSig));
  const lunes = fechaDeClave(claveSig);
  const cuando = `el lunes ${lunes.getDate()} de ${MESES_LARGOS[lunes.getMonth()]}`;

  if (!actual || !siguiente) return 'Mueve el plan entero si te saltas o repites una semana';
  return actual.id === siguiente.id
    ? `Sigues con ${actual.nombre} ${cuando}`
    : `Cambia a ${siguiente.nombre} ${cuando}`;
}

function renderAjustes() {
  const cont = $('#view-ajustes');
  const semana = getSemana(semanaVista);
  const dieta = getDieta(semana.dietaId);
  const tema = estado.ajustes.tema || 'auto';
  const nPlan = indicePlan(semanaVista);

  cont.innerHTML = `
    <div class="group">
      <p class="group-title">Plan</p>
      <div class="list">
        <button class="row is-tappable" data-accion="ajustar-plan">
          <div class="row-main">
            <div class="row-title">Semana del plan</div>
            <div class="row-sub">${esc(textoProximoCambio())}</div>
          </div>
          <span class="row-value">${nPlan ? nPlan + ' de ' + SECUENCIA.length : '—'}</span>
          <span class="row-chevron"></span>
        </button>
        <button class="row is-tappable" data-accion="normas">
          <div class="row-main"><div class="row-title">Normas del plan</div></div>
          <span class="row-chevron"></span>
        </button>
      </div>
    </div>

    <div class="group">
      <p class="group-title">Semana del ${esc(rangoSemana(semanaVista))}</p>
      <div class="list">
        <button class="row is-tappable" data-accion="elegir-dieta-semana">
          <div class="row-main"><div class="row-title">Dieta asignada</div></div>
          <span class="row-value">${esc(dieta ? dieta.nombre : 'Ninguna')}</span>
          <span class="row-chevron"></span>
        </button>
        <button class="row is-tappable action" data-accion="reordenar">
          <div class="row-main"><div class="row-title">Repartir automáticamente</div></div>
        </button>
        <button class="row is-tappable danger" data-accion="reset-marcas">
          <div class="row-main"><div class="row-title">Desmarcar comidas de la semana</div></div>
        </button>
      </div>
    </div>

    <div class="group">
      <p class="group-title">Apariencia</p>
      <div class="list">
        <div style="padding:12px 16px">
          <div class="segmented" data-accion="tema">
            <button data-tema="auto"   class="${tema === 'auto'   ? 'is-on' : ''}">Automático</button>
            <button data-tema="claro"  class="${tema === 'claro'  ? 'is-on' : ''}">Claro</button>
            <button data-tema="oscuro" class="${tema === 'oscuro' ? 'is-on' : ''}">Oscuro</button>
          </div>
        </div>
      </div>
    </div>

    <div class="group">
      <p class="group-title">Mis dietas</p>
      <div class="list">
        ${estado.dietas.map(d => `
          <button class="row is-tappable" data-accion="editar-dieta" data-dieta="${esc(d.id)}">
            <div class="row-main">
              <div class="row-title">${esc(d.nombre)}</div>
              <div class="row-sub">${esc(d.subtitulo || '')}${d.subtitulo ? ' · ' : ''}${(d.comidas || []).length} comidas · ${(d.cenas || []).length} cenas</div>
            </div>
            <span class="row-chevron"></span>
          </button>`).join('')}
        <button class="row is-tappable action" data-accion="nueva-dieta">
          <div class="row-main"><div class="row-title">Nueva dieta</div></div>
        </button>
        <button class="row is-tappable action" data-accion="importar-dieta">
          <div class="row-main"><div class="row-title">Pegar dieta (JSON)</div></div>
        </button>
        <button class="row is-tappable action" data-accion="restaurar-dietas">
          <div class="row-main"><div class="row-title">Restaurar las 9 dietas originales</div></div>
        </button>
      </div>
      <p class="group-foot">Restaurar reescribe las dietas con las del fichero, pero conserva tu progreso semanal.</p>
    </div>

    <div class="group">
      <p class="group-title">Historial</p>
      <div class="list">
        <button class="row is-tappable" data-accion="historial">
          <div class="row-main"><div class="row-title">Semanas anteriores</div></div>
          <span class="row-value">${Object.keys(estado.semanas).length}</span>
          <span class="row-chevron"></span>
        </button>
      </div>
    </div>

    <div class="group">
      <p class="group-title">Datos</p>
      <div class="list">
        <button class="row is-tappable action" data-accion="exportar">
          <div class="row-main"><div class="row-title">Guardar copia de seguridad</div></div>
        </button>
        <button class="row is-tappable action" data-accion="importar">
          <div class="row-main"><div class="row-title">Restaurar copia</div></div>
        </button>
        <button class="row is-tappable danger" data-accion="borrar-todo">
          <div class="row-main"><div class="row-title">Borrar todos los datos</div></div>
        </button>
      </div>
      <p class="group-foot">Los datos se guardan sólo en este dispositivo. Haz una copia de vez en cuando y guárdala en Archivos o iCloud Drive.</p>
    </div>

    <div class="group">
      <div class="list">
        <div class="row">
          <div class="row-main"><div class="row-title">Versión</div></div>
          <span class="row-value">${APP_VER}</span>
        </div>
      </div>
    </div>`;
}

/* ============================================================
   6. Hojas modales
   ============================================================ */

let hojaAbierta = null;

function abrirHoja({ titulo, cuerpo, aceptar, onAceptar, cancelar = 'Cancelar', sinCancelar = false, clase = '' }) {
  cerrarHoja(true);

  const fondo = document.createElement('div');
  fondo.className = 'sheet-backdrop';

  const hoja = document.createElement('div');
  hoja.className = 'sheet ' + clase;
  hoja.innerHTML = `
    <div class="sheet-grabber"></div>
    <div class="sheet-head">
      ${sinCancelar ? '<span></span>' : `<button data-cerrar>${esc(cancelar)}</button>`}
      <b>${esc(titulo || '')}</b>
      ${aceptar ? `<button data-aceptar>${esc(aceptar)}</button>` : '<span></span>'}
    </div>
    <div class="sheet-body">${cuerpo}</div>`;

  $('#sheetHost').append(fondo, hoja);
  requestAnimationFrame(() => { fondo.classList.add('is-open'); hoja.classList.add('is-open'); });

  if (!sinCancelar) {
    fondo.addEventListener('click', () => cerrarHoja());
    hoja.querySelector('[data-cerrar]').addEventListener('click', () => cerrarHoja());
  }

  const btnOk = hoja.querySelector('[data-aceptar]');
  if (btnOk && onAceptar) {
    btnOk.addEventListener('click', () => { if (onAceptar(hoja) !== false) cerrarHoja(); });
  }

  hojaAbierta = { fondo, hoja };
  return hoja;
}

function cerrarHoja(inmediato = false) {
  if (!hojaAbierta) return;
  const { fondo, hoja } = hojaAbierta;
  hojaAbierta = null;
  if (inmediato) { fondo.remove(); hoja.remove(); return; }
  fondo.classList.remove('is-open');
  hoja.classList.remove('is-open');
  setTimeout(() => { fondo.remove(); hoja.remove(); }, 380);
}

function menuAcciones(titulo, opciones) {
  const cuerpo = `
    <div class="acciones">
      <div class="list">
        ${opciones.map((o, i) => `
          <button class="row is-tappable ${o.peligro ? 'danger' : ''}" data-op="${i}">
            <div class="row-main" style="text-align:center"><div class="row-title">${esc(o.texto)}</div></div>
          </button>`).join('')}
      </div>
    </div>`;
  const hoja = abrirHoja({ titulo, cuerpo });
  hoja.querySelectorAll('[data-op]').forEach(btn => {
    btn.addEventListener('click', () => {
      const op = opciones[Number(btn.dataset.op)];
      cerrarHoja();
      setTimeout(() => op.accion && op.accion(), 180);
    });
  });
}

/* ---------- Selector de semana del plan (con slider) ---------- */

function selectorPlan(primeraVez = false) {
  const actual = indicePlan(claveSemana(new Date())) || 1;

  const cuerpo = `
    <div class="onboarding">
      ${primeraVez ? `
        <div class="ob-hero">
          <div class="ob-emoji">🥗</div>
          <h2>Bienvenido</h2>
          <p>Tienes 10 semanas de plan repartidas en 8 dietas. Dime en cuál estás <b>esta semana</b> y a partir de ahí la app va sola.</p>
        </div>` : `
        <p class="group-foot" style="margin:4px 0 20px">
          Esto mueve el plan entero. Úsalo si te has saltado una semana o has repetido alguna.
        </p>`}

      <div class="slider-caja">
        <div class="slider-valor">
          <b id="obNombre"></b>
          <small id="obSub"></small>
        </div>
        <input type="range" id="obRango" min="1" max="${SECUENCIA.length}" step="1" value="${actual}">
        <div class="slider-escala">
          <span>Semana 1</span><span>Semana ${SECUENCIA.length}</span>
        </div>
      </div>

      <div class="ob-lista" id="obLista"></div>
    </div>`;

  const hoja = abrirHoja({
    titulo: primeraVez ? '' : 'Semana del plan',
    cuerpo,
    aceptar: primeraVez ? 'Empezar' : 'Guardar',
    sinCancelar: primeraVez,
    clase: 'alta',
    onAceptar(h) {
      const n = Number(h.querySelector('#obRango').value);
      estado.ajustes.plan = { anclaClave: claveSemana(new Date()), anclaIndice: n };
      // La semana en curso se reasigna a la dieta que toca.
      const clave = claveSemana(new Date());
      const dietaId = SECUENCIA[n - 1];
      const s = getSemana(clave);
      if (s.dietaId !== dietaId) {
        s.dietaId = dietaId;
        s.plan = planAuto(getDieta(dietaId));
        s.hechos = {};
      }
      guardar();
      semanaVista = clave;
      renderTodo();
      toast(primeraVez ? '¡Listo!' : 'Plan actualizado');
    },
  });

  const rango = hoja.querySelector('#obRango');
  const pinta = () => {
    const n = Number(rango.value);
    rango.style.setProperty('--p', ((n - 1) / (SECUENCIA.length - 1)) * 100 + '%');
    const d = getDieta(SECUENCIA[n - 1]);
    hoja.querySelector('#obNombre').textContent = d ? d.nombre : '—';
    hoja.querySelector('#obSub').textContent = `Semana ${n} del plan`;
    hoja.querySelector('#obLista').innerHTML = !d ? '' : `
      <div class="group" style="margin:22px 0 0">
        <p class="group-title">Comidas</p>
        <div class="list">${d.comidas.map(m => `<div class="row"><div class="row-main"><div class="row-title" style="font-size:15px">${esc(m.titulo)}</div></div></div>`).join('')}</div>
      </div>
      <div class="group">
        <p class="group-title">Cenas</p>
        <div class="list">${d.cenas.map(m => `<div class="row"><div class="row-main"><div class="row-title" style="font-size:15px">${esc(m.titulo)}</div></div></div>`).join('')}</div>
      </div>`;
  };
  rango.addEventListener('input', () => { vibrar(4); pinta(); });
  pinta();
}

function verNormas() {
  abrirHoja({
    titulo: 'Normas del plan',
    cancelar: 'Cerrar',
    cuerpo: `
      <div class="group">
        <div class="list">
          ${NORMAS.map(n => `<div class="row"><div class="row-main"><div class="row-sub" style="font-size:15px;color:var(--label)">${esc(n)}</div></div></div>`).join('')}
        </div>
      </div>`,
  });
}

/* ---------- Editor de dieta ---------- */

function editorDieta(dietaId) {
  const nueva = !dietaId;
  const d = nueva
    ? { id: uid('d'), nombre: '', subtitulo: '', notas: '', fijos: {}, comidas: [], cenas: [] }
    : structuredClone(getDieta(dietaId));
  if (!d) return;

  while (d.comidas.length < 6) d.comidas.push({ id: uid('c'), titulo: '', detalle: '', ingredientes: [], dia: null });
  while (d.cenas.length   < 6) d.cenas.push({   id: uid('n'), titulo: '', detalle: '', ingredientes: [], dia: null });

  const opcionesDia = sel => ['<option value="">Libre</option>']
    .concat(DIAS.map((n, i) => `<option value="${i}"${String(sel) === String(i) ? ' selected' : ''}>${n}</option>`))
    .join('');

  const campoPlato = (pl, tipo, i) => `
    <div class="group">
      <p class="group-title">${tipo === 'comidas' ? 'Comida' : 'Cena'} ${i + 1}</p>
      <div class="list">
        <div class="campo"><label>Plato</label>
          <input type="text" data-p="${tipo}.${i}.titulo" value="${esc(pl.titulo)}" placeholder="Pollo a la plancha"></div>
        <div class="campo"><label>Detalle</label>
          <input type="text" data-p="${tipo}.${i}.detalle" value="${esc(pl.detalle || '')}" placeholder="Opcional"></div>
        <div class="campo"><label>Ingredientes para la compra</label>
          <input type="text" data-p="${tipo}.${i}.ingredientes" value="${esc((pl.ingredientes || []).join(', '))}" placeholder="pollo, ensalada"></div>
        <div class="campo"><label>Día fijo</label>
          <select data-p="${tipo}.${i}.dia">${opcionesDia(pl.dia)}</select></div>
      </div>
    </div>`;

  const cuerpo = `
    <div class="group">
      <div class="list">
        <div class="campo"><label>Nombre</label>
          <input type="text" data-p="nombre" value="${esc(d.nombre)}" placeholder="Dieta 9"></div>
        <div class="campo"><label>Subtítulo</label>
          <input type="text" data-p="subtitulo" value="${esc(d.subtitulo || '')}" placeholder="Semana 11"></div>
        <div class="campo"><label>Nota</label>
          <input type="text" data-p="notas" value="${esc(d.notas || '')}" placeholder="Opcional"></div>
      </div>
    </div>
    <div class="group">
      <p class="group-title">Todos los días</p>
      <div class="list">
        <div class="campo"><label>Desayuno</label><input type="text" data-p="fijos.desayuno" value="${esc(d.fijos?.desayuno || '')}"></div>
        <div class="campo"><label>Media mañana</label><input type="text" data-p="fijos.media_manana" value="${esc(d.fijos?.media_manana || '')}"></div>
        <div class="campo"><label>Merienda</label><input type="text" data-p="fijos.merienda" value="${esc(d.fijos?.merienda || '')}"></div>
      </div>
    </div>
    ${d.comidas.map((pl, i) => campoPlato(pl, 'comidas', i)).join('')}
    ${d.cenas.map((pl, i) => campoPlato(pl, 'cenas', i)).join('')}
    ${nueva ? '' : '<div class="btn-wrap"><button class="btn peligro" data-borrar-dieta>Borrar esta dieta</button></div>'}`;

  const hoja = abrirHoja({
    titulo: nueva ? 'Nueva dieta' : 'Editar dieta',
    cuerpo,
    aceptar: 'Guardar',
    clase: 'alta',
    onAceptar(h) {
      h.querySelectorAll('[data-p]').forEach(inp => {
        const ruta = inp.dataset.p.split('.');
        const valor = inp.value.trim();
        if (ruta.length === 1) d[ruta[0]] = valor;
        else if (ruta[0] === 'fijos') { d.fijos ||= {}; d.fijos[ruta[1]] = valor; }
        else {
          const [tipo, idx, campo] = ruta;
          const plato = d[tipo][Number(idx)];
          if (campo === 'ingredientes') plato.ingredientes = valor.split(',').map(s => s.trim()).filter(Boolean);
          else if (campo === 'dia') plato.dia = valor === '' ? null : Number(valor);
          else plato[campo] = valor;
        }
      });

      if (!d.nombre) { toast('Ponle un nombre a la dieta'); return false; }
      d.comidas = d.comidas.filter(pl => pl.titulo);
      d.cenas   = d.cenas.filter(pl => pl.titulo);

      const i = estado.dietas.findIndex(x => x.id === d.id);
      if (i >= 0) estado.dietas[i] = d; else estado.dietas.push(d);

      // Reaplica el plan en las semanas que usan esta dieta y no están empezadas.
      Object.values(estado.semanas).forEach(s => {
        if (s.dietaId === d.id && !Object.keys(s.hechos).length) s.plan = planAuto(d);
      });

      guardar();
      renderTodo();
      toast('Dieta guardada');
    },
  });

  const btnBorrar = hoja.querySelector('[data-borrar-dieta]');
  if (btnBorrar) {
    btnBorrar.addEventListener('click', () => {
      cerrarHoja();
      setTimeout(() => menuAcciones('¿Borrar la dieta?', [{
        texto: 'Borrar', peligro: true, accion() {
          estado.dietas = estado.dietas.filter(x => x.id !== d.id);
          Object.values(estado.semanas).forEach(s => {
            if (s.dietaId === d.id) { s.dietaId = null; s.plan = planVacio(); }
          });
          guardar(); renderTodo(); toast('Dieta borrada');
        },
      }]), 200);
    });
  }
}

/* ---------- Importar dieta pegada ---------- */

function importarDietaPegada() {
  abrirHoja({
    titulo: 'Pegar dieta',
    aceptar: 'Importar',
    cuerpo: `
      <div class="group">
        <div class="list">
          <div class="campo">
            <label>JSON de la dieta</label>
            <textarea data-json placeholder='{"nombre":"Dieta 9","comidas":[…],"cenas":[…]}' style="min-height:220px"></textarea>
          </div>
        </div>
        <p class="group-foot">Mándame las fotos de la hoja nueva y te devuelvo este texto ya montado.</p>
      </div>`,
    onAceptar(h) {
      const txt = h.querySelector('[data-json]').value.trim();
      if (!txt) return false;
      let d;
      try { d = JSON.parse(txt); }
      catch (e) { toast('El texto no es un JSON válido'); return false; }
      if (!d || !Array.isArray(d.comidas) || !Array.isArray(d.cenas)) {
        toast('Faltan las listas de comidas y cenas'); return false;
      }
      const norm = (pl, pre) => ({
        id: pl.id || uid(pre), titulo: pl.titulo || '', detalle: pl.detalle || '',
        ingredientes: pl.ingredientes || [], dia: pl.dia == null ? null : Number(pl.dia),
      });
      d.id = d.id || uid('d');
      d.nombre = d.nombre || 'Dieta importada';
      d.comidas = d.comidas.map(pl => norm(pl, 'c'));
      d.cenas = d.cenas.map(pl => norm(pl, 'n'));
      if (estado.dietas.some(x => x.id === d.id)) d.id = uid('d');
      estado.dietas.push(d);
      guardar();
      renderTodo();
      toast('Dieta importada');
    },
  });
}

/* ---------- Historial ---------- */

function verHistorial() {
  const claves = Object.keys(estado.semanas).sort().reverse().slice(0, 30);
  const cuerpo = claves.length ? `
    <div class="group">
      <div class="list">
        ${claves.map(c => {
          const { hechos, total } = progresoSemana(c);
          const pct = total ? Math.round((hechos / total) * 100) : 0;
          const d = getDieta(estado.semanas[c].dietaId);
          return `
            <button class="row is-tappable" data-ir="${c}">
              <div class="row-main">
                <div class="row-title">${esc(rangoSemana(c))}</div>
                <div class="row-sub">${esc(d ? d.nombre : 'Sin dieta')} · ${hechos}/${total}</div>
              </div>
              <span class="row-value">${pct}%</span>
              <span class="row-chevron"></span>
            </button>`;
        }).join('')}
      </div>
    </div>` : '<div class="vacio"><div class="vacio-emoji">📅</div><h3>Sin historial</h3><p>Aquí verás el seguimiento de las semanas pasadas.</p></div>';

  const hoja = abrirHoja({ titulo: 'Historial', cuerpo, cancelar: 'Cerrar' });
  hoja.querySelectorAll('[data-ir]').forEach(b => b.addEventListener('click', () => {
    semanaVista = b.dataset.ir;
    cerrarHoja();
    cambiarVista('semana');
  }));
}

/* ---------- Elegir dieta ---------- */

function elegirDieta(clave) {
  if (!estado.dietas.length) { toast('Primero crea una dieta'); return; }
  menuAcciones('Dieta para esa semana', estado.dietas.map(d => ({
    texto: d.nombre,
    accion() {
      const s = getSemana(clave);
      s.dietaId = d.id;
      s.plan = planAuto(d);
      s.hechos = {};
      guardar();
      renderTodo();
      toast('Dieta asignada');
    },
  })));
}

/* ============================================================
   7. Arrastrar y soltar
   ============================================================ */

let arrastre = null;

function iniciarArrastre(chip, punto) {
  const slot = chip.closest('.slot[data-dia]');
  if (!slot || chip.dataset.fijo) return;

  const caja = chip.getBoundingClientRect();
  const fantasma = chip.cloneNode(true);
  fantasma.classList.add('chip-drag');
  fantasma.style.width = caja.width + 'px';
  fantasma.style.transform = `translate(${caja.left}px, ${caja.top}px) scale(1.03)`;
  document.body.appendChild(fantasma);

  chip.classList.add('is-ghost');
  document.body.classList.add('is-dragging');
  vibrar(12);

  arrastre = {
    chip, fantasma,
    tipo: slot.dataset.tipo,
    diaOrigen: Number(slot.dataset.dia),
    dx: punto.x - caja.left,
    dy: punto.y - caja.top,
    destino: null,
  };

  document.addEventListener('pointermove', moverArrastre, { passive: false });
  document.addEventListener('pointerup', soltarArrastre);
  document.addEventListener('pointercancel', soltarArrastre);
  moverArrastre({ clientX: punto.x, clientY: punto.y });
}

function moverArrastre(e) {
  if (!arrastre) return;
  if (e.preventDefault) e.preventDefault();
  const x = e.clientX, y = e.clientY;

  arrastre.fantasma.style.transform = `translate(${x - arrastre.dx}px, ${y - arrastre.dy}px) scale(1.03)`;

  const margen = 90;
  if (y < margen) window.scrollBy(0, -Math.ceil((margen - y) / 8));
  else if (y > innerHeight - margen) window.scrollBy(0, Math.ceil((y - (innerHeight - margen)) / 8));

  const bajo = document.elementFromPoint(x, y);
  const slot = bajo && bajo.closest ? bajo.closest('.slot[data-dia]') : null;
  const valido = slot && slot.dataset.tipo === arrastre.tipo && !slot.dataset.fijo;

  if (arrastre.destino !== (valido ? slot : null)) {
    if (arrastre.destino) arrastre.destino.classList.remove('is-target');
    arrastre.destino = valido ? slot : null;
    if (arrastre.destino) { arrastre.destino.classList.add('is-target'); vibrar(6); }
  }
}

function soltarArrastre() {
  if (!arrastre) return;
  const { fantasma, chip, destino, tipo, diaOrigen } = arrastre;

  document.removeEventListener('pointermove', moverArrastre);
  document.removeEventListener('pointerup', soltarArrastre);
  document.removeEventListener('pointercancel', soltarArrastre);
  document.body.classList.remove('is-dragging');
  if (destino) destino.classList.remove('is-target');
  fantasma.remove();
  chip.classList.remove('is-ghost');
  arrastre = null;

  if (!destino) return;
  const diaDestino = Number(destino.dataset.dia);
  if (diaDestino === diaOrigen) return;

  const arr = getSemana(semanaVista).plan[tipo];
  [arr[diaOrigen], arr[diaDestino]] = [arr[diaDestino], arr[diaOrigen]];
  guardar();
  vibrar(14);
  renderSemana();
}

function onPointerDown(e) {
  if (arrastre) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;

  const chip = e.target.closest && e.target.closest('.chip');
  if (!chip || !chip.closest('.slot[data-dia]') || chip.dataset.fijo) return;
  if (e.target.closest('.tick')) return;

  const punto = { x: e.clientX, y: e.clientY };
  let ultimo = { ...punto };

  if (e.target.closest('.grip')) { e.preventDefault(); iniciarArrastre(chip, punto); return; }

  const temporizador = setTimeout(() => { limpiar(); iniciarArrastre(chip, ultimo); }, 280);

  function preMove(ev) {
    ultimo = { x: ev.clientX, y: ev.clientY };
    if (Math.hypot(ultimo.x - punto.x, ultimo.y - punto.y) > 10) limpiar();
  }
  function limpiar() {
    clearTimeout(temporizador);
    document.removeEventListener('pointermove', preMove);
    document.removeEventListener('pointerup', limpiar);
    document.removeEventListener('pointercancel', limpiar);
  }

  document.addEventListener('pointermove', preMove);
  document.addEventListener('pointerup', limpiar);
  document.addEventListener('pointercancel', limpiar);
}

/* ============================================================
   8. Acciones
   ============================================================ */

function accionPlato(platoId, tipo, dia) {
  const semana = getSemana(semanaVista);
  const plato = getPlato(getDieta(semana.dietaId), platoId);
  if (!plato) return;

  const opciones = [{
    texto: semana.hechos[platoId] ? 'Desmarcar' : 'Marcar como hecha',
    accion() { alternarHecho(platoId); },
  }];

  if (dia !== '' && dia != null && plato.dia == null) {
    DIAS.forEach((nombre, i) => {
      if (i === Number(dia)) return;
      const ocupa = getPlato(getDieta(semana.dietaId), semana.plan[tipo][i]);
      if (ocupa && ocupa.dia != null) return;    // no se pisa un día fijo
      opciones.push({
        texto: `Mover a ${nombre}`,
        accion() {
          const arr = semana.plan[tipo];
          const o = Number(dia);
          [arr[o], arr[i]] = [arr[i], arr[o]];
          guardar(); renderSemana();
        },
      });
    });
  }

  menuAcciones(plato.titulo, opciones);
}

function alternarHecho(platoId) {
  const semana = getSemana(semanaVista);
  if (semana.hechos[platoId]) delete semana.hechos[platoId];
  else { semana.hechos[platoId] = true; vibrar(10); }
  guardar();
  renderSemana();
}

function exportarCopia() {
  const nombre = `mi-dieta-${claveSemana(new Date())}.json`;
  const blob = new Blob([JSON.stringify(estado, null, 2)], { type: 'application/json' });

  if (navigator.canShare) {
    try {
      const archivo = new File([blob], nombre, { type: 'application/json' });
      if (navigator.canShare({ files: [archivo] })) {
        navigator.share({ files: [archivo], title: 'Copia de Mi Dieta' }).catch(() => {});
        return;
      }
    } catch (_) {}
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombre;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Copia descargada');
}

function importarCopia() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    if (!f) return;
    const lector = new FileReader();
    lector.onload = () => {
      try {
        const datos = JSON.parse(String(lector.result));
        if (!datos || !Array.isArray(datos.dietas)) throw new Error('formato');
        estado = datos;
        estado.semanas ||= {};
        estado.ajustes ||= { tema: 'auto', plan: null };
        guardar(); aplicarTema(); renderTodo();
        toast('Copia restaurada');
      } catch (e) { toast('El archivo no es una copia válida'); }
    };
    lector.readAsText(f);
  });
  input.click();
}

function copiarLista() {
  const texto = textoLista();
  if (!texto) return;
  if (navigator.share) { navigator.share({ text: texto, title: 'Lista de la compra' }).catch(() => {}); return; }
  navigator.clipboard.writeText(texto)
    .then(() => toast('Lista copiada'))
    .catch(() => toast('No se ha podido copiar'));
}

/* ============================================================
   9. Navegación y render
   ============================================================ */

const TITULOS = { semana: 'Semana', compra: 'Compra', ajustes: 'Ajustes' };

function cambiarVista(v) {
  vistaActual = v;
  $$('.view').forEach(s => { s.hidden = s.dataset.vista !== v; });
  $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.vista === v));
  $('#navTitle').textContent = TITULOS[v];
  $('#largeTitle').textContent = TITULOS[v];
  window.scrollTo(0, 0);
  renderTodo();
}

function renderTodo() {
  if (vistaActual === 'semana') renderSemana();
  else if (vistaActual === 'compra') renderCompra();
  else renderAjustes();
}

function aplicarTema() {
  const t = estado.ajustes.tema || 'auto';
  if (t === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', t);
}

/* ============================================================
   10. Eventos
   ============================================================ */

document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-accion], .tab, [data-tema]');
  if (!el) return;

  if (el.classList.contains('tab')) { cambiarVista(el.dataset.vista); return; }

  if (el.dataset.tema) {
    estado.ajustes.tema = el.dataset.tema;
    guardar(); aplicarTema(); renderAjustes();
    return;
  }

  switch (el.dataset.accion) {
    case 'toggle':      alternarHecho(el.dataset.plato); break;
    case 'plato':       accionPlato(el.dataset.plato, el.dataset.tipo, el.dataset.dia); break;

    case 'semana-prev': semanaVista = claveSemana(sumarDias(fechaDeClave(semanaVista), -7)); renderSemana(); break;
    case 'semana-next': semanaVista = claveSemana(sumarDias(fechaDeClave(semanaVista),  7)); renderSemana(); break;
    case 'ir-hoy':      semanaVista = claveSemana(new Date()); renderSemana(); window.scrollTo(0, 0); break;

    case 'dia-toggle': {
      const d = Number(el.dataset.d);
      estado.ajustes.diasAbiertos = estado.ajustes.diasAbiertos || {};
      estado.ajustes.diasAbiertos[d] = !diaAbierto(d);
      guardar(); renderSemana();
      break;
    }
    case 'modo-dias':
      estado.ajustes.modoDias = el.dataset.modo;
      estado.ajustes.diasAbiertos = {};   // el modo manda sobre los toques sueltos
      guardar(); renderSemana();
      break;

    case 'compra-dieta-toggle':
      estado.ajustes.compraDietaAbierta = !estado.ajustes.compraDietaAbierta;
      guardar(); renderCompra();
      break;

    case 'reordenar': {
      const s = getSemana(semanaVista);
      s.plan = planAuto(getDieta(s.dietaId));
      guardar(); cambiarVista('semana'); toast('Comidas repartidas');
      break;
    }
    case 'reset-marcas':
      getSemana(semanaVista).hechos = {};
      guardar(); renderTodo(); toast('Marcas borradas');
      break;

    case 'ajustar-plan':  selectorPlan(false); break;
    case 'normas':        verNormas(); break;
    case 'nueva-dieta':   editorDieta(null); break;
    case 'editar-dieta':  editorDieta(el.dataset.dieta); break;
    case 'importar-dieta': importarDietaPegada(); break;
    case 'historial':     verHistorial(); break;

    case 'restaurar-dietas':
      menuAcciones('¿Restaurar las dietas originales?', [{
        texto: 'Restaurar', accion() {
          estado.dietas = structuredClone(DIETAS);
          Object.values(estado.semanas).forEach(s => {
            const d = getDieta(s.dietaId);
            if (d && !Object.keys(s.hechos).length) s.plan = planAuto(d);
          });
          guardar(); renderTodo(); toast('Dietas restauradas');
        },
      }]);
      break;

    case 'elegir-dieta-semana': elegirDieta(semanaVista); break;
    case 'elegir-dieta-compra': elegirDieta(claveSemanaSiguiente()); break;

    case 'compra-toggle': {
      const s = getSemana(claveSemanaSiguiente());
      const k = el.dataset.item;
      if (s.compra[k]) delete s.compra[k]; else { s.compra[k] = true; vibrar(8); }
      guardar(); renderCompra();
      break;
    }
    case 'compra-reset':
      getSemana(claveSemanaSiguiente()).compra = {};
      guardar(); renderCompra();
      break;
    case 'compra-copiar': copiarLista(); break;

    case 'exportar': exportarCopia(); break;
    case 'importar': importarCopia(); break;
    case 'borrar-todo':
      menuAcciones('¿Borrar todos los datos?', [{
        texto: 'Borrar todo', peligro: true, accion() {
          localStorage.removeItem(APP_KEY);
          estado = estadoInicial();
          semanaVista = claveSemana(new Date());
          guardar(); aplicarTema(); renderTodo(); selectorPlan(true);
        },
      }]);
      break;
  }
});

document.addEventListener('pointerdown', onPointerDown, { passive: false });
document.addEventListener('touchmove', e => { if (arrastre) e.preventDefault(); }, { passive: false });

/* --- El día (y por tanto la semana) puede cambiar con la app abierta --- */
let diaCargado = new Date().toDateString();

function revisarCambioDeDia() {
  const ahora = new Date().toDateString();
  if (ahora === diaCargado) return;
  diaCargado = ahora;

  // Al cambiar el día, el plegado vuelve a seguir el modo elegido
  // (si no, "todos menos hoy" seguiría señalando al día de ayer).
  estado.ajustes.diasAbiertos = {};
  semanaVista = claveSemana(new Date());
  guardar();
  renderTodo();
}

document.addEventListener('visibilitychange', () => { if (!document.hidden) revisarCambioDeDia(); });
window.addEventListener('focus', revisarCambioDeDia);
window.addEventListener('pageshow', revisarCambioDeDia);
setInterval(revisarCambioDeDia, 60000);

let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    $('#nav').classList.toggle('is-scrolled', window.scrollY > 12);
    ticking = false;
  });
}, { passive: true });

/* ============================================================
   11. Arranque
   ============================================================ */

aplicarTema();
cambiarVista('semana');
if (!estado.ajustes.plan) selectorPlan(true);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
    let recargando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (recargando) return;
      recargando = true;
      toast('Actualizando…');
      setTimeout(() => location.reload(), 900);
    });
  });
}

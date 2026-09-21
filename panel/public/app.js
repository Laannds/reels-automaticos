const ETIQUETAS = {
  "sin-procesar": "Sin procesar",
  "sin-generar": "Sin generar",
  "transcrito": "Transcrito",
  "con-revision": "Con revisión",
  "renderizado": "Renderizado ✓",
  "borrador": "Borrador",
  "listo": "Listo",
  "publicado": "Publicado ✓",
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const getJSON = (url) => fetch(url).then((r) => r.json());
const postJSON = (url, datos) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(datos),
  }).then((r) => r.json());

const escapar = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );

const abrir = (ruta) => fetch(`/api/abrir?ruta=${encodeURIComponent(ruta)}`);

// ── Panel de log en vivo ───────────────────────────────────────────────
const panelLog = $("#panel-log");
$("#cerrar-log").onclick = () => panelLog.classList.add("oculto");

const ejecutar = (titulo, endpoint, alTerminar) => {
  $("#panel-log-titulo").textContent = titulo;
  $("#panel-log-contenido").textContent = "";
  panelLog.classList.remove("oculto");
  const es = new EventSource(endpoint);
  es.onmessage = (e) => {
    const c = $("#panel-log-contenido");
    c.textContent += JSON.parse(e.data) + "\n";
    c.scrollTop = c.scrollHeight;
  };
  es.addEventListener("fin", (e) => {
    es.close();
    $("#panel-log-contenido").textContent += `\n— terminado (código ${e.data}) —`;
    alTerminar?.();
  });
};

// ── Navegación ─────────────────────────────────────────────────────────
$("#nav").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-seccion]");
  if (!btn) return;
  $$("#nav button").forEach((b) => b.classList.toggle("activo", b === btn));
  $$(".seccion").forEach((s) =>
    s.classList.toggle("activa", s.id === `seccion-${btn.dataset.seccion}`)
  );
});

// ── Producción ─────────────────────────────────────────────────────────
const cargarCrudos = async () => {
  const crudos = await getJSON("/api/crudos");
  $("#contador-crudos").textContent = `(${crudos.length})`;
  $("#lista-crudos").innerHTML =
    crudos
      .map(
        (c) => `
    <div class="tarjeta">
      <div class="tarjeta-titulo">${escapar(c.slug)}</div>
      <span class="badge ${c.estado}">${ETIQUETAS[c.estado]}</span>
      <div class="acciones">
        <button data-accion="sugerir" data-slug="${escapar(c.slug)}">Transcribir</button>
        <button data-accion="render-crudo" data-slug="${escapar(c.slug)}" ${
          c.estado === "sin-procesar" ? "disabled" : ""
        } class="primario">Renderizar</button>
        ${c.salida ? `<button data-accion="abrir" data-ruta="${escapar(c.salida)}">▶ Ver</button>` : ""}
      </div>
    </div>`
      )
      .join("") || "<p class='vacio'>No hay crudos en la carpeta.</p>";
};

const cargarHistorias = async () => {
  const historias = await getJSON("/api/historias");
  $("#contador-historias").textContent = `(${historias.length})`;
  $("#lista-historias").innerHTML =
    historias
      .map(
        (h) => `
    <div class="tarjeta">
      <div class="tarjeta-titulo">${escapar(h.titulo)}</div>
      <span class="badge ${h.estado}">${ETIQUETAS[h.estado]}</span>
      <div class="acciones">
        <button data-accion="render-historia" data-slug="${escapar(h.slug)}" class="primario">Renderizar</button>
        ${h.salida ? `<button data-accion="abrir" data-ruta="${escapar(h.salida)}">▶ Ver</button>` : ""}
      </div>
    </div>`
      )
      .join("") || "<p class='vacio'>No hay guiones en content/.</p>";
};

// ── Planificación ──────────────────────────────────────────────────────
const cargarEstadoConexiones = async () => {
  const estado = await getJSON("/api/publicacion/estado");
  const linea = (nombre, e) =>
    e.listo
      ? `<span class="ok">● ${nombre} conectado</span>`
      : `<span class="pendiente">○ ${nombre}: falta ${e.falta.join(", ")}</span>`;
  const todoListo = estado.instagram.listo && estado.tiktok.listo;
  $("#estado-conexiones").innerHTML = `
    ${linea("Instagram", estado.instagram)}
    ${linea("TikTok", estado.tiktok)}
    ${
      todoListo
        ? ""
        : `<p class="aviso-ayuda">Rellena <code>panel/datos/credenciales.json</code> con tus tokens
           para activar la publicación automática. El calendario funciona igualmente sin ellos.</p>`
    }`;
};

const cargarRenderizados = async () => {
  const videos = await getJSON("/api/renderizados");
  $("#nuevo-archivo").innerHTML =
    videos.map((v) => `<option value="${escapar(v.archivo)}">${escapar(v.nombre)}</option>`).join("") ||
    "<option value=''>No hay vídeos renderizados</option>";
};

const formatearFecha = (iso) => {
  if (!iso) return "sin fecha";
  const d = new Date(iso);
  return d.toLocaleString("es-ES", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
};

const cargarCalendario = async () => {
  const entradas = (await getJSON("/api/calendario")).sort((a, b) =>
    (a.fecha ?? "").localeCompare(b.fecha ?? "")
  );
  $("#contador-calendario").textContent = `(${entradas.length})`;
  $("#lista-calendario").innerHTML =
    entradas
      .map((e) => {
        const publicadas = e.publicadoEn ?? [];
        const botones = (e.redes ?? [])
          .map((red) =>
            publicadas.includes(red)
              ? `<span class="chip-ok">${red} ✓</span>`
              : `<button data-accion="publicar" data-id="${escapar(e.id)}" data-red="${red}">Publicar en ${red}</button>`
          )
          .join("");
        return `
      <div class="fila-calendario" data-fila="${escapar(e.id)}">
        <div class="fila-fecha">${escapar(formatearFecha(e.fecha))}</div>
        <div class="fila-cuerpo">
          <div class="tarjeta-titulo">${escapar(e.archivo ?? "—")}</div>
          <span class="badge ${e.estado}">${ETIQUETAS[e.estado] ?? e.estado}</span>
          <p class="caption">${escapar(e.caption ?? "")}</p>
          <div class="acciones">
            ${botones}
            <button data-accion="editar-entrada" data-id="${escapar(e.id)}">Editar</button>
            <button data-accion="borrar-entrada" data-id="${escapar(e.id)}">Quitar</button>
          </div>
        </div>
      </div>`;
      })
      .join("") || "<p class='vacio'>Nada programado todavía.</p>";
};

// ── Probar conexión con las APIs ───────────────────────────────────────
$("#btn-probar-conexion").onclick = async () => {
  const btn = $("#btn-probar-conexion");
  const salida = $("#resultado-prueba");
  btn.disabled = true;
  btn.textContent = "Probando…";
  salida.textContent = "";
  try {
    const r = await postJSON("/api/publicacion/probar", {});
    const NOMBRES = { instagram: "Instagram", tiktok: "TikTok", tunel: "Túnel público" };
    salida.innerHTML = Object.entries(r)
      .map(
        ([clave, v]) =>
          `<div class="${v.ok ? "prueba-ok" : "prueba-fallo"}">${v.ok ? "✅" : "❌"} ${
            NOMBRES[clave] ?? clave
          }: ${escapar(v.mensaje)}</div>`
      )
      .join("");
  } catch (err) {
    salida.textContent = `No se pudo probar: ${err.message}`;
  }
  btn.disabled = false;
  btn.textContent = "Probar conexión";
};

// ── Planificador automático ────────────────────────────────────────────
const cargarPlanificador = async () => {
  const p = await getJSON("/api/planificador");
  $("#planificador-activo").checked = p.activo;
  $("#planificador-info").textContent = p.activo
    ? `Revisando cada minuto · ${p.pendientes} pendiente(s) ahora mismo`
    : "Parado: nada se publicará solo";

  $("#historial").innerHTML =
    p.historial
      .map(
        (h) => `
      <div class="historial-fila ${h.ok ? "ok" : "fallo"}">
        <span>${h.ok ? "✅" : "❌"}</span>
        <span>${escapar(formatearFecha(h.cuando))}</span>
        <span>${escapar(h.archivo ?? "—")}${h.red ? ` · ${escapar(h.red)}` : ""}</span>
        <span class="pista">${escapar(h.mensaje ?? "")}</span>
      </div>`
      )
      .join("") || "<p class='vacio'>Todavía no ha publicado nada.</p>";
};

$("#planificador-activo").onchange = async (e) => {
  await postJSON("/api/planificador", { activo: e.target.checked });
  cargarPlanificador();
};

$("#btn-revisar-ahora").onclick = async () => {
  const btn = $("#btn-revisar-ahora");
  btn.disabled = true;
  btn.textContent = "Revisando…";
  const r = await postJSON("/api/planificador/revisar", {});
  btn.disabled = false;
  btn.textContent = "Revisar ahora";
  if (r.hechos.length === 0) alert("No había nada pendiente de publicar.");
  cargarPlanificador();
  cargarCalendario();
};

$("#btn-programar").onclick = async () => {
  const archivo = $("#nuevo-archivo").value;
  if (!archivo) return alert("No hay ningún vídeo renderizado que programar.");
  const redes = $$(".redes input:checked").map((i) => i.value);
  await postJSON("/api/calendario", {
    archivo,
    fecha: $("#nueva-fecha").value,
    caption: $("#nuevo-caption").value,
    redes,
    estado: "listo",
  });
  $("#nuevo-caption").value = "";
  cargarCalendario();
};

// ── Respuestas automáticas ─────────────────────────────────────────────
const ETIQUETA_DISPARADOR = {
  comentario: "Comentario",
  dm: "Mensaje directo",
  mencion_historia: "Mención en historia",
};
const ETIQUETA_CONDICION = {
  contiene: "contiene",
  exacto: "es exactamente",
  cualquiera: "cualquier mensaje",
};
const ETIQUETA_ACCION = {
  responder_comentario: "Responde al comentario",
  enviar_dm: "Envía DM",
  etiquetar: "Etiqueta",
};

const cargarAutomatizaciones = async () => {
  const { reglas } = await getJSON("/api/automatizaciones");
  $("#contador-autos").textContent = `(${reglas.length})`;
  $("#lista-autos").innerHTML =
    reglas
      .map((r) => {
        const d = r.disparador ?? {};
        const claves = (d.palabras ?? []).map((p) => `<code>${escapar(p)}</code>`).join(" ");
        const acciones = (r.acciones ?? [])
          .map(
            (a) =>
              `<li><b>${escapar(ETIQUETA_ACCION[a.tipo] ?? a.tipo)}:</b> ${escapar(
                a.texto ?? a.etiqueta ?? ""
              )}</li>`
          )
          .join("");
        return `
      <div class="regla ${r.activa ? "" : "apagada"}">
        <div class="regla-cabecera">
          <div>
            <div class="tarjeta-titulo">${escapar(r.nombre)}</div>
            <div class="regla-disparador">
              ${escapar(ETIQUETA_DISPARADOR[d.tipo] ?? d.tipo)} ·
              ${escapar(ETIQUETA_CONDICION[d.condicion] ?? d.condicion)}
              ${claves}
            </div>
          </div>
          <span class="badge ${r.activa ? "publicado" : "borrador"}">${r.activa ? "Activa" : "Pausada"}</span>
        </div>
        <ul class="regla-acciones">${acciones}</ul>
        <div class="regla-pie">
          <span class="pista">${r.estadisticas?.disparos ?? 0} disparos</span>
          <div class="acciones">
            <button data-accion="toggle-auto" data-id="${escapar(r.id)}">${r.activa ? "Pausar" : "Activar"}</button>
            <button data-accion="borrar-auto" data-id="${escapar(r.id)}">Borrar</button>
          </div>
        </div>
      </div>`;
      })
      .join("") || "<p class='vacio'>Todavía no hay automatizaciones.</p>";
};

$("#btn-guardar-auto").onclick = async () => {
  const nombre = $("#auto-nombre").value.trim();
  if (!nombre) return alert("Ponle un nombre a la automatización.");

  const acciones = [];
  const respuesta = $("#auto-respuesta").value.trim();
  const dm = $("#auto-dm").value.trim();
  const etiqueta = $("#auto-etiqueta").value.trim();
  if (respuesta) acciones.push({ tipo: "responder_comentario", texto: respuesta });
  if (dm) acciones.push({ tipo: "enviar_dm", texto: dm });
  if (etiqueta) acciones.push({ tipo: "etiquetar", etiqueta });
  if (acciones.length === 0) return alert("Define al menos una respuesta o etiqueta.");

  await postJSON("/api/automatizaciones", {
    nombre,
    disparador: {
      tipo: $("#auto-tipo").value,
      condicion: $("#auto-condicion").value,
      palabras: $("#auto-palabras").value.split(",").map((p) => p.trim()).filter(Boolean),
    },
    acciones,
  });

  ["#auto-nombre", "#auto-palabras", "#auto-respuesta", "#auto-dm", "#auto-etiqueta"].forEach(
    (s) => ($(s).value = "")
  );
  cargarAutomatizaciones();
};

$("#btn-simular").onclick = async () => {
  const r = await postJSON("/api/automatizaciones/simular", {
    tipo: $("#sim-tipo").value,
    texto: $("#sim-texto").value,
    usuario: $("#sim-usuario").value,
  });

  if (!r.coincide) {
    $("#resultado-simulacion").innerHTML =
      "<div class='error'>Ninguna automatización saltaría con ese mensaje.</div>";
    return;
  }
  const pasos = r.acciones
    .map((a) => `<li><b>${escapar(ETIQUETA_ACCION[a.tipo] ?? a.tipo)}:</b> ${escapar(a.texto ?? a.etiqueta ?? "")}</li>`)
    .join("");
  $("#resultado-simulacion").innerHTML = `
    <div class="ok-caja">
      <b>Saltaría:</b> ${escapar(r.regla.nombre)}
      <ul class="regla-acciones">${pasos}</ul>
    </div>`;
};

// ── Ideas IA ───────────────────────────────────────────────────────────
let guionGenerado = null;

$("#btn-generar-idea").onclick = async () => {
  const btn = $("#btn-generar-idea");
  btn.disabled = true;
  btn.textContent = "Generando…";
  $("#resultado-idea").innerHTML = "";

  const r = await postJSON("/api/ideas/generar", {
    linea: Number($("#idea-linea").value),
    tema: $("#idea-tema").value.trim(),
  });

  btn.disabled = false;
  btn.textContent = "Generar guión";

  if (!r.ok) {
    $("#resultado-idea").innerHTML = `<div class="error">❌ ${escapar(r.error)}</div>`;
    return;
  }

  guionGenerado = r.guion;
  const escenas = (r.guion.escenas ?? [])
    .map((e) => `<li><b>${escapar(e.tipo)}</b> · ${escapar(e.duracion)}s — ${escapar(e.texto)}</li>`)
    .join("");
  $("#resultado-idea").innerHTML = `
    <div class="guion">
      <h3>${escapar(r.guion.titulo)}</h3>
      <ul>${escenas}</ul>
      <div class="acciones">
        <input type="text" id="idea-slug" placeholder="nombre-del-archivo" />
        <button class="primario" id="btn-guardar-idea">Guardar en content/</button>
      </div>
    </div>`;

  $("#btn-guardar-idea").onclick = async () => {
    const slug = $("#idea-slug").value.trim();
    if (!slug) return alert("Ponle un nombre al archivo.");
    const g = await postJSON("/api/ideas/guardar", { slug, guion: guionGenerado });
    if (g.ok) {
      $("#resultado-idea").innerHTML = `<div class="ok-caja">✅ Guardado como <code>content/${escapar(g.slug)}.json</code> — ya aparece en Producción.</div>`;
      cargarHistorias();
    }
  };
};

// ── Acciones delegadas ─────────────────────────────────────────────────
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-accion]");
  if (!btn) return;
  const { accion, slug, ruta, id, red } = btn.dataset;

  if (accion === "abrir") return abrir(ruta);
  if (accion === "sugerir")
    return ejecutar(`Transcribiendo ${slug}…`, `/api/run/crudo-sugerir?slug=${slug}`, cargarCrudos);
  if (accion === "render-crudo")
    return ejecutar(`Renderizando ${slug}…`, `/api/run/crudo-render?slug=${slug}`, () => {
      cargarCrudos();
      cargarRenderizados();
    });
  if (accion === "render-historia")
    return ejecutar(`Renderizando ${slug}…`, `/api/run/historia-render?slug=${slug}`, () => {
      cargarHistorias();
      cargarRenderizados();
    });
  if (accion === "publicar")
    return ejecutar(`Publicando en ${red}…`, `/api/publicar?id=${id}&red=${red}`, cargarCalendario);
  if (accion === "borrar-entrada") {
    await fetch(`/api/calendario?id=${id}`, { method: "DELETE" });
    return cargarCalendario();
  }
  if (accion === "editar-entrada") {
    const entrada = (await getJSON("/api/calendario")).find((x) => x.id === id);
    const fila = document.querySelector(`[data-fila="${id}"] .fila-cuerpo`);
    fila.innerHTML = `
      <div class="tarjeta-titulo">${escapar(entrada.archivo)}</div>
      <label class="pista">Fecha y hora
        <input type="datetime-local" class="edit-fecha" value="${escapar(entrada.fecha ?? "")}" />
      </label>
      <label class="pista">Caption
        <textarea class="edit-caption" rows="4">${escapar(entrada.caption ?? "")}</textarea>
      </label>
      <label class="pista">Estado
        <select class="edit-estado">
          ${["borrador", "listo", "publicado", "error"]
            .map((s) => `<option value="${s}" ${entrada.estado === s ? "selected" : ""}>${ETIQUETAS[s] ?? s}</option>`)
            .join("")}
        </select>
      </label>
      <div class="acciones">
        <button class="primario" data-accion="guardar-entrada" data-id="${escapar(id)}">Guardar</button>
        <button data-accion="cancelar-edicion">Cancelar</button>
      </div>`;
    return;
  }
  if (accion === "guardar-entrada") {
    const fila = document.querySelector(`[data-fila="${id}"]`);
    await postJSON("/api/calendario", {
      id,
      fecha: fila.querySelector(".edit-fecha").value,
      caption: fila.querySelector(".edit-caption").value,
      estado: fila.querySelector(".edit-estado").value,
    });
    return cargarCalendario();
  }
  if (accion === "cancelar-edicion") return cargarCalendario();
  if (accion === "toggle-auto") {
    const { reglas } = await getJSON("/api/automatizaciones");
    const regla = reglas.find((r) => r.id === id);
    await postJSON("/api/automatizaciones", { id, activa: !regla.activa });
    return cargarAutomatizaciones();
  }
  if (accion === "borrar-auto") {
    await fetch(`/api/automatizaciones?id=${id}`, { method: "DELETE" });
    return cargarAutomatizaciones();
  }
});

cargarCrudos();
cargarHistorias();
cargarRenderizados();
cargarEstadoConexiones();
cargarCalendario();
cargarPlanificador();
cargarAutomatizaciones();

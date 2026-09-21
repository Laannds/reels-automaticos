#!/usr/bin/env node
/**
 * Control de calidad de un reel ya renderizado.
 *
 *   node scripts/qa-reel.mjs <slug> [--revision ruta/revision.json]
 *
 * editar-crudo.mjs lo lanza solo tras el máster (salvo con --sin-qa). Revisa lo
 * que hasta ahora se pillaba a ojo, casi siempre cuando ya lo había visto el
 * cliente:
 *
 *   1. Gráficos o subtítulos encima de una cara (también en el b-roll).
 *   2. Texto en las zonas que tapa la interfaz de Instagram/TikTok.
 *   3. Elementos desplazados de su palabra, CTA que acaba antes que el vídeo.
 *   4. Subtítulos "relámpago" (visibles menos de 0,3 s).
 *   5. Palabras que Whisper transcribió con poca confianza y nadie corrigió.
 *   6. Gráficos que coinciden en tiempo y altura (posible solape).
 *   7. Tramos largos sin ningún cambio visual (retención).
 *   8. Sonoridad final (-14 LUFS, pico real ≤ -1 dBTP).
 *
 * Cómo sabe qué tapa cada gráfico: renderiza el reel en "modo QA" (solo
 * gráficos y subtítulos sobre fondo transparente, a 1/4 de resolución). El
 * canal alfa es la huella exacta de lo que se pinta, sin estimar tamaños.
 * Las caras salen del framework Vision de macOS (scripts/qa/caras.swift).
 *
 * Deja: out/<slug>-QA.png (fotogramas de cada incidencia, marcados),
 *       public/generated/<slug>/qa.json
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { paginaEn, paginar, tramosSilenciados } from "../src/paginar.ts";

const RAIZ = resolve(new URL("..", import.meta.url).pathname);
const slug = process.argv[2];
if (!slug) {
  console.error("Uso: node scripts/qa-reel.mjs <slug> [--revision ruta]");
  process.exit(1);
}
const iRev = process.argv.indexOf("--revision");
const dirGen = join(RAIZ, "public", "generated", slug);
const rutaRevision = iRev > -1 ? resolve(RAIZ, process.argv[iRev + 1]) : join(dirGen, "revision.json");
const props = JSON.parse(readFileSync(join(dirGen, "props.json"), "utf8"));
const revision = existsSync(rutaRevision) ? JSON.parse(readFileSync(rutaRevision, "utf8")) : null;
const mp4 = join(RAIZ, "out", `${slug}-editado.mp4`);
const dirQA = join(dirGen, "qa");
rmSync(dirQA, { recursive: true, force: true });
mkdirSync(dirQA, { recursive: true });

const MUESTRAS_S = 4; // muestras por segundo para caras y zonas
const FPS = 30;
const duracion = props.segmentos.reduce((a, s) => a + (s.srcFin - s.srcInicio), 0);
const elementos = props.elementos;
const fin = (e) => e.t + (e.duracion ?? 3);
const activosEn = (t) =>
  elementos.filter((e) => t >= e.t && t < fin(e) && !(e.ocultar ?? []).some(([a, b]) => t >= a && t <= b));

// Umbrales
const UMBRAL_ALFA = 100; // 0-255: a partir de aquí un píxel "tapa" (paneles al 55% ya cuentan)
const TAPA_CARA = 0.1; // fracción del NÚCLEO de la cara cubierta que ya se considera tapada
const CARA_MINIMA = 0.07; // alto mínimo (0-1) para contar como protagonista: por debajo son
                          // espectadores o gente de fondo (en la grada del Bernabéu, 0,05)
const TAPA_ESTIMADA = 0.25; // cabeza estimada por silueta: más margen, es menos precisa
const ZONAS = {
  // Coordenadas 0-1. Instagram y TikTok pintan su interfaz encima del vídeo.
  arriba: { x0: 0, x1: 1, y0: 0, y1: 0.06, que: "cabecera de la app" },
  abajo: { x0: 0, x1: 1, y0: 0.83, y1: 1, que: "texto del post, usuario y audio" },
  derecha: { x0: 0.88, x1: 1, y0: 0.45, y1: 0.83, que: "botones de like/comentar/compartir" },
};

const ffmpeg = (args) => execFileSync("ffmpeg", ["-v", "error", "-y", ...args], { stdio: "pipe" });
const incidencias = [];
const avisar = (grupo, gravedad, t, texto, extra = {}) =>
  incidencias.push({ grupo, gravedad, t: Math.round(t * 100) / 100, texto, ...extra });

// ── 1. Máscara de gráficos (render transparente a 1/4) ────────────────────
console.log("🔍 QA: renderizando la huella de los gráficos...");
const propsQA = join(dirQA, "props-qa.json");
writeFileSync(propsQA, JSON.stringify({ ...props, qa: true }));
const mascara = join(dirQA, "mascara.mov");
const r = spawnSync(
  "npx",
  [
    "remotion", "render", "ReelCrudo", mascara, `--props=${propsQA}`,
    "--scale=0.25", "--muted", "--codec=prores", "--prores-profile=4444",
    "--pixel-format=yuva444p10le", "--image-format=png", "--log=error",
  ],
  { cwd: RAIZ, stdio: "pipe", encoding: "utf8" }
);
if (r.status !== 0) {
  console.error("❌ QA: no se pudo renderizar la máscara\n" + (r.stderr ?? "").slice(-800));
  process.exit(1);
}
ffmpeg(["-i", mascara, "-vf", `fps=${MUESTRAS_S}`, join(dirQA, "m_%04d.png")]);
const nMuestras = readdirSync(dirQA).filter((f) => f.startsWith("m_")).length;
const tMuestra = (k) => k / MUESTRAS_S; // k empieza en 0
const rutaMascara = (k) => join(dirQA, `m_${String(k + 1).padStart(4, "0")}.png`);

// ── 2. Caras: vídeo base y b-roll, en coordenadas de PANTALLA ─────────────
console.log("🔍 QA: buscando caras (Vision)...");
const binCaras = join(RAIZ, "scripts", "qa", ".bin", "caras");
const fuenteCaras = join(RAIZ, "scripts", "qa", "caras.swift");
if (!existsSync(binCaras) || statSync(binCaras).mtimeMs < statSync(fuenteCaras).mtimeMs) {
  mkdirSync(join(RAIZ, "scripts", "qa", ".bin"), { recursive: true });
  execFileSync("swiftc", ["-O", fuenteCaras, "-o", binCaras], { stdio: "pipe" });
}

// Tiempo de salida → tiempo en el crudo (los cortes comprimen el tiempo)
const aFuente = (t) => {
  let acc = 0;
  for (let i = 0; i < props.segmentos.length; i++) {
    const s = props.segmentos[i];
    const d = s.srcFin - s.srcInicio;
    if (t < acc + d || i === props.segmentos.length - 1) return { src: s.srcInicio + (t - acc), seg: i, local: t - acc };
    acc += d;
  }
};

// Réplica de las escalas que el render aplica al vídeo base. Si cambian en
// ReelCrudo.tsx (ZoomInterno, VideoCortado, ZoomTransiciones, BRoll), cambian
// aquí: son las que desplazan las caras respecto al crudo.
const cubico = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
const salidaCubica = (p) => 1 - Math.pow(1 - p, 3);
const escalaBase = (t) => {
  const { seg, local } = aFuente(t);
  const base = 1 + (Math.floor(seg / 2) % 2 === 0 ? 0 : 0.08);
  let escala = base * (1 + Math.round(local * FPS) * 0.00025);
  for (const tr of elementos.filter((e) => e.tipo === "transicion")) {
    const d = tr.duracion ?? 0.65;
    if (t < tr.t || t > tr.t + d) continue;
    const p = (t - tr.t) / d;
    if (tr.dato === "zoomOut") escala *= 1.22 - 0.22 * salidaCubica(p);
    else if (tr.dato !== "fade" && tr.dato !== "fadeBlanco")
      escala *= p < 0.35 ? 1 + 0.16 * cubico(p / 0.35) : 1.16 - 0.16 * cubico((p - 0.35) / 0.65);
  }
  return escala;
};
const aPantalla = (c, s) => ({
  ...c,
  x: 0.5 + (c.x - 0.5) * s,
  y: 0.5 + (c.y - 0.5) * s,
  w: c.w * s,
  h: c.h * s,
});

const brolls = elementos.filter((e) => e.tipo === "broll");
const brollEn = (t) => brolls.find((e) => t >= e.t && t < fin(e));

// Fotogramas a analizar: del crudo (fps fijo, se indexan por tiempo) y de
// cada b-roll durante su tramo
const fotosCrudo = join(dirQA, "c_%05d.png");
if (props.video) ffmpeg(["-i", join(RAIZ, "public", props.video), "-vf", `fps=${MUESTRAS_S},scale=540:-2`, fotosCrudo]);
const fotosBroll = {};
brolls.forEach((b, i) => {
  const patron = join(dirQA, `b${i}_%04d.png`);
  ffmpeg(["-i", join(RAIZ, "public", b.dato), "-vf", `fps=${MUESTRAS_S},scale=540:-2`, patron]);
  fotosBroll[i] = patron;
});
const rutaCrudo = (src) => join(dirQA, `c_${String(Math.round(src * MUESTRAS_S) + 1).padStart(5, "0")}.png`);
const rutaBroll = (i, local) => fotosBroll[i].replace("%04d", String(Math.round(local * MUESTRAS_S) + 1).padStart(4, "0"));

const plan = []; // { k, t, foto, escala, origen }
for (let k = 0; k < nMuestras; k++) {
  const t = tMuestra(k);
  if (t > duracion) break;
  const b = brollEn(t);
  if (b) {
    const i = brolls.indexOf(b);
    const local = t - b.t;
    plan.push({ k, t, foto: rutaBroll(i, local), escala: 1.06 + Math.round(local * FPS) * 0.0012, origen: "b-roll" });
  } else if (props.video) {
    plan.push({ k, t, foto: rutaCrudo(aFuente(t).src), escala: escalaBase(t), origen: "vídeo" });
  }
}
const existentes = plan.filter((p) => existsSync(p.foto));
const caras = JSON.parse(
  execFileSync(binCaras, existentes.map((p) => p.foto), { maxBuffer: 64 * 1024 * 1024 }).toString() || "{}"
);

// ── Utilidades de imagen (PIL, en un solo proceso para todo el lote) ──────
const python = (codigo, entrada) =>
  JSON.parse(execFileSync("python3", ["-c", codigo], { input: JSON.stringify(entrada), maxBuffer: 64 * 1024 * 1024 }).toString());
const MEDIR = `
import json, sys
from PIL import Image, ImageFilter
tareas = json.load(sys.stdin); out = []
cache = {}
for t in tareas:
    clave = (t["m"], t.get("engordar", 0))
    if clave not in cache:
        a = Image.open(t["m"]).getchannel("A").point(lambda v: 255 if v > ${UMBRAL_ALFA} else 0)
        # Para las caras la máscara se "engorda": un anillo o un texto son
        # trazos finos con huecos transparentes y taparían poco en píxeles,
        # pero el ojo los ve encima de la cara igual.
        if t.get("engordar"): a = a.filter(ImageFilter.MaxFilter(t["engordar"]))
        cache = {clave: a}
    a = cache[clave]; W, H = a.size
    x0, y0 = max(0, int(t["x0"] * W)), max(0, int(t["y0"] * H))
    x1, y1 = min(W, int(t["x1"] * W + 0.999)), min(H, int(t["y1"] * H + 0.999))
    if x1 <= x0 or y1 <= y0: out.append([0, 0]); continue
    h = a.crop((x0, y0, x1, y1)).histogram()
    out.append([h[255], (x1 - x0) * (y1 - y0)])
print(json.dumps(out))
`;

// ── 3. Chequeos de imagen: caras y zonas seguras ──────────────────────────
// En los remates que oscurecen toda la pantalla (sin "y"), tapar es a propósito
const oscurece = (t) =>
  elementos.some(
    (e) => ((e.tipo === "remate" && e.y === undefined) || e.tipo === "movil") && t >= e.t && t < fin(e)
  );
const silenciar = tramosSilenciados(elementos);
const paginas = paginar(props.palabras, silenciar);
// Quién puede ser el responsable: lo que está en pantalla en ese instante y,
// si se pasa una franja vertical [y0, y1], solo lo que cae cerca de ella (la
// máscara lo junta todo; así no se culpa a unos subtítulos que están abajo de
// que se tape una cara que está arriba). Los gráficos sin "y" usan su sitio
// por defecto, que aquí no se conoce: se incluyen siempre.
// Ancho horizontal aproximado de los gráficos que no ocupan toda la fila
const anchoX = (e) =>
  e.tipo === "icono" ? [0.72, 0.86] // fijo a la derecha (right: 150, 138 px)
  : e.tipo === "contador" ? [(e.x ?? 0.5) - 0.085, (e.x ?? 0.5) + 0.085]
  : ["regalo", "interrogantes"].includes(e.tipo) && e.x !== undefined ? [e.x - 0.13, e.x + 0.13]
  : [0, 1];
const culpables = (t, franja = null, franjaX = null) => {
  const cerca = (y) => !franja || y === undefined || (y > franja[0] - 0.12 && y < franja[1] + 0.12);
  const cercaX = (e) => {
    if (!franjaX) return true;
    const [a, b] = anchoX(e);
    return b > franjaX[0] - 0.03 && a < franjaX[1] + 0.03;
  };
  const v = activosEn(t)
    .filter((e) => !["broll", "transicion"].includes(e.tipo) && cerca(e.y) && cercaX(e))
    .map((e) => `${e.tipo}${e.dato ? ` "${String(e.dato).replace(/^bocadillo:/, "").split("|")[0].replace(/[=@].*$/, "")}"` : ""}`);
  const ySub = props.subtitulosY ?? 0.54;
  if (paginaEn(paginas, silenciar, t) && props.subtitulos !== "ninguno" && (!franja || (ySub < franja[1] + 0.05 && ySub + 0.08 > franja[0] - 0.05)))
    v.push("subtítulos");
  return v;
};

const tareas = [];
const meta = [];
for (const p of existentes) {
  if (oscurece(p.t)) continue;
  for (const c of caras[p.foto] ?? []) {
    if (c.h < CARA_MINIMA) continue;
    const cp = aPantalla(c, p.escala);
    // Se mide solo el NÚCLEO: ojos, nariz y boca. La caja de Vision ya viene
    // ampliada hacia la frente y, contando bordes, un panel pegado DEBAJO de la
    // barbilla o un titular rozando el pelo salían como "cara tapada".
    const hCruda = c.tipo === "cara" ? cp.h / 1.25 : cp.h;
    const yCruda = cp.y + (cp.h - hCruda);
    const nucleo = {
      x0: cp.x + cp.w * 0.12, x1: cp.x + cp.w * 0.88,
      y0: yCruda + hCruda * 0.05, y1: yCruda + hCruda * 0.85,
    };
    tareas.push({ m: rutaMascara(p.k), ...nucleo, engordar: 5 });
    meta.push({ tipo: "cara", t: p.t, k: p.k, caja: cp, nucleo, origen: p.origen, estimada: c.tipo === "estimada" });
  }
}
for (let k = 0; k < nMuestras; k++) {
  const t = tMuestra(k);
  if (t > duracion || oscurece(t)) continue;
  for (const [nombre, z] of Object.entries(ZONAS)) {
    tareas.push({ m: rutaMascara(k), ...z });
    meta.push({ tipo: "zona", t, k, zona: nombre });
  }
}
const medidas = python(MEDIR, tareas);

// Agrupa muestras seguidas con el mismo problema en una sola incidencia
const agrupar = (lista, clave) => {
  const grupos = [];
  for (const m of lista.sort((a, b) => a.t - b.t)) {
    const g = grupos.at(-1);
    // Se toleran huecos de una muestra: un fotograma en que el detector pierde
    // la cara no parte el mismo problema en dos avisos
    if (g && g.clave === clave(m) && m.t - g.hasta <= 2 / MUESTRAS_S + 0.01) {
      g.hasta = m.t;
      g.muestras.push(m);
    } else grupos.push({ clave: clave(m), desde: m.t, hasta: m.t, muestras: [m] });
  }
  return grupos;
};

const carasTapadas = [];
const enZona = [];
medidas.forEach(([tapados, total], i) => {
  const m = meta[i];
  if (!total) return;
  if (m.tipo === "cara") {
    const f = tapados / total;
    if (f > (m.estimada ? TAPA_ESTIMADA : TAPA_CARA)) carasTapadas.push({ ...m, fraccion: f });
  } else if (tapados > 40) {
    enZona.push({ ...m, px: tapados });
  }
});
const franjaDe = (m) => [m.nucleo.y0, m.nucleo.y1];
const franjaXDe = (m) => [m.nucleo.x0, m.nucleo.x1];
// Un mismo problema no se parte en doce avisos porque otros gráficos entren y
// salgan mientras dura: se agrupa por tramo continuo y se juntan los culpables
for (const g of agrupar(carasTapadas, (m) => m.origen)) {
  const peor = g.muestras.reduce((a, b) => (b.fraccion > a.fraccion ? b : a));
  const quien = [...new Set(g.muestras.flatMap((m) => culpables(m.t, franjaDe(m), franjaXDe(m))))];
  avisar(
    "cara", peor.fraccion >= 0.2 ? "grave" : "aviso", g.desde,
    `${quien.join(" + ") || "un gráfico"} tapa${quien.length > 1 ? "n" : ""} el ${Math.round(peor.fraccion * 100)}% de la cara${peor.origen === "b-roll" ? " (en el b-roll)" : ""}` +
      (g.hasta > g.desde ? ` durante ${(g.hasta - g.desde + 1 / MUESTRAS_S).toFixed(1)} s` : ""),
    { hasta: g.hasta, k: peor.k, caja: peor.caja }
  );
}
for (const g of agrupar(enZona, (m) => m.zona)) {
  const z = ZONAS[g.muestras[0].zona];
  // En la columna de botones manda la x: en cada instante, si hay un gráfico
  // colocado a la derecha, ese es el sospechoso; si no, lo que haya a esa
  // altura (algo centrado solo llega ahí si es muy ancho)
  const quien = [...new Set(g.muestras.flatMap((m) => {
    const aLaDerecha = z.x0 > 0 ? activosEn(m.t).filter((e) => (e.x ?? 0.5) >= 0.7) : [];
    return aLaDerecha.length
      ? aLaDerecha.map((e) => `${e.tipo} (x=${e.x})`)
      : culpables(m.t, [z.y0, z.y1]);
  }))];
  avisar(
    "zona", "aviso", g.desde,
    `${quien.join(" + ") || "un gráfico"} entra en la zona de ${z.que}` +
      (g.hasta > g.desde ? ` durante ${(g.hasta - g.desde + 1 / MUESTRAS_S).toFixed(1)} s` : ""),
    { hasta: g.hasta, k: g.muestras[0].k, zona: g.muestras[0].zona }
  );
}

// ── 4. Chequeos de tiempo ─────────────────────────────────────────────────
const porIndice = new Map(props.palabras.filter((p) => p.indice !== undefined).map((p) => [p.indice, p]));
if (revision) {
  // Empareja cada elemento de la revisión con el suyo en props por tipo+dato
  const usados = new Set();
  for (const re of revision.elementos ?? []) {
    const pe = elementos.find((e, i) => !usados.has(i) && e.tipo === re.tipo && e.dato === re.dato && usados.add(i));
    const palabra = porIndice.get(re.palabra);
    if (!pe || !palabra) continue;
    if (pe.t < palabra.inicio - 0.05) {
      avisar(
        "tiempo", "grave", pe.t,
        `${re.tipo} "${String(re.dato).replace(/^bocadillo:/, "").split("|")[0]}" entra ${(palabra.inicio - pe.t).toFixed(2)} s antes de "${palabra.texto}": no cabía antes del final y el script lo adelantó. Acórtalo a ${(duracion - palabra.inicio).toFixed(2)} s`
      );
    }
  }
}
for (const e of elementos) {
  if (fin(e) > duracion + 0.05)
    avisar("tiempo", "aviso", e.t, `${e.tipo} acaba ${(fin(e) - duracion).toFixed(2)} s después del final del vídeo`);
}
const cta = [...elementos].reverse().find((e) => e.tipo === "remate" && String(e.dato).startsWith("bocadillo:"));
if (cta && duracion - fin(cta) > 0.3) {
  avisar("tiempo", "aviso", fin(cta), `el CTA desaparece ${(duracion - fin(cta)).toFixed(2)} s antes de que acabe el vídeo`);
}

// Subtítulos que aparecen y un titular corta al instante (el "se montan,
// aparecen muy rápido y desaparecen"). Ojo: la duración sola no vale, hay
// frases normales de 0,37 s cuando se habla rápido y la siguiente las releva.
// Lo que falla es que la frase se corte porque ENTRA UN TITULAR.
if (props.subtitulos !== "ninguno") {
  const enSilencio = (t) => silenciar.some(([a, b]) => t >= a && t <= b);
  let actual = null;
  let desde = 0;
  for (let f = 0; f <= Math.ceil(duracion * FPS); f++) {
    const t = f / FPS;
    const pag = paginaEn(paginas, silenciar, t);
    if (pag === actual) continue;
    if (actual && pag === null && enSilencio(t) && t - desde < 0.6) {
      avisar(
        "subtitulos", "aviso", desde,
        `"${actual.map((p) => p.texto).join(" ")}" asoma ${(t - desde).toFixed(2)} s y lo corta un titular: alarga el titular anterior o adelanta el siguiente para enlazarlos`
      );
    }
    actual = pag;
    desde = t;
  }
}

// Palabras que no llegan a verse MIENTRAS se dicen (sin estar bajo un titular):
// es como se detectó que una página cruzaba un titular y se tragaba palabras
if (props.subtitulos !== "ninguno") {
  const vistas = new Set();
  for (let f = 0; f <= Math.ceil(duracion * FPS); f++) {
    const t = f / FPS;
    for (const w of paginaEn(paginas, silenciar, t) ?? []) if (t >= w.inicio) vistas.add(w);
  }
  const bajoTitular = (w) => silenciar.some(([a, b]) => w.inicio >= a && w.inicio <= b);
  for (const w of props.palabras.filter((w) => !vistas.has(w) && !bajoTitular(w) && w.inicio < duracion)) {
    avisar("subtitulos", "grave", w.inicio, `"${w.texto}" se dice pero no llega a salir en los subtítulos`);
  }
}

// ── 5. Transcripción ──────────────────────────────────────────────────────
const PROB_DUDOSA = 0.45;
const conProb = props.palabras.filter((p) => p.prob !== undefined);
const dudosas = conProb.filter((p) => p.prob < PROB_DUDOSA && !p.corregida && /[a-záéíóúñü]{3,}/i.test(p.texto));
for (const p of dudosas) {
  avisar("transcripcion", "revisar", p.inicio, `"${p.texto}" (palabra ${p.indice}) — Whisper solo está al ${Math.round(p.prob * 100)}%`);
}
// Whisper duda la primera vez que oye algo raro y luego se "convence": en el
// reel del curl, "cool de bicis" salió al 16% y al 41%, y la segunda vez que
// David lo dijo, al 98% y al 99%. Las repeticiones de una palabra dudosa se
// señalan también, aunque Whisper esté seguro.
const norma = (x) => x.toLowerCase().replace(/[^a-záéíóúñü]/g, "");
const yaDudosas = new Set(dudosas.map((p) => p.indice));
for (const p of props.palabras) {
  if (yaDudosas.has(p.indice) || p.corregida) continue;
  const origen = dudosas.find((d) => norma(d.texto) === norma(p.texto) && norma(p.texto).length >= 3);
  if (origen) {
    avisar("transcripcion", "revisar", p.inicio, `"${p.texto}" (palabra ${p.indice}) — se repite la dudosa del ${origen.inicio.toFixed(1)} s; si aquella está mal, esta también`);
  }
}

// ── 6. Posibles solapes (misma franja a la vez) ───────────────────────────
const deTexto = ["etiqueta", "checklist", "estado", "contador", "siNo", "regalo", "interrogantes", "titulon", "cabeceraTop"];
const conY = elementos.filter((e) => deTexto.includes(e.tipo) || (e.tipo === "remate" && e.y !== undefined));
for (let i = 0; i < conY.length; i++)
  for (let j = i + 1; j < conY.length; j++) {
    const a = conY[i], b = conY[j];
    if (a.y === undefined || b.y === undefined) continue;
    const juntos = Math.min(fin(a), fin(b)) - Math.max(a.t, b.t);
    if (juntos > 0.15 && Math.abs(a.y - b.y) < 0.07 && Math.abs((a.x ?? 0.5) - (b.x ?? 0.5)) < 0.3) {
      avisar("solape", "aviso", Math.max(a.t, b.t), `${a.tipo} y ${b.tipo} coinciden ${juntos.toFixed(1)} s en la misma franja (y≈${a.y})`);
    }
  }

// ── 7. Tramos sin cambios visuales ────────────────────────────────────────
const eventos = new Set([0, duracion]);
const redondea = (t) => Math.round(t * 10) / 10;
for (const e of elementos) {
  if (["cabeceraTop", "riel", "fotoCirc"].includes(e.tipo)) continue;
  if (e.tipo !== "contador") eventos.add(redondea(e.t));
  // Que un gráfico se vaya también es un cambio visual
  if (fin(e) < duracion - 0.2) eventos.add(redondea(fin(e)));
  // Y cada ✓ del checklist / cada salto del contador
  if (e.tipo === "checklist")
    for (const l of String(e.dato).split("|")) eventos.add(redondea(e.t + parseFloat(l.split("@")[1] ?? "0")));
  if (e.tipo === "contador")
    for (const m of String(e.dato).split("|").slice(1)) eventos.add(redondea(e.t + parseFloat(m)));
  // Un móvil con varias pantallas cambia de pantalla por dentro
  if (e.tipo === "movil") {
    const n = String(e.dato).split("|").length;
    for (let i = 1; i < n; i++) eventos.add(redondea(e.t + ((e.duracion ?? 3) * i) / n));
  }
}
let acc = 0;
for (const s of props.segmentos) {
  eventos.add(Math.round(acc * 10) / 10);
  acc += s.srcFin - s.srcInicio;
}
if (props.video) {
  // Cortes que ya trae el crudo (cambios de plano del propio montaje)
  const sc = spawnSync("ffmpeg", ["-i", join(RAIZ, "public", props.video), "-vf", "scale=270:-2,select='gt(scene,0.3)',showinfo", "-f", "null", "-"], { encoding: "utf8" });
  for (const m of (sc.stderr ?? "").matchAll(/pts_time:([\d.]+)/g)) {
    let a = 0;
    for (const s of props.segmentos) {
      const src = parseFloat(m[1]);
      if (src >= s.srcInicio && src < s.srcFin) eventos.add(Math.round((a + src - s.srcInicio) * 10) / 10);
      a += s.srcFin - s.srcInicio;
    }
  }
}
const orden = [...eventos].sort((a, b) => a - b);
for (let i = 1; i < orden.length; i++) {
  if (orden[i] - orden[i - 1] > 4.5) {
    avisar("ritmo", "info", orden[i - 1], `${(orden[i] - orden[i - 1]).toFixed(1)} s sin ningún cambio visual (ni corte, ni gráfico, ni b-roll)`);
  }
}

// ── 8. Sonoridad ──────────────────────────────────────────────────────────
const eb = spawnSync("ffmpeg", ["-hide_banner", "-i", mp4, "-af", "ebur128=peak=true:framelog=quiet", "-f", "null", "-"], { encoding: "utf8" }).stderr ?? "";
const lufs = parseFloat((eb.match(/I:\s+(-?[\d.]+) LUFS/g) ?? []).at(-1)?.match(/-?[\d.]+/)?.[0]);
const pico = parseFloat((eb.match(/Peak:\s+(-?[\d.]+) dBFS/g) ?? []).at(-1)?.match(/-?[\d.]+/)?.[0]);
// Con la voz sin comprimir, el máster solo aplica ganancia: si una voz grabada
// muy baja tiene picos altos, no llega a -14 sin limitarla. Eso no es un error
// mientras no quede demasiado baja (−17) y el tope lo marque el pico real.
const limitadoPorPico = pico >= -1.7;
if (lufs > -13 || lufs < -17 || (lufs < -15 && !limitadoPorPico))
  avisar("audio", "grave", 0, `sonoridad ${lufs} LUFS (objetivo -14)`);
else if (lufs < -15)
  avisar("audio", "info", 0, `sonoridad ${lufs} LUFS: no llega a -14 porque el pico de la voz sin comprimir ya está en ${pico} dBTP`);
if (pico > -1) avisar("audio", "aviso", 0, `pico real ${pico} dBTP (máximo -1)`);

// ── Informe ───────────────────────────────────────────────────────────────
const ICONO = { grave: "❌", aviso: "⚠️ ", revisar: "🔤", info: "ℹ️ " };
const GRUPOS = {
  cara: "Caras", zona: "Zonas seguras", tiempo: "Tiempos", subtitulos: "Subtítulos",
  transcripcion: "Transcripción", solape: "Solapes", ritmo: "Ritmo", audio: "Audio",
};
incidencias.sort((a, b) => a.t - b.t);
console.log(`\n🧪 Control de calidad — ${slug} (${duracion.toFixed(1)} s)`);
console.log(`   Audio: ${lufs} LUFS · pico ${pico} dBTP · ${existentes.length} fotogramas analizados · ${Object.values(caras).filter((v) => v.length).length} con cara`);
for (const [g, nombre] of Object.entries(GRUPOS)) {
  const de = incidencias.filter((i) => i.grupo === g);
  if (!de.length) {
    console.log(`   ✅ ${nombre}`);
    continue;
  }
  const peor = ["grave", "aviso", "revisar", "info"].find((n) => de.some((i) => i.gravedad === n));
  console.log(`   ${ICONO[peor]} ${nombre}: ${de.length}`);
  for (const i of de.slice(0, 8)) console.log(`      ${i.t.toFixed(2).padStart(6)}s  ${i.texto}`);
  if (de.length > 8) console.log(`      … y ${de.length - 8} más (ver qa.json)`);
}
if (conProb.length === 0) console.log("   (sin probabilidades de Whisper: esta transcripción es anterior al QA)");

writeFileSync(join(dirGen, "qa.json"), JSON.stringify({ slug, duracion, lufs, pico, incidencias }, null, 2));

// Hoja visual: un fotograma del reel FINAL por incidencia de imagen, con la
// cara (verde) y las zonas de riesgo (rojo) dibujadas encima
const visuales = incidencias.filter((i) => i.grupo === "cara" || i.grupo === "zona").slice(0, 12);
const hoja = join(RAIZ, "out", `${slug}-QA.png`);
rmSync(hoja, { force: true });
if (visuales.length) {
  visuales.forEach((v, n) => ffmpeg(["-ss", String(v.t + 0.05), "-i", mp4, "-frames:v", "1", "-update", "1", "-vf", "scale=360:640", join(dirQA, `hoja_${n}.png`)]));
  python(
    `
import json, sys
from PIL import Image, ImageDraw, ImageFont
import textwrap
d = json.load(sys.stdin); W, H = 360, 640; cols = min(4, len(d["v"]))
try: fuente = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 15)
except Exception: fuente = ImageFont.load_default()
filas = (len(d["v"]) + cols - 1) // cols
hoja = Image.new("RGB", (cols * W, filas * (H + 54)), (18, 18, 18))
for n, v in enumerate(d["v"]):
    im = Image.open(d["dir"] + f"/hoja_{n}.png").convert("RGBA")
    capa = Image.new("RGBA", im.size, (0, 0, 0, 0)); dr = ImageDraw.Draw(capa)
    for z in d["zonas"].values():
        dr.rectangle([z["x0"]*W, z["y0"]*H, z["x1"]*W, z["y1"]*H], fill=(255, 40, 40, 55))
    if v.get("caja"):
        c = v["caja"]; dr.rectangle([c["x"]*W, c["y"]*H, (c["x"]+c["w"])*W, (c["y"]+c["h"])*H], outline=(40, 255, 90, 255), width=3)
    im = Image.alpha_composite(im, capa).convert("RGB")
    x, y = (n % cols) * W, (n // cols) * (H + 54)
    hoja.paste(im, (x, y))
    t = ImageDraw.Draw(hoja)
    icono = "X" if v["gravedad"] == "grave" else "!"
    texto = f'[{icono}] {v["t"]:.2f}s  {v["texto"]}'
    lineas = textwrap.wrap(texto, 42)[:2]
    for j, l in enumerate(lineas): t.text((x + 8, y + H + 6 + j * 20), l, font=fuente, fill=(255, 220, 90) if v["gravedad"] == "grave" else (235, 235, 235))
hoja.save(d["salida"]); print("[]")
`,
    { v: visuales, dir: dirQA, zonas: ZONAS, salida: hoja }
  );
  console.log(`   🖼  Hoja de incidencias: out/${slug}-QA.png`);
}

// Los fotogramas pesan; se queda solo el informe
for (const f of readdirSync(dirQA)) if (f.endsWith(".png") || f.endsWith(".mov")) rmSync(join(dirQA, f));

const graves = incidencias.filter((i) => i.gravedad === "grave").length;
console.log(graves ? `\n❌ QA: ${graves} incidencia(s) grave(s). Revisar antes de entregar.\n` : `\n✅ QA superado${incidencias.length ? " (hay avisos, míralos)" : ""}.\n`);
process.exitCode = graves ? 2 : 0;

#!/usr/bin/env node
/**
 * Editor automático de crudos:
 *   npm run crudo -- crudos/mi-video.mp4 [--plan] [--sin-claude] [--estilo gym|tech|cine] [--musica ambient-127] [--sin-qa] [--limpiar-voz]
 *
 * 1. Transcribe tu voz con Whisper (local, por palabra)
 * 2. Corta silencios y, con Claude, muletillas / tomas repetidas
 * 3. Mejora la voz (denoise + compresión + loudness broadcast)
 * 4. Monta el reel: jump cuts con zoom, subtítulos karaoke, motion graphics
 *    sincronizados con lo que dices, música de fondo y SFX
 *
 * --plan       muestra el plan de cortes y sale (sin renderizar)
 * --sin-claude solo corta silencios (sin revisión de contenido)
 * --sugerir    genera un borrador de revision.json por reglas (sin Claude,
 *              sin render) para revisar y afinar antes de aplicar
 */
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, renameSync, readdirSync, statSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import { transcribe } from "@remotion/install-whisper-cpp";

const RAIZ = resolve(new URL("..", import.meta.url).pathname);
const DIR_WHISPER = join(RAIZ, ".whisper");
const MODELO = "medium";
const MAX_HUECO = 0.28; // pausas de habla mayores que esto se cortan (corte directo)
const MARGEN = 0.07; // aire mínimo a cada lado de un corte

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const soloPlan = process.argv.includes("--plan");
const sinClaude = process.argv.includes("--sin-claude");
const iRevision = process.argv.indexOf("--revision");
const archivoRevision = iRevision > -1 ? process.argv[iRevision + 1] : null;
// --sin-cortes: el corte del usuario es final. No se toca ni un frame:
// ni silencios, ni eliminaciones. Solo voz, subtítulos y gráficos.
const sinCortes = process.argv.includes("--sin-cortes");
const sugerir = process.argv.includes("--sugerir");
const iMusica = process.argv.indexOf("--musica");
// --estilo gym|tech|cine: rota dentro del estilo (ver elegirMusica, más abajo).
// --musica <nombre> sigue forzando una pista concreta.
const iEstilo = process.argv.indexOf("--estilo");
const estilo = iEstilo > -1 ? process.argv[iEstilo + 1] : "tech";
const iHandle = process.argv.indexOf("--handle");
// --handle "" (vacío) = no pintar handle, para vídeos de cliente
const handle = iHandle > -1 ? process.argv[iHandle + 1] : "@politecnic__";
// --color "#F5B301" = color de marca del cliente; por defecto el azul nuestro
const iColor = process.argv.indexOf("--color");
const color = iColor > -1 ? process.argv[iColor + 1] : undefined;

if (!args[0]) {
  console.error("Uso: npm run crudo -- crudos/mi-video.mp4");
  process.exit(1);
}
const rutaCrudo = resolve(RAIZ, args[0]);
const slug = basename(rutaCrudo).replace(extname(rutaCrudo), "");
const dirGen = join(RAIZ, "public", "generated", slug);
mkdirSync(dirGen, { recursive: true });
mkdirSync(join(RAIZ, "public", "crudos"), { recursive: true });

// Música: con 5 pistas acabábamos quemando siempre la misma. Ahora hay un
// catálogo por estilo (public/musica/catalogo.json) y se coge la que lleve más
// tiempo sin usarse en OTROS reels. Si este mismo reel ya tenía pista de ese
// estilo (un re-render por correcciones), se mantiene: la música no puede
// cambiar entre la versión que vio el cliente y la corregida.
function elegirMusica() {
  if (iMusica > -1) return `musica/${process.argv[iMusica + 1]}.mp3`;
  const catalogo = JSON.parse(readFileSync(join(RAIZ, "public", "musica", "catalogo.json"), "utf8"));
  const pistas = catalogo[estilo];
  if (!Array.isArray(pistas) || pistas.length === 0) {
    console.error(`Estilo de música desconocido: "${estilo}". Usa: ${Object.keys(catalogo).filter((k) => Array.isArray(catalogo[k])).join(", ")}`);
    process.exit(1);
  }
  const leerProps = (dir) => {
    try { return JSON.parse(readFileSync(join(dir, "props.json"), "utf8")); } catch { return null; }
  };
  const previa = leerProps(dirGen)?.musica;
  if (previa && pistas.includes(previa)) return previa;

  const ultimoUso = {};
  const base = join(RAIZ, "public", "generated");
  for (const d of readdirSync(base)) {
    if (d === slug) continue;
    const m = leerProps(join(base, d))?.musica;
    if (!m) continue;
    const t = statSync(join(base, d, "props.json")).mtimeMs;
    ultimoUso[m] = Math.max(ultimoUso[m] ?? 0, t);
  }
  // Nunca usada = 0 → va primero. Empate: orden del catálogo.
  return [...pistas].sort((a, b) => (ultimoUso[a] ?? 0) - (ultimoUso[b] ?? 0))[0];
}
const musica = elegirMusica();
console.log(`🎵 Música (${iMusica > -1 ? "forzada" : estilo}): ${musica}`);

// ── 1. Metadatos y proxy de trabajo ──────────────────────────────────────
const probe = JSON.parse(
  execFileSync("ffprobe", [
    "-v", "error", "-print_format", "json", "-show_format", "-show_streams", rutaCrudo,
  ]).toString()
);
const duracionTotal = parseFloat(probe.format.duration);
const v = probe.streams.find((s) => s.codec_type === "video");
console.log(`\n🎞  Crudo: ${basename(rutaCrudo)} — ${duracionTotal.toFixed(1)}s, ${v.width}x${v.height} (${v.codec_name})`);

// Si el crudo es horizontal, 4K o HEVC, generamos un proxy vertical 1080x1920
// H.264 a 30fps (recorte centrado). Mucho más rápido de renderizar.
const esVertical = v.height >= v.width;
const necesitaProxy = !esVertical || v.width > 1600 || v.codec_name === "hevc";
let videoRel;
if (necesitaProxy) {
  videoRel = `crudos/${slug}-1080.mp4`;
  const proxy = join(RAIZ, "public", videoRel);
  if (!existsSync(proxy)) {
    console.log("🔁 Generando proxy vertical 1080x1920 (recorte centrado, encoder por hardware)...");
    execFileSync("ffmpeg", [
      "-y", "-i", rutaCrudo,
      "-vf", esVertical ? "scale=1080:1920" : "crop=ih*9/16:ih,scale=1080:1920",
      "-r", "30",
      "-c:v", "h264_videotoolbox", "-b:v", "9M",
      "-an", proxy,
    ], { stdio: "pipe" });
  }
} else {
  videoRel = `crudos/${slug}${extname(rutaCrudo)}`;
  const destinoCrudo = join(RAIZ, "public", videoRel);
  if (!existsSync(destinoCrudo)) copyFileSync(rutaCrudo, destinoCrudo);
}

// ── 2. Voz mejorada + wav para Whisper ───────────────────────────────────
// ── 2. Voz ────────────────────────────────────────────────────────────────
// Por defecto la voz va TAL CUAL la grabó el cliente: sin reductor de ruido,
// sin compresor y sin normalizar. Pablo lo pidió así (2026-09-15) después de
// que un reductor mal calibrado le apagara la voz. Solo se decodifica a WAV
// (sin pérdida) y, si hace falta, se remuestrea a 48 kHz en alta calidad. La limpieza
// suave anterior sigue disponible con --limpiar-voz.
// WAV y no AAC: cada codificación AAC mete ~20-25 ms de retraso y se sumaban.
const vozRel = `generated/${slug}/voz.wav`;
const limpiarVoz = process.argv.includes("--limpiar-voz");
{
  // Remuestreo de alta calidad del propio ffmpeg (este build no trae soxr);
  // si el crudo ya está a 48 kHz, no hace nada
  let cadena = "aresample=48000:filter_size=64:phase_shift=10:cutoff=0.97";
  if (limpiarVoz) {
    // El reductor necesita saber dónde está el ruido: se mide en cada crudo
    const ventanas = spawnSync("ffmpeg", [
      "-hide_banner", "-i", rutaCrudo, "-vn", "-ac", "1",
      "-af", "asetnsamples=2400,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level",
      "-f", "null", "-",
    ], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).stderr;
    const niveles = [...ventanas.matchAll(/RMS_level=(-?[\d.]+)/g)].map((m) => Number(m[1])).sort((x, y) => x - y);
    const ruido = niveles.length ? niveles[Math.floor(niveles.length * 0.05)] : -50;
    const nf = Math.round(Math.min(-30, Math.max(-75, ruido + 2)));
    cadena = `highpass=f=70,afftdn=nr=8:nf=${nf}:tn=1,acompressor=threshold=-20dB:ratio=2:attack=15:release=250:makeup=2,${cadena}`;
    console.log(`🔊 Voz: limpieza suave (--limpiar-voz), ruido del crudo ${ruido.toFixed(1)} dB → nf=${nf}`);
  } else {
    console.log("🔊 Voz: tal cual el original (sin reductor, sin compresor, sin normalizar)");
  }
  execFileSync("ffmpeg", [
    "-y", "-i", rutaCrudo, "-vn", "-af", cadena, "-ar", "48000", "-c:a", "pcm_s16le", join(RAIZ, "public", vozRel),
  ], { stdio: "pipe" });
}
// Sonoridad real de la voz: música y efectos se colocan RELATIVOS a ella
const nivelVoz = (() => {
  const o = spawnSync("ffmpeg", ["-hide_banner", "-i", join(RAIZ, "public", vozRel), "-af", "ebur128", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const v = Number((o.match(/I:\s+(-?[\d.]+) LUFS/g) ?? []).at(-1)?.match(/-?[\d.]+/)?.[0]);
  return Number.isFinite(v) ? Math.min(-8, Math.max(-40, v)) : -16;
})();
console.log(`   sonoridad de la voz: ${nivelVoz.toFixed(1)} LUFS`);

const wav = join(dirGen, "audio-16k.wav");
execFileSync("ffmpeg", ["-y", "-i", rutaCrudo, "-ar", "16000", "-ac", "1", "-vn", wav], { stdio: "pipe" });

// Detección de silencios sobre el audio REAL (los timestamps de Whisper
// estiran palabras sobre las pausas y las esconden). Todo lo que suene a
// silencio de más de 0.22s se conoce con precisión de milisegundos.
const salidaSil = spawnSync(
  "ffmpeg",
  ["-i", wav, "-af", "silencedetect=n=-32dB:d=0.22", "-f", "null", "-"],
  { encoding: "utf8" }
).stderr;
const silencios = [];
{
  let inicioSil = null;
  for (const linea of salidaSil.split("\n")) {
    const s = linea.match(/silence_start: ([\d.]+)/);
    const e = linea.match(/silence_end: ([\d.]+)/);
    if (s) inicioSil = parseFloat(s[1]);
    if (e && inicioSil !== null) {
      silencios.push({ desde: inicioSil, hasta: parseFloat(e[1]) });
      inicioSil = null;
    }
  }
  if (inicioSil !== null) silencios.push({ desde: inicioSil, hasta: duracionTotal });
}
// tramos con voz = total menos silencios, con un pelín de aire
const AIRE = 0.06;
const tramosVoz = [];
{
  let cursor = 0;
  for (const s of silencios) {
    if (s.desde - cursor > 0.05) {
      tramosVoz.push({ desde: Math.max(0, cursor - AIRE), hasta: s.desde + AIRE });
    }
    cursor = s.hasta;
  }
  if (duracionTotal - cursor > 0.05) {
    tramosVoz.push({ desde: Math.max(0, cursor - AIRE), hasta: duracionTotal });
  }
}
console.log(`   ${silencios.length} silencios reales detectados en el audio`);

// ── 3. Transcripción con timestamps por palabra ──────────────────────────
// La revisión ancla cada gráfico a un NÚMERO de palabra. Si cada render
// volviera a pasar Whisper, una pasada que junte o parta una palabra distinto
// descuadraría todos los gráficos siguientes (ya pasó con los tiempos del
// final en el reel DV_SP_2). Así que se reutiliza la transcripción sobre la que
// se escribió la revisión, salvo que el crudo sea más nuevo o --retranscribir.
const rutaTranscripcion = join(dirGen, "transcripcion.json");
const reutilizar =
  existsSync(rutaTranscripcion) &&
  !process.argv.includes("--retranscribir") &&
  statSync(rutaTranscripcion).mtimeMs > statSync(rutaCrudo).mtimeMs;

async function transcribirConWhisper() {
  console.log("📝 Transcribiendo con Whisper (esto tarda un poco la primera vez)...");
  const { transcription } = await transcribe({
    inputPath: wav,
    whisperPath: DIR_WHISPER,
    whisperCppVersion: "1.5.5",
    model: MODELO,
    modelFolder: DIR_WHISPER,
    tokenLevelTimestamps: true,
    language: "es",
  });

  // tokens (subpalabras) → palabras con inicio/fin
  const palabras = [];
  for (const seg of transcription) {
    for (const tok of seg.tokens ?? []) {
      const texto = tok.text ?? "";
      if (/^\s*\[.*\]\s*$/.test(texto) || texto.trim() === "") continue;
      const inicio = (tok.offsets?.from ?? seg.offsets.from) / 1000;
      const fin = (tok.offsets?.to ?? seg.offsets.to) / 1000;
      // prob = la del token MÁS dudoso de la palabra. Whisper se inventa
      // palabras con mucha seguridad aparente en el texto ("usanía", "rotunda"),
      // pero su probabilidad baja las delata: el control de calidad las señala.
      const prob = typeof tok.p === "number" ? Math.round(tok.p * 100) / 100 : undefined;
      if (texto.startsWith(" ") || palabras.length === 0) {
        palabras.push({ texto: texto.trim(), inicio, fin, prob });
      } else {
        const ultima = palabras.at(-1);
        ultima.texto += texto.trim();
        if (prob !== undefined && !/^[\s.,;:!?…]+$/.test(texto)) {
          ultima.prob = Math.min(ultima.prob ?? 1, prob);
        }
        // La puntuación suele absorber la pausa siguiente: no extendemos el fin
        // de la palabra con ella, para que el detector de silencios vea el hueco.
        if (!/^[\s.,;:!?…]+$/.test(texto)) {
          ultima.fin = fin;
        }
      }
    }
  }
  return palabras;
}

let palabras;
if (reutilizar) {
  palabras = JSON.parse(readFileSync(rutaTranscripcion, "utf8")).map(({ i, ...p }) => p);
  console.log(`📝 Transcripción reutilizada (${palabras.length} palabras): las anclas de la revisión no se mueven`);
} else {
  palabras = await transcribirConWhisper();
}
// Etiquetas de Whisper que llegan partidas en varios tokens y se cuelan como
// palabra ("[AUDIO_EN_BLANCO]", "[Música]"): fuera, o saldrían en subtítulos.
// Solo pueden estar al final o en huecos, así que no mueven índices anteriores.
palabras = palabras.filter((p) => !/^\[.*\]$/.test(p.texto.trim()));

// Correcciones de transcripción: Whisper escribe mal los nombres de las IAs
const CORRECCIONES = [
  [/\b(cloud|clod|clot|claud)\b/gi, "Claude"],
  [/\bchat\s?gpt\b/gi, "ChatGPT"],
  [/\bgéminis?\b/gi, "Gemini"],
  [/\bperplejity\b/gi, "Perplexity"],
];
for (const p of palabras) {
  for (const [patron, bueno] of CORRECCIONES) {
    p.texto = p.texto.replace(patron, bueno);
  }
}

console.log(`   ${palabras.length} palabras transcritas`);
console.log(`   "${palabras.slice(0, 12).map((p) => p.texto).join(" ")}..."`);
writeFileSync(
  join(dirGen, "transcripcion.json"),
  JSON.stringify(palabras.map((p, i) => ({ i, ...p })), null, 1)
);

// ── Tiempos anclados a la voz real ────────────────────────────────────────
// Whisper acierta los inicios de frase (±20 ms medido), pero cuando alguien
// habla con pausas ("¡No… os queméis!") estira palabras por encima de los
// silencios: "queméis" salía 1,5 s antes de decirse. Aquí cada palabra se
// asigna al tramo de voz real (lo contrario de los silencios medidos) con el
// que más solapa, y las de cada tramo se reencajan dentro de él. Las que ya
// estaban dentro no se mueven: solo se corrigen las que flotaban en silencio.
// Se hace sobre una copia: transcripcion.json se queda con lo que dijo Whisper.
{
  const regiones = [];
  let c = 0;
  for (const s of silencios) {
    if (s.desde > c + 0.02) regiones.push({ desde: c, hasta: s.desde });
    c = Math.max(c, s.hasta);
  }
  if (duracionTotal > c + 0.02) regiones.push({ desde: c, hasta: duracionTotal });
  if (regiones.length > 1) {
    const solape = (w, r) => Math.min(w.fin, r.hasta) - Math.max(w.inicio, r.desde);
    let anterior = 0;
    const asignacion = palabras.map((w) => {
      let mejor = anterior, valor = -Infinity;
      for (let k = anterior; k < regiones.length; k++) {
        const v = solape(w, regiones[k]); // negativo = distancia si no toca
        if (v > valor) { valor = v; mejor = k; }
        if (regiones[k].desde > w.fin + 2) break;
      }
      anterior = mejor; // el orden de las palabras no puede retroceder
      return mejor;
    });
    let movidas = 0;
    const originales = palabras;
    palabras = palabras.map((w) => ({ ...w }));
    // Sin hueco = el recorte la dejó prácticamente a cero (estaba entera en el
    // silencio). Una que se queda en 30 ms porque el silencio le come la cola
    // es real: termina justo donde empieza la pausa.
    const MIN = 0.02;
    regiones.forEach((r, k) => {
      const idx = asignacion.map((a, i) => (a === k ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) return;
      // 1. Cada palabra se recorta a su tramo de voz. Las que ya estaban
      //    dentro no cambian; solo se toca lo que se salía al silencio.
      for (const i of idx) {
        const w = palabras[i];
        w.inicio = Math.min(Math.max(w.inicio, r.desde), r.hasta);
        w.fin = Math.min(Math.max(w.fin, r.desde), r.hasta);
      }
      // 2. Las que se quedan sin hueco (estaban enteras en el silencio) se
      //    reparten con su vecina: al final del tramo, compartiendo el
      //    espacio de la última palabra buena; al principio, el de la primera.
      // "sin hueco" = el recorte la dejó sin sitio. Una palabra que Whisper ya
      // daba cortísima ("Y", "no": 0-30 ms) pero DENTRO del tramo no lo es.
      const recortada = (i) =>
        Math.abs(palabras[i].inicio - originales[i].inicio) > 0.001 ||
        Math.abs(palabras[i].fin - originales[i].fin) > 0.001;
      const buenas = idx.filter((i) => !recortada(i) || palabras[i].fin - palabras[i].inicio >= MIN);
      const repartir = (grupo, desde, hasta) => {
        const paso = (hasta - desde) / grupo.length;
        grupo.forEach((i, j) => {
          palabras[i].inicio = desde + paso * j;
          palabras[i].fin = desde + paso * (j + 1);
        });
      };
      if (!buenas.length) {
        repartir(idx, r.desde, r.hasta);
      } else {
        const primera = idx.indexOf(buenas[0]);
        const ultima = idx.indexOf(buenas[buenas.length - 1]);
        if (primera > 0) repartir(idx.slice(0, primera + 1), r.desde, palabras[buenas[0]].fin);
        if (ultima < idx.length - 1) repartir(idx.slice(ultima), palabras[buenas[buenas.length - 1]].inicio, r.hasta);
        // huecos intermedios: la colapsada toma la mitad final de la anterior
        for (let j = primera + 1; j < ultima; j++) {
          const w = palabras[idx[j]], prev = palabras[idx[j - 1]];
          if (recortada(idx[j]) && w.fin - w.inicio < MIN) {
            const medio = (prev.inicio + prev.fin) / 2;
            w.inicio = medio; w.fin = prev.fin; prev.fin = medio;
          }
        }
      }
      for (const i of idx) {
        const w = palabras[i];
        if (Math.abs(w.inicio - originales[i].inicio) > 0.05) movidas++;
        w.inicio = Math.round(w.inicio * 1000) / 1000;
        w.fin = Math.round(Math.max(w.fin, w.inicio + 0.03) * 1000) / 1000;
      }
    });
    if (movidas) console.log(`   🎯 ${movidas} palabra(s) recolocada(s) sobre la voz real (Whisper las dejaba en un silencio)`);
  }
}

// ── Modo --sugerir: borrador de revision.json por reglas, sin Claude ──────
// Detecta patrones repetitivos (marcas de IA, cifras+unidad, listicles,
// palabras clave→icono) para no tener que redactar el plan a mano cada vez.
if (sugerir) {
  const ICONO_POR_PALABRA = [
    [/dinero|euros?|precio|coste|cobrar|factura/i, "coins.svg"],
    [/horas?|minutos?|tiempo|reloj/i, "clock.svg"],
    [/mensajes?|whatsapp|contesta|respond/i, "message-circle.svg"],
    [/citas?|agenda|reservas?|calendario/i, "calendar.svg"],
    [/recordatorio|aviso|notifica/i, "bell.svg"],
    [/pierdes|perdiendo|no aparece|cancela/i, "user-x.svg"],
    [/crece|aumenta|mejora|tendencia/i, "trending-up.svg"],
    [/cuidado|alerta|error/i, "alert-triangle.svg"],
    [/factura/i, "receipt.svg"],
    [/panel|dashboard/i, "layout-dashboard.svg"],
  ];
  const LOGOS = /\b(claude|clod|chatgpt|chat gpt|gemini|perplexity|copilot|midjourney|whatsapp)\b/i;
  const UNIDAD = /^(horas?|minutos?|euros?|clientes?|veces|mensajes?|d[ií]as?|semanas?|meses?|%)$/i;

  const sug = { enfasis: [], elementos: [], pasos: [], lista: null, resumen: "" };
  const marcasLista = []; // posiciones de "1." "2." "3."... si el guión es listicle
  const iconosUsados = new Set();

  for (let i = 0; i < palabras.length; i++) {
    const w = palabras[i].texto;

    // Cifra + unidad → énfasis automático
    if (/^\d+([.,]\d+)?%?€?$/.test(w) && palabras[i + 1] && UNIDAD.test(palabras[i + 1].texto)) {
      sug.enfasis.push([i, i + 1]);
    }

    // Marca de listicle "1." "2." "3." "4."
    if (/^\d\.$/.test(w)) marcasLista.push(i);

    // Marca de IA → logo (una vez por marca)
    if (LOGOS.test(w) && !iconosUsados.has("logo:" + w.toLowerCase())) {
      const nombre = w.toUpperCase().replace(/[^A-Z]/g, "");
      sug.elementos.push({ palabra: i, tipo: "logo", dato: nombre, duracion: 1.8 });
      iconosUsados.add("logo:" + w.toLowerCase());
    }

    // Palabra clave → icono (máx. 1 por icono, para no saturar)
    for (const [patron, archivo] of ICONO_POR_PALABRA) {
      if (patron.test(w) && !iconosUsados.has(archivo)) {
        sug.elementos.push({ palabra: i, tipo: "icono", dato: `iconos/${archivo}`, duracion: 2.2 });
        iconosUsados.add(archivo);
        break;
      }
    }

    // CTA: "comenta" → icono de confirmación en ese punto
    if (/^comenta/i.test(w) && !iconosUsados.has("cta")) {
      sug.elementos.push({ palabra: i, tipo: "icono", dato: "iconos/circle-check.svg", duracion: 2.5 });
      iconosUsados.add("cta");
    }
  }

  // Listicle: si hay 3+ marcas numeradas, arma lista + revelaciones
  if (marcasLista.length >= 3) {
    sug.revelaciones = marcasLista;
    sug.lista = {
      titulo: "…",
      resaltar: "…",
      items: marcasLista.map((idx, k) => {
        const fin = marcasLista[k + 1] ?? Math.min(idx + 8, palabras.length);
        return palabras.slice(idx + 1, fin).map((p) => p.texto).join(" ").slice(0, 40);
      }),
    };
    sug.pasos = marcasLista;
  } else if (palabras.length > 20) {
    // Sin listicle: 3 ticks repartidos a lo largo del guión
    const n = palabras.length;
    sug.pasos = [Math.round(n * 0.35), Math.round(n * 0.6), Math.round(n * 0.85)].map(
      (i) => palabras[i]?.inicio ?? 0
    );
  }

  sug.resumen = `Borrador automático: ${sug.enfasis.length} énfasis, ${sug.elementos.length} elementos, ${marcasLista.length >= 3 ? "listicle detectado" : "sin listicle"}. Revisar 'titulo', 'lista.titulo/resaltar' y añadir caos/movil/calculadora/burbuja/titulon a mano si el guión los pide.`;

  const rutaSugerida = join(dirGen, "revision.sugerida.json");
  writeFileSync(rutaSugerida, JSON.stringify(sug, null, 1));
  console.log(`\n🧩 Borrador de revisión: ${rutaSugerida}`);
  console.log(`   ${sug.enfasis.length} énfasis · ${sug.elementos.length} elementos · ${marcasLista.length >= 3 ? `listicle (${marcasLista.length} puntos)` : `${sug.pasos.length} pasos repartidos`}`);
  console.log("⏭  Revisa/completa el borrador y pásalo con --revision para renderizar.");
  process.exit(0);
}

// ── 4. Revisión de contenido ─────────────────────────────────────────────
let eliminar = [];
let elementos = [];
let subtitulosY;
let resumen = "";
let titulo = null;
let pasosIdx = [];
let subtitulos = "bold";
let enfasis = [];
let lista = null;
let revelacionesIdx = [];

// Muletillas obvias: siempre se quitan, con o sin revisión
const MULETILLAS = /^(eh+|e+h|em+|mm+|hm+)[.,!?…]*$/i;
for (let i = 0; i < palabras.length; i++) {
  if (MULETILLAS.test(palabras[i].texto)) {
    eliminar.push({ desde: i, hasta: i, motivo: "muletilla" });
  }
}

if (archivoRevision) {
  const plan = JSON.parse(readFileSync(resolve(RAIZ, archivoRevision), "utf8"));
  eliminar = eliminar.concat(plan.eliminar ?? []);
  elementos = plan.elementos ?? [];
  resumen = plan.resumen ?? "";
  // Tiempos fijados a mano: {"palabra": N, "inicio": s, "fin": s}. Para lo
  // que ni Whisper ni el ajuste a la voz sitúan bien (una frase dicha tras una
  // pausa con risas por medio, que confunde a los dos)
  for (const f of plan.tiempos ?? []) {
    if (palabras[f.palabra]) {
      palabras[f.palabra].inicio = f.inicio;
      palabras[f.palabra].fin = f.fin;
    }
  }
  // Correcciones puntuales de transcripción: {"palabra": N, "texto": "..."}
  for (const s of plan.sustituciones ?? []) {
    if (palabras[s.palabra]) {
      palabras[s.palabra].texto = s.texto;
      palabras[s.palabra].corregida = true; // ya revisada a mano: el QA no la señala
    }
  }
  titulo = plan.titulo ?? null;
  pasosIdx = plan.pasos ?? []; // índices de palabra donde se completa cada hito
  subtitulos = plan.subtitulos ?? "bold";
  subtitulosY = plan.subtitulosY;
  enfasis = plan.enfasis ?? []; // rangos [desde, hasta] de palabras en azul
  lista = plan.lista ?? null; // panel listicle {titulo, resaltar, items}
  revelacionesIdx = plan.revelaciones ?? []; // índice de palabra que destapa cada item
  console.log(`🧠 Revisión cargada de ${archivoRevision}`);
} else if (!sinClaude) {
  console.log("🧠 Revisando contenido con Claude (muletillas, tomas repetidas, elementos)...");
  const listado = palabras.map((p, i) => `${i}:${p.texto}`).join(" ");
  const prompt = `Eres editor de vídeo profesional de reels. Esta es la transcripción de un crudo, con cada palabra numerada:

${listado}

Devuelve SOLO un JSON válido (sin markdown, sin explicación) con este formato exacto:
{
 "eliminar": [{"desde": N, "hasta": N, "motivo": "..."}],
 "elementos": [{"palabra": N, "tipo": "logo|sello|nota|emoji", "dato": "...", "color": "bueno|malo|mejor"}],
 "resumen": "una frase sobre si el discurso es coherente"
}

Reglas para "eliminar" (rangos de palabras, inclusive):
- Muletillas sueltas: "eh", "eeh", "esto...", "vale" (cuando es relleno, no contenido)
- Falsos comienzos y frases abortadas
- Tomas repetidas: si una frase se dice dos veces, elimina la PEOR versión (normalmente la primera)
- NO elimines contenido válido. Ante la duda, no elimines.

Reglas para "elementos" (motion graphics sincronizados, máximo 5, repartidos):
- "logo" con dato CLAUDE/CHATGPT/GEMINI/PERPLEXITY/COPILOT/MIDJOURNEY cuando se menciona esa IA (ojo: Whisper transcribe "Claude" como "Cloud" o "Clod")
- "sello" con texto corto (TOP, ERROR, GRATIS, EL MEJOR...) en afirmaciones fuertes, con su color
- "nota" manuscrita corta para ironías o apuntes ("apunta esto ↘")
- "emoji" para momentos emocionales (🤯, 💰, 👇)`;

  const res = spawnSync("claude", ["-p", prompt], {
    encoding: "utf8",
    timeout: 240000,
    cwd: RAIZ,
  });
  const salida = (res.stdout ?? "") + (res.stderr ?? "");
  const json = salida.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      const plan = JSON.parse(json[0]);
      eliminar = eliminar.concat(plan.eliminar ?? []);
      elementos = plan.elementos ?? [];
      resumen = plan.resumen ?? "";
    } catch {
      console.warn("   ⚠️  Claude no devolvió JSON parseable; sigo solo con cortes de silencio");
    }
  } else {
    console.warn("   ⚠️  Sin respuesta de Claude; sigo solo con cortes de silencio");
  }
}

// ── 5. Plan de cortes: silencios + eliminaciones ─────────────────────────
if (sinCortes && eliminar.length > 0) {
  console.warn("   ⚠️  --sin-cortes activo: se ignoran las eliminaciones de la revisión");
  eliminar = [];
}
const eliminada = new Set();
for (const r of eliminar) {
  for (let i = r.desde; i <= r.hasta; i++) eliminada.add(i);
}
const conservadas = palabras
  .map((p, i) => ({ ...p, indice: i }))
  .filter((p) => !eliminada.has(p.indice));

if (conservadas.length === 0) {
  console.error("❌ No quedan palabras tras la revisión. Revisa el crudo.");
  process.exit(1);
}

// Segmentos base según palabras conservadas (elección de tomas)
const segmentosBase = [];
let segInicio = Math.max(0, conservadas[0].inicio - MARGEN);
for (let i = 0; i < conservadas.length - 1; i++) {
  const hueco = conservadas[i + 1].inicio - conservadas[i].fin;
  if (hueco > MAX_HUECO) {
    segmentosBase.push({
      srcInicio: segInicio,
      srcFin: Math.min(duracionTotal, conservadas[i].fin + MARGEN),
    });
    segInicio = Math.max(0, conservadas[i + 1].inicio - MARGEN);
  }
}
segmentosBase.push({
  srcInicio: segInicio,
  srcFin: Math.min(duracionTotal, conservadas.at(-1).fin + 0.25),
});

// Refinado con los silencios REALES del audio: cada segmento se recorta a
// sus tramos con voz, eliminando todas las pausas internas que Whisper no ve
const segmentos = [];
if (sinCortes) {
  // El corte del usuario es final: un único segmento, el vídeo entero
  segmentos.push({ srcInicio: 0, srcFin: duracionTotal });
}
for (const seg of sinCortes ? [] : segmentosBase) {
  for (const voz of tramosVoz) {
    const desde = Math.max(seg.srcInicio, voz.desde);
    const hasta = Math.min(seg.srcFin, voz.hasta);
    if (hasta - desde > 0.12) segmentos.push({ srcInicio: desde, srcFin: hasta });
  }
}
// Red de seguridad: toda palabra conservada debe quedar dentro de un
// segmento; si no, se extiende el más cercano (con tope, por si Whisper
// la situó dentro de un silencio real)
for (const p of conservadas) {
  const centro = (p.inicio + p.fin) / 2;
  if (segmentos.some((s) => centro >= s.srcInicio && centro <= s.srcFin)) continue;
  let mejor = null;
  let dist = Infinity;
  for (const s of segmentos) {
    const d = centro < s.srcInicio ? s.srcInicio - centro : centro - s.srcFin;
    if (d < dist) {
      dist = d;
      mejor = s;
    }
  }
  if (mejor && dist < 0.4) {
    if (centro < mejor.srcInicio) mejor.srcInicio = Math.max(0, centro - 0.1);
    else mejor.srcFin = Math.min(duracionTotal, centro + 0.1);
  }
}
segmentos.sort((a, b) => a.srcInicio - b.srcInicio);

// fusiona segmentos casi contiguos o solapados (evita microcortes)
for (let i = segmentos.length - 2; i >= 0; i--) {
  if (segmentos[i + 1].srcInicio - segmentos[i].srcFin < 0.12) {
    segmentos[i].srcFin = Math.max(segmentos[i].srcFin, segmentos[i + 1].srcFin);
    segmentos.splice(i + 1, 1);
  }
}

// palabra → posición en la línea de tiempo comprimida
const posComprimida = (t) => {
  let out = 0;
  for (const s of segmentos) {
    if (t >= s.srcInicio && t <= s.srcFin) return out + (t - s.srcInicio);
    out += s.srcFin - s.srcInicio;
  }
  return null;
};

const conEnfasis = (indice) =>
  enfasis.some(([desde, hasta]) => indice >= desde && indice <= hasta);

const palabrasFinales = conservadas
  .map((p) => {
    const inicio = posComprimida(p.inicio);
    const fin = posComprimida(Math.min(p.fin, duracionTotal));
    if (inicio === null) return null;
    return {
      texto: p.texto,
      inicio,
      fin: fin ?? inicio + 0.3,
      ...(conEnfasis(p.indice) ? { estilo: "resaltado" } : {}),
      // Para el control de calidad (scripts/qa-reel.mjs); el render las ignora
      indice: p.indice,
      ...(p.prob !== undefined ? { prob: p.prob } : {}),
      ...(p.corregida ? { corregida: true } : {}),
    };
  })
  .filter(Boolean);

const duracionFinal = segmentos.reduce((a, s) => a + (s.srcFin - s.srcInicio), 0);

// Mapeo robusto: si el timestamp cae en un microhueco recortado, prueba el
// centro de la palabra y, si no, engancha al segmento más cercano
const posRobusta = (palabra) => {
  const candidatos = [palabra.inicio, (palabra.inicio + palabra.fin) / 2, palabra.fin];
  for (const c of candidatos) {
    const t = posComprimida(c);
    if (t !== null) return t;
  }
  let out = 0;
  for (const s of segmentos) {
    if (palabra.inicio < s.srcInicio) return out; // el segmento siguiente
    out += s.srcFin - s.srcInicio;
  }
  return null;
};

const elementosFinales = elementos
  .map((e) => {
    const palabra = palabras[e.palabra];
    if (!palabra || eliminada.has(e.palabra)) return null;
    const tPalabra = posRobusta(palabra);
    if (tPalabra === null) return null;
    // desfase (s): para lo que no tiene palabra propia, p. ej. un CTA que el
    // cliente olvidó grabar y va sobre el plano final, cuando ya no habla
    const t = tPalabra + (e.desfase ?? 0);
    // cabeceraTop, riel y fotoCirc son persistentes: cubren el resto del reel
    const PERSISTENTES = ["cabeceraTop", "riel", "fotoCirc", "antesDespues", "contador"];
    const dur =
      e.duracion ?? (PERSISTENTES.includes(e.tipo)
        ? duracionFinal - t
        : e.tipo === "rotulo"
          ? 1.8
          : 3);
    return {
      t: Math.max(0, Math.min(t, duracionFinal - dur)),
      tipo: e.tipo,
      dato: e.dato,
      color: e.color,
      lado: e.lado,
      x: e.x,
      y: e.y,
      radio: e.radio,
      ocultar: e.ocultar,
      tam: e.tam,
      tapaSubtitulos: e.tapaSubtitulos,
      // "pista": "ipad" → public/generated/<slug>/pista-ipad.json, incrustada
      // en los props (el render no puede leer ficheros sueltos)
      pista: e.pista ? JSON.parse(readFileSync(join(dirGen, `pista-${e.pista}.json`), "utf8")) : undefined,
      duracion: dur,
    };
  })
  .filter(Boolean);

// ── 6. Enseña el plan ─────────────────────────────────────────────────────
console.log(`\n✂️  PLAN DE EDICIÓN`);
console.log(`   Duración: ${duracionTotal.toFixed(1)}s → ${duracionFinal.toFixed(1)}s (${segmentos.length} tramos, ${segmentos.length - 1} cortes)`);
for (const r of eliminar) {
  const texto = palabras.slice(r.desde, r.hasta + 1).map((p) => p.texto).join(" ");
  console.log(`   🗑  "${texto}" — ${r.motivo}`);
}
for (const e of elementosFinales) {
  console.log(`   ✨ ${e.tipo}(${e.dato}) en ${e.t.toFixed(1)}s`);
}
if (resumen) console.log(`   🧠 ${resumen}`);

const pasos = pasosIdx
  .map((idx) => {
    const p = palabras[idx];
    return p && !eliminada.has(idx) ? posRobusta(p) : null;
  })
  .filter((t) => t !== null);

// ── Premezcla de audio (voz + música) en UN solo archivo ─────────────────
// El propio ffmpeg de Remotion se cuelga a veces mezclando pistas internamente
// (bug de audio-mixing con ffmpeg/coreaudiod en macOS). Lo evitamos del todo
// mezclando nosotros mismos con nuestro ffmpeg de confianza, fuera de Remotion.
console.log("🎚  Premezclando voz + música...");
const mezclaRel = `generated/${slug}/mezcla.wav`;
{
  const inputs = ["-i", join(RAIZ, "public", vozRel)];
  if (musica) inputs.push("-stream_loop", "-1", "-i", join(RAIZ, "public", musica));

  const tramosVoz2 = segmentos
    .map((s, i) => `[0:a]atrim=start=${s.srcInicio}:end=${s.srcFin},asetpts=PTS-STARTPTS[v${i}]`)
    .join(";");
  const concatVoz = `${segmentos.map((_, i) => `[v${i}]`).join("")}concat=n=${segmentos.length}:v=0:a=1[voz]`;

  // Música con "ducking": se normaliza a la misma sonoridad que la voz, se deja
  // MUSICA_DB por debajo y un compresor con la VOZ como llave la hunde otros
  // ~9 dB mientras se habla. En las pausas, el gancho y el CTA vuelve a subir
  // sola. Antes iba fija al 3.5% todo el vídeo: casi inaudible y plana.
  //
  // normalize=0 en el amix es clave: por defecto amix divide cada entrada
  // entre el nº de entradas y le quitaba 6 dB a la voz (los reels salían a
  // -22 LUFS, muy por debajo del resto del feed).
  // -22: con -9 y luego -12 Pablo la oía casi por encima de su voz. Medido en el
  // reel 30apps con -12: música a -20 dB de la voz mientras habla. Con -22 queda
  // a unos -30 dB, que es lo discreto en un reel donde manda la voz.
  const MUSICA_DB = -22;
  const filtro = musica
    ? `${tramosVoz2};${concatVoz};[voz]asplit=2[vozmix][vozllave];` +
      `[1:a]atrim=0:${duracionFinal},asetpts=PTS-STARTPTS,loudnorm=I=${nivelVoz.toFixed(1)}:TP=-2:LRA=11,aresample=48000,volume=${MUSICA_DB}dB[mus];` +
      `[mus][vozllave]sidechaincompress=threshold=0.02:ratio=3:attack=20:release=400:makeup=1[musduck];` +
      `[vozmix][musduck]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[out]`
    : `${tramosVoz2};${concatVoz}[out]`;

  execFileSync(
    "ffmpeg",
    ["-y", ...inputs, "-filter_complex", filtro, "-map", "[out]", "-ar", "48000", "-c:a", "pcm_s16le", join(RAIZ, "public", mezclaRel)],
    { stdio: "pipe" }
  );
}
console.log(`   ✅ mezcla.wav lista`);

const props = {
  video: videoRel,
  audio: vozRel,
  mezcla: mezclaRel,
  nivelVoz, // LUFS de la voz: el render ajusta los efectos a ella
  handle,
  color,
  musica,
  segmentos,
  palabras: palabrasFinales,
  elementos: elementosFinales,
  titulo,
  pasos,
  subtitulos,
  subtitulosY,
  lista,
  revelaciones: revelacionesIdx
    .map((idx) => (palabras[idx] ? posRobusta(palabras[idx]) : null))
    .filter((t) => t !== null),
};
const rutaProps = join(dirGen, "props.json");
writeFileSync(rutaProps, JSON.stringify(props, null, 2));
console.log(`\n📝 Props: ${rutaProps}`);

if (soloPlan) {
  console.log("⏭  Modo --plan: no se renderiza. Quita --plan para montar el reel.");
  process.exit(0);
}

// ── Máster final ──────────────────────────────────────────────────────────
// Remotion mezcla voz+música con los efectos de sonido de los gráficos, así
// que la sonoridad definitiva solo se conoce DESPUÉS del render. Aquí se mide
// el mp4 entero y se lleva a -14 LUFS (lo que usan Instagram y TikTok) con el
// pico real limitado a -1 dBTP para que la recompresión no distorsione.
// Dos pasadas: la primera mide, la segunda aplica una ganancia lineal exacta
// en vez de comprimir sobre la marcha. El vídeo se copia sin recodificar.
// Envolvente de la voz (5 ms) para medir desfases por correlación
function envolvente(fichero, desde, dur) {
  const raw = execFileSync("ffmpeg", [
    "-v", "error", "-ss", String(desde), "-t", String(dur), "-i", fichero,
    "-ac", "1", "-ar", "4000", "-af", "highpass=f=200,lowpass=f=1500", "-f", "s16le", "-",
  ], { maxBuffer: 64 * 1024 * 1024 });
  const x = new Int16Array(raw.buffer, raw.byteOffset, Math.floor(raw.length / 2));
  const env = [];
  for (let i = 0; i + 20 <= x.length; i += 20) {
    let s = 0;
    for (let j = i; j < i + 20; j++) s += x[j] * x[j];
    env.push(Math.sqrt(s / 20));
  }
  return env;
}
// Retardo (s) de `prueba` respecto a `ref`: positivo = llega tarde
function retardo(ref, prueba, dur) {
  const medidas = [];
  for (const desde of [1, dur / 2 - 3, dur - 7].filter((d) => d >= 0)) {
    const a = envolvente(ref, desde, 6), b = envolvente(prueba, desde, 6);
    const n = Math.min(a.length, b.length);
    if (n < 200) continue;
    const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
    const mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
    let mejor = 0, valor = -Infinity;
    for (let L = -40; L <= 40; L++) {
      let c = 0;
      for (let i = Math.max(0, -L); i < Math.min(n, n - L); i++) c += (a[i] - ma) * (b[i + L] - mb);
      if (c > valor) { valor = c; mejor = L; }
    }
    medidas.push(mejor * 0.005);
  }
  medidas.sort((x, y) => x - y);
  return medidas.length ? medidas[Math.floor(medidas.length / 2)] : 0;
}

function masterizar(mp4, referencia) {
  // Solo GANANCIA: se lleva el conjunto hacia -14 LUFS con un único volumen,
  // sin compresor ni limitador, para no tocar la voz. Si llegar a -14 dejara
  // el pico real por encima de -1,5 dBTP, se queda más bajo (manda el pico).
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4]).toString());
  // Sincronía: si el render retrasó la voz, se adelanta el audio lo necesario
  const tarde = existsSync(referencia) ? retardo(referencia, mp4, dur) : 0;
  const ajuste = Math.abs(tarde) >= 0.01
    ? (tarde > 0 ? `atrim=start=${tarde.toFixed(3)},asetpts=PTS-STARTPTS,` : `adelay=${Math.round(-tarde * 1000)}:all=1,`)
    : "";
  const eb = spawnSync("ffmpeg", ["-hide_banner", "-i", mp4, "-af", `${ajuste}ebur128=peak=true`, "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const I = Number((eb.match(/I:\s+(-?[\d.]+) LUFS/g) ?? []).at(-1)?.match(/-?[\d.]+/)?.[0]);
  const TP = Number((eb.match(/Peak:\s+(-?[\d.]+) dBFS/g) ?? []).at(-1)?.match(/-?[\d.]+/)?.[0]);
  const ganancia = Math.min(-14 - I, -1.5 - TP);
  const tmp = mp4.replace(/\.mp4$/, ".master.mp4");
  execFileSync("ffmpeg", [
    "-y", "-i", mp4, "-c:v", "copy",
    "-af", `${ajuste}volume=${ganancia.toFixed(2)}dB`,
    "-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart", tmp,
  ], { stdio: "pipe" });
  renameSync(tmp, mp4);
  const queda = existsSync(referencia) ? retardo(referencia, mp4, dur) : 0;
  console.log(
    `🔊 Máster (solo ganancia ${ganancia >= 0 ? "+" : ""}${ganancia.toFixed(1)} dB): ${I.toFixed(1)} → ${(I + ganancia).toFixed(1)} LUFS · ` +
      `pico ${(TP + ganancia).toFixed(1)} dBTP · sincronía: voz ${Math.round(tarde * 1000)} ms tarde → ${Math.round(queda * 1000)} ms` +
      (Math.abs(queda) > 0.02 ? " ⚠️" : "")
  );
}

// ── 7. Render ─────────────────────────────────────────────────────────────
console.log("\n🎬 Renderizando el reel editado...\n");
const salidaMp4 = `out/${slug}-editado.mp4`;
const render = spawnSync(
  "npx",
  ["remotion", "render", "ReelCrudo", salidaMp4, `--props=${rutaProps}`, "--audio-bitrate=320k"],
  { cwd: RAIZ, stdio: "inherit" }
);
if (render.status === 0) {
  // Referencia de sincronía: sin cortes, el reel va en la línea de tiempo del
  // crudo y se mide contra él (incluye el retardo de la limpieza de voz); con
  // cortes, contra la mezcla, que es la que está en la línea de tiempo final
  const sinRecortes = segmentos.length === 1 && segmentos[0].srcInicio < 0.01;
  masterizar(join(RAIZ, salidaMp4), sinRecortes ? rutaCrudo : join(RAIZ, "public", mezclaRel));
  console.log(`\n✨ Reel editado: ${salidaMp4}\n`);
  // Control de calidad automático (scripts/qa-reel.mjs). No bloquea: el reel
  // queda hecho igual, pero el informe dice si hay algo que arreglar antes de
  // entregarlo. --sin-qa lo salta (p. ej. para pruebas rápidas).
  if (!process.argv.includes("--sin-qa")) {
    spawnSync(
      "node",
      ["scripts/qa-reel.mjs", slug, ...(archivoRevision ? ["--revision", archivoRevision] : [])],
      { cwd: RAIZ, stdio: "inherit" }
    );
  }
} else {
  console.error("\n❌ El render falló.");
  process.exit(render.status ?? 1);
}

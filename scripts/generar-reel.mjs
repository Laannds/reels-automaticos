#!/usr/bin/env node
/**
 * Pipeline: JSON de guión → voz IA (Edge TTS, gratis) → render Remotion → MP4
 *
 * Uso:
 *   npm run reel -- content/ejemplo.json
 *   npm run reel -- content/ejemplo.json --solo-audio   (genera voz sin renderizar)
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { MsEdgeTTS, OUTPUT_FORMAT } from "msedge-tts";
import { parseFile } from "music-metadata";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";

const RAIZ = resolve(new URL("..", import.meta.url).pathname);
const TICKS_POR_SEGUNDO = 10_000_000; // Edge TTS reporta offsets en unidades de 100ns

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const soloAudio = process.argv.includes("--solo-audio");
const rutaGuion = args[0] ?? "content/ejemplo.json";

const guion = JSON.parse(readFileSync(resolve(RAIZ, rutaGuion), "utf8"));
const slug = basename(rutaGuion).replace(/\.json$/, "");
const voz = guion.voz ?? "es-ES-AlvaroNeural";
// Pronunciaciones por defecto (una sola palabra cada una, para que el
// mapeo voz→pantalla sea 1:1). El guión puede ampliar o sobreescribir.
const pronunciacion = {
  Claude: "Clod",
  ChatGPT: "chatgepeté",
  ...(guion.pronunciacion ?? {}),
};
const velocidad = guion.velocidad ?? "+8%"; // voz un poco más ágil, ritmo de reel
const dirSalida = join(RAIZ, "public", "generated", slug);
mkdirSync(dirSalida, { recursive: true });

// Clips de stock disponibles para rotar como fondo (public/stock/*.mp4)
const dirStock = join(RAIZ, "public", "stock");
const clipsStock =
  guion.stock === false || !existsSync(dirStock)
    ? []
    : readdirSync(dirStock).filter((f) => f.endsWith(".mp4"));

const duracionesVideo = new Map();
const duracionDeVideo = async (rutaRelativa) => {
  if (!duracionesVideo.has(rutaRelativa)) {
    const { durationInSeconds } = await parseMedia({
      src: join(RAIZ, "public", rutaRelativa),
      fields: { durationInSeconds: true },
      reader: nodeReader,
      acknowledgeRemotionLicense: true,
    });
    duracionesVideo.set(rutaRelativa, durationInSeconds ?? undefined);
  }
  return duracionesVideo.get(rutaRelativa);
};

const leerStream = (stream) =>
  new Promise((res, rej) => {
    const chunks = [];
    stream.on("data", (c) => chunks.push(c));
    stream.on("end", () => res(chunks));
    stream.on("close", () => res(chunks));
    stream.on("error", rej);
  });

const extraerPalabras = (chunksMetadata) => {
  const palabras = [];
  for (const chunk of chunksMetadata) {
    try {
      const json = JSON.parse(chunk.toString("utf8"));
      for (const meta of json.Metadata ?? []) {
        if (meta.Type !== "WordBoundary") continue;
        const d = meta.Data;
        palabras.push({
          texto: d.text.Text,
          inicio: d.Offset / TICKS_POR_SEGUNDO,
          fin: (d.Offset + d.Duration) / TICKS_POR_SEGUNDO,
        });
      }
    } catch {
      // chunk no parseable: lo ignoramos, hay fallback
    }
  }
  return palabras;
};

// Marcado en el guión: *palabra* → subrayado amarillo, ~palabra~ → círculo rojo.
// Devuelve el texto limpio (lo que se locuta) y el estilo de cada palabra.
const analizarTexto = (textoConMarcas) => {
  // Etiqueta cada palabra dentro de una marca con un centinela invisible,
  // de modo que funcione con puntuación alrededor ("¿*Claude*?", "*horas*.")
  const etiquetado = textoConMarcas
    .replace(/\*([^*]+)\*/g, (_, inner) =>
      inner.trim().split(/\s+/).map((w) => "R" + w).join(" ")
    )
    .replace(/~([^~]+)~/g, (_, inner) =>
      inner.trim().split(/\s+/).map((w) => "C" + w).join(" ")
    );
  const tokens = etiquetado
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      if (raw.includes("R"))
        return { texto: raw.replaceAll("R", ""), estilo: "resaltado" };
      if (raw.includes("C"))
        return { texto: raw.replaceAll("C", ""), estilo: "circulo" };
      return { texto: raw };
    });
  return {
    textoLimpio: tokens.map((t) => t.texto).join(" "),
    tokens,
  };
};

const normalizar = (s) =>
  s.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

const pronunciacionInversa = Object.fromEntries(
  Object.entries(pronunciacion).map(([k, v]) => [normalizar(v), normalizar(k)])
);

// "pronunciacion": {"Claude": "Clod"} → la voz dice "Clod", en pantalla se ve "Claude"
const aplicarPronunciacion = (texto, pronunciacion) => {
  let resultado = texto;
  for (const [palabra, dicho] of Object.entries(pronunciacion)) {
    resultado = resultado.replace(new RegExp(`\\b${palabra}\\b`, "gi"), dicho);
  }
  return resultado;
};

// Asigna el estilo de cada token del guión a las palabras que reporta el TTS
const aplicarEstilos = (palabras, tokens, pronunciacionInversa = {}) => {
  let puntero = 0;
  return palabras.map((p) => {
    const dicho = normalizar(p.texto);
    const objetivo = pronunciacionInversa[dicho] ?? dicho;
    for (let j = puntero; j < Math.min(tokens.length, puntero + 3); j++) {
      const tok = normalizar(tokens[j].texto);
      if (tok === objetivo || tok.includes(objetivo) || objetivo.includes(tok)) {
        puntero = j + 1;
        // Usa el texto del guión: conserva puntuación y mayúsculas que el TTS pierde
        return { ...p, texto: tokens[j].texto, estilo: tokens[j].estilo };
      }
    }
    return p;
  });
};

// Comprime los silencios internos del audio: cualquier hueco entre palabras
// mayor que MAX_HUECO se recorta. Devuelve los tramos del mp3 a reproducir
// y las palabras con sus tiempos ya ajustados a la línea de tiempo comprimida.
const comprimirSilencios = (palabras, duracionAudio) => {
  const INICIO_MARGEN = 0.08;
  const MAX_HUECO = 0.24;
  const COLA = 0.18;

  const segmentos = [];
  let segInicio = Math.max(0, palabras[0].inicio - INICIO_MARGEN);
  let recortado = segInicio;
  const ajustadas = [];

  for (let i = 0; i < palabras.length; i++) {
    const p = palabras[i];
    ajustadas.push({ ...p, inicio: p.inicio - recortado, fin: p.fin - recortado });
    const sig = palabras[i + 1];
    if (sig) {
      const hueco = sig.inicio - p.fin;
      if (hueco > MAX_HUECO) {
        const corteFin = p.fin + MAX_HUECO / 2;
        const corteInicio = sig.inicio - MAX_HUECO / 2;
        segmentos.push({ srcInicio: segInicio, srcFin: corteFin });
        segInicio = corteInicio;
        recortado += corteInicio - corteFin;
      }
    }
  }
  const srcFinal = Math.min(duracionAudio, palabras.at(-1).fin + COLA);
  segmentos.push({ srcInicio: segInicio, srcFin: srcFinal });

  return { segmentos, palabras: ajustadas, duracion: srcFinal - recortado };
};

// Si Edge no devolvió timestamps, reparte las palabras según su longitud
const palabrasEstimadas = (texto, duracion) => {
  const tokens = texto.split(/\s+/).filter(Boolean);
  const totalChars = tokens.reduce((a, t) => a + t.length, 0);
  const util = Math.max(0.1, duracion - 0.25);
  let t = 0.05;
  return tokens.map((tok) => {
    const dur = (tok.length / totalChars) * util;
    const p = { texto: tok, inicio: t, fin: t + dur };
    t += dur;
    return p;
  });
};

const sintetizar = async (texto, rutaMp3) => {
  let ultimoError;
  for (let intento = 1; intento <= 3; intento++) {
    try {
      return await sintetizarUnaVez(texto, rutaMp3);
    } catch (err) {
      ultimoError = err;
      console.warn(`   ⚠️  TTS falló (intento ${intento}/3): ${err.message?.slice(0, 80)}`);
      await new Promise((r) => setTimeout(r, 1500 * intento));
    }
  }
  throw ultimoError;
};

const sintetizarUnaVez = async (texto, rutaMp3) => {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voz, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3, {
    wordBoundaryEnabled: true,
  });
  const resultado = await tts.toStream(texto, { rate: velocidad });
  const audioStream = resultado.audioStream ?? resultado;
  const metadataStream = resultado.metadataStream ?? null;

  const [audioChunks, metaChunks] = await Promise.all([
    leerStream(audioStream),
    metadataStream ? leerStream(metadataStream) : Promise.resolve([]),
  ]);
  tts.close?.();

  writeFileSync(rutaMp3, Buffer.concat(audioChunks));
  const meta = await parseFile(rutaMp3);
  const duracionAudio = meta.format.duration ?? 0;

  let palabras = extraerPalabras(metaChunks);
  if (palabras.length === 0) {
    palabras = palabrasEstimadas(texto, duracionAudio);
    return { duracion: duracionAudio, palabras, segmentos: undefined };
  }
  // Comprime TODOS los silencios: el de arranque, los internos (pausas de
  // comas y puntos) y la cola final del mp3.
  return comprimirSilencios(palabras, duracionAudio);
};

console.log(`\n🎙  Generando voz (${voz}) para "${guion.titulo}"...`);

const escenas = [];
for (let i = 0; i < guion.escenas.length; i++) {
  const e = guion.escenas[i];
  const archivo = `escena-${i}.mp3`;
  const { textoLimpio, tokens } = analizarTexto(e.texto);

  // Modo sin voz ("sinVoz": true): el usuario lo narra por encima.
  // La duración por escena se indica con "duracion" (o se estima a ritmo
  // de narración humana) y las palabras aparecen repartidas en ese tiempo.
  let duracion, palabras, segmentos;
  if (guion.sinVoz) {
    duracion = e.duracion ?? Math.max(2.5, tokens.length * 0.42);
    palabras = palabrasEstimadas(textoLimpio, duracion).map((p, j) => ({
      ...p,
      texto: tokens[j]?.texto ?? p.texto,
      estilo: tokens[j]?.estilo,
    }));
    segmentos = undefined;
  } else {
    ({ duracion, palabras, segmentos } = await sintetizar(
      aplicarPronunciacion(textoLimpio, pronunciacion),
      join(dirSalida, archivo)
    ));
  }

  // Clip de stock: el indicado en el guión, o rotación automática
  const video =
    e.video ?? (clipsStock.length > 0 ? `stock/${clipsStock[i % clipsStock.length]}` : undefined);
  const videoDuracion = video ? await duracionDeVideo(video) : undefined;

  escenas.push({
    tipo: e.tipo ?? "contenido",
    texto: textoLimpio,
    emoji: e.emoji,
    nota: e.nota,
    postit: e.postit,
    sello: e.sello,
    vs: e.vs,
    badge: e.badge,
    puntuacion: e.puntuacion,
    rank: e.rank,
    flecha: e.flecha,
    comparativa: e.comparativa,
    chat: e.chat,
    logo: e.logo,
    audio: guion.sinVoz ? "" : `generated/${slug}/${archivo}`,
    duracion,
    palabras: guion.sinVoz
      ? palabras
      : aplicarEstilos(palabras, tokens, pronunciacionInversa),
    segmentos,
    video,
    videoDuracion,
  });
  const cortes = segmentos ? segmentos.length - 1 : 0;
  console.log(
    `   ✅ Escena ${i + 1}/${guion.escenas.length} (${e.tipo}) — ${duracion.toFixed(1)}s, ${palabras.length} palabras${cortes > 0 ? `, ${cortes} silencios recortados` : ""}`
  );
}

const props = {
  titulo: guion.titulo,
  handle: guion.handle ?? "@politecnic__",
  musica: guion.musica,
  escenas,
};
const rutaProps = join(dirSalida, "props.json");
writeFileSync(rutaProps, JSON.stringify(props, null, 2));

const total = escenas.reduce((a, e) => a + e.duracion + 0.05, 0) + 0.2;
console.log(`\n📝 Props listos: ${rutaProps} (duración ~${total.toFixed(1)}s)`);

if (soloAudio) {
  console.log("⏭  Modo --solo-audio: no se renderiza.");
  process.exit(0);
}

console.log("\n🎬 Renderizando con Remotion...\n");
const salidaMp4 = `out/${slug}.mp4`;
const render = spawnSync(
  "npx",
  ["remotion", "render", "Reel", salidaMp4, `--props=${rutaProps}`],
  { cwd: RAIZ, stdio: "inherit" }
);

if (render.status === 0) {
  console.log(`\n✨ Reel listo: ${salidaMp4}\n`);
} else {
  console.error("\n❌ El render falló. Revisa el error de arriba.");
  process.exit(render.status ?? 1);
}

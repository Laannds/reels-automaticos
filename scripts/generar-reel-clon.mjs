#!/usr/bin/env node
/**
 * Variante de generar-reel.mjs que usa la voz clonada (XTTS-v2) en vez de
 * Edge TTS. Sin timestamps por palabra reales -> reparto estimado por
 * longitud (misma lógica de fallback que ya usa generar-reel.mjs).
 *
 * Uso: node scripts/generar-reel-clon.mjs content/mi-guion.json
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { parseFile } from "music-metadata";

const RAIZ = resolve(new URL("..", import.meta.url).pathname);
const PYTHON = "/Users/lands/Desktop/voz-clonada/xtts/venv/bin/python";
const SCRIPT_CLON = "/Users/lands/Desktop/voz-clonada/xtts/clonar_reel.py";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const rutaGuion = args[0] ?? "content/ejemplo.json";

const guion = JSON.parse(readFileSync(resolve(RAIZ, rutaGuion), "utf8"));
const slug = basename(rutaGuion).replace(/\.json$/, "");
const dirSalida = join(RAIZ, "public", "generated", slug);
mkdirSync(dirSalida, { recursive: true });

const analizarTexto = (textoConMarcas) => {
  const etiquetado = textoConMarcas
    .replace(/\*([^*]+)\*/g, (_, inner) =>
      inner.trim().split(/\s+/).map((w) => "R" + w).join(" ")
    )
    .replace(/~([^~]+)~/g, (_, inner) =>
      inner.trim().split(/\s+/).map((w) => "C" + w).join(" ")
    );
  const tokens = etiquetado
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      if (raw.includes("R"))
        return { texto: raw.replaceAll("R", ""), estilo: "resaltado" };
      if (raw.includes("C"))
        return { texto: raw.replaceAll("C", ""), estilo: "circulo" };
      return { texto: raw };
    });
  return {
    textoLimpio: tokens.map((t) => t.texto).join(" "),
    tokens,
  };
};

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

console.log(`\n🎙  Generando voz CLONADA para "${guion.titulo}"...`);

const preparadas = guion.escenas.map((e, i) => {
  const { textoLimpio, tokens } = analizarTexto(e.texto);
  return { i, textoLimpio, tokens, archivo: join(dirSalida, `escena-${i}.wav`) };
});

const manifestPath = join(dirSalida, "escenas-a-sintetizar.json");
writeFileSync(
  manifestPath,
  JSON.stringify(preparadas.map((p) => ({ i: p.i, texto: p.textoLimpio, archivo: p.archivo })))
);

console.log("   Llamando a XTTS-v2 (carga el modelo una vez, sintetiza todas las escenas)...");
const resultado = spawnSync(PYTHON, [SCRIPT_CLON, manifestPath], { cwd: RAIZ, stdio: "inherit" });
if (resultado.status !== 0) {
  console.error("\n❌ Falló la síntesis de voz clonada.");
  process.exit(resultado.status ?? 1);
}

const escenas = [];
for (const p of preparadas) {
  const meta = await parseFile(p.archivo);
  const duracion = meta.format.duration ?? 0;
  const palabras = palabrasEstimadas(p.textoLimpio, duracion).map((pal, j) => ({
    ...pal,
    texto: p.tokens[j]?.texto ?? pal.texto,
    estilo: p.tokens[j]?.estilo,
  }));
  const e = guion.escenas[p.i];
  escenas.push({
    tipo: e.tipo ?? "contenido",
    texto: p.textoLimpio,
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
    audio: `generated/${slug}/escena-${p.i}.wav`,
    duracion,
    palabras,
    segmentos: undefined,
    video: e.video,
    videoDuracion: undefined,
  });
  console.log(`   ✅ Escena ${p.i + 1}/${guion.escenas.length} (${e.tipo}) — ${duracion.toFixed(1)}s, ${palabras.length} palabras`);
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

console.log("\n🎬 Renderizando con Remotion...\n");
const salidaMp4 = `out/${slug}-clon.mp4`;
const render = spawnSync(
  "node_modules/.bin/remotion",
  ["render", "Reel", salidaMp4, `--props=${rutaProps}`],
  { cwd: RAIZ, stdio: "inherit" }
);

if (render.status === 0) {
  console.log(`\n✨ Reel listo: ${salidaMp4}\n`);
} else {
  console.error("\n❌ El render falló. Revisa el error de arriba.");
  process.exit(render.status ?? 1);
}

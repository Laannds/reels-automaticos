#!/usr/bin/env node
/**
 * Pista de seguimiento de un objeto del vídeo, para pegarle encima un gráfico
 * que se mueva y gire con él (la "?" roja sobre el iPad en DV_SP_3).
 *
 *   node scripts/seguir-objeto.mjs <slug> <nombre> <desde> <hasta> <x0> <y0> <x1> <y1>
 *
 *   slug          carpeta en public/generated (el crudo ya procesado)
 *   nombre        pista-<nombre>.json  → en la revisión: "pista": "<nombre>"
 *   desde, hasta  segundos del tramo a seguir (el gráfico no puede durar más)
 *   x0..y1        recuadro del objeto en el PRIMER fotograma (0-1, origen arriba izq.)
 *
 * Ejemplo (iPad del gancho de DV_SP_3):
 *   node scripts/seguir-objeto.mjs DV_SP_3 ipad 0 3 0.555 0.385 0.765 0.51
 *
 * Posición y tamaño salen del tracker de Vision (scripts/qa/seguir.swift) y el
 * ángulo de la orientación de los bordes (scripts/qa/angulo.py). Todo local.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const RAIZ = resolve(new URL("..", import.meta.url).pathname);
const [slug, nombre, desde, hasta, ...caja] = process.argv.slice(2);
if (!slug || !nombre || caja.length !== 4) {
  console.error("Uso: node scripts/seguir-objeto.mjs <slug> <nombre> <desde> <hasta> <x0> <y0> <x1> <y1>");
  process.exit(1);
}
const FPS = 30;
const dirGen = join(RAIZ, "public", "generated", slug);
const props = JSON.parse(execFileSync("cat", [join(dirGen, "props.json")]).toString());
const video = join(RAIZ, "public", props.video);

// 1. Fotogramas del tramo
const tmp = mkdtempSync(join(tmpdir(), "pista-"));
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", desde, "-to", hasta, "-i", video, "-vf", "scale=540:-2", join(tmp, "f_%04d.png")]);
const fotos = readdirSync(tmp).filter((f) => f.startsWith("f_")).sort().map((f) => join(tmp, f));
console.log(`🎞  ${fotos.length} fotogramas (${desde}s → ${hasta}s)`);

// 2. Seguimiento (Vision) y ángulo
const bin = join(RAIZ, "scripts", "qa", ".bin", "seguir");
const fuente = join(RAIZ, "scripts", "qa", "seguir.swift");
if (!existsSync(bin) || statSync(bin).mtimeMs < statSync(fuente).mtimeMs) {
  mkdirSync(join(RAIZ, "scripts", "qa", ".bin"), { recursive: true });
  execFileSync("swiftc", ["-O", fuente, "-o", bin], { stdio: "pipe" });
}
const seguido = JSON.parse(execFileSync(bin, [...caja, ...fotos], { maxBuffer: 64 * 1024 * 1024 }).toString());
const json = join(tmp, "seguir.json");
writeFileSync(json, JSON.stringify(seguido));
const angulos = JSON.parse(
  execFileSync("python3", [join(RAIZ, "scripts", "qa", "angulo.py"), json, ...fotos], { maxBuffer: 64 * 1024 * 1024 }).toString()
);
const perdidos = seguido.filter((s) => !s.ok).length;
if (perdidos) console.log(`⚠️  ${perdidos} fotograma(s) con poca confianza; revisa el resultado`);

// 3. Suavizado (el tracker tiembla un poco) y guardado
const suave = (v, r = 3) => v.map((_, i) => {
  const t = v.slice(Math.max(0, i - r), i + r + 1);
  return t.reduce((a, c) => a + c, 0) / t.length;
});
const cx = suave(seguido.map((s) => (s.caja[0] + s.caja[2]) / 2));
const cy = suave(seguido.map((s) => (s.caja[1] + s.caja[3]) / 2));
const an = suave(seguido.map((s) => s.caja[2] - s.caja[0]));
const al = suave(seguido.map((s) => s.caja[3] - s.caja[1]));
const ang = suave(angulos);
const salida = join(dirGen, `pista-${nombre}.json`);
writeFileSync(salida, JSON.stringify({
  fps: FPS,
  desde: Number(desde),
  nota: "Seguimiento con Vision (posición y tamaño) + orientación de bordes (ángulo). Coords 0-1 del crudo.",
  cuadros: cx.map((_, i) => [cx[i], cy[i], an[i], al[i], ang[i]].map((v) => Math.round(v * 1e4) / 1e4)),
}));
console.log(`✅ ${salida.replace(RAIZ + "/", "")} · ángulo ${Math.min(...ang).toFixed(0)}° a ${Math.max(...ang).toFixed(0)}°`);
console.log(`   En la revisión: { "tipo": "interrogantes", "pista": "${nombre}", "color": "#FF2D2D", "duracion": ${(Number(hasta) - Number(desde)).toFixed(2)} }`);

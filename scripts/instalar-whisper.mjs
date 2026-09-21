#!/usr/bin/env node
// Instala whisper.cpp y descarga el modelo (una sola vez)
import { installWhisperCpp, downloadWhisperModel } from "@remotion/install-whisper-cpp";
import { resolve } from "node:path";

const RAIZ = resolve(new URL("..", import.meta.url).pathname);
export const DIR_WHISPER = resolve(RAIZ, ".whisper");
export const MODELO = "medium";

const { alreadyExisted } = await installWhisperCpp({
  to: DIR_WHISPER,
  version: "1.5.5",
});
console.log(alreadyExisted ? "whisper.cpp ya estaba instalado" : "whisper.cpp instalado ✅");

const modelo = await downloadWhisperModel({
  model: MODELO,
  folder: DIR_WHISPER,
  onProgress: (p) => {
    const pct = Math.round((p.downloadedBytes / p.totalBytes) * 100);
    if (pct % 10 === 0) process.stdout.write(`\rModelo ${MODELO}: ${pct}%   `);
  },
});
console.log(
  modelo.alreadyExisted ? `\nmodelo ${MODELO} ya estaba descargado` : `\nmodelo ${MODELO} descargado ✅`
);

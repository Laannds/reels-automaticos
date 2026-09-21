#!/usr/bin/env node
// Lista las voces en español disponibles en Edge TTS (gratis)
import { MsEdgeTTS } from "msedge-tts";

const tts = new MsEdgeTTS();
const voces = await tts.getVoices();
const españolas = voces.filter((v) => v.Locale.startsWith("es-"));

console.log(`\n🗣  Voces en español disponibles (${españolas.length}):\n`);
for (const v of españolas) {
  console.log(`  ${v.ShortName.padEnd(32)} ${v.Gender.padEnd(8)} ${v.Locale}`);
}
console.log('\nUsa el campo "voz" en tu JSON, p. ej: "voz": "es-MX-JorgeNeural"\n');
process.exit(0);

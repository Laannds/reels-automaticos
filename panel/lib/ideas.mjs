/**
 * Generación de guiones nuevos con IA (CLI de Claude).
 * Devuelve JSON con el mismo formato que content/*.json, listo para renderizar.
 */
import { spawn } from "node:child_process";

const FORMATO = `{
  "titulo": "título corto del reel",
  "handle": "@politecnic__",
  "sinVoz": false,
  "stock": false,
  "escenas": [
    { "tipo": "hook", "duracion": 4, "nota": "anotación manuscrita corta (opcional)", "texto": "..." },
    { "tipo": "contenido", "duracion": 5, "logo": "logos/claude.svg", "texto": "..." },
    { "tipo": "contenido", "duracion": 6, "chat": { "ia": "CLAUDE", "prompt": "...", "respuesta": "..." }, "texto": "..." },
    { "tipo": "contenido", "duracion": 4.5, "sello": { "texto": "REMATE", "tipo": "mejor" }, "postit": "nota corta", "texto": "..." },
    { "tipo": "cta", "duracion": 4, "texto": "..." }
  ]
}`;

const LINEAS = {
  1: `LÍNEA 1 — dueños de negocio local. Tono directo y práctico, enfocado en
automatización con IA para ahorrar tiempo y no perder clientes (responder
mensajes, recordatorios de cita, reseñas, recuperar clientes, resúmenes de
ventas). Punto de dolor concreto y solución clara.`,
  2: `LÍNEA 2 — audiencia general, poco experta en IA. Tono casual y viral,
formatos "Top N" o comparativas. Nada de jerga técnica: beneficios concretos
del día a día.`,
};

export const generarGuion = ({ linea, tema }) =>
  new Promise((resolve, reject) => {
    const prompt = `Eres el guionista de la cuenta de Instagram @politecnic__ (nicho IA y automatización, español de España).

${LINEAS[linea] ?? LINEAS[2]}

${tema ? `TEMA CONCRETO: ${tema}` : "Elige un tema con gancho que encaje en la línea."}

Escribe UN guión de reel de 20-30 segundos con esta estructura: un hook que
enganche en los 2 primeros segundos, 3 escenas de contenido y un CTA final.

Reglas de estilo obligatorias:
- Español de España (nada de "recién", "ahorita", "platicar").
- Marcado en el texto: *palabra* la resalta en amarillo, ~palabra~ le pone un
  círculo rojo a mano. Usa *...* para frases clave y ~...~ SOLO en palabras sueltas.
- PROHIBIDO usar emojis en el campo "texto".
- El campo "duracion" en segundos, entre 3.5 y 7 por escena.
- Campos visuales opcionales por escena: "logo" (logos/claude.svg,
  logos/chatgpt.svg, logos/gemini.svg), "chat" (simula una conversación con la
  IA), "sello" (tampón, tipo: bueno|malo|mejor), "postit", "nota", "badge".
  Usa 2 o 3 de estos en total, repartidos, no en todas las escenas.
- El CTA final pide seguir o comentar una palabra clave.

Responde ÚNICAMENTE con el JSON, sin explicaciones ni bloques de código, con este formato:
${FORMATO}`;

    const proc = spawn("claude", ["-p", prompt], { stdio: ["ignore", "pipe", "pipe"] });
    let salida = "";
    let error = "";
    proc.stdout.on("data", (d) => (salida += d.toString()));
    proc.stderr.on("data", (d) => (error += d.toString()));

    proc.on("error", () =>
      reject(new Error("No se encuentra el CLI de Claude. Instálalo o revisa el PATH."))
    );

    proc.on("close", () => {
      const texto = (salida + error).trim();
      if (/OAuth|authenticate|401/i.test(texto)) {
        return reject(
          new Error(
            "El CLI de Claude no está autenticado. Ejecuta `claude login` en una terminal y vuelve a intentarlo."
          )
        );
      }
      // El modelo puede envolver el JSON en ``` pese a pedirle que no
      const limpio = salida.replace(/^```(?:json)?\s*/m, "").replace(/```\s*$/m, "").trim();
      const inicio = limpio.indexOf("{");
      const fin = limpio.lastIndexOf("}");
      if (inicio === -1 || fin === -1) {
        return reject(new Error(`Respuesta no válida: ${texto.slice(0, 300)}`));
      }
      try {
        resolve(JSON.parse(limpio.slice(inicio, fin + 1)));
      } catch (e) {
        reject(new Error(`JSON mal formado: ${e.message}`));
      }
    });
  });

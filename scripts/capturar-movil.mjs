#!/usr/bin/env node
/**
 * Capturas "de móvil" de una web, con Chrome sin ventana (DevTools Protocol).
 * Para enseñar la web o la app de un cliente dentro de un reel.
 *
 *   node scripts/capturar-movil.mjs <carpetaSalida> <url> [--ls=clave=valor] <nombre=ruta>...
 *
 * Ejemplo (la plataforma de rutinas de DV FIT, con el plan de 3 días elegido):
 *   node scripts/capturar-movil.mjs public/inserts "https://rutina-kappa.vercel.app/#/" \
 *     '--ls=rt.v1.plan="3"' "rutina-planes=#/" "rutina-plan=#/plan" "rutina-sesion=#/s/1"
 *
 * Sale un PNG por pantalla a 1170x2532 (iPhone a 3x), listo para el elemento
 * "movil" (que admite varias pantallas separadas por |) o "imagen".
 * --ls fija localStorage antes de capturar, para apps que guardan ahí su estado.
 *
 * Opciones para webs públicas (con banner de cookies y contenido más abajo):
 *   --sin-cookies   pulsa "rechazar las no esenciales" (la opción que menos
 *                   datos cede) para que el banner no tape la captura
 *   --scroll=900    baja N px (CSS) antes de capturar
 *   --pagina        captura la página ENTERA en vez de solo la primera pantalla
 *   --escritorio    1440x900 a 2x en vez de móvil. Para webs cuyo contenido
 *                   sale en columnas (planes de precios) y en móvil se apila
 */
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [salida, base, ...resto] = process.argv.slice(2);
if (!salida || !base) {
  console.error('Uso: node scripts/capturar-movil.mjs <carpetaSalida> <url> [--ls=clave=valor] <nombre=ruta>...');
  process.exit(1);
}
const ls = resto.filter((a) => a.startsWith("--ls=")).map((a) => a.slice(5).split(/=(.*)/s));
const rutas = resto.filter((a) => !a.startsWith("--")).map((a) => a.split("="));
const sinCookies = resto.includes("--sin-cookies");
const escritorio = resto.includes("--escritorio");
const paginaEntera = resto.includes("--pagina");
const scrollPx = Number((resto.find((a) => a.startsWith("--scroll=")) ?? "--scroll=0").slice(9)) || 0;
mkdirSync(salida, { recursive: true });

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PUERTO = 9333;
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${PUERTO}`, "--hide-scrollbars", "--no-first-run",
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "cap-"))}`, "about:blank",
], { stdio: "ignore" });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
for (let i = 0; i < 40 && !ws; i++) {
  try {
    const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
    const pag = lista.find((p) => p.type === "page");
    if (pag) ws = new WebSocket(pag.webSocketDebuggerUrl);
  } catch {
    await espera(250);
  }
}
if (!ws) {
  console.error("No se pudo abrir Chrome sin ventana. ¿Está instalado Google Chrome?");
  process.exit(1);
}
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pendientes = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendientes.has(m.id)) {
    pendientes.get(m.id)(m.result ?? m);
    pendientes.delete(m.id);
  }
});
const cdp = (method, params = {}) =>
  new Promise((r) => {
    const n = ++id;
    pendientes.set(n, r);
    ws.send(JSON.stringify({ id: n, method, params }));
  });

// iPhone 14/15: 390x844 a 3x (o escritorio 1440x900 a 2x con --escritorio)
await cdp("Emulation.setDeviceMetricsOverride", escritorio
  ? { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false }
  : { width: 390, height: 844, deviceScaleFactor: 3, mobile: true });
await cdp("Emulation.setUserAgentOverride", {
  userAgent: escritorio
    ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
    : "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
});
await cdp("Page.enable");
await cdp("Page.navigate", { url: base });
await espera(2500);
for (const [k, v] of ls) {
  await cdp("Runtime.evaluate", { expression: `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(v)})` });
}

for (const [nombre, ruta] of rutas) {
  await cdp("Page.navigate", { url: base.replace(/#.*$/, "") + ruta });
  await espera(2000);
  if (sinCookies) {
    // Se busca un botón cuyo texto diga rechazar / reject / solo necesarias.
    // Nunca "aceptar": es el banner de una web ajena y no se cede nada.
    await cdp("Runtime.evaluate", {
      expression: `(() => { const re = /rechazar|reject|decline|no son esenciales|solo (las )?necesarias|only necessary|essential only/i;
        const b = [...document.querySelectorAll('button, [role=button], a')].find((e) => re.test(e.textContent || ''));
        if (b) { b.click(); return 'ok'; } return 'sin banner'; })()`,
    });
    await espera(700);
  }
  if (scrollPx) {
    await cdp("Runtime.evaluate", { expression: `window.scrollTo(0, ${scrollPx})` });
    await espera(500);
  }
  const captura = { format: "png" };
  if (paginaEntera) {
    const r = await cdp("Runtime.evaluate", { expression: "document.documentElement.scrollHeight" });
    const alto = Number(r.result?.value) || 844;
    captura.captureBeyondViewport = true;
    captura.clip = { x: 0, y: 0, width: escritorio ? 1440 : 390, height: alto, scale: escritorio ? 2 : 3 };
  }
  const { data } = await cdp("Page.captureScreenshot", captura);
  writeFileSync(join(salida, `${nombre}.png`), Buffer.from(data, "base64"));
  console.log(`✓ ${nombre}.png ← ${ruta}`);
}
ws.close();
chrome.kill();

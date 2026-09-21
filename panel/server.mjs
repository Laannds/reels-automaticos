#!/usr/bin/env node
/**
 * Central de automatización de redes — panel local.
 *
 * Tres bloques:
 *   · Producción    — crudos y guiones, lanza los scripts del pipeline
 *   · Planificación — calendario editorial y publicación a IG/TikTok
 *   · Ideas IA      — genera guiones nuevos con el CLI de Claude
 *
 * Uso: npm run panel  →  http://localhost:4322
 */
import { createServer } from "node:http";
import { readdirSync, existsSync, statSync, readFileSync, writeFileSync, createReadStream } from "node:fs";
import { join, resolve, extname, basename } from "node:path";
import { spawn, exec } from "node:child_process";
import { leer, escribir } from "./lib/almacen.mjs";
import { estadoConfiguracion, publicar, probarConexion } from "./lib/publicar.mjs";
import { generarGuion } from "./lib/ideas.mjs";
import * as automatizaciones from "./lib/automatizaciones.mjs";
import * as planificador from "./lib/planificador.mjs";

const RAIZ = resolve(new URL("..", import.meta.url).pathname);
const PUERTO = 4322;

const DIR_CRUDOS = join(RAIZ, "crudos");
const DIR_CONTENT = join(RAIZ, "content");
const DIR_GENERATED = join(RAIZ, "public", "generated");
const DIR_OUT = join(RAIZ, "out");

const EXT_VIDEO = [".mov", ".mp4", ".MOV", ".MP4"];

// ── Producción ─────────────────────────────────────────────────────────
const listarCrudos = () => {
  if (!existsSync(DIR_CRUDOS)) return [];
  return readdirSync(DIR_CRUDOS)
    .filter((f) => EXT_VIDEO.includes(extname(f)) && statSync(join(DIR_CRUDOS, f)).size > 1_000_000)
    .map((f) => {
      const slug = basename(f, extname(f));
      const dirGen = join(DIR_GENERATED, slug);
      const tieneTranscripcion = existsSync(join(dirGen, "transcripcion.json"));
      const tieneRevision = existsSync(join(dirGen, "revision.json"));
      const salida = join(DIR_OUT, `${slug}-editado.mp4`);
      const renderizado = existsSync(salida);
      let estado = "sin-procesar";
      if (renderizado) estado = "renderizado";
      else if (tieneRevision) estado = "con-revision";
      else if (tieneTranscripcion) estado = "transcrito";
      return { slug, archivo: f, estado, salida: renderizado ? salida : null };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
};

const listarHistorias = () => {
  if (!existsSync(DIR_CONTENT)) return [];
  return readdirSync(DIR_CONTENT)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const slug = basename(f, ".json");
      const salida = join(DIR_OUT, `${slug}.mp4`);
      const renderizado = existsSync(salida);
      let titulo = slug;
      try {
        titulo = JSON.parse(readFileSync(join(DIR_CONTENT, f), "utf8")).titulo ?? slug;
      } catch {}
      return { slug, titulo, estado: renderizado ? "renderizado" : "sin-generar", salida: renderizado ? salida : null };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));
};

/** Vídeos ya renderizados, para poder asignarlos a una fecha del calendario. */
const listarRenderizados = () => {
  if (!existsSync(DIR_OUT)) return [];
  return readdirSync(DIR_OUT)
    .filter((f) => f.endsWith(".mp4"))
    .map((f) => ({ archivo: f, nombre: basename(f, ".mp4"), ruta: join(DIR_OUT, f) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
};

// ── Utilidades HTTP ────────────────────────────────────────────────────
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" };

const responderJSON = (res, datos, codigo = 200) => {
  res.writeHead(codigo, JSON_HEADERS);
  res.end(JSON.stringify(datos));
};

const leerCuerpo = (req) =>
  new Promise((resolve) => {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(cuerpo || "{}"));
      } catch {
        resolve({});
      }
    });
  });

/** Abre un stream SSE y devuelve helpers para escribir en él. */
const abrirSSE = (res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  return {
    log: (linea) => res.write(`data: ${JSON.stringify(linea)}\n\n`),
    fin: (codigo) => {
      res.write(`event: fin\ndata: ${codigo}\n\n`);
      res.end();
    },
  };
};

const ejecutarConSSE = (res, cmd, args) => {
  const { log, fin } = abrirSSE(res);
  const proc = spawn(cmd, args, { cwd: RAIZ });
  proc.stdout.on("data", (d) => d.toString().split("\n").filter(Boolean).forEach(log));
  proc.stderr.on("data", (d) => d.toString().split("\n").filter(Boolean).forEach(log));
  proc.on("close", (code) => fin(code));
  proc.on("error", (err) => {
    log(`❌ ${err.message}`);
    fin(1);
  });
};

// ── Servidor ───────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PUERTO}`);
  const ruta = url.pathname;

  // Producción ---------------------------------------------------------
  if (ruta === "/api/crudos") return responderJSON(res, listarCrudos());
  if (ruta === "/api/historias") return responderJSON(res, listarHistorias());
  if (ruta === "/api/renderizados") return responderJSON(res, listarRenderizados());

  if (ruta === "/api/abrir") {
    const r = url.searchParams.get("ruta");
    if (r && existsSync(r)) exec(`open "${r}"`);
    return responderJSON(res, { ok: true });
  }

  if (ruta === "/api/run/crudo-sugerir") {
    const slug = url.searchParams.get("slug");
    const crudo = listarCrudos().find((c) => c.slug === slug);
    if (!crudo) return responderJSON(res, { error: "No encontrado" }, 404);
    return ejecutarConSSE(res, "node", [
      "scripts/editar-crudo.mjs", `crudos/${crudo.archivo}`, "--sin-cortes", "--sugerir",
    ]);
  }

  if (ruta === "/api/run/crudo-render") {
    const slug = url.searchParams.get("slug");
    const crudo = listarCrudos().find((c) => c.slug === slug);
    if (!crudo || !existsSync(join(DIR_GENERATED, slug, "revision.json"))) {
      return responderJSON(res, { error: "Falta la revisión" }, 404);
    }
    return ejecutarConSSE(res, "node", [
      "scripts/editar-crudo.mjs", `crudos/${crudo.archivo}`, "--sin-cortes",
      "--revision", `public/generated/${slug}/revision.json`,
    ]);
  }

  if (ruta === "/api/run/historia-render") {
    const slug = url.searchParams.get("slug");
    if (!existsSync(join(DIR_CONTENT, `${slug}.json`))) {
      return responderJSON(res, { error: "No encontrado" }, 404);
    }
    return ejecutarConSSE(res, "node", ["scripts/generar-reel.mjs", `content/${slug}.json`]);
  }

  // Planificación ------------------------------------------------------
  if (ruta === "/api/calendario" && req.method === "GET") {
    return responderJSON(res, leer("calendario", []));
  }

  if (ruta === "/api/calendario" && req.method === "POST") {
    const entrada = await leerCuerpo(req);
    const calendario = leer("calendario", []);
    const i = calendario.findIndex((e) => e.id === entrada.id);
    if (i >= 0) calendario[i] = { ...calendario[i], ...entrada };
    else calendario.push({ ...entrada, id: entrada.id ?? `p${Date.now()}`, estado: entrada.estado ?? "borrador" });
    escribir("calendario", calendario);
    return responderJSON(res, calendario);
  }

  if (ruta === "/api/calendario" && req.method === "DELETE") {
    const id = url.searchParams.get("id");
    escribir("calendario", leer("calendario", []).filter((e) => e.id !== id));
    return responderJSON(res, { ok: true });
  }

  if (ruta === "/api/publicacion/estado") return responderJSON(res, estadoConfiguracion());

  // Ping para que el propio panel compruebe que el túnel público llega hasta aquí
  if (ruta === "/api/salud") return responderJSON(res, { ok: true });

  if (ruta === "/api/publicacion/probar" && req.method === "POST") {
    return responderJSON(res, await probarConexion());
  }

  // Planificador automático ---------------------------------------------
  if (ruta === "/api/planificador" && req.method === "GET") {
    return responderJSON(res, {
      activo: planificador.estaActivo(),
      pendientes: planificador.pendientes().length,
      historial: planificador.historial(),
    });
  }

  if (ruta === "/api/planificador" && req.method === "POST") {
    const { activo } = await leerCuerpo(req);
    if (activo) planificador.arrancar(DIR_OUT);
    else planificador.parar();
    return responderJSON(res, { activo: planificador.estaActivo() });
  }

  if (ruta === "/api/planificador/revisar" && req.method === "POST") {
    return responderJSON(res, { hechos: await planificador.revisar(DIR_OUT) });
  }

  if (ruta === "/api/publicar") {
    const id = url.searchParams.get("id");
    const red = url.searchParams.get("red");
    const calendario = leer("calendario", []);
    const entrada = calendario.find((e) => e.id === id);
    const { log, fin } = abrirSSE(res);

    if (!entrada?.archivo) {
      log("❌ Esta entrada no tiene un vídeo asignado.");
      return fin(1);
    }
    const rutaArchivo = join(DIR_OUT, entrada.archivo);
    if (!existsSync(rutaArchivo)) {
      log(`❌ No existe el archivo ${entrada.archivo}`);
      return fin(1);
    }

    try {
      await publicar({
        red,
        rutaArchivo,
        archivoNombre: entrada.archivo,
        caption: entrada.caption ?? "",
        log,
      });
      const i = calendario.findIndex((e) => e.id === id);
      calendario[i] = {
        ...calendario[i],
        estado: "publicado",
        publicadoEn: [...new Set([...(calendario[i].publicadoEn ?? []), red])],
      };
      escribir("calendario", calendario);
      fin(0);
    } catch (err) {
      log(`❌ ${err.message}`);
      fin(1);
    }
    return;
  }

  // Automatizaciones (DMs y comentarios) --------------------------------
  if (ruta === "/api/automatizaciones" && req.method === "GET") {
    return responderJSON(res, {
      reglas: automatizaciones.listar(),
      tiposDisparador: automatizaciones.TIPOS_DISPARADOR,
      tiposAccion: automatizaciones.TIPOS_ACCION,
    });
  }

  if (ruta === "/api/automatizaciones" && req.method === "POST") {
    return responderJSON(res, automatizaciones.guardar(await leerCuerpo(req)));
  }

  if (ruta === "/api/automatizaciones" && req.method === "DELETE") {
    automatizaciones.borrar(url.searchParams.get("id"));
    return responderJSON(res, { ok: true });
  }

  if (ruta === "/api/automatizaciones/simular" && req.method === "POST") {
    const { tipo, texto, usuario } = await leerCuerpo(req);
    return responderJSON(res, automatizaciones.simular({ tipo, texto, usuario }));
  }

  // Ideas IA -----------------------------------------------------------
  if (ruta === "/api/ideas/generar" && req.method === "POST") {
    const { linea, tema } = await leerCuerpo(req);
    try {
      return responderJSON(res, { ok: true, guion: await generarGuion({ linea, tema }) });
    } catch (err) {
      return responderJSON(res, { ok: false, error: err.message }, 200);
    }
  }

  if (ruta === "/api/ideas/guardar" && req.method === "POST") {
    const { slug, guion } = await leerCuerpo(req);
    const limpio = String(slug).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
    if (!limpio) return responderJSON(res, { error: "Nombre no válido" }, 400);
    writeFileSync(join(DIR_CONTENT, `${limpio}.json`), JSON.stringify(guion, null, 2));
    return responderJSON(res, { ok: true, slug: limpio });
  }

  // Vídeos servidos públicamente (Instagram los descarga de aquí) -------
  if (ruta.startsWith("/media/")) {
    const archivo = decodeURIComponent(ruta.slice("/media/".length));
    const rutaArchivo = join(DIR_OUT, archivo);
    if (!rutaArchivo.startsWith(DIR_OUT) || !existsSync(rutaArchivo)) {
      res.writeHead(404);
      return res.end("No encontrado");
    }
    res.writeHead(200, {
      "Content-Type": "video/mp4",
      "Content-Length": statSync(rutaArchivo).size,
    });
    return createReadStream(rutaArchivo).pipe(res);
  }

  // Estáticos ----------------------------------------------------------
  let archivo = join(RAIZ, "panel", "public", ruta === "/" ? "/index.html" : ruta);
  if (!archivo.startsWith(join(RAIZ, "panel", "public")) || !existsSync(archivo)) {
    res.writeHead(404);
    return res.end("No encontrado");
  }
  const tipos = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  res.writeHead(200, { "Content-Type": tipos[extname(archivo)] ?? "text/plain" });
  res.end(readFileSync(archivo));
});

server.listen(PUERTO, () => {
  console.log(`\n🎛  Central de automatización: http://localhost:${PUERTO}`);
  // Si el planificador quedó activo, sigue estándolo al reiniciar el panel
  if (planificador.estaActivo()) {
    planificador.arrancar(DIR_OUT);
    console.log("⏰ Planificador automático activo\n");
  } else {
    console.log("⏸  Planificador automático parado\n");
  }
});

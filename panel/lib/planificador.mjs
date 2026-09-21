/**
 * Planificador: revisa el calendario cada minuto y publica lo que ya toca.
 *
 * Reglas de seguridad para no hacer estropicios:
 *  · Sólo publica entradas en estado "listo" (las de borrador se ignoran).
 *  · Sólo si la fecha ya pasó y no hace más de MARGEN_HORAS (si el panel
 *    estuvo apagado dos días, no publica de golpe todo lo atrasado).
 *  · Cada red se marca en publicadoEn al salir bien: nunca repite.
 *  · Si falla, lo anota en el historial y NO reintenta en bucle: pasa a
 *    "error" y espera a que lo revises.
 */
import { leer, escribir } from "./almacen.mjs";
import { publicar } from "./publicar.mjs";
import { join } from "node:path";
import { existsSync } from "node:fs";

const MARGEN_HORAS = 6;
const INTERVALO_MS = 60_000;

let temporizador = null;
let enMarcha = false;

export const estaActivo = () => leer("planificador", { activo: false }).activo === true;

export const historial = () => leer("historial", []).slice(-50).reverse();

const anotar = (entrada) => {
  const h = leer("historial", []);
  h.push({ ...entrada, cuando: new Date().toISOString() });
  escribir("historial", h.slice(-200));
};

/** Entradas cuya hora ya pasó (dentro del margen) y les falta alguna red. */
export const pendientes = (ahora = Date.now()) =>
  leer("calendario", []).filter((e) => {
    if (e.estado !== "listo" || !e.fecha || !e.archivo) return false;
    const t = new Date(e.fecha).getTime();
    if (Number.isNaN(t) || t > ahora) return false;
    if (ahora - t > MARGEN_HORAS * 3600_000) return false;
    const hechas = e.publicadoEn ?? [];
    return (e.redes ?? []).some((r) => !hechas.includes(r));
  });

/** Una pasada del planificador. Exportada para poder probarla sin esperar. */
export const revisar = async (dirOut, ahora = Date.now()) => {
  const trabajo = pendientes(ahora);
  const hechos = [];

  for (const entrada of trabajo) {
    const rutaArchivo = join(dirOut, entrada.archivo);
    if (!existsSync(rutaArchivo)) {
      anotar({ id: entrada.id, archivo: entrada.archivo, ok: false, mensaje: "No existe el archivo" });
      marcarError(entrada.id);
      continue;
    }

    const hechas = entrada.publicadoEn ?? [];
    for (const red of (entrada.redes ?? []).filter((r) => !hechas.includes(r))) {
      try {
        await publicar({
          red,
          rutaArchivo,
          archivoNombre: entrada.archivo,
          caption: entrada.caption ?? "",
          log: () => {},
        });
        marcarPublicado(entrada.id, red);
        anotar({ id: entrada.id, archivo: entrada.archivo, red, ok: true, mensaje: "Publicado" });
        hechos.push({ id: entrada.id, red, ok: true });
      } catch (err) {
        anotar({ id: entrada.id, archivo: entrada.archivo, red, ok: false, mensaje: err.message });
        marcarError(entrada.id);
        hechos.push({ id: entrada.id, red, ok: false, error: err.message });
      }
    }
  }
  return hechos;
};

const actualizar = (id, cambios) => {
  const cal = leer("calendario", []);
  const i = cal.findIndex((e) => e.id === id);
  if (i < 0) return;
  cal[i] = { ...cal[i], ...(typeof cambios === "function" ? cambios(cal[i]) : cambios) };
  escribir("calendario", cal);
};

const marcarPublicado = (id, red) =>
  actualizar(id, (e) => {
    const publicadoEn = [...new Set([...(e.publicadoEn ?? []), red])];
    const completo = (e.redes ?? []).every((r) => publicadoEn.includes(r));
    return { publicadoEn, estado: completo ? "publicado" : e.estado };
  });

const marcarError = (id) => actualizar(id, { estado: "error" });

export const arrancar = (dirOut) => {
  escribir("planificador", { activo: true });
  if (temporizador) return;
  temporizador = setInterval(async () => {
    if (enMarcha) return; // no solapar pasadas si una tarda
    enMarcha = true;
    try {
      await revisar(dirOut);
    } catch (err) {
      anotar({ ok: false, mensaje: `Fallo del planificador: ${err.message}` });
    } finally {
      enMarcha = false;
    }
  }, INTERVALO_MS);
  temporizador.unref?.();
};

export const parar = () => {
  escribir("planificador", { activo: false });
  if (temporizador) clearInterval(temporizador);
  temporizador = null;
};

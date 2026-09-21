/**
 * Motor de automatizaciones tipo ManyChat: reglas que reaccionan a comentarios
 * y mensajes directos.
 *
 * El motor de coincidencias y las acciones son reales y funcionan ya: se pueden
 * probar con el simulador sin tocar ninguna API. Lo único que falta para
 * producción es el enganche con los webhooks de Meta, que va aparte
 * (ver ejecutarAcciones → modo "simulacion" vs "real").
 */
import { leer, escribir } from "./almacen.mjs";

export const TIPOS_DISPARADOR = {
  comentario: "Comentario en post o reel",
  dm: "Mensaje directo",
  mencion_historia: "Mención en historia",
};

export const TIPOS_ACCION = {
  responder_comentario: "Responder al comentario",
  enviar_dm: "Enviar mensaje directo",
  etiquetar: "Etiquetar al contacto",
};

/** Quita acentos y mayúsculas para que "GUÍA", "guia" y "Guía" coincidan. */
const normalizar = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/** Escapa lo que sea para poder meterlo en una expresión regular sin romperla. */
const escaparRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const listar = () => leer("automatizaciones", []);

export const guardar = (regla) => {
  const reglas = listar();
  const i = reglas.findIndex((r) => r.id === regla.id);
  const completa = {
    activa: true,
    estadisticas: { disparos: 0, ultimoDisparo: null },
    ...regla,
    id: regla.id ?? `a${Date.now()}`,
  };
  if (i >= 0) reglas[i] = { ...reglas[i], ...completa };
  else reglas.push(completa);
  escribir("automatizaciones", reglas);
  return reglas;
};

export const borrar = (id) => {
  escribir("automatizaciones", listar().filter((r) => r.id !== id));
};

/** ¿Este texto dispara esta regla? */
export const coincide = (regla, { tipo, texto }) => {
  if (!regla.activa) return false;
  if (regla.disparador.tipo !== tipo) return false;

  const { condicion, palabras = [] } = regla.disparador;
  if (condicion === "cualquiera") return true;

  const t = normalizar(texto);
  const claves = palabras.map(normalizar).filter(Boolean);
  if (claves.length === 0) return false;

  if (condicion === "exacto") return claves.some((k) => t === k);
  // "contiene": la palabra clave aparece como palabra suelta, no dentro de otra
  return claves.some((k) => new RegExp(`(^|\\W)${escaparRegex(k)}(\\W|$)`).test(t));
};

/** Primera regla que coincide (el orden de la lista marca la prioridad). */
export const buscarRegla = (evento) => listar().find((r) => coincide(r, evento)) ?? null;

/**
 * Ejecuta las acciones de una regla.
 * modo "simulacion" (por defecto): sólo describe lo que haría.
 * modo "real": aquí se enganchará la API de Meta cuando despleguemos.
 */
export const ejecutarAcciones = (regla, evento, modo = "simulacion") => {
  const resultados = (regla.acciones ?? []).map((accion) => {
    // Sólo las acciones con texto (respuesta / DM) sustituyen variables:
    // "etiquetar" no lleva texto y no debe acabar con un texto vacío.
    const base = accion.texto
      ? { ...accion, texto: String(accion.texto).replace(/\{\{usuario\}\}/g, evento.usuario ?? "usuario") }
      : { ...accion };
    return modo === "real"
      ? { ...base, estado: "pendiente-de-api", nota: "Falta conectar la API de Meta" }
      : { ...base, estado: "simulado" };
  });

  if (modo === "real") {
    const reglas = listar();
    const i = reglas.findIndex((r) => r.id === regla.id);
    if (i >= 0) {
      reglas[i].estadisticas = {
        disparos: (reglas[i].estadisticas?.disparos ?? 0) + 1,
        ultimoDisparo: new Date().toISOString(),
      };
      escribir("automatizaciones", reglas);
    }
  }
  return resultados;
};

/** Simulador: dado un evento falso, dice qué regla saltaría y qué respondería. */
export const simular = (evento) => {
  const regla = buscarRegla(evento);
  if (!regla) return { coincide: false, regla: null, acciones: [] };
  return {
    coincide: true,
    regla: { id: regla.id, nombre: regla.nombre },
    acciones: ejecutarAcciones(regla, evento, "simulacion"),
  };
};

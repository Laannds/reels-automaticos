/**
 * Almacén JSON simple para los datos del panel (calendario, credenciales).
 * Cada "tabla" es un archivo en panel/datos/, que está fuera de git.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const RAIZ = resolve(new URL("../..", import.meta.url).pathname);
const DIR_DATOS = join(RAIZ, "panel", "datos");

const ruta = (nombre) => join(DIR_DATOS, `${nombre}.json`);

export const leer = (nombre, porDefecto) => {
  const r = ruta(nombre);
  if (!existsSync(r)) return porDefecto;
  try {
    return JSON.parse(readFileSync(r, "utf8"));
  } catch {
    return porDefecto;
  }
};

export const escribir = (nombre, datos) => {
  mkdirSync(DIR_DATOS, { recursive: true });
  writeFileSync(ruta(nombre), JSON.stringify(datos, null, 2));
  return datos;
};

export { RAIZ, DIR_DATOS };

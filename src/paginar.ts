// Paginación de los subtítulos del crudo. Vive aparte (sin JSX ni imports de
// valor) porque la usan dos sitios: SubtitulosCrudo al pintar y el control de
// calidad (scripts/qa-reel.mjs, que Node carga como .ts). Así el QA calcula
// qué página se ve en cada fotograma con EXACTAMENTE la lógica del render.
import type { Palabra } from "./tipos";

export type Tramo = [number, number];

// Lo dicho bajo un titular ya lo contó el titular: esas palabras se quitan
// antes de paginar. Si no, al acabar el titular la página seguía "abierta" y
// resucitaban un instante las últimas palabras ("gimnasio,", "noviembre,").
export const paginar = (palabras: Palabra[], silenciar: Tramo[] = []): Palabra[][] => {
  const tapada = (p: Palabra) =>
    silenciar.some(([desde, hasta]) => p.inicio >= desde && p.inicio <= hasta);
  const paginas: Palabra[][] = [];
  let actual: Palabra[] = [];
  let chars = 0;
  for (const p of palabras.filter((p) => !tapada(p))) {
    // Una página nunca cruza un titular. Al quitar las palabras tapadas, las
    // de antes y las de después quedaban contiguas y se juntaban ("de" a
    // 11,2 s + "La segunda" a 14,5 s); como la página empezaba antes del
    // titular, luego no se mostraba y "La segunda" no salía nunca.
    const cruzaTitular =
      actual.length > 0 &&
      silenciar.some(([desde]) => actual[actual.length - 1].inicio < desde && desde <= p.inicio);
    // Ni cruza una pausa larga: lo que se dice tras una pausa de más de 1 s es
    // otra frase y no puede aparecer pegado a la anterior ("trapo." … 3 s de
    // silencio … "¡No os queméis!" salía como "trapo. ¡No os").
    const trasPausa = actual.length > 0 && p.inicio - actual[actual.length - 1].fin > 1.0;
    if (actual.length > 0 && (cruzaTitular || trasPausa || actual.length >= 3 || chars + p.texto.length > 20)) {
      paginas.push(actual);
      actual = [];
      chars = 0;
    }
    actual.push(p);
    chars += p.texto.length + 1;
  }
  if (actual.length > 0) paginas.push(actual);

  // Página huérfana: la corta un titular antes de 0,5 s ("mal?" asomando
  // 0,43 s antes de "DOLOR MODERADO"). No se deja sola: se une a la anterior,
  // que se queda en pantalla hasta el titular con las dos frases (el texto
  // hace wrap a dos líneas). Solo si entre ambas no hay otro titular.
  const inicioTitularTras = (t: number) =>
    silenciar.map(([desde]) => desde).filter((d) => d >= t).sort((a, b) => a - b)[0];
  for (let i = paginas.length - 1; i > 0; i--) {
    const pag = paginas[i];
    const previa = paginas[i - 1];
    const corte = inicioTitularTras(pag[0].inicio);
    const entreMedias = silenciar.some(
      ([desde]) => previa[previa.length - 1].inicio < desde && desde <= pag[0].inicio
    );
    if (corte !== undefined && corte - pag[0].inicio < 0.5 && !entreMedias) {
      paginas.splice(i - 1, 2, [...previa, ...pag]);
    }
  }
  return paginas;
};

// Página visible en el instante t, o null si no toca pintar nada.
export const paginaEn = (
  paginas: Palabra[][],
  silenciar: Tramo[],
  t: number
): Palabra[] | null => {
  if (silenciar.some(([desde, hasta]) => t >= desde && t <= hasta)) return null;

  // Ninguna página se pinta antes de que empiece su primera palabra: antes se
  // mostraba la primera por defecto, y entre dos titulares seguidos asomaba un
  // fotograma de una frase que aún no se había dicho.
  let pagina: Palabra[] | null = null;
  for (const pag of paginas) {
    if (pag[0] && t >= pag[0].inicio) pagina = pag;
  }
  if (!pagina) return null;

  // Y la página de ANTES de un titular tampoco vuelve cuando el titular acaba:
  // esa frase ya se cerró. Se espera a que empiece la siguiente.
  const ultimoTitular = silenciar
    .filter(([, hasta]) => hasta <= t)
    .reduce<Tramo | null>((a, b) => (!a || b[1] > a[1] ? b : a), null);
  if (ultimoTitular && pagina[0].inicio < ultimoTitular[0]) return null;
  return pagina;
};

// Tramos que silencian los subtítulos: el titulón y el remate ya dicen el
// mensaje en grande, y con el titulón además se solaparían.
export const tramosSilenciados = (
  elementos: { tipo: string; t: number; duracion?: number; tapaSubtitulos?: boolean }[]
): Tramo[] =>
  elementos
    // tapaSubtitulos: cualquier elemento grande que ya dice lo que se oye (la
    // portada de TIME con "El chef José Andrés") y quedaría encima del texto
    .filter((e) => e.tipo === "remate" || e.tipo === "titulon" || e.tapaSubtitulos)
    .map((e) => [e.t, e.t + (e.duracion ?? 3)] as Tramo);

// Paginación de los subtítulos del crudo. Vive aparte (sin JSX ni imports de
// valor) porque la usan dos sitios: SubtitulosCrudo al pintar y el control de
// calidad (scripts/qa-reel.mjs, que Node carga como .ts). Así el QA calcula
// qué página se ve en cada fotograma con EXACTAMENTE la lógica del render.
import type { Palabra } from "./tipos";

export type Tramo = [number, number];

// Cuántas palabras/caracteres caben en una página antes de forzar el salto a
// la siguiente. Subirlo hace que el subtítulo crezca frase a frase (como una
// build-up que se va acumulando) en vez de vaciarse y rehacerse cada 2-3
// palabras, que es lo que hacía sentir el texto "atropellado": el bloque de
// texto entero se sustituía sin que diera tiempo a leerlo.
const MAX_PALABRAS_POR_PAGINA = 6;
const MAX_CARACTERES_POR_PAGINA = 32;

// Los subtítulos "cristal" (look de referencia) van al revés: bloques de dos o
// tres palabras que se relevan al ritmo del habla, sin acumular frase. Con seis
// palabras el bloque se quedaba fijo cuatro segundos y el vídeo parecía parado.
// Los límites viven aquí, y no en el componente, porque el control de calidad
// tiene que paginar EXACTAMENTE igual que el render para saber qué se ve.
export type Limites = {
  maxPalabras: number;
  maxCaracteres: number;
  // Partir por unidades de sentido y no solo por cupo. Contar palabras deja
  // cortes que no se leen: "automatizar. La", "siempre igual? Si",
  // "Un correo, un", "Comenta test y" — el final de una frase pegado al
  // principio de la siguiente, y artículos y conjunciones colgando al final
  // de la página. Solo en "cristal": el clásico lleva páginas de seis
  // palabras ya afinadas reel a reel y moverlas descolocaría lo entregado.
  sintaxis?: boolean;
};
export const limitesDe = (estilo?: string): Limites =>
  estilo === "cristal"
    ? // El cupo que manda es el de caracteres: con tres palabras clavadas,
      // "entre 2 y 6 horas" —diecisiete caracteres— se partía en tres páginas.
      { maxPalabras: 5, maxCaracteres: 24, sintaxis: true }
    : { maxPalabras: MAX_PALABRAS_POR_PAGINA, maxCaracteres: MAX_CARACTERES_POR_PAGINA };

// Palabras que NUNCA cierran una página: se leen apoyadas en la siguiente, y
// solas al final de una línea dejan la frase en el aire.
const ATONAS = new Set(
  ("un una unos unas el la los las lo al del de a en con por para sin sobre " +
   "entre hasta desde tras ante bajo contra hacia según durante mediante " +
   "algún alguna algunos algunas este esta estos estas ese esa esos esas " +
   "otro otra otros otras todo toda todos todas cada mismo misma mismos mismas " +
   "y e o u ni que si su sus tu tus mi mis me te se nos le les como cuando " +
   "donde muy más tan ya no").split(" ")
);
const limpia = (t: string) =>
  t.toLowerCase().replace(/[.,;:¿?¡!…"'«»()-]/g, "").trim();
const cierraFrase = (t: string) => /[.?!…:]["'»)]?$/.test(t.trim());
const cierraInciso = (t: string) => /[,;]["'»)]?$/.test(t.trim());

// Lo dicho bajo un titular ya lo contó el titular: esas palabras se quitan
// antes de paginar. Si no, al acabar el titular la página seguía "abierta" y
// resucitaban un instante las últimas palabras ("gimnasio,", "noviembre,").
export const paginar = (
  palabras: Palabra[],
  silenciar: Tramo[] = [],
  limites: Limites = limitesDe()
): Palabra[][] => {
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
    const previa = actual[actual.length - 1];
    // Fin de frase: corte obligatorio. Lo que viene detrás ya es otra cosa y
    // no puede compartir página ("automatizar." + "La").
    const trasPunto = limites.sintaxis === true && previa !== undefined && cierraFrase(previa.texto);
    // Coma o punto y coma: corte preferente, si la página ya se lee sola.
    const trasComa =
      limites.sintaxis === true &&
      previa !== undefined &&
      cierraInciso(previa.texto) &&
      actual.length >= 2;
    const porCupo =
      actual.length >= limites.maxPalabras || chars + p.texto.length > limites.maxCaracteres;
    if (actual.length > 0 && (cruzaTitular || trasPausa || trasPunto || trasComa || porCupo)) {
      // Si el corte lo manda el cupo (no la puntuación) y la página terminaría
      // en un artículo, una preposición o una conjunción, esa palabra se lleva
      // a la página siguiente: "Un correo, un" → "Un correo," + "un Excel,".
      let cierra = actual;
      let arrastre: Palabra[] = [];
      if (
        limites.sintaxis === true &&
        porCupo &&
        !trasPunto &&
        !trasComa &&
        !cruzaTitular &&
        !trasPausa
      ) {
        // Se arrastra también el par "átona + su palabra": si la página acaba
        // en "entre 2", lo que cuelga no es la última palabra sino el sintagma
        // entero, y partirlo rompía el número ("esos son entre 2" + "y 6
        // horas"). Con el par se lee "esos son" + "entre 2 y 6".
        // Nunca se arrastra tanto como para dejar la página en una sola
        // palabra átona: sin este freno, "a la semana que puedes" se comía a
        // sí misma hasta dejar una página con la palabra "a" suelta.
        const dejaHuerfana = (resto: Palabra[]) =>
          resto.length === 1 && ATONAS.has(limpia(resto[0].texto));
        for (let n = 0; n < 4; n++) {
          const ult = cierra.length - 1;
          const quitandoUna = cierra.slice(0, -1);
          const quitandoDos = cierra.slice(0, -2);
          if (
            cierra.length > 1 &&
            ATONAS.has(limpia(cierra[ult].texto)) &&
            !dejaHuerfana(quitandoUna)
          ) {
            arrastre.unshift(cierra[ult]);
            cierra = quitandoUna;
          } else if (
            cierra.length > 2 &&
            ATONAS.has(limpia(cierra[ult - 1].texto)) &&
            !dejaHuerfana(quitandoDos)
          ) {
            arrastre.unshift(cierra[ult - 1], cierra[ult]);
            cierra = quitandoDos;
          } else break;
        }
      }
      paginas.push(cierra);
      actual = arrastre;
      chars = arrastre.reduce((a, w) => a + w.texto.length + 1, 0);
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

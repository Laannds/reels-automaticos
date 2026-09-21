export type Palabra = {
  texto: string;
  inicio: number; // segundos dentro de la escena (ya con silencios comprimidos)
  fin: number;
  estilo?: "resaltado" | "circulo"; // subrayado amarillo o círculo rojo a mano
  // Solo para el control de calidad (scripts/qa-reel.mjs):
  indice?: number; // posición en la transcripción original
  prob?: number; // confianza de Whisper (la del token más dudoso)
  corregida?: boolean; // tiene sustitución manual en revision.json
};

// Tramo del mp3 original que se reproduce (los huecos entre tramos son
// silencios que se saltan para que no haya ni un segundo muerto)
export type Segmento = {
  srcInicio: number;
  srcFin: number;
};

export type TipoEscena = "hook" | "contenido" | "cta";

export type Escena = {
  tipo: TipoEscena;
  texto: string;
  audio: string; // ruta relativa dentro de /public
  duracion: number; // segundos
  palabras: Palabra[];
  emoji?: string;
  video?: string; // clip de stock (va en una polaroid), ruta relativa dentro de /public
  videoDuracion?: number; // segundos del clip, para loopearlo si hace falta
  segmentos?: Segmento[]; // tramos del mp3 sin silencios
  nota?: string; // anotación manuscrita en rojo
  postit?: string; // texto del post-it amarillo
  sello?: { texto: string; tipo?: "bueno" | "malo" | "mejor" }; // tampón de tinta
  vs?: string[]; // enfrentamiento: chips con nombres + badge VS
  badge?: string; // pegatina numerada para rankings ("#1", "TOP 3"...)
  puntuacion?: {
    valor: number; // 0-5, bloques que se rellenan
    etiqueta?: string; // aspecto evaluado ("ESCRITURA")
    tipo?: "bueno" | "malo" | "mejor"; // color del medidor
  };
  rank?: { numero: number; nombre: string }; // tarjeta de ranking gigante
  logo?: string; // pegatina con logo (ruta en /public), p. ej. "logos/claude.svg"
  flecha?: boolean; // fuerza la flecha roja en vez del conector fino
  comparativa?: {
    a: string; // nombre IA izquierda (logo automático)
    b: string; // nombre IA derecha
    metricas: { etiqueta: string; a: number; b: number }[]; // valores 0-5
    ganador?: "a" | "b"; // el perdedor se atenúa
  };
  chat?: {
    ia: string; // "CLAUDE", "CHATGPT"... (logo automático)
    prompt: string; // se teclea carácter a carácter
    respuesta?: string; // aparece en streaming palabra a palabra
  };
};

export type ReelProps = {
  titulo: string;
  handle: string;
  musica?: string; // ruta relativa dentro de /public
  escenas: Escena[];
};

export const FPS = 30;
export const PAUSA_ENTRE_ESCENAS = 0.05; // segundos — sin huecos muertos
export const COLA_FINAL = 0.2; // segundos tras la última escena

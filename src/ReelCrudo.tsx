import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  Easing,
  Img,
  interpolate,
} from "remotion";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadAnton } from "@remotion/google-fonts/Anton";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";
import {
  logoDe,
  LogoCirculo,
  Sello,
  ANIM,
  PAPEL,
  TINTA,
  AMARILLO,
  ROJO,
  archivo,
  caveat,
} from "./Reel";
import { FPS, type Palabra, type Segmento } from "./tipos";
import { paginaEn, paginar, tramosSilenciados } from "./paginar";

const { fontFamily: inter } = loadInter("normal", {
  weights: ["600", "700", "800"],
  subsets: ["latin"],
});
const { fontFamily: anton } = loadAnton("normal", {
  weights: ["400"],
  subsets: ["latin"],
});
const { fontFamily: playfair } = loadPlayfair("italic", {
  weights: ["500"],
  subsets: ["latin"],
});

// Color de marca (rótulos, énfasis, carril, ticks). Por defecto el azul
// eléctrico de @politecnic__, pero cada reel puede llevar el suyo vía
// props.color — útil para vídeos de clientes con su propia identidad.
//
// Es una variable de módulo en vez de contexto de React a propósito: la usan
// ~20 sitios repartidos por todo el archivo y así se evita tocarlos uno a uno.
// Funciona porque el componente raíz la fija antes de que rendericen los
// hijos, y Remotion renderiza una composición por proceso.
const AZUL_POR_DEFECTO = "#3D9BFF";
let AZUL = AZUL_POR_DEFECTO;
let AZUL_OSCURO = "#1B5FC7";

/** Oscurece un hex (#RRGGBB) el porcentaje indicado. Para los degradados. */
const oscurecer = (hex: string, factor = 0.45): string => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const canal = (desp: number) =>
    Math.round(((n >> desp) & 0xff) * (1 - factor))
      .toString(16)
      .padStart(2, "0");
  return `#${canal(16)}${canal(8)}${canal(0)}`;
};

const fijarColorDeMarca = (color?: string) => {
  AZUL = color?.trim() || AZUL_POR_DEFECTO;
  AZUL_OSCURO = oscurecer(AZUL);
};

const TURQUESA = "#3AE0D0"; // círculos de anotación

export type ElementoCrudo = {
  tapaSubtitulos?: boolean; // silencia los subtítulos mientras está en pantalla
  // Seguimiento de un objeto que se mueve en el vídeo (scripts/qa/seguir.swift):
  // el gráfico se pega a él, con su posición, tamaño y ángulo en cada fotograma.
  // cuadros = [centroX, centroY, ancho, alto, ánguloGrados] en coords 0-1 del crudo.
  pista?: { fps: number; desde: number; cuadros: [number, number, number, number, number][] };
  tam?: number; // tamaño en px para los que lo admiten (anillo de estado: 168 por defecto)
  // Tramos ABSOLUTOS [desde, hasta] en los que el gráfico se aparta con un
  // fundido. Para persistentes como la cabecera fija: si el presentador se
  // acerca a cámara y le quedaría sobre la boca, se retira y luego vuelve.
  ocultar?: [number, number][];
  t: number; // segundo (en la línea de tiempo ya sin silencios) en que aparece
  duracion?: number; // segundos que permanece (por defecto 3)
  tipo:
    | "logo" | "sello" | "nota" | "emoji" | "imagen" | "foco" | "broll" | "rotulo"
    | "titulon" // "PIERDES|CLIENTES" — título gigante multilínea sobre el video
    | "metricas" // "2.6K,1.8K,3.7K" — pills oscuras con 👁
    | "burbuja" // texto de chat iMessage (lado: izq gris / der azul)
    | "tarjetas" // "stock/a.mp4:150K,stock/b.mp4:1.8M" — mini-reels con views
    | "icono" // PNG/SVG descargado por reel (iconos/x.svg) en chip de cristal
    | "panel" // bandeja de clientes desbordada; dato = contador final ("47")
    | "movil" // mockup de iPhone; dato = una captura o varias separadas por |
    | "caos" // capturas apiladas que colapsan (dato = "cap-x.png:tRel,...")
    | "calculadora" // operación que se acumula línea a línea; dato = "L1@t|L2@t|=RESULTADO@t"
    | "estado" // anillo giratorio "siempre activo"; dato = "24/7" (texto central) o "24/7:SIEMPRE ACTIVA"
    | "cabeceraTop" // header persistente "TOP N|palabra cursiva"; dato = "TOP 6 TRUCOS DE|ChatGPT"
    | "riel" // carril numerado persistente; dato = "6|6@3.7|5@6.9|4@10.3|3@14.5|2@18.2|1@21.4" (total|activo@t...)
    | "fotoCirc" // burbuja circular con icono que cambia; dato = "iconos/a.svg@3.7|iconos/b.svg@6.9|..."
    | "timeline" // mockup de editor de vídeo: tramos rojos colapsan; dato = "1:32|0:48@tColapso"
    | "checklist" // tareas que se marcan una a una; dato = "Tarea 1@0.2|Tarea 2@1.4|=Remate@4.5"
    | "antesDespues" // par de fotos persistente; dato = "inserts/a.jpg:ANTES|inserts/b.jpg:AHORA"
    | "regalo" // caja de regalo animada en SVG; dato = texto opcional debajo
    | "remate" // titular a pantalla completa; dato = "LÍNEA 1|PALABRA=DESTACADA"
    | "siNo" // contraste SÍ/NO en dos filas; dato = "texto del sí|texto del no"
    | "contador" // progreso "1/3"; dato = "3|8.8|14.4|20.5" (total|segundos)
    | "interrogantes" // "?" del gancho; dato = cuántos ("1"), con color/tam y, con
                      // "pista", pegados a un objeto que se mueve
    | "plazas" // plazas de clase + lista de espera; dato = "8|3" (total|la que cancela)
    | "etiqueta" // tarjeta editorial; dato = "TRUCO|Agua poco a poco"
    | "transicion"; // gesto de cámara entre bloques; dato = zoomIn | zoomOut | fade
  dato: string; // nombre IA / texto / emoji / ruta de imagen o video / texto del rótulo
  color?: "bueno" | "malo" | "mejor";
  lado?: "izq" | "der"; // burbuja: quién habla
  x?: number; // foco: centro horizontal 0-1
  y?: number; // foco: centro vertical 0-1
  radio?: number; // foco: radio en px (por defecto 150)
};

export type CrudoProps = {
  video: string; // crudo, ruta relativa a /public
  audio: string; // voz mejorada, ruta relativa a /public
  handle: string; // cadena vacía = no se pinta (vídeos de cliente)
  color?: string; // color de marca en hex; por defecto el azul de politecnic
  musica?: string;
  mezcla?: string; // voz+música premezcladas en un solo archivo (ver VozMezclada)
  segmentos: Segmento[]; // tramos del crudo que se conservan
  palabras: Palabra[]; // línea de tiempo comprimida global
  elementos: ElementoCrudo[];
  titulo?: { texto: string; resaltar?: string }; // banner persistente inferior
  pasos?: number[]; // segundos en que se completa cada hito (ticks)
  // "ninguno" para vídeos que ya traen su propio texto (grabaciones de
  // pantalla, piezas ya diseñadas): evita duplicar mensaje.
  subtitulos?: "bold" | "serif" | "ninguno";
  subtitulosY?: number; // altura 0-1 de los subtítulos (por defecto 0.54)
  // Modo control de calidad: solo gráficos y subtítulos sobre fondo
  // transparente. El alfa de ese render es la huella REAL de lo que tapa cada
  // gráfico; scripts/qa-reel.mjs la cruza con las caras detectadas.
  qa?: boolean;
  nivelVoz?: number; // LUFS de la voz original (los efectos se ajustan a ella)
  lista?: { titulo: string; resaltar?: string; items: string[]; y?: number }; // panel listicle (y 0-1, por defecto bajo la barbilla)
  revelaciones?: number[]; // segundo en que se destapa cada item de la lista
};

export const duracionCrudoEnFrames = (props: CrudoProps): number => {
  const seg = props.segmentos.reduce((a, s) => a + (s.srcFin - s.srcInicio), 0);
  return Math.max(1, Math.round((seg + 0.3) * FPS));
};

// Vídeo troceado: cada segmento pega con el siguiente (jump cut) y alterna
// un punch-in de zoom para que el corte se sienta intencional
const VideoCortado: React.FC<{ props: CrudoProps }> = ({ props }) => {
  if (!props.video) return null;
  let out = 0;
  return (
    <>
      {props.segmentos.map((s, i) => {
        const desde = Math.round(out * FPS);
        const dur = Math.max(1, Math.round((s.srcFin - s.srcInicio) * FPS));
        out += s.srcFin - s.srcInicio;
        // Cambio de toma real (salto grande en el crudo) → whoosh y cambio
        // de plano. Microcortes de silencio → mismo encuadre, sin ruido.
        const gapSrc = i > 0 ? s.srcInicio - props.segmentos[i - 1].srcFin : 0;
        const cambioDeToma = gapSrc > 1;
        const zoomBase = 1 + (Math.floor(i / 2) % 2 === 0 ? 0 : 0.08);
        return (
          <Sequence key={i} from={desde} durationInFrames={dur}>
            <AbsoluteFill>
              <ZoomInterno base={zoomBase}>
                <OffthreadVideo
                  src={staticFile(props.video)}
                  muted
                  trimBefore={Math.round(s.srcInicio * FPS)}
                  trimAfter={Math.round(s.srcFin * FPS)}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    // grade cinematográfico suave
                    filter: "contrast(1.07) saturate(1.08) brightness(0.96)",
                  }}
                />
              </ZoomInterno>
            </AbsoluteFill>
            {cambioDeToma ? (
              <Audio src={staticFile("sfx/corte.mp3")} volume={0.16} />
            ) : null}
          </Sequence>
        );
      })}
    </>
  );
};

const ZoomInterno: React.FC<{ base: number; children: React.ReactNode }> = ({
  base,
  children,
}) => {
  const frame = useCurrentFrame();
  const drift = 1 + frame * 0.00025; // deriva lenta continua
  return (
    <AbsoluteFill style={{ transform: `scale(${base * drift})` }}>
      {children}
    </AbsoluteFill>
  );
};

// Voz (+ música, ya premezcladas en un solo archivo por editar-crudo.mjs para
// evitar el audio-mixing interno de Remotion, que puede colgarse en macOS).
// El archivo ya viene recortado y mezclado: se reproduce entero, sin trocear.
const VozMezclada: React.FC<{ props: CrudoProps }> = ({ props }) => {
  if (props.mezcla) return <Audio src={staticFile(props.mezcla)} />;
  // Fallback (props antiguos sin mezcla): comportamiento previo por segmento
  if (!props.audio) return null;
  let out = 0;
  return (
    <>
      {props.segmentos.map((s, i) => {
        const desde = Math.round(out * FPS);
        const dur = Math.max(1, Math.round((s.srcFin - s.srcInicio) * FPS));
        out += s.srcFin - s.srcInicio;
        return (
          <Sequence key={i} from={desde} durationInFrames={dur}>
            <Audio
              src={staticFile(props.audio)}
              trimBefore={Math.round(s.srcInicio * FPS)}
              trimAfter={Math.round(s.srcFin * FPS)}
            />
          </Sequence>
        );
      })}
    </>
  );
};

// Subtítulos sobre vídeo: páginas de 3 palabras, estilo bold o serif elegante
const SubtitulosCrudo: React.FC<{
  palabras: Palabra[];
  estilo?: "bold" | "serif" | "ninguno";
  // Tramos [inicio, fin] en los que NO se pintan subtítulos, porque hay un
  // remate a pantalla completa diciendo ya lo mismo en grande.
  silenciar?: [number, number][];
  // Altura 0-1. Por defecto 0.54 (bajo la barbilla en planos medios), pero
  // en grabaciones de pantalla que ya traen texto propio hay que bajarlos.
  y?: number;
}> = ({ palabras, estilo = "bold", silenciar, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  if (estilo === "ninguno") return null;
  // Misma lógica que usa el control de calidad (ver src/paginar.ts)
  const pagina = paginaEn(paginar(palabras, silenciar), silenciar ?? [], t);
  if (!pagina) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: `${(y ?? 0.54) * 100}%`,
        left: 0,
        right: 0,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        rowGap: 4,
        padding: "0 90px",
      }}
    >
      {/* Solo se pintan las palabras ya dichas. Antes las siguientes ocupaban
          su hueco (invisibles) y lo visible quedaba descentrado a la izquierda
          mientras se completaba la frase: "os queréis ___". Ahora cada palabra
          entra ensanchándose, así que la frase crece centrada y sin saltos. */}
      {pagina.filter((p) => t >= p.inicio).map((p, i) => {
        const dicha = true;
        // Presencia sólida y seria: fade + leve asentamiento, sin rebote,
        // sin rotación, sin pulso. El énfasis es solo color y peso, sin slam.
        const enfasis = p.estilo === "resaltado";
        const entra = spring({
          frame: frame - Math.round(p.inicio * fps),
          fps,
          config: { damping: 26, stiffness: 180 },
        });
        const base = estilo === "serif" ? 46 : 54;
        return (
          <span
            key={`${p.texto}-${i}-${p.inicio}`}
            style={{
              fontFamily: enfasis ? inter : estilo === "serif" ? playfair : inter,
              fontStyle: !enfasis && estilo === "serif" ? "italic" : "normal",
              fontWeight: enfasis ? 800 : estilo === "serif" ? 500 : 700,
              fontSize: enfasis ? Math.round(base * 1.14) : base,
              letterSpacing: estilo === "serif" && !enfasis ? 1 : 0,
              lineHeight: 1.2,
              color: enfasis ? AZUL : "#FFFFFF",
              opacity: dicha ? entra : 0,
              transform: `translateY(${dicha ? (1 - entra) * 8 : 8}px)`,
              // Ensanche: el ancho máximo crece con la entrada. El relleno con
              // margen negativo da sitio a la sombra sin mover la maqueta.
              display: "inline-block",
              whiteSpace: "nowrap",
              overflow: "hidden",
              verticalAlign: "top",
              maxWidth: Math.round(Math.min(1, entra) * 760),
              padding: "0 12px 16px",
              margin: `0 -12px -16px ${i === 0 ? -12 : Math.round(14 * Math.min(1, entra)) - 12}px`,
              textShadow: enfasis
                ? "0 0 14px rgba(61,155,255,0.45), 0 3px 14px rgba(0,0,0,0.8)"
                : estilo === "serif"
                  ? "0 2px 12px rgba(0,0,0,0.7)"
                  : "0 3px 14px rgba(0,0,0,0.75), 0 1px 3px rgba(0,0,0,0.8)",
            }}
          >
            {p.texto}
          </span>
        );
      })}
    </div>
  );
};

// Banner de título persistente + estrellas de progreso (estilo referencia)
const BannerTitulo: React.FC<{
  titulo: NonNullable<CrudoProps["titulo"]>;
  pasos?: number[];
}> = ({ titulo, pasos }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const entra = spring({ frame: frame - 5, fps, config: ANIM.entrada });

  const partes = titulo.resaltar
    ? titulo.texto.split(new RegExp(`(${titulo.resaltar})`, "i"))
    : [titulo.texto];

  return (
    <div
      style={{
        position: "absolute",
        bottom: 460,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 22,
        opacity: entra,
        transform: `translateY(${(1 - entra) * 30}px)`,
      }}
    >
      <div
        style={{
          fontFamily: inter,
          fontWeight: 800,
          fontSize: 58,
          color: "#FFFFFF",
          textShadow: "0 4px 24px rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.8)",
          padding: "6px 30px",
        }}
      >
        {partes.map((parte, i) => (
          <span
            key={i}
            style={{
              color:
                titulo.resaltar &&
                parte.toLowerCase() === titulo.resaltar.toLowerCase()
                  ? AZUL
                  : "#FFFFFF",
            }}
          >
            {parte}
          </span>
        ))}
      </div>
      {pasos && pasos.length > 0 ? (
        <div style={{ display: "flex", gap: 26 }}>
          {pasos.map((hito, i) => {
            const completado = t >= hito;
            const pop = spring({
              frame: frame - Math.round(hito * fps),
              fps,
              config: { damping: 13, stiffness: 240 },
            });
            return (
              <div
                key={i}
                style={{
                  width: 74,
                  height: 74,
                  borderRadius: "50%",
                  backgroundColor: completado ? AZUL : "rgba(255,255,255,0.92)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: inter,
                  fontWeight: 800,
                  fontSize: 34,
                  color: completado ? "#0A1F3D" : "#3A3A3A",
                  boxShadow: completado
                    ? "0 0 22px rgba(61,155,255,0.6), 0 6px 18px rgba(0,0,0,0.35)"
                    : "0 6px 18px rgba(0,0,0,0.35)",
                  transform: completado ? `scale(${0.9 + pop * 0.25})` : "none",
                }}
              >
                {completado ? (
                  <svg viewBox="0 0 40 40" style={{ width: 38, height: 38 }}>
                    <path
                      d="M 9 21 L 17 29 L 31 12"
                      fill="none"
                      stroke="#0A1F3D"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      pathLength={1}
                      strokeDasharray={1}
                      strokeDashoffset={1 - Math.min(1, pop)}
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};

// Panel de lista (formato listicle): título + cajas numeradas tapadas que
// se destapan una a una cuando el guión llega a cada punto
const ListaPanel: React.FC<{
  lista: NonNullable<CrudoProps["lista"]>;
  revelaciones: number[];
}> = ({ lista, revelaciones }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const entra = spring({ frame: frame - 4, fps, config: ANIM.entrada });

  const partes = lista.resaltar
    ? lista.titulo.split(new RegExp(`(${lista.resaltar})`, "i"))
    : [lista.titulo];

  return (
    <div
      style={{
        position: "absolute",
        top: Math.round((lista.y ?? 0.615) * 1920),
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        gap: 18,
        opacity: entra,
        transform: `translateY(${(1 - entra) * 24}px)`,
      }}
    >
      <div
        style={{
          textAlign: "center",
          fontFamily: anton,
          fontSize: 58,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: "#FFFFFF",
          textShadow: "0 5px 26px rgba(0,0,0,0.7), 0 2px 8px rgba(0,0,0,0.7)",
        }}
      >
        {partes.map((parte, i) => (
          <span
            key={i}
            style={{
              color:
                lista.resaltar &&
                parte.toLowerCase() === lista.resaltar.toLowerCase()
                  ? AZUL
                  : "#FFFFFF",
            }}
          >
            {parte}
          </span>
        ))}
        <span style={{ color: AZUL }}> ✳</span>
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          padding: "0 90px",
        }}
      >
        {lista.items.map((item, i) => {
          const revelado = revelaciones[i] !== undefined && t >= revelaciones[i];
          const pop = spring({
            frame: frame - Math.round((revelaciones[i] ?? 0) * fps),
            fps,
            config: { damping: 15, stiffness: 220 },
          });
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 22 }}>
              <div
                style={{
                  fontFamily: anton,
                  fontSize: 42,
                  color: "#FFFFFF",
                  textShadow: "0 3px 14px rgba(0,0,0,0.8)",
                  width: 44,
                }}
              >
                {i + 1}.
              </div>
              {revelado ? (
                <div
                  style={{
                    fontFamily: inter,
                    fontWeight: 800,
                    fontSize: 36,
                    color: "#FFFFFF",
                    textShadow: "0 0 16px rgba(61,155,255,0.4), 0 3px 14px rgba(0,0,0,0.85)",
                    transform: `scale(${0.9 + Math.min(1, pop) * 0.1})`,
                    transformOrigin: "left center",
                  }}
                >
                  {item}
                </div>
              ) : (
                <div
                  style={{
                    width: 250 + ((i * 47) % 80),
                    height: 42,
                    borderRadius: 12,
                    background: `linear-gradient(120deg, ${AZUL}E8, #7CBEFFE8)`,
                    boxShadow: "0 6px 20px rgba(0,0,0,0.3)",
                    transform: `translateY(${Math.sin(frame / 20 + i) * 2}px)`,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Caos de capturas: mockups reales (Excel, WhatsApp, agenda, facturas) que
// van apareciendo apilados y desordenados sobre la mesa. Cada uno entra
// deslizando y rotado; se acumulan solapándose (el descontrol). Al final
// TODO el montón colapsa hacia el centro justo antes de aparecer el orden.
// dato = "cap-excel.png:t0,cap-whatsapp.png:t1,..." (t = seg de entrada
// relativo al inicio del elemento) o rutas simples (reparto automático).
const CaosCapturas: React.FC<{ dato: string; duracion: number }> = ({
  dato,
  duracion,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const partes = dato.split(",").map((s) => s.trim()).filter(Boolean);
  const capturas = partes.map((p, i) => {
    const [ruta, t] = p.split(":");
    return {
      ruta: ruta.startsWith("inserts/") ? ruta : `inserts/${ruta}`,
      entra: t !== undefined ? parseFloat(t) : (i / partes.length) * (duracion - 3),
    };
  });
  // Posiciones apiladas y giradas (evitando el centro-cara superior)
  const slots = [
    { x: 30, y: 62, rot: -8 },
    { x: 66, y: 60, rot: 7 },
    { x: 34, y: 82, rot: 6 },
    { x: 68, y: 84, rot: -9 },
  ];
  const colapso = spring({
    frame: frame - (durationInFrames - 9),
    fps,
    config: { damping: 24, stiffness: 210 },
  });
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {capturas.map((c, i) => {
        const s = slots[i % slots.length];
        const desde = Math.round(c.entra * fps);
        const aparece = spring({
          frame: frame - desde,
          fps,
          config: { damping: 14, stiffness: 200 },
        });
        if (frame < desde) return null;
        // vibración sutil que crece (descontrol acumulándose)
        const inten = 1 + Math.min(3.5, (frame - desde) * 0.03);
        const shx = Math.sin(frame / 3 + i * 2) * inten;
        const shy = Math.cos(frame / 3.5 + i) * inten;
        // al colapsar viaja al centro y se encoge
        const cx = s.x + (50 - s.x) * colapso;
        const cy = s.y + (74 - s.y) * colapso;
        const desliza = (1 - aparece) * (i % 2 === 0 ? -70 : 70);
        const esc = (0.85 + aparece * 0.15) * (1 - colapso * 0.85);
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${cx}%`,
              top: `${cy}%`,
              width: 430,
              marginLeft: -215,
              marginTop: -150,
              borderRadius: 18,
              overflow: "hidden",
              backgroundColor: "#fff",
              border: "3px solid rgba(255,255,255,0.9)",
              boxShadow: "0 22px 50px rgba(0,0,0,0.5)",
              opacity: Math.min(1, aparece * 1.3) * (1 - colapso),
              transform: `translate(${desliza + shx}px, ${shy}px) rotate(${s.rot + shx * 0.4}deg) scale(${esc})`,
              zIndex: i,
            }}
          >
            <Img src={staticFile(c.ruta)} style={{ width: "100%", display: "block" }} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Calculadora: panel oscuro donde una operación se acumula línea a línea,
// sincronizada con lo que dices. La línea que empieza por "=" es el
// resultado: gigante, azul y con slam. dato = "40 msg/día@0.5|× 2 min@2|=30 HORAS@5"
const Calculadora: React.FC<{ dato: string; y?: number }> = ({ dato, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const lineas = dato.split("|").map((l) => {
    const [texto, tt] = l.split("@");
    const resultado = texto.trim().startsWith("=");
    return {
      texto: resultado ? texto.trim().slice(1).trim() : texto.trim(),
      entra: parseFloat(tt ?? "0"),
      resultado,
    };
  });
  const entra = spring({ frame: frame - 3, fps, config: ANIM.entrada });
  const visibles = lineas.filter((l) => t >= l.entra);
  if (visibles.length === 0 && frame < 3) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: Math.round((y ?? 0.6) * 1920),
        left: 90,
        right: 90,
        backgroundColor: "rgba(13,13,20,0.82)",
        backdropFilter: "blur(14px)",
        border: "1px solid rgba(61,155,255,0.35)",
        borderRadius: 28,
        padding: "34px 40px",
        boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
        opacity: entra,
        transform: `translateY(${(1 - entra) * 26}px)`,
      }}
    >
      {lineas.map((l, i) => {
        const visible = t >= l.entra;
        const pop = spring({
          frame: frame - Math.round(l.entra * fps),
          fps,
          config: l.resultado
            ? { damping: 11, stiffness: 300 }
            : { damping: 16, stiffness: 220 },
        });
        if (!visible) return null;
        if (l.resultado) {
          const flash = 1 + Math.max(0, 1 - pop) * 2;
          return (
            <div
              key={i}
              style={{
                marginTop: 20,
                paddingTop: 22,
                borderTop: "2px solid rgba(61,155,255,0.4)",
                fontFamily: anton,
                fontSize: 92,
                letterSpacing: 1,
                color: AZUL,
                textShadow: `0 0 ${Math.round(20 * flash)}px rgba(61,155,255,${Math.min(1, 0.6 * flash)})`,
                transform: `scale(${1.5 - Math.min(1, pop) * 0.5})`,
                transformOrigin: "left center",
              }}
            >
              {l.texto}
            </div>
          );
        }
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              fontFamily: inter,
              fontWeight: 700,
              fontSize: 46,
              color: "#FFFFFF",
              marginTop: i === 0 ? 0 : 12,
              opacity: Math.min(1, pop * 1.4),
              transform: `translateX(${(1 - Math.min(1, pop)) * -24}px)`,
            }}
          >
            {l.texto}
          </div>
        );
      })}
    </div>
  );
};

// Checklist tipo "la IA está haciendo esto por ti": tareas que se van
// marcando con check una a una, mismo panel que la Calculadora. La última
// línea puede ir con "=" delante para resaltarla como remate.
// dato = "Cortando silencios@0.2|Añadiendo subtítulos@1.4|=Listo@4.5"
// Contraste SÍ / NO en dos filas. Para aclarar distinciones del tipo
// "esto sí es normal, esto no lo es".
// dato = "Al día siguiente|Durante el ejercicio" (1ª fila SÍ, 2ª fila NO)
const SiNo: React.FC<{ dato: string; y?: number }> = ({ dato, y }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  // "texto@s|texto@s": como en el checklist, cada fila entra en su segundo
  // (relativo al elemento). Sin @, las dos casi a la vez, como siempre.
  const [crudoSi, crudoNo = ""] = dato.split("|");
  const [textoSi, tSi] = crudoSi.split("@");
  const [textoNo, tNo] = crudoNo.split("@");
  const retrasoSi = tSi !== undefined ? Math.round(parseFloat(tSi) * fps) + 2 : 2;
  const retrasoNo = tNo !== undefined ? Math.round(parseFloat(tNo) * fps) + 2 : 10;
  const sale = spring({
    frame: frame - (durationInFrames - 7),
    fps,
    config: { damping: 30, stiffness: 240 },
  });

  const VERDE = "#1FBF6B";
  const ROJO_NO = "#E5484D";

  const fila = (texto: string, ok: boolean, retraso: number) => {
    const pop = spring({ frame: frame - retraso, fps, config: { damping: 15, stiffness: 210 } });
    const dibujo = Math.min(
      1,
      spring({ frame: frame - retraso - 4, fps, config: { damping: 14, stiffness: 200 } })
    );
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 20,
          opacity: Math.min(1, pop * 1.4),
          transform: `translateX(${(1 - Math.min(1, pop)) * -26}px)`,
        }}
      >
        <div
          style={{
            width: 62,
            height: 62,
            borderRadius: "50%",
            backgroundColor: ok ? VERDE : ROJO_NO,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            boxShadow: `0 0 22px ${ok ? VERDE : ROJO_NO}66`,
          }}
        >
          <svg viewBox="0 0 24 24" style={{ width: 32, height: 32 }}>
            <path
              d={ok ? "M20 6L9 17l-5-5" : "M6 6l12 12M18 6L6 18"}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="3.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - dibujo}
            />
          </svg>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <div
            style={{
              fontFamily: anton,
              fontSize: 46,
              letterSpacing: 1,
              color: ok ? VERDE : ROJO_NO,
            }}
          >
            {ok ? "SÍ" : "NO"}
          </div>
          <div style={{ fontFamily: inter, fontWeight: 700, fontSize: 36, color: "#FFFFFF" }}>
            {texto}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      style={{
        position: "absolute",
        top: Math.round((y ?? 0.63) * 1920),
        left: 70,
        right: 70,
        backgroundColor: "rgba(13,13,20,0.86)",
        backdropFilter: "blur(14px)",
        border: `1px solid ${AZUL}55`,
        borderRadius: 28,
        padding: "30px 36px",
        display: "flex",
        flexDirection: "column",
        gap: 20,
        boxShadow: "0 20px 50px rgba(0,0,0,0.55)",
        opacity: 1 - sale,
      }}
    >
      {fila(textoSi, true, retrasoSi)}
      {fila(textoNo, false, retrasoNo)}
    </div>
  );
};

// Contador de progreso "1/3" que avanza con cada punto. Retiene: el que ve
// que quedan dos se queda. dato = "3|8.8|14.4|20.5" (total | segundos de
// cada punto, en tiempo absoluto del vídeo ya montado).
const Contador: React.FC<{ dato: string; x?: number; y?: number }> = ({ dato, x, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [totalStr, ...marcas] = dato.split("|");
  const total = parseInt(totalStr, 10);
  // El elemento arranca en su propio Sequence, así que t es local; las marcas
  // vienen en absoluto y se comparan restando el inicio (ver props.t al usarlo)
  const t = frame / fps;
  const tiempos = marcas.map(parseFloat);

  let actual = 0;
  tiempos.forEach((m, i) => {
    if (t >= m) actual = i + 1;
  });
  if (actual === 0) return null;

  const cambio = spring({
    frame: frame - Math.round(tiempos[actual - 1] * fps),
    fps,
    config: { damping: 12, stiffness: 220 },
  });

  return (
    <div
      style={{
        position: "absolute",
        top: Math.round((y ?? 0.145) * 1920),
        left: Math.round((x ?? 0.5) * 1080 - 90),
        width: 180,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: 2,
          padding: "8px 22px",
          borderRadius: 999,
          backgroundColor: "rgba(0,0,0,0.55)",
          border: `2px solid ${AZUL}`,
          backdropFilter: "blur(8px)",
          transform: `scale(${0.9 + Math.min(1, cambio) * 0.1})`,
        }}
      >
        <span style={{ fontFamily: anton, fontSize: 42, color: AZUL }}>{actual}</span>
        <span style={{ fontFamily: anton, fontSize: 30, color: "rgba(255,255,255,0.65)" }}>
          /{total}
        </span>
      </div>
    </div>
  );
};

// Tres interrogantes que van apareciendo, para el gancho de "tres dudas".
// dato = número de signos (por defecto 3)
// Etiqueta compacta tipo rótulo inferior: una pastilla con prefijo en color
// de marca y texto en blanco. Para trucos, pasos y avisos cortos, cuando un
// panel entero sería demasiado. Entra deslizando desde la izquierda.
// dato = "TRUCO|Agua poco a poco"  (prefijo | texto). El prefijo es opcional.
// Etiqueta con el mismo lenguaje editorial que el Checklist: barra de acento
// que crece, tarjeta ajustada al contenido, antetítulo pequeño en mayúsculas
// espaciadas ("PASO", "TRUCO", "OJO") y el texto con una línea de marca que se
// dibuja debajo. dato = "PREFIJO|Texto" o solo "Texto".
const Etiqueta: React.FC<{ dato: string; y?: number }> = ({ dato, y }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const partes = dato.split("|");
  const prefijo = partes.length > 1 ? partes[0] : null;
  const texto = partes.length > 1 ? partes.slice(1).join(" ") : partes[0];

  const suave = { damping: 26, stiffness: 190 };
  const entra = spring({ frame: frame - 2, fps, config: suave });
  const sale = spring({ frame: frame - (durationInFrames - 9), fps, config: { damping: 30, stiffness: 240 } });
  const barra = spring({ frame: frame - 4, fps, config: { damping: 24, stiffness: 140 } });
  const textoEntra = Math.min(1, spring({ frame: frame - 6, fps, config: suave }));
  const subraya = Math.min(1, spring({ frame: frame - 11, fps, config: { damping: 22, stiffness: 120 } }));

  return (
    <div
      style={{
        position: "absolute",
        top: Math.round((y ?? 0.34) * 1920),
        left: 84,
        maxWidth: 1080 - 168,
        display: "flex",
        opacity: entra * (1 - sale),
        transform: `translateY(${(1 - entra) * 18 + sale * 12}px)`,
      }}
    >
      <div
        style={{
          width: 6,
          borderRadius: 3,
          backgroundColor: AZUL,
          transform: `scaleY(${Math.min(1, barra)})`,
          transformOrigin: "top",
          flexShrink: 0,
        }}
      />
      <div
        style={{
          backgroundColor: "rgba(10,10,12,0.78)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderLeft: "none",
          borderRadius: "0 14px 14px 0",
          padding: "20px 34px 22px 26px",
          boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
        }}
      >
        {prefijo ? (
          <div
            style={{
              fontFamily: inter,
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: 5,
              textTransform: "uppercase",
              color: AZUL,
              marginBottom: 10,
            }}
          >
            {prefijo}
          </div>
        ) : null}
        <div
          style={{
            position: "relative",
            display: "inline-block",
            paddingBottom: 10,
            opacity: textoEntra,
            transform: `translateY(${(1 - textoEntra) * 10}px)`,
          }}
        >
          <div
            style={{
              fontFamily: inter,
              fontWeight: 600,
              fontSize: 40,
              letterSpacing: -0.4,
              lineHeight: 1.15,
              color: "#FFFFFF",
            }}
          >
            {texto}
          </div>
          <div
            style={{
              position: "absolute",
              left: 0,
              bottom: 0,
              height: 4,
              borderRadius: 2,
              width: `${subraya * 100}%`,
              backgroundColor: AZUL,
            }}
          />
        </div>
      </div>
    </div>
  );
};

// Plazas de una clase que se llenan, una se libera al cancelar alguien y
// entra sola la siguiente de la lista de espera. Cuenta la función estrella
// de una app de gestión: la plaza no se queda vacía sin que hagas nada.
// dato = "8|3" → 8 plazas en total, la nº3 (1-indexada) es la que cancela.
const Plazas: React.FC<{ dato: string; y?: number }> = ({ dato, y }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const [totalStr, cancelaStr] = dato.split("|");
  const total = Math.max(1, parseInt(totalStr, 10) || 8);
  const cancela = (parseInt(cancelaStr, 10) || 3) - 1;

  // Guion interno: se llenan → una cancela → entra la de la lista
  const T_LLENADO = 0.09; // separación entre plaza y plaza al llenarse
  const T_CANCELA = 1.5;
  const T_ENTRA = 2.25;

  const entra = spring({ frame: frame - 2, fps, config: { damping: 20, stiffness: 180 } });
  const sale = spring({
    frame: frame - (durationInFrames - 8),
    fps,
    config: { damping: 30, stiffness: 240 },
  });

  const ROJO_LIBRE = "#E5484D";
  const cancelado = t >= T_CANCELA && t < T_ENTRA;
  const rellenada = t >= T_ENTRA;

  // La ficha que viaja desde la lista de espera hasta el hueco
  const viaje = Math.min(
    1,
    spring({ frame: frame - Math.round(T_ENTRA * fps), fps, config: { damping: 17, stiffness: 150 } })
  );

  const COL = 4;
  const LADO = 92;
  const HUECO = 14;
  const anchoRejilla = COL * LADO + (COL - 1) * HUECO;
  const filas = Math.ceil(total / COL);

  const posicion = (i: number) => ({
    x: (i % COL) * (LADO + HUECO),
    y: Math.floor(i / COL) * (LADO + HUECO),
  });

  return (
    <div
      style={{
        position: "absolute",
        top: Math.round((y ?? 0.56) * 1920),
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: entra * (1 - sale),
      }}
    >
      <div
        style={{
          backgroundColor: "rgba(13,13,20,0.86)",
          backdropFilter: "blur(14px)",
          border: `1px solid ${AZUL}55`,
          borderRadius: 28,
          padding: "26px 30px 22px",
          boxShadow: "0 20px 50px rgba(0,0,0,0.55)",
        }}
      >
        <div
          style={{
            fontFamily: inter,
            fontWeight: 800,
            fontSize: 26,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.6)",
            marginBottom: 16,
          }}
        >
          Clase de las 19:00
        </div>

        {/* Rejilla de plazas */}
        <div style={{ position: "relative", width: anchoRejilla, height: filas * LADO + (filas - 1) * HUECO }}>
          {Array.from({ length: total }).map((_, i) => {
            const pos = posicion(i);
            const aparece = Math.min(
              1,
              spring({ frame: frame - 4 - Math.round(i * T_LLENADO * fps), fps, config: { damping: 14, stiffness: 220 } })
            );
            const esHueco = i === cancela;
            const vacia = esHueco && cancelado;
            const color = vacia ? "transparent" : AZUL;
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: pos.x,
                  top: pos.y,
                  width: LADO,
                  height: LADO,
                  borderRadius: 18,
                  backgroundColor: color,
                  border: vacia ? `3px dashed ${ROJO_LIBRE}` : "none",
                  opacity: aparece,
                  transform: `scale(${0.6 + aparece * 0.4})`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {!vacia ? (
                  <svg viewBox="0 0 24 24" style={{ width: 44, height: 44 }}>
                    <path
                      d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 21a7.5 7.5 0 0 1 15 0"
                      fill="none"
                      stroke="#0B0F14"
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : null}
              </div>
            );
          })}

          {/* La ficha que entra sola desde la lista de espera */}
          {viaje > 0 && viaje < 1 ? (
            <div
              style={{
                position: "absolute",
                left: posicion(cancela).x,
                top: posicion(cancela).y + (1 - viaje) * 190,
                width: LADO,
                height: LADO,
                borderRadius: 18,
                backgroundColor: AZUL,
                opacity: viaje,
                transform: `scale(${0.8 + viaje * 0.2})`,
                boxShadow: `0 0 30px ${AZUL}`,
              }}
            />
          ) : null}
        </div>

        {/* Pie: lista de espera / plaza cubierta */}
        <div
          style={{
            marginTop: 18,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontFamily: inter,
            fontWeight: 800,
            fontSize: 30,
            color: rellenada ? AZUL : "rgba(255,255,255,0.75)",
          }}
        >
          {rellenada ? "PLAZA CUBIERTA SOLA" : cancelado ? "ALGUIEN CANCELA…" : "LISTA DE ESPERA: 4"}
        </div>
      </div>
    </div>
  );
};

// Una "?" pegada a un objeto que se mueve (el iPad del gancho de DV_SP_3): va
// sobre su pantalla, gira con él y crece si lo acerca a cámara, para que
// parezca parte del plano y no un rótulo encima.
const InterroganteSeguido: React.FC<{
  pista: NonNullable<ElementoCrudo["pista"]>;
  inicio: number;
  tono: string;
}> = ({ pista, inicio, tono }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const tAbs = inicio + frame / fps;
  const k = Math.min(pista.cuadros.length - 1, Math.max(0, Math.round((tAbs - pista.desde) * pista.fps)));
  const [cx, cy, ancho, , ang] = pista.cuadros[k];
  // El vídeo base lleva la deriva lenta de ZoomInterno (1 + fotograma·0,00025
  // en el primer tramo, centrada): se aplica igual para no despegarse.
  const esc = 1 + Math.round(tAbs * fps) * 0.00025;
  const X = (0.5 + (cx - 0.5) * esc) * 1080;
  const Y = (0.5 + (cy - 0.5) * esc) * 1920;
  const pop = spring({ frame: frame - 2, fps, config: { damping: 11, stiffness: 190 } });
  const sale = spring({ frame: frame - (durationInFrames - 6), fps, config: { damping: 30, stiffness: 260 } });
  const latido = 1 + Math.sin(frame / 6) * 0.035;
  return (
    <div
      style={{
        position: "absolute",
        left: X,
        top: Y,
        transform: `translate(-50%, -50%) rotate(${ang}deg) scale(${Math.min(1, pop) * latido})`,
        fontFamily: anton,
        fontSize: Math.round(ancho * 1080 * esc * 1.05),
        lineHeight: 1,
        color: tono,
        opacity: Math.min(1, pop) * (1 - sale),
        textShadow: `0 0 34px ${tono}AA, 0 0 12px ${tono}, 0 6px 20px rgba(0,0,0,0.7)`,
      }}
    >
      ?
    </div>
  );
};

// color/tam opcionales: por defecto el color de marca y 92 px. Una sola "?"
// roja y grande sobre un objeto (el iPad del gancho de DV_SP_3) genera duda.
const Interrogantes: React.FC<{
  dato?: string;
  x?: number;
  y?: number;
  color?: string;
  tam?: number;
  pista?: ElementoCrudo["pista"];
  inicio?: number;
}> = ({ dato, x, y, color, tam = 92, pista, inicio = 0 }) => {
  const tono = color ?? AZUL;
  if (pista) return <InterroganteSeguido pista={pista} inicio={inicio} tono={tono} />;
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const cuantos = Math.max(1, parseInt(dato || "3", 10) || 3);
  const sale = spring({
    frame: frame - (durationInFrames - 8),
    fps,
    config: { damping: 30, stiffness: 240 },
  });

  return (
    <div
      style={{
        position: "absolute",
        top: Math.round((y ?? 0.3) * 1920),
        left: Math.round((x ?? 0.77) * 1080 - Math.max(130, tam)),
        width: Math.max(260, tam * 2),
        display: "flex",
        justifyContent: "center",
        gap: 6,
        opacity: 1 - sale,
      }}
    >
      {Array.from({ length: cuantos }).map((_, i) => {
        const pop = spring({
          frame: frame - 3 - i * 7,
          fps,
          config: { damping: 10, stiffness: 200 },
        });
        const bamboleo = Math.sin(frame / 11 + i * 1.3) * 4;
        return (
          <div
            key={i}
            style={{
              fontFamily: anton,
              fontSize: Math.round(tam * (1 - i * 0.065)),
              color: tono,
              opacity: Math.min(1, pop),
              transform: `scale(${Math.min(1, pop)}) rotate(${bamboleo}deg) translateY(${i * 8}px)`,
              textShadow: `0 0 ${Math.round(tam * 0.28)}px ${tono}88, 0 5px 18px rgba(0,0,0,0.8)`,
            }}
          >
            ?
          </div>
        );
      })}
    </div>
  );
};

// Caja de regalo animada, dibujada a mano en SVG (nada de emojis ni imágenes).
// Cae con rebote, la tapa da un saltito y salen destellos alrededor.
// dato = texto opcional bajo la caja ("TU REGALO"); y = altura 0-1.
const Regalo: React.FC<{ dato?: string; x?: number; y?: number }> = ({ dato, x, y }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const entra = spring({ frame, fps, config: { damping: 11, stiffness: 190 } });
  const sale = spring({
    frame: frame - (durationInFrames - 8),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  // La tapa se levanta un poco justo después de aterrizar
  const tapa = spring({ frame: frame - 10, fps, config: { damping: 9, stiffness: 220 } });
  const flotar = Math.sin(frame / 14) * 5;

  const TAM = 240;
  const cx = 100; // centro en coordenadas del viewBox (200x200)
  // Por defecto a un lado, no centrado: nunca debe taparle la cara
  const izquierda = Math.round((x ?? 0.76) * 1080 - TAM / 2);

  return (
    <div
      style={{
        position: "absolute",
        top: Math.round((y ?? 0.32) * 1920 - TAM / 2),
        left: izquierda,
        width: TAM,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        opacity: entra * (1 - sale),
      }}
    >
      <div
        style={{
          transform: `translateY(${(1 - entra) * -180 + flotar}px) scale(${0.7 + entra * 0.3})`,
        }}
      >
        <svg viewBox="0 0 200 200" style={{ width: TAM, height: TAM, overflow: "visible" }}>
          <defs>
            <linearGradient id="cajaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={AZUL} />
              <stop offset="100%" stopColor={AZUL_OSCURO} />
            </linearGradient>
          </defs>

          {/* Destellos girando alrededor */}
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const ang = (i / 6) * Math.PI * 2 + frame / 26;
            const r = 88 + Math.sin(frame / 9 + i) * 6;
            const brillo = 0.35 + Math.abs(Math.sin(frame / 11 + i * 1.4)) * 0.65;
            return (
              <g
                key={i}
                transform={`translate(${cx + Math.cos(ang) * r} ${105 + Math.sin(ang) * r * 0.62}) rotate(${frame * 2 + i * 60})`}
                opacity={brillo * entra}
              >
                <path
                  d="M0,-9 L2.2,-2.2 L9,0 L2.2,2.2 L0,9 L-2.2,2.2 L-9,0 L-2.2,-2.2 Z"
                  fill={AZUL}
                />
              </g>
            );
          })}

          {/* Sombra bajo la caja */}
          <ellipse cx={cx} cy={172} rx={54} ry={9} fill="rgba(0,0,0,0.45)" />

          {/* Cuerpo de la caja */}
          <rect x={cx - 52} y={92} width={104} height={78} rx={7} fill="url(#cajaGrad)" />
          {/* Cinta vertical del cuerpo */}
          <rect x={cx - 11} y={92} width={22} height={78} fill="#FFFFFF" opacity={0.92} />

          {/* Tapa: se levanta con el spring */}
          <g transform={`translate(0 ${-tapa * 13})`}>
            <rect x={cx - 62} y={68} width={124} height={30} rx={7} fill={AZUL} />
            <rect x={cx - 11} y={68} width={22} height={30} fill="#FFFFFF" opacity={0.92} />

            {/* Lazo: dos bucles y el nudo */}
            <g transform={`translate(${cx} 66)`}>
              <path
                d="M0,0 C-30,-30 -54,-14 -34,2 C-24,10 -9,7 0,0 Z"
                fill="#FFFFFF"
                opacity={0.95}
              />
              <path
                d="M0,0 C30,-30 54,-14 34,2 C24,10 9,7 0,0 Z"
                fill="#FFFFFF"
                opacity={0.95}
              />
              <circle cx={0} cy={0} r={9} fill="#FFFFFF" />
            </g>
          </g>
        </svg>
      </div>

      {dato ? (
        <div
          style={{
            fontFamily: anton,
            fontSize: 40,
            letterSpacing: 1,
            textTransform: "uppercase",
            color: "#FFFFFF",
            textShadow: `0 0 22px ${AZUL}, 0 4px 16px rgba(0,0,0,0.85)`,
            transform: `scale(${0.85 + entra * 0.15})`,
          }}
        >
          {dato}
        </div>
      ) : null}
    </div>
  );
};

// Titular a pantalla completa para los puntos clave: en vez de pasar como
// subtítulo pequeño, el remate ocupa la pantalla con el fondo atenuado.
// dato = "DE 4 A 6|SEMANAS" y la palabra tras "=" va en color de marca:
//        "NUNCA=ES TARDE" → "NUNCA" blanco, "ES TARDE" en color
// tamMax: tope de tamaño de letra (126 por defecto). Para un CTA largo que a
// tamaño completo ocuparía media pantalla.
const Remate: React.FC<{ dato: string; y?: number; tamMax?: number }> = ({ dato, y, tamMax }) => {
  const tope = tamMax ?? 126;
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entra = spring({ frame: frame - 1, fps, config: { damping: 14, stiffness: 200 } });
  const sale = spring({
    frame: frame - (durationInFrames - 7),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  // Prefijo "bocadillo:" → dibuja un globo de comentario animado encima,
  // para los CTA de "comenta X" (igual que el cartel de la marca).
  const conBocadillo = dato.startsWith("bocadillo:");
  const lineas = (conBocadillo ? dato.slice("bocadillo:".length) : dato).split("|");
  const visible = entra * (1 - sale);

  const pulso = 1 + Math.sin(frame / 7) * 0.045;
  const puntos = [0, 1, 2].map(
    (i) => 0.3 + Math.abs(Math.sin(frame / 8 - i * 0.7)) * 0.7
  );

  return (
    <AbsoluteFill style={{ opacity: visible }}>
      {y === undefined ? (
        <AbsoluteFill
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.78) 45%, rgba(0,0,0,0.5) 100%)",
          }}
        />
      ) : null}
      <div
        style={{
          position: "absolute",
          top: `${(y ?? 0.31) * 100}%`,
          left: 0,
          right: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {conBocadillo ? (
          <div
            style={{
              marginBottom: 22,
              transform: `scale(${Math.min(1, spring({ frame: frame - 2, fps, config: { damping: 11, stiffness: 210 } })) * pulso})`,
            }}
          >
            <svg viewBox="0 0 120 96" style={{ width: 190, height: 152, overflow: "visible" }}>
              {/* Globo de comentario con la colita abajo a la izquierda */}
              <path
                d="M12,6 H108 A10,10 0 0 1 118,16 V62 A10,10 0 0 1 108,72 H44 L22,92 V72 H12 A10,10 0 0 1 2,62 V16 A10,10 0 0 1 12,6 Z"
                fill="rgba(0,0,0,0.55)"
                stroke={AZUL}
                strokeWidth={5}
                strokeLinejoin="round"
              />
              {/* Los tres puntitos de "escribiendo" */}
              {puntos.map((op, i) => (
                <circle key={i} cx={38 + i * 22} cy={39} r={7.5} fill={AZUL} opacity={op} />
              ))}
            </svg>
          </div>
        ) : null}
        {lineas.map((linea, i) => {
          // filter evita que un "=X" al principio meta un espacio y descentre
          const partes = linea.split("=").filter((p) => p.length > 0);
          const pop = spring({
            frame: frame - 1 - i * 4,
            fps,
            config: { damping: 15, stiffness: 210 },
          });
          const tam = Math.min(tope, Math.round(1180 / Math.max(6, linea.replace("=", "").length)));
          return (
            <div
              key={i}
              style={{
                fontFamily: anton,
                fontSize: tam,
                lineHeight: 0.98,
                letterSpacing: 1,
                textTransform: "uppercase",
                textAlign: "center",
                textShadow: "0 6px 30px rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.95)",
                opacity: Math.min(1, pop * 1.3),
                transform: `scale(${0.86 + Math.min(1, pop) * 0.14})`,
              }}
            >
              {partes.map((parte, j) => (
                <span key={j} style={{ color: j === 0 ? "#FFFFFF" : AZUL }}>
                  {parte}
                  {j < partes.length - 1 ? " " : ""}
                </span>
              ))}
            </div>
          );
        })}
        {/* Subrayado que se estira bajo el titular */}
        <div
          style={{
            marginTop: 26,
            height: 9,
            borderRadius: 99,
            backgroundColor: AZUL,
            width: `${Math.min(1, spring({ frame: frame - 8, fps, config: { damping: 18, stiffness: 150 } })) * 46}%`,
            boxShadow: `0 0 26px ${AZUL}`,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

// Lista editorial: tarjeta ajustada al contenido con barra de acento, cabecera
// opcional ("#Ingredientes"), números 01/02 en condensada y una línea del color
// de marca que se dibuja bajo cada ítem cuando se nombra. Sustituye al diseño
// anterior de círculos verdes tipo app de tareas, que Pablo veía "de juguete".
// dato = "#Cabecera|Texto@s|Texto@s|=Remate@s" (cabecera y remate opcionales)
const Checklist: React.FC<{ dato: string; y?: number }> = ({ dato, y }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const partes = dato.split("|");
  const cabecera = partes[0]?.trim().startsWith("#") ? partes.shift()!.trim().slice(1).trim() : null;
  const lineas = partes.map((l) => {
    const [texto, tt] = l.split("@");
    const remate = texto.trim().startsWith("=");
    return {
      texto: remate ? texto.trim().slice(1).trim() : texto.trim(),
      entra: parseFloat(tt ?? "0"),
      remate,
    };
  });
  const suave = { damping: 26, stiffness: 190 };
  const entra = spring({ frame: frame - 2, fps, config: suave });
  const sale = spring({ frame: frame - (durationInFrames - 9), fps, config: { damping: 30, stiffness: 240 } });
  const barra = spring({ frame: frame - 4, fps, config: { damping: 24, stiffness: 140 } });
  let numero = 0;

  return (
    <div
      style={{
        position: "absolute",
        top: Math.round((y ?? 0.58) * 1920),
        left: 84,
        maxWidth: 1080 - 168,
        display: "flex",
        opacity: entra * (1 - sale),
        transform: `translateY(${(1 - entra) * 18 + sale * 12}px)`,
      }}
    >
      {/* barra de acento: crece de arriba abajo */}
      <div
        style={{
          width: 6,
          borderRadius: 3,
          backgroundColor: AZUL,
          transform: `scaleY(${Math.min(1, barra)})`,
          transformOrigin: "top",
          flexShrink: 0,
        }}
      />
      <div
        style={{
          backgroundColor: "rgba(10,10,12,0.78)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderLeft: "none",
          borderRadius: "0 14px 14px 0",
          padding: "22px 34px 24px 26px",
          boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
          minWidth: 380,
        }}
      >
        {cabecera ? (
          <div
            style={{
              fontFamily: inter,
              fontWeight: 700,
              fontSize: 22,
              letterSpacing: 5,
              textTransform: "uppercase",
              color: AZUL,
              marginBottom: 10,
            }}
          >
            {cabecera}
          </div>
        ) : null}
        {lineas.map((l, i) => {
          if (t < l.entra) return null;
          const f0 = Math.round(l.entra * fps);
          const pop = Math.min(1, spring({ frame: frame - f0, fps, config: suave }));
          const subraya = Math.min(1, spring({ frame: frame - f0 - 5, fps, config: { damping: 22, stiffness: 120 } }));
          if (!l.remate) numero += 1;
          const separador = i > 0;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 20,
                padding: "14px 0 12px",
                borderTop: separador ? "1px solid rgba(255,255,255,0.10)" : "none",
                opacity: pop,
                transform: `translateY(${(1 - pop) * 10}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: anton,
                  fontSize: 34,
                  lineHeight: 1,
                  color: l.remate ? AZUL : "rgba(255,255,255,0.45)",
                  width: 44,
                  flexShrink: 0,
                }}
              >
                {l.remate ? "→" : String(numero).padStart(2, "0")}
              </div>
              <div style={{ position: "relative", paddingBottom: 8 }}>
                <div
                  style={{
                    fontFamily: inter,
                    fontWeight: l.remate ? 800 : 600,
                    fontSize: l.remate ? 42 : 40,
                    letterSpacing: -0.4,
                    lineHeight: 1.1,
                    color: l.remate ? AZUL : "#FFFFFF",
                    whiteSpace: "nowrap",
                  }}
                >
                  {l.texto}
                </div>
                {/* la "marca": una línea de marca que se dibuja bajo el ítem */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    bottom: 0,
                    height: 4,
                    borderRadius: 2,
                    width: `${subraya * 100}%`,
                    backgroundColor: AZUL,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Par de fotos antes/después, persistente. dato = "inserts/a.jpg:ANTES|inserts/b.jpg:AHORA"
const AntesDespues: React.FC<{ dato: string }> = ({ dato }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const [izq, der] = dato.split("|").map((s) => {
    const [ruta, label] = s.split(":");
    return { ruta, label };
  });

  const entraIzq = spring({ frame: frame - 3, fps, config: { damping: 16, stiffness: 155 } });
  const entraDer = spring({ frame: frame - 9, fps, config: { damping: 16, stiffness: 155 } });
  const flecha = spring({ frame: frame - 18, fps, config: { damping: 14, stiffness: 200 } });
  const respira = 1 + Math.sin(t * 1.1) * 0.012;

  const Tarjeta: React.FC<{ ruta: string; label: string; entra: number; rot: number }> = ({
    ruta,
    label,
    entra,
    rot,
  }) => (
    <div
      style={{
        width: 320,
        opacity: entra,
        transform: `translateX(${(1 - entra) * rot * 40}px) rotate(${(1 - entra) * rot * 10}deg) scale(${respira})`,
      }}
    >
      <div
        style={{
          width: "100%",
          height: 320,
          borderRadius: 22,
          overflow: "hidden",
          border: "3px solid rgba(61,155,255,0.55)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.5), 0 0 26px rgba(61,155,255,0.25)",
        }}
      >
        <Img src={staticFile(ruta)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
      <div
        style={{
          marginTop: 12,
          textAlign: "center",
          fontFamily: inter,
          fontWeight: 800,
          fontSize: 32,
          letterSpacing: 1,
          color: label === "AHORA" ? AZUL : "rgba(255,255,255,0.75)",
          textShadow:
            label === "AHORA"
              ? "0 0 18px rgba(61,155,255,0.55)"
              : "0 2px 8px rgba(0,0,0,0.6)",
        }}
      >
        {label}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: "absolute",
        top: 130,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        gap: 26,
      }}
    >
      <Tarjeta ruta={izq.ruta} label={izq.label} entra={entraIzq} rot={-1} />
      <div
        style={{
          position: "absolute",
          top: 138,
          left: "50%",
          transform: `translate(-50%, 0) scale(${flecha})`,
          width: 46,
          height: 46,
          borderRadius: "50%",
          backgroundColor: AZUL,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 0 20px rgba(61,155,255,0.6)",
        }}
      >
        <svg viewBox="0 0 24 24" style={{ width: 24, height: 24 }}>
          <path
            d="M5 12h13m0 0l-5 -5m5 5l-5 5"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <Tarjeta ruta={der.ruta} label={der.label} entra={entraDer} rot={1} />
    </div>
  );
};

// Mockup de iPhone con una captura dentro haciendo scroll lento
const Movil: React.FC<{ ruta: string }> = ({ ruta }) => {
  const pantallas = ruta.split("|");
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entra = spring({ frame, fps, config: ANIM.entrada });
  const sale = spring({
    frame: frame - (durationInFrames - 8),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  const scroll = interpolate(frame, [12, durationInFrames], [0, -320], {
    extrapolateLeft: "clamp",
  });
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "flex-start",
        opacity: entra * (1 - sale),
      }}
    >
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.75) 100%)",
        }}
      />
      <div
        style={{
          marginTop: 170,
          width: 580,
          height: 1180,
          borderRadius: 76,
          backgroundColor: "#0B0B0E",
          padding: 16,
          boxShadow: "0 30px 80px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.12)",
          transform: `translateY(${(1 - entra) * 90}px) scale(${0.9 + entra * 0.1})`,
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            borderRadius: 60,
            overflow: "hidden",
            backgroundColor: "#101018",
          }}
        >
          {pantallas.length === 1 ? (
            <Img
              src={staticFile(ruta)}
              style={{
                width: "100%",
                transform: `translateY(${scroll}px)`,
              }}
            />
          ) : (
            // "a.png|b.png|c.png": el teléfono se queda y las pantallas pasan
            // deslizándose, como al navegar por la app. Así no entra y sale el
            // móvil tres veces.
            pantallas.map((src, i) => {
              const tramo = durationInFrames / pantallas.length;
              const desliza = { damping: 22, stiffness: 170 };
              const llega = i === 0 ? 1 : spring({ frame: frame - Math.round(i * tramo), fps, config: desliza });
              const va = i === pantallas.length - 1 ? 0 : spring({ frame: frame - Math.round((i + 1) * tramo), fps, config: desliza });
              return (
                <Img
                  key={src}
                  src={staticFile(src)}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    objectPosition: "top",
                    transform: `translateX(${Math.round(((1 - Math.min(1, llega)) - Math.min(1, va)) * 100)}%)`,
                  }}
                />
              );
            })
          )}
          <div
            style={{
              position: "absolute",
              top: 14,
              left: "50%",
              transform: "translateX(-50%)",
              width: 170,
              height: 34,
              borderRadius: 20,
              backgroundColor: "#0B0B0E",
            }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};

// Título gigante multilínea sobre el video (estilo hook cinematográfico)
const Titulon: React.FC<{ texto: string; y?: number }> = ({ texto, y }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sale = spring({
    frame: frame - (durationInFrames - 8),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  const lineas = texto.split("|");
  // Encoge las líneas largas para que no se salgan de cuadro
  const ANCHO_SEGURO = 13; // caracteres que caben a 128px
  const tam = (t: string) =>
    Math.round(128 * (t.length > ANCHO_SEGURO ? ANCHO_SEGURO / t.length : 1));
  // Sin y va arriba (comportamiento de siempre); con y se centra en esa altura
  const centrado = y !== undefined;
  return (
    <div
      style={{
        position: "absolute",
        ...(centrado
          ? { top: `${y * 100}%`, transform: "translateY(-50%)" }
          : { top: 130 }),
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        opacity: 1 - sale,
      }}
    >
      {lineas.map((lineaCruda, i) => {
        // Una línea que empieza por "=" se pinta en el color de marca
        const enColor = lineaCruda.startsWith("=");
        const linea = enColor ? lineaCruda.slice(1) : lineaCruda;
        // Presencia sólida: fade + leve asentamiento vertical, sin overshoot
        // lateral ni sombra dinámica
        const entra = spring({
          frame: frame - i * 4,
          fps,
          config: { damping: 26, stiffness: 170 },
        });
        return (
          <div
            key={i}
            style={{
              fontFamily: anton,
              fontSize: tam(linea),
              lineHeight: 0.92, // líneas apretadas, como un lockup
              letterSpacing: 3,
              textTransform: "uppercase",
              textAlign: "center",
              color: enColor ? AZUL : "#FFFFFF",
              textShadow: "0 6px 30px rgba(0,0,0,0.65), 0 2px 8px rgba(0,0,0,0.7)",
              opacity: entra,
              transform: `translateY(${(1 - entra) * 22}px)`,
            }}
          >
            {linea}
          </div>
        );
      })}
    </div>
  );
};

// Pills de métricas: chips oscuros translúcidos con 👁 y cifra
const Metricas: React.FC<{ dato: string; y?: number }> = ({ dato, y }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sale = spring({
    frame: frame - (durationInFrames - 8),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  return (
    <div
      style={{
        position: "absolute",
        top: y ? Math.round(y * 1920) : 420,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        gap: 18,
        opacity: 1 - sale,
      }}
    >
      {dato.split(",").map((v, i) => {
        const entra = spring({
          frame: frame - 3 - i * 4,
          fps,
          config: { damping: 15, stiffness: 220 },
        });
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              backgroundColor: "rgba(12,14,20,0.62)",
              backdropFilter: "blur(10px)",
              border: "1px solid rgba(255,255,255,0.16)",
              borderRadius: 999,
              padding: "12px 26px",
              fontFamily: inter,
              fontWeight: 700,
              fontSize: 34,
              color: "#FFFFFF",
              transform: `scale(${entra}) translateY(${Math.sin(frame / 16 + i) * 4}px)`,
              boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
            }}
          >
            <span style={{ fontSize: 30 }}>👁</span> {v.trim()}
          </div>
        );
      })}
    </div>
  );
};

// Burbuja de chat estilo iMessage flotando sobre el video
const Burbuja: React.FC<{ elemento: ElementoCrudo; indice: number }> = ({
  elemento,
  indice,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entra = spring({ frame, fps, config: { damping: 16, stiffness: 190 } });
  const sale = spring({
    frame: frame - (durationInFrames - 7),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  const izq = (elemento.lado ?? (indice % 2 === 0 ? "izq" : "der")) === "izq";
  // La burbuja se escribe en vivo (efecto typing) con cursor
  const chars = Math.max(0, Math.floor((frame - 4) * 1.8));
  const textoVisible = elemento.dato.slice(0, chars);
  const escribiendo = chars < elemento.dato.length;
  const cursorOn = Math.floor(frame / 8) % 2 === 0;
  return (
    <div
      style={{
        position: "absolute",
        top: elemento.y ? Math.round(elemento.y * 1920) : izq ? 280 : 420,
        left: izq ? 70 : undefined,
        right: izq ? undefined : 70,
        maxWidth: 640,
        backgroundColor: izq ? "rgba(58,58,60,0.94)" : "rgba(10,132,255,0.95)",
        color: "#FFFFFF",
        fontFamily: inter,
        fontWeight: 600,
        fontSize: 36,
        lineHeight: 1.32,
        padding: "22px 30px",
        borderRadius: 30,
        [izq ? "borderBottomLeftRadius" : "borderBottomRightRadius"]: 8,
        boxShadow: "0 12px 34px rgba(0,0,0,0.4)",
        opacity: entra * (1 - sale),
        transform: `translateY(${(1 - entra) * 24 + Math.sin(frame / 18) * 4}px) scale(${0.85 + entra * 0.15})`,
        transformOrigin: izq ? "bottom left" : "bottom right",
      } as React.CSSProperties}
    >
      {textoVisible}
      {escribiendo && cursorOn ? (
        <span style={{ opacity: 0.85 }}>▍</span>
      ) : null}
    </div>
  );
};

// Fila de mini-reels flotantes con sus views ("stock/a.mp4:150K,...")
const TarjetasReels: React.FC<{ dato: string; y?: number }> = ({ dato, y }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const sale = spring({
    frame: frame - (durationInFrames - 8),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  const tarjetas = dato.split(",").map((t) => {
    const [video, vistas, etiqueta] = t.trim().split(":");
    return { video, vistas, etiqueta };
  });
  return (
    <div
      style={{
        position: "absolute",
        top: y ? Math.round(y * 1920) : 150,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        gap: 26,
        opacity: 1 - sale,
      }}
    >
      {tarjetas.map((t, i) => {
        const entra = spring({
          frame: frame - i * 5,
          fps,
          config: { damping: 16, stiffness: 170 },
        });
        return (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              opacity: entra,
              transform: `translateY(${(1 - entra) * 60 + Math.sin(frame / 17 + i * 2) * 5}px) rotate(${(i - 1) * 2.5}deg)`,
            }}
          >
          <div
            style={{
              position: "relative",
              width: 236,
              height: 396,
              borderRadius: 22,
              overflow: "hidden",
              border: "2px solid rgba(255,255,255,0.35)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.5)",
            }}
          >
            <OffthreadVideo
              src={staticFile(t.video)}
              muted
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <div
              style={{
                position: "absolute",
                bottom: 12,
                left: "50%",
                transform: "translateX(-50%)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                backgroundColor: "rgba(12,14,20,0.72)",
                backdropFilter: "blur(8px)",
                borderRadius: 999,
                padding: "8px 18px",
                fontFamily: inter,
                fontWeight: 700,
                fontSize: 26,
                color: "#FFFFFF",
                whiteSpace: "nowrap",
              }}
            >
              👁 {t.vistas}
            </div>
          </div>
          {t.etiqueta ? (
            <div
              style={{
                fontFamily: inter,
                fontWeight: 800,
                fontSize: 27,
                letterSpacing: 2,
                textTransform: "uppercase",
                color: "#FFFFFF",
                textShadow: "0 3px 12px rgba(0,0,0,0.8)",
              }}
            >
              {t.etiqueta}
            </div>
          ) : null}
          </div>
        );
      })}
    </div>
  );
};

// Panel de clientes desbordado: bandeja de entrada que se llena en vivo,
// contador de no-leídos disparándose y temblor creciente (descontrol)
const CHATS_PANEL = [
  ["MG", "María G.", "Hola!! ¿Qué precio tiene?", "#E06A8A"],
  ["CR", "Carlos R.", "¿Tenéis hueco para hoy?", "#5B8DEF"],
  ["LP", "Lucía P.", "Sigo esperando respuesta…", "#E0A14D"],
  ["JM", "Javi M.", "¿Me puedes llamar?", "#4DBF8A"],
  ["AT", "Ana T.", "Vi vuestro anuncio, info porfa", "#9B6AE0"],
  ["RS", "Raúl S.", "¿¿Hola?? Escribí ayer", "#E05B5B"],
  ["PB", "Paula B.", "Quiero reservar cita", "#4DA6C9"],
  ["DH", "Dani H.", "¿Cuánto tardáis en responder?", "#C9A24D"],
  ["SF", "Sara F.", "Me interesa, ¿cómo funciona?", "#6AC96A"],
  ["NV", "Nico V.", "Al final lo hago con otro sitio", "#E06A4D"],
] as const;

const PanelClientes: React.FC<{ contadorFinal: number }> = ({
  contadorFinal,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entra = spring({ frame, fps, config: ANIM.entrada });
  const sale = spring({
    frame: frame - (durationInFrames - 7),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  const visibles = Math.min(CHATS_PANEL.length, 1 + Math.floor(frame / 6));
  const contador = Math.round(
    interpolate(frame, [4, durationInFrames - 14], [12, contadorFinal], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    })
  );
  const caos = Math.min(1, frame / 55); // el temblor crece con el tiempo
  const tiembla = Math.sin(frame * 1.7) * 3.2 * caos;

  return (
    <div
      style={{
        position: "absolute",
        top: 150,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity: entra * (1 - sale),
        transform: `translateY(${(1 - entra) * 60}px) translateX(${tiembla}px) rotate(${tiembla * 0.15}deg)`,
      }}
    >
      <div
        style={{
          width: 850,
          backgroundColor: "#12151F",
          borderRadius: 28,
          overflow: "hidden",
          boxShadow: `0 24px 60px rgba(0,0,0,0.5), 0 0 ${20 + caos * 30}px rgba(224,91,91,${0.15 + caos * 0.3})`,
          border: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "22px 30px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div
            style={{
              fontFamily: inter,
              fontWeight: 800,
              fontSize: 32,
              color: "#FFFFFF",
            }}
          >
            Mensajes
          </div>
          <div
            style={{
              fontFamily: inter,
              fontWeight: 800,
              fontSize: 28,
              color: "#FFFFFF",
              backgroundColor: "#E05B5B",
              borderRadius: 999,
              padding: "8px 22px",
              transform: `scale(${1 + Math.sin(frame / 4) * 0.04 * (0.4 + caos)})`,
              boxShadow: "0 0 18px rgba(224,91,91,0.6)",
            }}
          >
            {contador} sin leer
          </div>
        </div>
        <div style={{ maxHeight: 700, overflow: "hidden" }}>
          {CHATS_PANEL.slice(0, visibles).map(([ini, nombre, msg, color], i) => {
            const pop = spring({
              frame: frame - i * 6,
              fps,
              config: { damping: 18, stiffness: 240 },
            });
            return (
              <div
                key={nombre}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 20,
                  padding: "17px 30px",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                  opacity: pop,
                  transform: `translateX(${(1 - pop) * 60}px)`,
                }}
              >
                <div
                  style={{
                    width: 62,
                    height: 62,
                    borderRadius: "50%",
                    backgroundColor: color,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: inter,
                    fontWeight: 800,
                    fontSize: 24,
                    color: "#FFFFFF",
                    flexShrink: 0,
                  }}
                >
                  {ini}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: inter,
                      fontWeight: 700,
                      fontSize: 27,
                      color: "#FFFFFF",
                    }}
                  >
                    {nombre}
                  </div>
                  <div
                    style={{
                      fontFamily: inter,
                      fontWeight: 600,
                      fontSize: 24,
                      color: "rgba(255,255,255,0.55)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {msg}
                  </div>
                </div>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: "50%",
                    backgroundColor: "#E05B5B",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: inter,
                    fontWeight: 800,
                    fontSize: 20,
                    color: "#FFFFFF",
                    flexShrink: 0,
                  }}
                >
                  {((i * 7) % 5) + 1}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// B-roll: sustituye TODA la pantalla por un clip de stock manteniendo tu voz
const BRoll: React.FC<{ ruta: string }> = ({ ruta }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entra = spring({ frame, fps, config: { damping: 24, stiffness: 200 } });
  const sale = spring({
    frame: frame - (durationInFrames - 7),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  const zoom = 1.06 + frame * 0.0012;
  return (
    <AbsoluteFill style={{ opacity: entra * (1 - sale), backgroundColor: "#000" }}>
      <AbsoluteFill style={{ transform: `scale(${zoom})` }}>
        <OffthreadVideo
          src={staticFile(ruta)}
          muted
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "contrast(1.08) saturate(1.05) brightness(0.92)",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 45%, transparent 50%, rgba(0,0,0,0.4) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

// Anillo de actividad: un arco azul gira sin parar alrededor de una cifra
// central (24/7, SIEMPRE, etc). Transmite "nunca se detiene" sin texto.
// Cabecera persistente formato "Top N": línea bold + línea en cursiva,
// arriba del todo (zona frente/gorra), presente todo el reel
// dato = "LÍNEA 1|LÍNEA 2" y, opcionalmente, "|bold" como tercer segmento
// para usar sans condensada en vez de la cursiva serif (marcas agresivas
// tipo gimnasio, donde la cursiva elegante desentona).
const CabeceraTop: React.FC<{ dato: string }> = ({ dato }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const [linea1, linea2, estilo] = dato.split("|");
  const esBold = estilo?.trim().toLowerCase() === "bold";

  // Encoger si el texto es largo, para no pegarse a los bordes: Instagram
  // recorta un poco en algunas vistas y se comería las palabras extremas.
  const ANCHO_SEGURO = 30; // caracteres que caben cómodos al tamaño base
  const escala = (t?: string) =>
    t && t.length > ANCHO_SEGURO ? ANCHO_SEGURO / t.length : 1;

  const entra = spring({ frame: frame - 2, fps, config: { damping: 24, stiffness: 170 } });
  return (
    <div
      style={{
        position: "absolute",
        top: 175,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0, // líneas apiladas juntas, como un lockup de marca
        opacity: entra,
        transform: `translateY(${(1 - entra) * 14}px)`,
      }}
    >
      <div
        style={{
          fontFamily: inter,
          fontWeight: 800,
          fontSize: Math.round(48 * escala(linea1)),
          lineHeight: 1,
          letterSpacing: 0.5,
          color: "#FFFFFF",
          textShadow: "0 3px 14px rgba(0,0,0,0.75), 0 1px 3px rgba(0,0,0,0.8)",
          textAlign: "center",
        }}
      >
        {linea1}
      </div>
      {linea2 ? (
        <div
          style={
            esBold
              ? {
                  fontFamily: anton,
                  fontSize: Math.round(64 * escala(linea2)),
                  lineHeight: 1,
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  color: AZUL,
                  textShadow: "0 3px 14px rgba(0,0,0,0.8), 0 1px 3px rgba(0,0,0,0.9)",
                  textAlign: "center",
                }
              : {
                  fontFamily: playfair,
                  fontStyle: "italic",
                  fontWeight: 600,
                  fontSize: Math.round(56 * escala(linea2)),
                  lineHeight: 1,
                  color: AZUL,
                  textShadow: "0 3px 14px rgba(0,0,0,0.75)",
                  textAlign: "center",
                }
          }
        >
          {linea2}
        </div>
      ) : null}
    </div>
  );
};

// Carril numerado persistente en el borde izquierdo. El número activo se
// agranda y se ilumina. El icono del punto que se está explicando aparece
// GRANDE bajo los subtítulos; al pasar al siguiente, se encoge y se ancla
// para siempre junto a su número (se van acumulando, nunca desaparecen).
// dato = "total|N:icono@t|N:icono@t|..." (icono es opcional: "N@t" también vale)
const RielNumeros: React.FC<{ dato: string }> = ({ dato }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const [totalStr, ...resto] = dato.split("|");
  const total = parseInt(totalStr, 10);
  const eventos = resto.map((s) => {
    const [izq, tt] = s.split("@");
    const [n, icono] = izq.split(":");
    return { n: parseInt(n, 10), icono, t: parseFloat(tt) };
  });

  let idxEvento = 0;
  for (let i = 0; i < eventos.length; i++) if (t >= eventos[i].t) idxEvento = i;
  const actual = eventos[idxEvento];

  const ALTO = 128;
  const inicioY = 960 - (total * ALTO) / 2;
  const yDe = (n: number) => inicioY + (n - 1) * ALTO;
  const xDock = 60 + 102 + 22 + 54; // centro de la burbuja anclada
  const X_GRANDE = 540; // centro horizontal (pantalla)
  const Y_GRANDE = 1190; // justo bajo los subtítulos
  const DIAM_GRANDE = 200;
  const DIAM_DOCK = 108;

  const pop = spring({
    frame: frame - Math.round(actual.t * fps),
    fps,
    config: { damping: 18, stiffness: 210 },
  });

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: total }).map((_, idx) => {
        const n = idx + 1;
        const esActivo = n === actual.n;
        const tam = esActivo ? 92 + pop * 10 : 76;
        return (
          <div
            key={n}
            style={{
              position: "absolute",
              left: 60,
              top: inicioY + idx * ALTO - tam / 2,
              width: tam,
              height: tam,
              borderRadius: "50%",
              backgroundColor: esActivo ? AZUL : "rgba(20,22,30,0.68)",
              border: esActivo
                ? "3px solid rgba(255,255,255,0.85)"
                : "1px solid rgba(255,255,255,0.14)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: esActivo
                ? "0 10px 26px rgba(61,155,255,0.5)"
                : "0 4px 14px rgba(0,0,0,0.3)",
            }}
          >
            <div
              style={{
                fontFamily: anton,
                fontSize: esActivo ? 40 : 30,
                lineHeight: 1,
                textAlign: "center",
                color: esActivo ? "#FFFFFF" : "rgba(255,255,255,0.55)",
              }}
            >
              {n}
            </div>
          </div>
        );
      })}
      {eventos.slice(0, idxEvento + 1).map((e, i) => {
        if (!e.icono) return null;
        const esActual = i === idxEvento;
        // progreso 0 = grande en el centro · 1 = anclado junto al número
        const progreso = esActual
          ? 0
          : Math.min(
              1,
              spring({
                frame: frame - Math.round(eventos[i + 1].t * fps),
                fps,
                config: { damping: 20, stiffness: 170 },
              })
            );
        const entra = esActual
          ? pop
          : spring({
              frame: frame - Math.round(e.t * fps),
              fps,
              config: { damping: 18, stiffness: 210 },
            });
        const cx = X_GRANDE + (xDock - X_GRANDE) * progreso;
        const cy = Y_GRANDE + (yDe(e.n) - Y_GRANDE) * progreso;
        const diam = DIAM_GRANDE + (DIAM_DOCK - DIAM_GRANDE) * progreso;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: cx - diam / 2,
              top: cy - diam / 2,
              width: diam,
              height: diam,
              borderRadius: "50%",
              backgroundColor: "#FFFFFF",
              boxShadow: "0 14px 34px rgba(0,0,0,0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              opacity: Math.min(1, entra * 1.3),
              transform: `scale(${0.8 + Math.min(1, entra) * 0.2})`,
            }}
          >
            <div
              style={{
                width: diam * 0.72,
                height: diam * 0.72,
                borderRadius: "50%",
                background: `linear-gradient(135deg, ${AZUL}, ${AZUL_OSCURO})`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Img
                src={staticFile(e.icono)}
                style={{ width: diam * 0.37, height: diam * 0.37 }}
              />
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Burbuja circular con un icono dentro que va cambiando según el punto
// activo del listicle (equivalente a la "foto de producto" de la referencia)
const FotoCircular: React.FC<{ dato: string; y?: number }> = ({ dato, y }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const items = dato.split("|").map((s) => {
    const [ruta, tt] = s.split("@");
    return { ruta, t: parseFloat(tt) };
  });
  let actual = items[0];
  let idxActual = 0;
  items.forEach((it, i) => {
    if (t >= it.t) {
      actual = it;
      idxActual = i;
    }
  });
  const desde = actual.t;
  const entra = spring({
    frame: frame - Math.round(desde * fps),
    fps,
    config: { damping: 18, stiffness: 210 },
  });
  const TAM = 210;
  return (
    <div
      style={{
        position: "absolute",
        top: Math.round((y ?? 0.66) * 1920 - TAM / 2),
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
      }}
    >
      <div
        key={idxActual}
        style={{
          width: TAM,
          height: TAM,
          borderRadius: "50%",
          backgroundColor: "#FFFFFF",
          border: "6px solid rgba(255,255,255,0.95)",
          boxShadow: "0 18px 44px rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: entra,
          transform: `scale(${0.85 + entra * 0.15})`,
        }}
      >
        <div
          style={{
            width: TAM * 0.72,
            height: TAM * 0.72,
            borderRadius: "50%",
            background: `linear-gradient(135deg, ${AZUL}, ${AZUL_OSCURO})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Img
            src={staticFile(actual.ruta)}
            style={{ width: TAM * 0.36, height: TAM * 0.36 }}
          />
        </div>
      </div>
    </div>
  );
};

// Mockup de editor de vídeo: pantalla oscurecida + panel de timeline con
// tramos de audio, algunos marcados como error/silencio (rojo) que colapsan
// de golpe justo en el momento indicado, con el contador de duración bajando.
// dato = "1:32|0:48@6.4" (duración antes | duración después @ segundo de colapso)
const EditorTimeline: React.FC<{ dato: string }> = ({ dato }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [antes, resto] = dato.split("|");
  const [despues, tColapsoStr] = resto.split("@");
  const tColapso = parseFloat(tColapsoStr);
  const t = frame / fps;

  const entra = spring({ frame: frame - 2, fps, config: { damping: 22, stiffness: 190 } });
  const sale = spring({
    frame: frame - (durationInFrames - 8),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  const colapsado = Math.min(
    1,
    spring({
      frame: frame - Math.round(tColapso * fps),
      fps,
      config: { damping: 16, stiffness: 130 },
    })
  );

  // Patrón fijo de tramos: alternando buenos (azules) y malos (rojos)
  const tramos = [
    { tipo: "bueno", ancho: 150 },
    { tipo: "malo", ancho: 70, etq: "silencio" },
    { tipo: "bueno", ancho: 110 },
    { tipo: "malo", ancho: 55, etq: "error" },
    { tipo: "bueno", ancho: 170 },
    { tipo: "malo", ancho: 60, etq: "silencio" },
    { tipo: "bueno", ancho: 130 },
  ];

  const playhead = 40 + ((frame * 5) % 680);

  return (
    <AbsoluteFill style={{ opacity: entra * (1 - sale) }}>
      <Sequence from={Math.round(tColapso * fps)} durationInFrames={20}>
        <Audio src={staticFile("sfx/corte.mp3")} volume={0.3} />
      </Sequence>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 42%, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.72) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 560,
          left: 60,
          right: 60,
          backgroundColor: "#12141c",
          borderRadius: 26,
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 30px 80px rgba(0,0,0,0.6)",
          overflow: "hidden",
          transform: `scale(${0.9 + entra * 0.1}) translateY(${(1 - entra) * 30}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "26px 34px",
            borderBottom: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div style={{ display: "flex", gap: 10 }}>
            {[ROJO, "#FFD52E", "#1E9E5A"].map((c) => (
              <div
                key={c}
                style={{ width: 15, height: 15, borderRadius: "50%", backgroundColor: c }}
              />
            ))}
          </div>
          <div
            style={{
              fontFamily: inter,
              fontWeight: 700,
              fontSize: 26,
              color: "rgba(255,255,255,0.55)",
              letterSpacing: 1,
            }}
          >
            editor.reel
          </div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                backgroundColor: ROJO,
                opacity: 0.6 + Math.sin(frame / 6) * 0.4,
              }}
            />
            <div style={{ fontFamily: inter, fontWeight: 700, fontSize: 22, color: ROJO }}>
              EDITANDO
            </div>
          </div>
        </div>

        <div style={{ padding: "40px 34px 20px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: 76,
              gap: 4,
              position: "relative",
              overflow: "hidden",
            }}
          >
            {tramos.map((tr, i) => {
              const esMalo = tr.tipo === "malo";
              const ancho = esMalo ? tr.ancho * (1 - colapsado) : tr.ancho;
              if (esMalo && ancho < 1) return null;
              return (
                <div
                  key={i}
                  style={{
                    position: "relative",
                    width: ancho,
                    height: "100%",
                    borderRadius: 8,
                    flexShrink: 0,
                    overflow: "hidden",
                    background: esMalo
                      ? `repeating-linear-gradient(45deg, ${ROJO}33 0 7px, ${ROJO}55 7px 14px)`
                      : `linear-gradient(180deg, ${AZUL}, ${AZUL_OSCURO})`,
                    border: esMalo ? `1px solid ${ROJO}99` : "none",
                    opacity: esMalo ? 1 - colapsado * 0.3 : 1,
                  }}
                >
                  {!esMalo && (
                    <div style={{ display: "flex", alignItems: "center", height: "100%", gap: 2, padding: "0 6px" }}>
                      {Array.from({ length: Math.floor(ancho / 9) }).map((_, k) => (
                        <div
                          key={k}
                          style={{
                            width: 3,
                            height: `${30 + Math.abs(Math.sin(k * 1.7 + i)) * 60}%`,
                            backgroundColor: "rgba(255,255,255,0.55)",
                            borderRadius: 2,
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {esMalo && colapsado < 0.5 && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontFamily: inter,
                        fontWeight: 700,
                        fontSize: 15,
                        color: "#FFFFFF",
                        textAlign: "center",
                        lineHeight: 1.1,
                        padding: 2,
                      }}
                    >
                      {tr.etq}
                    </div>
                  )}
                </div>
              );
            })}
            {t < tColapso ? (
              <div
                style={{
                  position: "absolute",
                  top: -6,
                  bottom: -6,
                  left: playhead,
                  width: 3,
                  backgroundColor: "#FFFFFF",
                  boxShadow: "0 0 8px rgba(255,255,255,0.8)",
                }}
              />
            ) : null}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 26,
              paddingTop: 20,
              borderTop: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontFamily: inter, fontWeight: 700, fontSize: 22, color: "rgba(255,255,255,0.45)" }}>
              Duración
            </div>
            <div style={{ position: "relative", height: 52, overflow: "hidden" }}>
              <div
                style={{
                  fontFamily: anton,
                  fontSize: 44,
                  color: colapsado > 0.5 ? "#1E9E5A" : "#FFFFFF",
                  transform: `translateY(${-colapsado * 52}px)`,
                }}
              >
                {antes}
              </div>
              <div
                style={{
                  position: "absolute",
                  top: 52,
                  fontFamily: anton,
                  fontSize: 44,
                  color: "#1E9E5A",
                  transform: `translateY(${-colapsado * 52}px)`,
                }}
              >
                {despues}
              </div>
            </div>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const AnilloActividad: React.FC<{ dato: string; y?: number; x?: number; tam?: number }> = ({
  dato,
  y,
  x,
  tam = 168,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const [central, etiqueta] = dato.split(":");
  const entra = spring({ frame, fps, config: { damping: 22, stiffness: 170 } });
  const sale = spring({
    frame: frame - (durationInFrames - 8),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  const giro = frame * 4.2; // rotación continua, nunca se detiene
  const pulso = 1 + Math.sin(frame / 10) * 0.03;
  const R_VB = 100; // radio en coordenadas del viewBox (fijo; el <svg> escala solo)
  const C = 2 * Math.PI * R_VB;
  const esc = tam / 280; // solo para escalar el texto HTML superpuesto

  return (
    <div
      style={{
        position: "absolute",
        // Zona superior libre (frente/gorra), igual que el titulón: el
        // hueco bajo la barbilla ya está ocupado por subtítulo + banner
        top: Math.round((y ?? 0.17) * 1920 - tam / 2),
        // Sin x, centrado en la fila (lo de siempre). Con x, a un lado: en
        // planos donde el centro es el cuerpo del presentador, que gesticula
        // justo ahí, el anillo se lleva al fondo (azulejos, pared)
        ...(x === undefined
          ? { left: 0, right: 0 }
          : { left: Math.round(x * 1080 - tam / 2), width: tam }),
        display: "flex",
        justifyContent: "center",
        opacity: entra * (1 - sale),
        transform: `translateY(${(1 - entra) * 20}px)`,
      }}
    >
      <div style={{ position: "relative", width: tam, height: tam }}>
        <svg viewBox="0 0 280 280" style={{ width: "100%", height: "100%" }}>
          <circle
            cx="140"
            cy="140"
            r={R_VB}
            fill="none"
            stroke="rgba(255,255,255,0.14)"
            strokeWidth="10"
          />
          <circle
            cx="140"
            cy="140"
            r={R_VB}
            fill="none"
            stroke={AZUL}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${C * 0.26} ${C}`}
            transform={`rotate(${giro} 140 140)`}
            style={{ filter: "drop-shadow(0 0 10px rgba(61,155,255,0.7))" }}
          />
        </svg>
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            transform: `scale(${pulso})`,
          }}
        >
          <div
            style={{
              fontFamily: anton,
              fontSize: Math.round(48 * esc),
              color: "#FFFFFF",
              lineHeight: 1,
              textShadow: "0 3px 14px rgba(0,0,0,0.6)",
            }}
          >
            {central}
          </div>
          {etiqueta ? (
            <div
              style={{
                fontFamily: inter,
                fontWeight: 800,
                fontSize: Math.round(15 * esc),
                letterSpacing: 1.5,
                color: AZUL,
                marginTop: 3,
              }}
            >
              {etiqueta}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// Rótulo llamativo: la pantalla se oscurece y el texto entra a lo grande,
// con glow verde neón, corte de luz y pulso mientras está en pantalla
const Rotulo: React.FC<{ texto: string }> = ({ texto }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entra = spring({ frame: frame - 1, fps, config: { damping: 15, stiffness: 220 } });
  const sale = spring({
    frame: frame - (durationInFrames - 7),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  const pulso = 1 + Math.sin(frame / 5) * 0.012;
  const escala = (2.1 - entra * 1.1) * pulso;
  const halo = 26 + Math.sin(frame / 4) * 8;
  return (
    <AbsoluteFill style={{ opacity: entra * (1 - sale) }}>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 40%, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.62) 100%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: inter,
            fontWeight: 800,
            fontStyle: "italic",
            fontSize: Math.min(170, Math.round(960 / (0.62 * texto.length))),
            letterSpacing: 2,
            color: "#FFFFFF",
            textShadow: `0 0 ${halo}px rgba(255,255,255,0.75), 0 0 ${halo * 2.4}px rgba(255,255,255,0.3), 0 12px 44px rgba(0,0,0,0.7), 0 3px 10px rgba(0,0,0,0.8)`,
            transform: `scale(${escala}) rotate(-4deg)`,
            filter: `blur(${(1 - entra) * 10}px)`,
            whiteSpace: "nowrap",
          }}
        >
          {texto}
        </div>
      </div>
      {[0, 1, 2, 3].map((i) => {
        const ang = (i / 4) * Math.PI * 2 + frame / 30;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${50 + Math.cos(ang) * 30}%`,
              top: `${36 + Math.sin(ang) * 14}%`,
              fontSize: 40,
              color: AZUL,
              opacity: entra * 0.7,
              transform: `rotate(${frame * 3 + i * 90}deg)`,
              textShadow: "0 0 14px rgba(61,155,255,0.8)",
            }}
          >
            ✦
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Transición entre bloques del guion. NO es una cortinilla que tapa la imagen:
// son gestos de cámara —un acercamiento, un retroceso o un fundido— porque el
// crudo es siempre una persona hablando y una cortina de color corta la cara.
//
// El zoom se aplica sobre el vídeo ENTERO desde la raíz (ver ZoomTransiciones),
// no dentro de cada segmento, para que el gesto sea el mismo aunque el crudo
// esté troceado en varios cortes. Aquí solo vive el fundido, que sí es una capa.
const Transicion: React.FC<{ dato?: string }> = ({ dato }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  if (dato !== "fade" && dato !== "fadeBlanco") return null;
  const t = frame / fps; // LOCAL a su propio Sequence
  const d = durationInFrames / fps;
  // Pico en 0.9, no en 1: un negro pleno a mitad de reel se lee como
  // "se ha acabado el vídeo" y la gente desliza.
  const op = interpolate(t, [0, d / 2, d], [0, 0.9, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  return (
    <AbsoluteFill
      style={{
        backgroundColor: dato === "fadeBlanco" ? "#fff" : "#000",
        opacity: op,
      }}
    />
  );
};

// Gestos de cámara de las transiciones, aplicados al vídeo de fondo. Vive en la
// raíz, así que useCurrentFrame() da el frame ABSOLUTO y se compara directamente
// con el t de cada transición (que también es absoluto).
//
// La escala nunca baja de 1: por debajo se verían los bordes negros del encuadre.
const ZoomTransiciones: React.FC<{
  transiciones: ElementoCrudo[];
  children: React.ReactNode;
}> = ({ transiciones, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  let escala = 1;
  for (const tr of transiciones) {
    const d = tr.duracion ?? 0.65;
    if (t < tr.t || t > tr.t + d) continue;
    const p = (t - tr.t) / d;
    if (tr.dato === "zoomOut") {
      // Aterrizaje: entra ampliado y se abre hasta el encuadre normal.
      escala = interpolate(p, [0, 1], [1.22, 1], {
        easing: Easing.out(Easing.cubic),
      });
    } else if (tr.dato === "fade" || tr.dato === "fadeBlanco") {
      // El fundido ya es el gesto; un zoom encima lo ensucia.
      escala = 1;
    } else {
      // Acercamiento por defecto: golpe de zoom que entra y se relaja.
      escala = interpolate(p, [0, 0.35, 1], [1, 1.16, 1], {
        easing: Easing.inOut(Easing.cubic),
      });
    }
  }

  return (
    <AbsoluteFill style={{ transform: `scale(${escala})` }}>
      {children}
    </AbsoluteFill>
  );
};

// Aplica los tramos "ocultar" de un elemento. Fundido de 0.3 s a cada lado
// para que se lea como una decisión de montaje y no como un parpadeo.
const Ocultable: React.FC<{
  ocultar?: [number, number][];
  desdeFrame: number;
  children: React.ReactNode;
}> = ({ ocultar, desdeFrame, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!ocultar?.length) return <>{children}</>;
  const t = (desdeFrame + frame) / fps; // absoluto, como vienen los tramos
  const F = 0.3;
  const visible = Math.min(
    ...ocultar
      .filter(([a, b]) => b > a)
      .map(([a, b]) =>
        interpolate(t, [a - F, a, b, b + F], [1, 0, 0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        })
      )
  );
  return <AbsoluteFill style={{ opacity: visible }}>{children}</AbsoluteFill>;
};

// Elementos que aparecen sincronizados con lo que dices (banda superior)
// Diseño sonoro: cada gráfico que entra suena, como en una pieza de productora.
// Volúmenes bajos a propósito —son acentos bajo la voz, no efectos de feria— y
// el máster final (editar-crudo.mjs) ya lleva el conjunto a -14 LUFS.
// `en` = segundos desde que entra el elemento: el checklist y el contador
// suenan una vez por ítem, justo cuando se marca. Puede ser NEGATIVO: lo que
// tiene que coincidir con el movimiento es el PICO del sonido, no su arranque.
// El impacto tiene el golpe a 0.55 s de su inicio y el swoosh a 1.21 s; sin
// adelantarlos, el boom llegaba con el titular ya quieto y el swoosh sonaba
// con el zoom ya terminado.
type Sonido = { src: string; vol: number; en?: number };
// Ganancia común de TODOS los efectos (-10 dB). Medido en el reel 30apps: los
// golpes de los titulares quedaban a solo 4,5 dB de la voz y Pablo los oía
// "casi más que mi voz". Un acento tiene que ir 15 dB o más por debajo. Los
// volúmenes de cada sonido (vol) marcan el equilibrio entre ellos; esto, el
// nivel del conjunto.
const GANANCIA_SFX = 0.32;
// Los volúmenes están calibrados con la voz a -16 LUFS. Ahora la voz va tal
// cual se grabó, así que los efectos se escalan a su sonoridad real.
const ajusteSfxVoz = (nivelVoz?: number) => (nivelVoz === undefined ? 1 : Math.pow(10, (nivelVoz + 16) / 20));
const sonidosDe = (e: ElementoCrudo): Sonido[] => {
  switch (e.tipo) {
    case "broll":
      // pico a 0.34 s → cae a 0.15 s, mientras el clip termina de aparecer
      return [{ src: "sfx/corte.mp3", vol: 0.2, en: -0.19 }];
    case "rotulo":
      return [{ src: "sfx/aparicion.mp3", vol: 0.22 }];
    case "titulon":
      // pico a 0.55 s → golpe a 0.2 s, cuando el titular llega a su tamaño
      return [{ src: "sfx/impacto-1143.mp3", vol: 0.2, en: -0.35 }];
    case "transicion":
      // pico a 1.21 s → a 0.28 s, el punto más cerrado del acercamiento
      return [{ src: "sfx/swoosh-1167.mp3", vol: 0.16, en: -0.93 }];
    case "remate":
      // El CTA es un bocadillo de mensaje: suena a notificación, no a golpe
      return e.dato.startsWith("bocadillo:")
        ? [{ src: "sfx/burbuja-2357.mp3", vol: 0.35 }]
        : [{ src: "sfx/impacto-1143.mp3", vol: 0.22, en: -0.35 }];
    case "etiqueta":
      return [{ src: "sfx/pop-2356.mp3", vol: 0.16 }];
    case "checklist":
      // Mismo cálculo que Checklist: cada línea entra en su @ y el ✓ se
      // dibuja 4 fotogramas después. El tick va con el ✓, no con el texto.
      return e.dato.split("|").map((l) => ({
        src: "sfx/check-2568.mp3",
        vol: 0.3,
        en: parseFloat(l.split("@")[1] ?? "0") + 4 / FPS,
      }));
    case "contador":
      // dato = "total|marca1|marca2…", marcas locales en segundos
      return e.dato
        .split("|")
        .slice(1)
        .map((m) => ({ src: "sfx/click-1109.mp3", vol: 0.22, en: parseFloat(m) }));
    case "estado":
      return [{ src: "sfx/click-1109.mp3", vol: 0.22 }];
    case "regalo":
      return [{ src: "sfx/destello-871.mp3", vol: 0.25 }];
    case "interrogantes":
      return [{ src: "sfx/pop-2354.mp3", vol: 0.16 }];
    case "siNo":
      return [{ src: "sfx/acierto-2870.mp3", vol: 0.2 }];
    default:
      return [];
  }
};

const ElementosCrudo: React.FC<{ elementos: ElementoCrudo[]; nivelVoz?: number }> = ({
  elementos,
  nivelVoz,
}) => {
  const { fps } = useVideoConfig();
  return (
    <>
      {elementos.flatMap((e, i) => {
        const desde = Math.round(e.t * fps);
        const dur = Math.round((e.duracion ?? 3) * fps);
        // Los sonidos van en su propio Sequence, en tiempo ABSOLUTO, porque con
        // los adelantos arrancan antes que el gráfico. Si el adelanto cae antes
        // del segundo 0 (el titular del gancho), se recorta el principio del
        // sonido en vez de desplazar el golpe.
        const sonidos = sonidosDe(e)
          .filter((s) => Number.isFinite(s.en ?? 0) && (s.en ?? 0) * fps < dur)
          .map((s, j) => {
            const inicio = e.t + (s.en ?? 0);
            const recorte = Math.max(0, -inicio);
            return (
              <Sequence key={`s${i}-${j}`} from={Math.round(Math.max(0, inicio) * fps)}>
                <Audio
                  src={staticFile(s.src)}
                  volume={s.vol * GANANCIA_SFX * ajusteSfxVoz(nivelVoz)}
                  trimBefore={Math.round(recorte * fps)}
                />
              </Sequence>
            );
          });
        return [
          ...sonidos,
          <Sequence key={`v${i}`} from={desde} durationInFrames={dur}>
            <Ocultable ocultar={e.ocultar} desdeFrame={desde}>
              <ElementoVisual elemento={e} indice={i} />
            </Ocultable>
          </Sequence>,
        ];
      })}
    </>
  );
};

const ElementoVisual: React.FC<{ elemento: ElementoCrudo; indice: number }> = ({
  elemento,
  indice,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const entra = spring({ frame, fps, config: ANIM.pop });
  const sale = spring({
    frame: frame - (durationInFrames - 8),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  const flota = Math.sin(frame / 17) * 6;
  const estilo: React.CSSProperties = {
    opacity: entra * (1 - sale),
    transform: `translateY(${(1 - entra) * -40 + flota}px) scale(${0.8 + entra * 0.2})`,
  };

  if (elemento.tipo === "logo") {
    const src = logoDe(elemento.dato) ?? elemento.dato;
    return (
      <div
        style={{
          position: "absolute",
          top: 200,
          right: 70,
          ...estilo,
          transform: `${estilo.transform} rotate(${indice % 2 === 0 ? 4 : -4}deg)`,
        }}
      >
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 24,
            padding: 30,
            boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
          }}
        >
          <LogoCirculo src={src} tamano={130} />
        </div>
      </div>
    );
  }
  if (elemento.tipo === "sello") {
    return (
      <div style={{ position: "absolute", top: 260, left: 0, right: 0, ...estilo }}>
        <Sello
          sello={{ texto: elemento.dato, tipo: elemento.color ?? "bueno" }}
          desde={0}
        />
      </div>
    );
  }
  if (elemento.tipo === "broll") {
    return <BRoll ruta={elemento.dato} />;
  }
  if (elemento.tipo === "rotulo") {
    return <Rotulo texto={elemento.dato} />;
  }
  if (elemento.tipo === "titulon") {
    return <Titulon texto={elemento.dato} y={elemento.y} />;
  }
  if (elemento.tipo === "movil") {
    return <Movil ruta={elemento.dato} />;
  }
  if (elemento.tipo === "caos") {
    return <CaosCapturas dato={elemento.dato} duracion={elemento.duracion ?? 9} />;
  }
  if (elemento.tipo === "calculadora") {
    return <Calculadora dato={elemento.dato} y={elemento.y} />;
  }
  if (elemento.tipo === "estado") {
    return <AnilloActividad dato={elemento.dato} y={elemento.y} x={elemento.x} tam={elemento.tam} />;
  }
  if (elemento.tipo === "timeline") {
    return <EditorTimeline dato={elemento.dato} />;
  }
  if (elemento.tipo === "checklist") {
    return <Checklist dato={elemento.dato} y={elemento.y} />;
  }
  if (elemento.tipo === "antesDespues") {
    return <AntesDespues dato={elemento.dato} />;
  }
  if (elemento.tipo === "regalo") {
    return <Regalo dato={elemento.dato} x={elemento.x} y={elemento.y} />;
  }
  if (elemento.tipo === "remate") {
    return <Remate dato={elemento.dato} y={elemento.y} tamMax={elemento.tam} />;
  }
  if (elemento.tipo === "siNo") {
    return <SiNo dato={elemento.dato} y={elemento.y} />;
  }
  if (elemento.tipo === "contador") {
    return <Contador dato={elemento.dato} x={elemento.x} y={elemento.y} />;
  }
  if (elemento.tipo === "interrogantes") {
    return (
      <Interrogantes
        dato={elemento.dato}
        x={elemento.x}
        y={elemento.y}
        color={elemento.color}
        tam={elemento.tam}
        pista={elemento.pista}
        inicio={elemento.t}
      />
    );
  }
  if (elemento.tipo === "plazas") {
    return <Plazas dato={elemento.dato} y={elemento.y} />;
  }
  if (elemento.tipo === "etiqueta") {
    return <Etiqueta dato={elemento.dato} y={elemento.y} />;
  }
  if (elemento.tipo === "transicion") {
    return <Transicion dato={elemento.dato} />;
  }
  if (elemento.tipo === "cabeceraTop") {
    return <CabeceraTop dato={elemento.dato} />;
  }
  if (elemento.tipo === "riel") {
    return <RielNumeros dato={elemento.dato} />;
  }
  if (elemento.tipo === "fotoCirc") {
    return <FotoCircular dato={elemento.dato} y={elemento.y} />;
  }
  if (elemento.tipo === "panel") {
    return <PanelClientes contadorFinal={parseInt(elemento.dato) || 47} />;
  }
  if (elemento.tipo === "icono") {
    // Chip de cristal con el icono dentro, junto a los subtítulos
    return (
      <div
        style={{
          position: "absolute",
          top: elemento.y ? Math.round(elemento.y * 1920) : "50.5%",
          // 150 y no 64: pegado al borde quedaba justo debajo de los botones de
          // like y comentar de Instagram (lo detectó el control de calidad)
          right: 150,
          width: 138,
          height: 138,
          borderRadius: 32,
          backgroundColor: "rgba(12,14,20,0.58)",
          backdropFilter: "blur(10px)",
          border: "1px solid rgba(255,255,255,0.18)",
          boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          ...estilo,
          transform: `${estilo.transform} rotate(${Math.sin(frame / 15) * 4}deg)`,
        }}
      >
        <Img
          src={staticFile(elemento.dato)}
          style={{ width: 84, height: 84 }}
        />
      </div>
    );
  }
  if (elemento.tipo === "metricas") {
    return <Metricas dato={elemento.dato} y={elemento.y} />;
  }
  if (elemento.tipo === "burbuja") {
    return <Burbuja elemento={elemento} indice={indice} />;
  }
  if (elemento.tipo === "tarjetas") {
    return <TarjetasReels dato={elemento.dato} y={elemento.y} />;
  }
  if (elemento.tipo === "imagen") {
    // dato = "ruta" o "ruta|pie de foto". tam = ancho de la tarjeta (820 por
    // defecto) e y = altura del borde superior; sin ellos, lo de siempre.
    // El pie va dentro de la tarjeta: una captura sola (App Store Connect, un
    // panel…) no dice qué se está enseñando.
    const [ruta, pie] = elemento.dato.split("|");
    const ancho = elemento.tam ?? 820;
    return (
      <div
        style={{
          position: "absolute",
          top: elemento.y !== undefined ? Math.round(elemento.y * 1920) : 170,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          ...estilo,
        }}
      >
        <div
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            padding: 14,
            maxWidth: ancho,
            boxShadow: "0 20px 50px rgba(0,0,0,0.45)",
          }}
        >
          <Img
            src={staticFile(ruta)}
            // Con tam, el alto máximo crece en proporción: una portada vertical
            // (TIME) quedaba estrecha con el tope fijo de 560 px
            style={{
              maxWidth: ancho - 28,
              maxHeight: elemento.tam ? Math.round(elemento.tam * 1.4) : 560,
              borderRadius: 10,
              display: "block",
            }}
          />
          {pie ? (
            <div
              style={{
                fontFamily: inter,
                fontWeight: 800,
                fontSize: 34,
                color: "#111111",
                textAlign: "center",
                padding: "12px 8px 2px",
                letterSpacing: -0.3,
              }}
            >
              {pie}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (elemento.tipo === "foco") {
    const dib = spring({ frame, fps, config: ANIM.trazo });
    const r = elemento.radio ?? 150;
    const cx = (elemento.x ?? 0.5) * 1080;
    const cy = (elemento.y ?? 0.5) * 1920;
    return (
      <svg
        viewBox="0 0 1080 1920"
        style={{ position: "absolute", inset: 0, opacity: estilo.opacity as number }}
      >
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={TURQUESA}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray="18 22"
          strokeDashoffset={-frame * 1.5}
          pathLength={undefined}
          opacity={dib}
          style={{ filter: "drop-shadow(0 0 10px rgba(58,224,208,0.5))" }}
        />
      </svg>
    );
  }
  if (elemento.tipo === "nota") {
    return (
      <div
        style={{
          position: "absolute",
          top: 230,
          left: 80,
          maxWidth: 520,
          fontFamily: caveat,
          fontWeight: 700,
          fontSize: 60,
          lineHeight: 1.15,
          color: "#FF6B5E",
          textShadow: "0 3px 14px rgba(0,0,0,0.7)",
          ...estilo,
          transform: `${estilo.transform} rotate(-4deg)`,
        }}
      >
        {elemento.dato}
      </div>
    );
  }
  // Emoji: acompaña a los subtítulos (a su altura, a la derecha), nunca
  // sobre la cara
  return (
    <div
      style={{
        position: "absolute",
        top: "51.5%",
        right: 64,
        fontSize: 104,
        filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.45))",
        ...estilo,
        transform: `${estilo.transform} rotate(${Math.sin(frame / 14) * 6}deg)`,
      }}
    >
      {elemento.dato}
    </div>
  );
};

const MarcoCrudo: React.FC<{ handle: string }> = ({ handle }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progreso = frame / durationInFrames;
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.32) 0%, transparent 18%, transparent 78%, rgba(0,0,0,0.45) 100%)",
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at 50% 42%, transparent 55%, rgba(0,0,0,0.35) 100%)",
        }}
      />
      {handle ? (
        <div
          style={{
            position: "absolute",
            top: 90,
            width: "100%",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontFamily: archivo,
              fontSize: 32,
              letterSpacing: 2,
              color: PAPEL,
              backgroundColor: "rgba(0,0,0,0.35)",
              borderRadius: 999,
              padding: "12px 34px",
              backdropFilter: "blur(8px)",
            }}
          >
            {handle}
          </div>
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          bottom: 84,
          left: 80,
          right: 80,
          height: 7,
          borderRadius: 999,
          backgroundColor: "rgba(255,255,255,0.25)",
        }}
      >
        <div
          style={{
            width: `${progreso * 100}%`,
            height: "100%",
            borderRadius: 999,
            backgroundColor: ROJO,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

export const ReelCrudo: React.FC<CrudoProps> = (props) => {
  // Se fija antes de renderizar los hijos, que son quienes leen AZUL
  fijarColorDeMarca(props.color);
  return (
    <AbsoluteFill style={{ backgroundColor: props.qa ? "transparent" : "#000" }}>
      {props.qa ? null : (
        <>
          <ZoomTransiciones
            transiciones={props.elementos.filter((e) => e.tipo === "transicion")}
          >
            <VideoCortado props={props} />
          </ZoomTransiciones>
          <VozMezclada props={props} />
          {!props.mezcla && props.musica ? (
            <Audio src={staticFile(props.musica)} volume={0.035} loop />
          ) : null}
          {/* El b-roll va bajo los subtítulos: la voz y el texto siguen encima */}
          <ElementosCrudo
            elementos={props.elementos.filter((e) => e.tipo === "broll")}
            nivelVoz={props.nivelVoz}
          />
          <MarcoCrudo handle={props.handle} />
        </>
      )}
      <SubtitulosCrudo
        palabras={props.palabras}
        estilo={props.subtitulos}
        y={props.subtitulosY}
        silenciar={tramosSilenciados(props.elementos)}
      />
      {props.titulo ? (
        <BannerTitulo titulo={props.titulo} pasos={props.pasos} />
      ) : null}
      {props.lista ? (
        <ListaPanel lista={props.lista} revelaciones={props.revelaciones ?? []} />
      ) : null}
      <ElementosCrudo
        elementos={props.elementos.filter(
          (e) => e.tipo !== "broll" && e.tipo !== "transicion"
        )}
        nivelVoz={props.nivelVoz}
      />
      {/* El fundido va el último para que también atenúe los rótulos: si solo
          oscureciera el vídeo, los textos quedarían flotando sobre el negro. */}
      <ElementosCrudo
        elementos={props.elementos.filter((e) => e.tipo === "transicion")}
        nivelVoz={props.nivelVoz}
      />
    </AbsoluteFill>
  );
};

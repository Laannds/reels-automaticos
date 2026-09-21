import {
  AbsoluteFill,
  Audio,
  Img,
  Loop,
  OffthreadVideo,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { loadFont as loadArchivo } from "@remotion/google-fonts/ArchivoBlack";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";
import {
  FPS,
  PAUSA_ENTRE_ESCENAS,
  type Escena,
  type ReelProps,
} from "./tipos";

const { fontFamily: archivo } = loadArchivo("normal", {
  weights: ["400"],
  subsets: ["latin"],
});
const { fontFamily: caveat } = loadCaveat("normal", {
  weights: ["600", "700"],
  subsets: ["latin"],
});
const { fontFamily: mono } = loadMono("normal", {
  weights: ["400", "600"],
  subsets: ["latin"],
});

const PAPEL = "#F4EFE3";
const TINTA = "#1A2142";
const AMARILLO = "#FFD52E";
const ROJO = "#E0372E";
const POSTIT = "#FFE96B";
const CELO = "#9CCBEE";
const BARRA_A = "#44549E"; // navy medio validado para barras de datos
const BARRA_B = ROJO;

// Movimiento sobrio: entradas suaves casi sin rebote, sellado con carácter
const ANIM = {
  entrada: { damping: 22, stiffness: 120 },
  pop: { damping: 20, stiffness: 150 },
  sello: { damping: 17, stiffness: 240 },
  trazo: { damping: 26, stiffness: 60 },
} as const;

const FondoPapel: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: PAPEL }}>
    <AbsoluteFill
      style={{
        backgroundImage: `
          linear-gradient(rgba(26,33,66,0.07) 1px, transparent 1px),
          linear-gradient(90deg, rgba(26,33,66,0.07) 1px, transparent 1px)`,
        backgroundSize: "54px 54px",
      }}
    />
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(ellipse at 50% 40%, transparent 55%, rgba(26,33,66,0.08) 100%)",
      }}
    />
  </AbsoluteFill>
);

// Círculo rojo "a mano" que se dibuja alrededor de una palabra
const CirculoRojo: React.FC<{ progreso: number }> = ({ progreso }) => (
  <svg
    viewBox="0 0 100 60"
    style={{
      position: "absolute",
      inset: "-22% -14%",
      width: "128%",
      height: "144%",
      overflow: "visible",
      transform: "rotate(-3deg)",
    }}
  >
    <ellipse
      cx="50"
      cy="30"
      rx="46"
      ry="23"
      fill="none"
      stroke={ROJO}
      strokeWidth="3.5"
      strokeLinecap="round"
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - progreso}
    />
  </svg>
);

const Titular: React.FC<{ escena: Escena }> = ({ escena }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const esHook = escena.tipo === "hook";
  const fontSize = esHook ? 92 : 82;

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "baseline",
        columnGap: 22,
        rowGap: 10,
        padding: "0 84px",
      }}
    >
      {escena.palabras.map((p, i) => {
        const desde = Math.round(p.inicio * fps);
        const aparece = spring({
          frame: frame - desde,
          fps,
          config: { damping: 20, stiffness: 210 },
        });
        const marca = spring({
          frame: frame - desde - 1,
          fps,
          config: ANIM.pop,
        });
        const visible = t >= p.inicio;

        return (
          <span
            key={`${p.texto}-${i}`}
            style={{
              position: "relative",
              display: "inline-block",
              fontFamily: archivo,
              fontSize,
              lineHeight: 1.12,
              color: TINTA,
              opacity: visible ? aparece : 0,
              transform: `translateY(${visible ? (1 - aparece) * 18 : 18}px)`,
              filter: visible ? `blur(${(1 - aparece) * 6}px)` : "none",
            }}
          >
            {p.estilo === "resaltado" && visible ? (
              <span
                style={{
                  position: "absolute",
                  inset: "4% -3% 0% -3%",
                  backgroundColor: AMARILLO,
                  transform: `scaleX(${marca}) rotate(-0.6deg)`,
                  transformOrigin: "left center",
                  borderRadius: 6,
                }}
              />
            ) : null}
            <span style={{ position: "relative" }}>{p.texto}</span>
            {p.estilo === "circulo" && visible ? (
              <CirculoRojo progreso={marca} />
            ) : null}
          </span>
        );
      })}
    </div>
  );
};

const NotaManuscrita: React.FC<{ texto: string; desde: number }> = ({
  texto,
  desde,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({
    frame: frame - desde,
    fps,
    config: ANIM.entrada,
  });
  if (frame < desde) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 96,
        top: "52%",
        fontFamily: caveat,
        fontWeight: 700,
        fontSize: 58,
        color: ROJO,
        opacity: entra,
        transform: `rotate(-5deg) translateY(${(1 - entra) * 20}px)`,
        maxWidth: 560,
        lineHeight: 1.15,
      }}
    >
      {texto}
    </div>
  );
};

const PostIt: React.FC<{ texto: string; desde: number }> = ({
  texto,
  desde,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({
    frame: frame - desde,
    fps,
    config: ANIM.pop,
  });
  if (frame < desde) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 84,
        bottom: 340,
        backgroundColor: POSTIT,
        padding: "38px 42px",
        maxWidth: 420,
        borderRadius: 4,
        boxShadow: "0 14px 34px rgba(26,33,66,0.22)",
        fontFamily: caveat,
        fontWeight: 600,
        fontSize: 52,
        lineHeight: 1.25,
        color: TINTA,
        opacity: Math.min(1, entra * 1.4),
        transform: `rotate(${-2.5 + entra * 0.5}deg) scale(${0.7 + entra * 0.3})`,
        transformOrigin: "bottom left",
      }}
    >
      {texto}
    </div>
  );
};

// Logos conocidos: se resuelven automáticamente por nombre en rank y vs
const LOGOS: Record<string, string> = {
  CLAUDE: "logos/claude.svg",
  CHATGPT: "logos/chatgpt.svg",
  GEMINI: "logos/gemini.svg",
  PERPLEXITY: "logos/perplexity.svg",
  MIDJOURNEY: "logos/midjourney.svg",
  COPILOT: "logos/copilot.svg",
  WHATSAPP: "logos/whatsapp.svg",
};

const logoDe = (nombre: string): string | undefined =>
  LOGOS[nombre.toUpperCase().replace(/[^A-Z]/g, "")];

// Círculo blanco con el logo dentro
const LogoCirculo: React.FC<{ src: string; tamano: number }> = ({
  src,
  tamano,
}) => (
  <div
    style={{
      width: tamano,
      height: tamano,
      borderRadius: "50%",
      backgroundColor: "#FFFFFF",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      boxShadow: "0 8px 20px rgba(26,33,66,0.25)",
      flexShrink: 0,
    }}
  >
    <Img
      src={staticFile(src)}
      style={{ width: tamano * 0.58, height: tamano * 0.58 }}
    />
  </div>
);

// Conector fino: línea con nodos que une el titular con el elemento clave,
// con un pulso de luz que recorre el trazo continuamente
const Conector: React.FC<{ desde: number; variante: number }> = ({
  desde,
  variante,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < desde) return null;
  const traza = spring({ frame: frame - desde, fps, config: ANIM.trazo });
  const rutas = [
    "M 30 10 C 90 120, -10 240, 60 350",
    "M 40 10 C -20 140, 100 220, 50 350",
    "M 25 10 C 80 100, 20 260, 70 350",
  ];
  const ruta = rutas[variante % rutas.length];
  return (
    <svg
      viewBox="0 0 120 360"
      style={{
        position: "absolute",
        left: 84,
        top: "37%",
        width: 150,
        height: 460,
        overflow: "visible",
      }}
    >
      <path
        d={ruta}
        fill="none"
        stroke={TINTA}
        strokeWidth="3.5"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - traza}
        opacity={0.65}
      />
      <path
        d={ruta}
        fill="none"
        stroke={ROJO}
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="16 640"
        strokeDashoffset={-((frame - desde) * 4) % 656}
        opacity={traza * 0.9}
      />
      <circle cx="30" cy="10" r="9" fill={TINTA} opacity={traza} />
      <circle
        cx="60"
        cy="350"
        r={9 * spring({ frame: frame - desde - 14, fps, config: ANIM.pop })}
        fill={ROJO}
      />
    </svg>
  );
};

// Comparativa lado a lado: barras emparejadas (tornado) con logos y ganador
const ComparativaSplit: React.FC<{
  comparativa: NonNullable<Escena["comparativa"]>;
  desde: number;
}> = ({ comparativa, desde }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < desde) return null;
  const entra = spring({ frame: frame - desde, fps, config: ANIM.entrada });
  const MAX = 270;
  const atenuar = (lado: "a" | "b") =>
    comparativa.ganador && comparativa.ganador !== lado ? 0.45 : 1;

  const Cabecera: React.FC<{ nombre: string; lado: "a" | "b" }> = ({
    nombre,
    lado,
  }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        flexDirection: lado === "a" ? "row" : "row-reverse",
        opacity: atenuar(lado),
      }}
    >
      <div
        style={{
          borderRadius: "50%",
          padding: comparativa.ganador === lado ? 5 : 0,
          border:
            comparativa.ganador === lado ? `5px solid ${AMARILLO}` : "none",
        }}
      >
        {logoDe(nombre) ? <LogoCirculo src={logoDe(nombre)!} tamano={96} /> : null}
      </div>
      <div style={{ fontFamily: archivo, fontSize: 42, color: TINTA }}>
        {nombre}
      </div>
    </div>
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 260,
        left: 70,
        right: 70,
        opacity: entra,
        transform: `translateY(${(1 - entra) * 50}px)`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 44,
          padding: "0 10px",
        }}
      >
        <Cabecera nombre={comparativa.a} lado="a" />
        <Cabecera nombre={comparativa.b} lado="b" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        {comparativa.metricas.map((m, i) => {
          const crece = spring({
            frame: frame - desde - 10 - i * 7,
            fps,
            config: ANIM.entrada,
          });
          const Barra: React.FC<{ lado: "a" | "b" }> = ({ lado }) => {
            const valor = m[lado];
            const ancho = (valor / 5) * MAX * crece;
            const color = lado === "a" ? BARRA_A : BARRA_B;
            return (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  width: MAX + 60,
                  flexDirection: lado === "a" ? "row-reverse" : "row",
                  opacity: atenuar(lado),
                }}
              >
                <div
                  style={{
                    width: Math.max(6, ancho),
                    height: 30,
                    borderRadius: 6,
                    backgroundColor: color,
                  }}
                />
                <div
                  style={{
                    fontFamily: archivo,
                    fontSize: 32,
                    color: TINTA,
                    opacity: crece > 0.85 ? 1 : 0,
                  }}
                >
                  {valor}
                </div>
              </div>
            );
          };
          return (
            <div
              key={m.etiqueta}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <Barra lado="a" />
              <div
                style={{
                  fontFamily: archivo,
                  fontSize: 34,
                  letterSpacing: 3,
                  color: TINTA,
                  textTransform: "uppercase",
                  textAlign: "center",
                  minWidth: 230,
                  opacity: 0.8,
                }}
              >
                {m.etiqueta}
              </div>
              <Barra lado="b" />
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Ventana de chat de IA: el prompt se teclea y la respuesta llega en streaming
const ChatIA: React.FC<{
  chat: NonNullable<Escena["chat"]>;
  desde: number;
}> = ({ chat, desde }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < desde) return null;
  const entra = spring({ frame: frame - desde, fps, config: ANIM.entrada });

  const t = frame - desde - 10;
  const charsPrompt = Math.max(0, Math.floor(t * 1.6));
  const promptVisible = chat.prompt.slice(0, charsPrompt);
  const promptListo = charsPrompt >= chat.prompt.length;

  const palabrasResp = (chat.respuesta ?? "").split(/\s+/).filter(Boolean);
  const inicioResp = Math.ceil(chat.prompt.length / 1.6) + 18;
  const nResp = promptListo
    ? Math.max(0, Math.floor((t - inicioResp) * 0.55))
    : 0;
  const respVisible = palabrasResp.slice(0, nResp).join(" ");
  const cursorOn = Math.floor(frame / 9) % 2 === 0;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 300,
        left: 70,
        right: 70,
        opacity: entra,
        transform: `translateY(${(1 - entra) * 60}px)`,
      }}
    >
      <div
        style={{
          backgroundColor: "#10162E",
          borderRadius: 26,
          overflow: "hidden",
          boxShadow: "0 24px 60px rgba(26,33,66,0.35)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            padding: "24px 34px",
            borderBottom: "1px solid rgba(244,239,227,0.14)",
          }}
        >
          <div style={{ display: "flex", gap: 12 }}>
            {[ROJO, AMARILLO, "#1E9E5A"].map((c) => (
              <div
                key={c}
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  backgroundColor: c,
                  opacity: 0.9,
                }}
              />
            ))}
          </div>
          {logoDe(chat.ia) ? (
            <LogoCirculo src={logoDe(chat.ia)!} tamano={54} />
          ) : null}
          <div
            style={{
              fontFamily: mono,
              fontWeight: 600,
              fontSize: 30,
              color: PAPEL,
              letterSpacing: 2,
            }}
          >
            {chat.ia}
          </div>
        </div>
        <div
          style={{
            padding: "30px 36px 36px",
            fontFamily: mono,
            fontSize: 33,
            lineHeight: 1.55,
            minHeight: 220,
          }}
        >
          <div style={{ color: "#8FA0D8" }}>
            <span style={{ color: ROJO }}>›</span> {promptVisible}
            {!promptListo && cursorOn ? (
              <span style={{ color: PAPEL }}>▍</span>
            ) : null}
          </div>
          {nResp > 0 ? (
            <div style={{ color: PAPEL, marginTop: 22 }}>
              {respVisible}
              {nResp < palabrasResp.length && cursorOn ? (
                <span style={{ color: AMARILLO }}>▍</span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

// Flecha curva "a mano" que se dibuja sola señalando un elemento
const FlechaSenal: React.FC<{
  desde: number;
  lado: "izquierda" | "derecha";
  variante: number;
}> = ({ desde, lado, variante }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < desde) return null;
  const traza = spring({
    frame: frame - desde,
    fps,
    config: { damping: 26, stiffness: 60 },
  });
  const punta = spring({
    frame: frame - desde - 16,
    fps,
    config: { damping: 14, stiffness: 260 },
  });
  const rutas = [
    "M 30 20 C 110 90, 10 200, 95 300",
    "M 20 30 C 130 60, 40 190, 110 290",
    "M 40 15 C 0 120, 120 180, 80 295",
  ];
  const balanceo = Math.sin(frame / 20) * 1.2;
  return (
    <svg
      viewBox="0 0 160 330"
      style={{
        position: "absolute",
        top: "36%",
        width: 260,
        height: 540,
        overflow: "visible",
        ...(lado === "izquierda" ? { left: 60 } : { right: 60 }),
        transform: `rotate(${balanceo}deg) ${lado === "derecha" ? "scaleX(-1)" : ""}`,
      }}
    >
      <path
        d={rutas[variante % rutas.length]}
        fill="none"
        stroke={ROJO}
        strokeWidth="8"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - traza}
      />
      <g
        opacity={punta}
        transform={`translate(95 300) scale(${punta})`}
      >
        <path
          d="M -26 -22 L 0 0 L 8 -32"
          fill="none"
          stroke={ROJO}
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};

// Recorrido de puntos que viaja continuamente por el fondo
const FlujoPuntos: React.FC<{ semilla: number }> = ({ semilla }) => {
  const frame = useCurrentFrame();
  const rutas = [
    "M -50 700 C 300 500, 500 1000, 1150 780",
    "M -50 1200 C 350 1450, 700 950, 1150 1250",
    "M -50 500 C 400 750, 650 380, 1150 620",
  ];
  return (
    <svg
      viewBox="0 0 1080 1920"
      style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
    >
      <path
        d={rutas[semilla % rutas.length]}
        fill="none"
        stroke={semilla % 2 === 0 ? TINTA : ROJO}
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="2 30"
        strokeDashoffset={-frame * 1.1}
        opacity={0.16}
      />
    </svg>
  );
};

// Anillos que se expanden en bucle (foco pulsante)
const AnillosFoco: React.FC<{ color: string }> = ({ color }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      {[0, 1].map((i) => {
        const ciclo = ((frame + i * 28) % 56) / 56;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              width: 380,
              height: 380,
              borderRadius: "50%",
              border: `5px solid ${color}`,
              opacity: (1 - ciclo) * 0.3,
              transform: `scale(${0.55 + ciclo * 0.75})`,
            }}
          />
        );
      })}
    </div>
  );
};

// Esquinas que se dibujan enmarcando el titular
const MarcoTitular: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const traza = spring({
    frame: frame - 2,
    fps,
    config: ANIM.trazo,
  });
  const giro = Math.sin(frame / 24) * 1.5;
  return (
    <>
      <svg
        viewBox="0 0 120 120"
        style={{
          position: "absolute",
          top: 190,
          left: 46,
          width: 110,
          height: 110,
          overflow: "visible",
          transform: `rotate(${giro}deg)`,
        }}
      >
        <path
          d="M 110 10 L 14 14 L 10 110"
          fill="none"
          stroke={TINTA}
          strokeWidth="10"
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - traza}
          opacity={0.85}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          top: 196,
          right: 70,
          fontSize: 54,
          color: ROJO,
          fontFamily: archivo,
          opacity: traza,
          transform: `rotate(${frame * 0.6}deg) scale(${traza})`,
        }}
      >
        ✳
      </div>
    </>
  );
};

// Garabatos flotantes: motion graphics de fondo en movimiento constante
const FORMAS_DOODLE = ["✳", "＋", "○", "◆", "✦", "〜"] as const;

const Doodles: React.FC<{ semilla: number }> = ({ semilla }) => {
  const frame = useCurrentFrame();
  const colores = [TINTA, ROJO, "#C99700"];
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {Array.from({ length: 9 }).map((_, i) => {
        const n = semilla * 9 + i;
        const x = ((n * 137) % 100) * 0.9 + 5; // pseudoaleatorio determinista
        const y = ((n * 79) % 100) * 0.82 + 6;
        const forma = FORMAS_DOODLE[n % FORMAS_DOODLE.length];
        const bob = Math.sin(frame / 22 + i * 1.7) * 10;
        const giro = Math.sin(frame / 30 + i) * 14 + frame * 0.25;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              fontSize: 34 + ((n * 31) % 30),
              color: colores[n % colores.length],
              opacity: 0.12,
              transform: `translateY(${bob}px) rotate(${giro}deg)`,
              fontFamily: archivo,
            }}
          >
            {forma}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

// Medidor de puntuación: bloques que se rellenan uno a uno
const Puntuacion: React.FC<{
  puntuacion: NonNullable<Escena["puntuacion"]>;
  desde: number;
}> = ({ puntuacion, desde }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < desde) return null;
  const color = COLORES_SELLO[puntuacion.tipo ?? "bueno"];
  const total = 5;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 330,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 26,
      }}
    >
      {puntuacion.etiqueta ? (
        <div
          style={{
            fontFamily: archivo,
            fontSize: 46,
            letterSpacing: 5,
            color: TINTA,
            textTransform: "uppercase",
          }}
        >
          {puntuacion.etiqueta}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        {Array.from({ length: total }).map((_, i) => {
          const pop = spring({
            frame: frame - desde - i * 4,
            fps,
            config: { damping: 18, stiffness: 230 },
          });
          const lleno = i < puntuacion.valor;
          const pulso = lleno
            ? 1 + Math.sin(frame / 9 + i) * 0.02
            : 1;
          return (
            <div
              key={i}
              style={{
                width: 118,
                height: 86,
                borderRadius: 16,
                border: `6px solid ${lleno ? color : "rgba(26,33,66,0.25)"}`,
                backgroundColor: lleno ? color : "transparent",
                transform: `scale(${(0.4 + pop * 0.6) * pulso}) rotate(${lleno ? -1.5 : 0}deg)`,
                boxShadow: lleno
                  ? `0 10px 26px ${color}55`
                  : "none",
              }}
            />
          );
        })}
        <div
          style={{
            fontFamily: caveat,
            fontWeight: 700,
            fontSize: 66,
            color,
            marginLeft: 14,
            transform: `rotate(-6deg)`,
          }}
        >
          {puntuacion.valor}/5
        </div>
      </div>
    </div>
  );
};

// Chispas que estallan alrededor (para el #1)
const Chispas: React.FC<{ desde: number }> = ({ desde }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <>
      {Array.from({ length: 7 }).map((_, i) => {
        const ciclo = (frame - desde - i * 6) % 55;
        const pop = spring({
          frame: ciclo,
          fps,
          config: { damping: 9, stiffness: 180 },
        });
        const ang = (i / 7) * Math.PI * 2;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${50 + Math.cos(ang) * 34}%`,
              top: `${46 + Math.sin(ang) * 40}%`,
              fontSize: 44,
              color: AMARILLO,
              textShadow: "0 2px 6px rgba(26,33,66,0.25)",
              opacity: ciclo < 0 ? 0 : Math.max(0, 1.15 - ciclo / 45),
              transform: `scale(${pop}) rotate(${ciclo * 5}deg)`,
            }}
          >
            ✦
          </div>
        );
      })}
    </>
  );
};

// Pegatina grande con un logo: tarjeta blanca con celo, flotando
const LogoSticker: React.FC<{ logo: string; indice: number }> = ({
  logo,
  indice,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({
    frame: frame - 5,
    fps,
    config: ANIM.entrada,
  });
  const flota = Math.sin(frame / 17) * 7;
  const giro = (indice % 2 === 0 ? 2 : -2) + Math.sin(frame / 25) * 1.2;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 330,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        opacity: entra,
        transform: `translateY(${(1 - entra) * 80 + flota}px)`,
      }}
    >
      <AnillosFoco color={TINTA} />
      <div
        style={{
          position: "relative",
          backgroundColor: "#FFFFFF",
          borderRadius: 28,
          padding: 54,
          boxShadow: "0 20px 48px rgba(26,33,66,0.28)",
          transform: `rotate(${giro}deg) scale(${0.75 + entra * 0.25})`,
        }}
      >
        <Img src={staticFile(logo)} style={{ width: 210, height: 210 }} />
        <div
          style={{
            position: "absolute",
            top: -24,
            left: "50%",
            width: 170,
            height: 48,
            backgroundColor: CELO,
            opacity: 0.85,
            transform: "translateX(-50%) rotate(-2.5deg)",
            boxShadow: "0 3px 8px rgba(26,33,66,0.15)",
          }}
        />
      </div>
    </div>
  );
};

// Tarjeta de ranking: número gigante perfilado + chip con el nombre
const RankCard: React.FC<{ rank: NonNullable<Escena["rank"]> }> = ({
  rank,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({
    frame: frame - 4,
    fps,
    config: ANIM.entrada,
  });
  const flota = Math.sin(frame / 18) * 6;
  const balanceo = Math.sin(frame / 26) * 1.2;
  return (
    <div
      style={{
        position: "absolute",
        bottom: 300,
        left: 0,
        right: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        transform: `translateY(${(1 - entra) * 120 + flota}px) scale(${0.7 + entra * 0.3})`,
        opacity: entra,
      }}
    >
      {rank.numero === 1 ? <Chispas desde={10} /> : null}
      <AnillosFoco color={rank.numero === 1 ? "#C99700" : TINTA} />
      <div
        style={{
          fontFamily: archivo,
          fontSize: 330,
          lineHeight: 1,
          color: rank.numero === 1 ? AMARILLO : "transparent",
          WebkitTextStroke: `12px ${TINTA}`,
          transform: `rotate(${-4 + balanceo}deg)`,
          textShadow:
            rank.numero === 1 ? "0 18px 40px rgba(201,151,0,0.35)" : "none",
        }}
      >
        {rank.numero}
      </div>
      <div
        style={{
          backgroundColor: TINTA,
          color: PAPEL,
          fontFamily: archivo,
          fontSize: 64,
          padding: "18px 44px",
          borderRadius: 18,
          display: "flex",
          alignItems: "center",
          gap: 28,
          transform: `rotate(${1.5 + balanceo * 0.4}deg)`,
          boxShadow: "0 16px 38px rgba(26,33,66,0.32)",
        }}
      >
        {logoDe(rank.nombre) ? (
          <LogoCirculo src={logoDe(rank.nombre)!} tamano={92} />
        ) : null}
        {rank.nombre}
      </div>
    </div>
  );
};

// Tampón de tinta que se estampa: BUENO (verde), MALO (rojo), EL MEJOR (dorado)
const COLORES_SELLO = {
  bueno: "#1E9E5A",
  malo: "#E0372E",
  mejor: "#B8860B",
} as const;

const Sello: React.FC<{
  sello: NonNullable<Escena["sello"]>;
  desde: number;
}> = ({ sello, desde }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const golpe = spring({
    frame: frame - desde,
    fps,
    config: ANIM.sello,
  });
  if (frame < desde) return null;
  const color = COLORES_SELLO[sello.tipo ?? "bueno"];
  return (
    <div
      style={{
        position: "absolute",
        right: 90,
        top: "44%",
        padding: "18px 34px",
        border: `7px solid ${color}`,
        borderRadius: 14,
        color,
        fontFamily: archivo,
        fontSize: 64,
        letterSpacing: 4,
        textTransform: "uppercase",
        opacity: Math.min(1, golpe * 1.2) * 0.92,
        transform: `rotate(-9deg) scale(${2.1 - golpe * 1.1})`,
        maskImage:
          "radial-gradient(circle at 30% 40%, black 60%, rgba(0,0,0,0.72) 100%)",
      }}
    >
      {sello.texto}
    </div>
  );
};

// Enfrentamiento: chips con los nombres y un badge VS rojo en medio
const Versus: React.FC<{ nombres: string[]; desde: number }> = ({
  nombres,
  desde,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < desde) return null;
  return (
    <div
      style={{
        position: "absolute",
        top: "47%",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: 30,
        flexWrap: "wrap",
        padding: "0 60px",
      }}
    >
      {nombres.map((nombre, i) => {
        const entra = spring({
          frame: frame - desde - i * 5,
          fps,
          config: ANIM.pop,
        });
        return (
          <div
            key={nombre}
            style={{ display: "flex", alignItems: "center", gap: 30 }}
          >
            {i > 0 ? (
              <div
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: "50%",
                  backgroundColor: ROJO,
                  color: PAPEL,
                  fontFamily: archivo,
                  fontSize: 40,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transform: `scale(${entra}) rotate(-8deg)`,
                  boxShadow: "0 10px 24px rgba(224,55,46,0.35)",
                }}
              >
                VS
              </div>
            ) : null}
            <div
              style={{
                backgroundColor: TINTA,
                color: PAPEL,
                fontFamily: archivo,
                fontSize: 52,
                padding: "16px 34px",
                borderRadius: 16,
                display: "flex",
                alignItems: "center",
                gap: 22,
                transform: `scale(${entra}) rotate(${i % 2 === 0 ? -2 : 2}deg)`,
                boxShadow: "0 12px 30px rgba(26,33,66,0.3)",
              }}
            >
              {logoDe(nombre) ? (
                <LogoCirculo src={logoDe(nombre)!} tamano={72} />
              ) : null}
              {nombre}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// El clip de stock, presentado como foto polaroid pegada con celo
const Polaroid: React.FC<{ escena: Escena; indice: number }> = ({
  escena,
  indice,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (!escena.video) return null;

  const entra = spring({
    frame: frame - 5,
    fps,
    config: ANIM.entrada,
  });
  const giro = indice % 2 === 0 ? 3 : -3.5;
  const zoom = 1.05 + frame * 0.0008;

  const clip = (
    <OffthreadVideo
      src={staticFile(escena.video)}
      muted
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        transform: `scale(${zoom})`,
      }}
    />
  );
  const framesClip = escena.videoDuracion
    ? Math.floor(escena.videoDuracion * fps)
    : null;

  return (
    <div
      style={{
        position: "absolute",
        right: 76,
        bottom: 250,
        width: 470,
        opacity: Math.min(1, entra * 1.3),
        transform: `rotate(${giro}deg) scale(${0.8 + entra * 0.2}) translateY(${(1 - entra) * 60}px)`,
        transformOrigin: "center bottom",
      }}
    >
      <div
        style={{
          backgroundColor: "#FFFFFF",
          padding: 18,
          paddingBottom: 54,
          boxShadow: "0 18px 44px rgba(26,33,66,0.28)",
          borderRadius: 3,
        }}
      >
        <div style={{ height: 520, overflow: "hidden", borderRadius: 2 }}>
          {framesClip ? (
            <Loop durationInFrames={framesClip}>{clip}</Loop>
          ) : (
            clip
          )}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: -26,
          left: "50%",
          width: 190,
          height: 52,
          backgroundColor: CELO,
          opacity: 0.85,
          transform: "translateX(-50%) rotate(-2deg)",
          boxShadow: "0 3px 8px rgba(26,33,66,0.15)",
        }}
      />
      {escena.emoji ? (
        <div
          style={{
            position: "absolute",
            bottom: -18,
            left: -34,
            fontSize: 96,
            transform: `rotate(-8deg) scale(${entra})`,
            filter: "drop-shadow(0 6px 14px rgba(26,33,66,0.3))",
          }}
        >
          {escena.emoji}
        </div>
      ) : null}
    </div>
  );
};

// Audio troceado: reproduce solo los tramos con voz, saltándose los silencios
const AudioSinSilencios: React.FC<{ escena: Escena }> = ({ escena }) => {
  if (!escena.audio) return null;
  if (!escena.segmentos || escena.segmentos.length === 0) {
    return <Audio src={staticFile(escena.audio)} />;
  }
  let out = 0;
  return (
    <>
      {escena.segmentos.map((s, i) => {
        const desde = Math.round(out * FPS);
        const dur = Math.max(1, Math.round((s.srcFin - s.srcInicio) * FPS));
        out += s.srcFin - s.srcInicio;
        return (
          <Sequence key={i} from={desde} durationInFrames={dur}>
            <Audio
              src={staticFile(escena.audio)}
              trimBefore={Math.round(s.srcInicio * FPS)}
              trimAfter={Math.round(s.srcFin * FPS)}
            />
          </Sequence>
        );
      })}
    </>
  );
};

// Pegatina numerada para rankings: círculo blanco con borde rojo
const BadgeRanking: React.FC<{ texto: string; conVideo: boolean }> = ({
  texto,
  conVideo,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const entra = spring({
    frame: frame - 3,
    fps,
    config: ANIM.pop,
  });
  return (
    <div
      style={{
        position: "absolute",
        right: conVideo ? 44 : 90,
        top: conVideo ? 1010 : 170,
        minWidth: 170,
        height: 170,
        padding: "0 24px",
        borderRadius: 999,
        backgroundColor: "#FFFFFF",
        border: `8px solid ${ROJO}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: archivo,
        fontSize: texto.length > 3 ? 52 : 76,
        color: TINTA,
        transform: `rotate(9deg) scale(${entra})`,
        boxShadow: "0 14px 34px rgba(26,33,66,0.3)",
        zIndex: 3,
      }}
    >
      {texto}
    </div>
  );
};

const VistaEscena: React.FC<{ escena: Escena; indice: number }> = ({
  escena,
  indice,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const framesEscena = Math.round(escena.duracion * fps);
  const framesNota = Math.round(escena.duracion * 0.45 * fps);
  const framesPostit = Math.round(escena.duracion * 0.6 * fps);
  const framesMitad = Math.round(escena.duracion * 0.5 * fps);

  // Transición: entra deslizando (alternando lado) y sale hacia arriba
  const entra = spring({ frame, fps, config: ANIM.entrada });
  const sale = spring({
    frame: frame - (framesEscena - 7),
    fps,
    config: { damping: 30, stiffness: 240 },
  });
  const lado = indice % 2 === 0 ? 1 : -1;

  return (
    <AbsoluteFill>
      <AudioSinSilencios escena={escena} />
      <AbsoluteFill
        style={{
          opacity: entra * (1 - sale),
          transform: `translateX(${(1 - entra) * 46 * lado}px) translateY(${sale * -50}px)`,
        }}
      >
        <Doodles semilla={indice} />
        <FlujoPuntos semilla={indice} />
        <MarcoTitular />
        {escena.flecha || escena.video ? (
          <FlechaSenal
            desde={Math.round(escena.duracion * 0.2 * fps)}
            lado={escena.video ? "derecha" : "izquierda"}
            variante={indice}
          />
        ) : escena.rank || escena.logo || escena.puntuacion ? (
          <Conector
            desde={Math.round(escena.duracion * 0.18 * fps)}
            variante={indice}
          />
        ) : null}
        {escena.comparativa ? (
          <ComparativaSplit comparativa={escena.comparativa} desde={8} />
        ) : null}
        {escena.chat ? <ChatIA chat={escena.chat} desde={6} /> : null}
        <div style={{ position: "absolute", top: 240, left: 0, right: 0 }}>
          <Titular escena={escena} />
        </div>
        {escena.nota ? (
          <NotaManuscrita texto={escena.nota} desde={framesNota} />
        ) : null}
        {escena.postit ? (
          <PostIt texto={escena.postit} desde={framesPostit} />
        ) : null}
        {escena.vs ? <Versus nombres={escena.vs} desde={8} /> : null}
        <Polaroid escena={escena} indice={indice} />
        {escena.logo && !escena.rank ? (
          <LogoSticker logo={escena.logo} indice={indice} />
        ) : null}
        {escena.rank ? <RankCard rank={escena.rank} /> : null}
        {escena.puntuacion ? (
          <Puntuacion
            puntuacion={escena.puntuacion}
            desde={Math.round(escena.duracion * 0.35 * fps)}
          />
        ) : null}
        {escena.sello ? (
          <Sello sello={escena.sello} desde={framesMitad} />
        ) : null}
        {escena.badge ? (
          <BadgeRanking texto={escena.badge} conVideo={Boolean(escena.video)} />
        ) : null}
        {escena.emoji && !escena.video ? (
          <div
            style={{
              position: "absolute",
              right: 100,
              bottom: 430,
              fontSize: 130,
              transform: `rotate(-8deg) translateY(${Math.sin(frame / 16) * 7}px)`,
              filter: "drop-shadow(0 8px 18px rgba(26,33,66,0.3))",
            }}
          >
            {escena.emoji}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Marco: React.FC<{ handle: string }> = ({ handle }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progreso = frame / durationInFrames;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 100,
          width: "100%",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontFamily: archivo,
            fontSize: 32,
            color: TINTA,
            letterSpacing: 2,
          }}
        >
          {handle}
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 96,
          left: 84,
          right: 84,
          height: 7,
          borderRadius: 999,
          backgroundColor: "rgba(26,33,66,0.1)",
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

export const Reel: React.FC<ReelProps> = ({ handle, musica, escenas }) => {
  let inicio = 0;
  const secuencias = escenas.map((e) => {
    const desde = Math.round(inicio * FPS);
    const dur = Math.max(1, Math.round((e.duracion + PAUSA_ENTRE_ESCENAS) * FPS));
    inicio += e.duracion + PAUSA_ENTRE_ESCENAS;
    return { escena: e, desde, dur };
  });

  return (
    <AbsoluteFill>
      <FondoPapel />
      {musica ? <Audio src={staticFile(musica)} volume={0.07} loop /> : null}
      {secuencias.map((s, i) => (
        <Sequence key={i} from={s.desde} durationInFrames={s.dur}>
          <VistaEscena escena={s.escena} indice={i} />
        </Sequence>
      ))}
      <Marco handle={handle} />
    </AbsoluteFill>
  );
};

// Piezas reutilizadas por la composición de crudos (ReelCrudo)
export {
  logoDe,
  LogoCirculo,
  Sello,
  NotaManuscrita,
  ANIM,
  PAPEL,
  TINTA,
  AMARILLO,
  ROJO,
  archivo,
  caveat,
};

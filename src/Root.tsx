import { Composition } from "remotion";
import { Reel } from "./Reel";
import {
  ReelCrudo,
  duracionCrudoEnFrames,
  type CrudoProps,
} from "./ReelCrudo";
import {
  COLA_FINAL,
  FPS,
  PAUSA_ENTRE_ESCENAS,
  type ReelProps,
} from "./tipos";

const demoProps: ReelProps = {
  titulo: "Demo",
  handle: "@tucuenta",
  escenas: [
    {
      tipo: "hook",
      texto: "Esto es una vista previa del reel",
      audio: "",
      duracion: 3,
      emoji: "🔥",
      palabras: [
        { texto: "Esto", inicio: 0.1, fin: 0.5 },
        { texto: "es", inicio: 0.5, fin: 0.7 },
        { texto: "una", inicio: 0.7, fin: 0.9 },
        { texto: "vista", inicio: 0.9, fin: 1.4 },
        { texto: "previa", inicio: 1.4, fin: 1.9 },
        { texto: "del", inicio: 1.9, fin: 2.2 },
        { texto: "reel", inicio: 2.2, fin: 2.8 },
      ],
    },
    {
      tipo: "cta",
      texto: "Sígueme para más",
      audio: "",
      duracion: 2.5,
      emoji: "👇",
      palabras: [
        { texto: "Sígueme", inicio: 0.1, fin: 0.8 },
        { texto: "para", inicio: 0.8, fin: 1.2 },
        { texto: "más", inicio: 1.2, fin: 1.8 },
      ],
    },
  ],
};

export const duracionTotalEnFrames = (props: ReelProps): number => {
  const segundos =
    props.escenas.reduce((acc, e) => acc + e.duracion + PAUSA_ENTRE_ESCENAS, 0) +
    COLA_FINAL;
  return Math.max(1, Math.round(segundos * FPS));
};

const demoCrudo: CrudoProps = {
  video: "",
  audio: "",
  handle: "@politecnic__",
  segmentos: [{ srcInicio: 0, srcFin: 4 }],
  palabras: [
    { texto: "Vista", inicio: 0.2, fin: 0.6 },
    { texto: "previa", inicio: 0.6, fin: 1.1 },
    { texto: "del", inicio: 1.1, fin: 1.3 },
    { texto: "crudo", inicio: 1.3, fin: 1.8 },
  ],
  elementos: [{ t: 1.5, tipo: "logo", dato: "CLAUDE" }],
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
    <Composition
      id="ReelCrudo"
      component={ReelCrudo}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={duracionCrudoEnFrames(demoCrudo)}
      defaultProps={demoCrudo}
      calculateMetadata={({ props }) => ({
        durationInFrames: duracionCrudoEnFrames(props),
      })}
    />
    <Composition
      id="Reel"
      component={Reel}
      fps={FPS}
      width={1080}
      height={1920}
      durationInFrames={duracionTotalEnFrames(demoProps)}
      defaultProps={demoProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: duracionTotalEnFrames(props),
      })}
    />
    </>
  );
};

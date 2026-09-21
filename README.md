# Reels automáticos

Edición automática de reels verticales (1080×1920) **100% en local**: partes de un vídeo grabado con el móvil y sale un MP4 montado con subtítulos sincronizados, gráficos de marca, música, efectos de sonido y un control de calidad que revisa el resultado.

Todo corre en el Mac: Whisper para transcribir, Remotion para renderizar, ffmpeg para el audio y el framework Vision de Apple para detectar caras y seguir objetos. No hay servicios de pago ni APIs externas.

---

## 1. Puesta en marcha en un Mac nuevo

### Requisitos

| Qué | Para qué | Cómo se instala |
|---|---|---|
| **Node 24 o superior** | Todo el sistema (usa TypeScript sin compilar) | `brew install node` |
| **ffmpeg** (con ffprobe) | Audio, proxies, fotogramas | `brew install ffmpeg` |
| **Xcode Command Line Tools** | `swiftc`, para caras y seguimiento | `xcode-select --install` |
| **Python 3 con Pillow** | Análisis de imagen del control de calidad | `python3 -m pip install pillow` |
| **Google Chrome** | Capturas de webs en modo móvil | [google.com/chrome](https://www.google.com/chrome/) |

### Pasos

```bash
git clone <URL-DEL-REPO> reels
cd reels
npm install
npm run whisper      # descarga whisper.cpp y el modelo (~1,5 GB, tarda un rato)
```

Copia tus vídeos a `crudos/`. **No están en el repo**: es material de clientes y pesa mucho.

> **Importante: no pongas el proyecto en el Escritorio ni en Documentos si tienes iCloud Drive activado.** Con el proyecto sincronizado, los renders tardaban diez minutos o se quedaban colgados. En `~/Projects` tardan segundos. Este fallo costó una tarde entera de depuración.

---

## 2. Flujo de trabajo de un reel

### Paso 1 — Transcribir y ver qué hay

```bash
npm run crudo -- crudos/MI_VIDEO.mov --sugerir
```

Transcribe con Whisper y deja un borrador en `public/generated/MI_VIDEO/revision.sugerida.json`, además de `transcripcion.json` con **cada palabra numerada y con su tiempo**. Esos números son las anclas de todo lo demás.

### Paso 2 — Escribir la revisión

Crea `public/generated/MI_VIDEO/revision.json` (ver el esquema en el punto 3). Aquí es donde se decide el montaje: qué gráfico sale, sobre qué palabra y dónde en pantalla.

Antes de colocar nada, mira **dónde está la cara** en ese vídeo, que cambia mucho entre encuadres:

```bash
ffmpeg -i public/crudos/MI_VIDEO-1080.mp4 -vf "fps=2,scale=540:-2" /tmp/k_%03d.png
scripts/qa/.bin/caras /tmp/k_*.png     # se compila solo la primera vez
```

Los paneles van **por debajo de la barbilla** y los subtítulos por debajo de los paneles.

### Paso 3 — Renderizar

```bash
npm run crudo -- crudos/MI_VIDEO.mov \
  --sin-cortes --handle "" --color "#F5B301" --estilo gym \
  --revision public/generated/MI_VIDEO/revision.json
```

Sale `out/MI_VIDEO-editado.mp4` y, al terminar, el **control de calidad** imprime su informe.

### Opciones

| Opción | Qué hace |
|---|---|
| `--sugerir` | Solo transcribe y deja el borrador. No renderiza. |
| `--revision <ruta>` | La revisión que manda. Sin ella, monta con el borrador. |
| `--sin-cortes` | No recorta silencios. **Úsalo casi siempre**: si el crudo ya viene montado, recortar rompe el ritmo y descuadra los tiempos. |
| `--handle "@quien"` | Handle arriba. Con `""` no se pinta (reels de cliente). |
| `--color "#F5B301"` | Color de marca. Por defecto, el azul de politecnic. |
| `--estilo gym\|tech\|cine` | Estilo de música. Rota sola: coge la pista que lleva más tiempo sin usarse. |
| `--musica <nombre>` | Fuerza una pista concreta (sin `.mp3`). |
| `--plan` | Prepara todo y enseña el montaje, pero no renderiza. Útil para comprobar tiempos. |
| `--retranscribir` | Vuelve a pasar Whisper. **Cuidado**: puede cambiar la numeración de palabras y descolocar la revisión. |
| `--limpiar-voz` | Limpieza suave de voz (ruido medido + compresión ligera). Por defecto la voz **no se toca**. |
| `--sin-qa` | Se salta el control de calidad. |

---

## 3. La revisión (`revision.json`)

```jsonc
{
  "subtitulos": "bold",            // "bold" | "serif" | "ninguno"
  "subtitulosY": 0.6,              // altura 0-1
  "enfasis": [[24, 26]],           // rangos de palabras resaltadas en color de marca
  "sustituciones": [               // correcciones de transcripción
    { "palabra": 43, "texto": "ASO," }
  ],
  "tiempos": [                     // recolocar a mano una palabra mal situada
    { "palabra": 84, "inicio": 26.0, "fin": 26.3 }
  ],
  "eliminar": [],
  "elementos": [
    { "palabra": 12, "tipo": "checklist", "dato": "#Ingredientes|Huevo@0|Mayonesa@1.2",
      "y": 0.37, "duracion": 3.0 }
  ],
  "resumen": "Por qué está montado así. Se lee antes de retocar nada."
}
```

Campos comunes de un elemento: `palabra` (ancla), `tipo`, `dato`, `duracion`, `y` (y a veces `x`), `tam`, `color`, `desfase` (retrasarlo respecto a su palabra), `ocultar` (tramos en los que se aparta), `tapaSubtitulos`, `pista` (seguimiento).

### Tipos que más se usan

| Tipo | `dato` | Notas |
|---|---|---|
| `titulon` | `"=LÍNEA 1\|LÍNEA 2"` | Titular del gancho. `=` pinta la línea en color de marca. Silencia los subtítulos. |
| `remate` | `"LO IMPORTANTE\|LOS=PLIEGUES"` | Titular a pantalla completa. Sin `y` oscurece el fondo; con `y` no. `bocadillo:` lo mete en un bocadillo (CTA). `tam` limita el tamaño de letra. |
| `etiqueta` | `"TRUCO\|Mayonesa bien generosa"` | Tarjeta editorial con antetítulo. |
| `checklist` | `"#Cabecera\|Ítem@0\|Ítem@2.5"` | Los `@` son segundos **desde que entra el elemento**. |
| `siNo` | `"Lo que sí@0\|Lo que no@2.8"` | Dos filas ✓/✗, cada una con su momento. |
| `estado` | `"40 SEG"` | Anillo de tiempo. Admite `x`, `y`, `tam`. |
| `contador` | `"4\|0\|2.5\|4.5"` | Progreso 1/4…4/4. Total y luego los segundos de cada salto. |
| `broll` | `"stock/gym-barra.mp4"` | Clip a pantalla completa. |
| `movil` | `"inserts/a.png\|inserts/b.png"` | Teléfono con varias pantallas que se deslizan. |
| `imagen` | `"inserts/foto.jpg\|Pie de foto"` | Tarjeta con pie. `tam` = ancho. |
| `transicion` | `"zoomIn"`, `"zoomOut"`, `"fade"` | Gesto de cámara entre bloques. No en cada corte: solo en los cambios de tema. |
| `interrogantes` | `"1"` | Con `pista` va pegado a un objeto que se mueve (ver punto 5). |
| `cabeceraTop` | `"LÍNEA 1\|LÍNEA 2\|bold"` | Cabecera fija. Se puede apartar con `ocultar`. |

La lista completa está en el tipo `ElementoCrudo` de `src/ReelCrudo.tsx`.

---

## 4. Control de calidad

Se lanza solo al acabar cada render (o a mano: `npm run qa -- MI_VIDEO`). Revisa:

1. **Caras tapadas**, también las del b-roll. Detecta las caras con Vision y las cruza con la huella real de los gráficos, que saca renderizando el reel solo con los gráficos sobre fondo transparente.
2. **Zonas que tapa la interfaz** de Instagram y TikTok: cabecera, texto del post y columna de botones.
3. **Tiempos**: elementos desplazados de su palabra, CTA que acaba antes que el vídeo.
4. **Subtítulos**: frases que un titular corta al instante y palabras que se dicen pero no llegan a salir.
5. **Transcripción**: palabras con poca confianza de Whisper, y sus repeticiones.
6. **Solapes**, **tramos sin cambios visuales** y **volumen final**.

Deja `out/<reel>-QA.png` con los fotogramas marcados y `public/generated/<reel>/qa.json`.

---

## 5. Herramientas auxiliares

**Capturas de una web en modo móvil** (para enseñar la web de un cliente):

```bash
npm run capturas -- public/inserts "https://ejemplo.com/#/" \
  '--ls=clave="valor"' "nombre-pantalla=#/ruta"
```

**Seguir un objeto** para pegarle un gráfico encima (la "?" roja sobre el iPad):

```bash
npm run seguir -- MI_VIDEO ipad 0 3 0.555 0.385 0.765 0.51
```

Deja `pista-ipad.json` junto a la revisión; luego se usa con `"pista": "ipad"`.

**Panel visual** (listar crudos, lanzar ediciones, calendario de publicación): `npm run panel` → <http://localhost:4322>.

---

## 6. Decisiones de audio (no tocar sin motivo)

- **La voz va tal cual la grabó el cliente**: sin reductor de ruido, sin compresor y sin normalizar. Un reductor mal calibrado le quitaba 7-10 dB a todo lo agudo y apagaba la voz. Con `--limpiar-voz` se puede activar una limpieza suave.
- **Música a -22 dB** respecto al volumen real de la voz, con *ducking*: baja mientras se habla y sube en las pausas. En la práctica, unos 30 dB por debajo de la voz.
- **Efectos al 32%** de su volumen: los acentos quedan entre 15 y 20 dB por debajo de la voz.
- **El máster solo aplica ganancia** para acercarse a -14 LUFS, sin comprimir ni limitar. Si la voz está grabada baja y con picos altos, el reel se queda algo por debajo: es lo correcto.
- **La sincronía se mide y se corrige** en cada render comparando con el crudo. Los intermedios son WAV porque cada codificación AAC metía 20-25 ms de retraso.

---

## 7. Convenciones por cliente

**DV FIT 24X7 (David)** — crudos con prefijo `DV`:
- Sin handle (`--handle ""`), color `#F5B301`.
- Reels de gimnasio: CTA "ESCRIBE RUTINA EN COMENTARIOS".
- Recetas: titulón con las dos primeras líneas en amarillo, checklist de ingredientes que se marcan al nombrarlos, anillos de tiempo y CTA "GUARDA ESTA RECETA".

**politecnic (Pablo)** — reels propios:
- Handle y color por defecto (azul), estilo de música `tech` o `cine`.
- CTA con palabra clave para comentar (RUTINA, IA, WINNIE…).

---

## 8. Estructura

```
crudos/            vídeos originales (NO están en el repo)
public/
  crudos/          proxies 1080x1920 que genera el script (NO en el repo)
  generated/<reel>/  revisión, transcripción, pistas e informe de calidad (sí en el repo)
  musica/          catálogo por estilos + catalogo.json
  stock/ sfx/ iconos/ inserts/ logos/
src/               componentes del render (ReelCrudo.tsx es el grande)
scripts/           editar-crudo.mjs (el principal), qa-reel.mjs, utilidades
scripts/qa/        caras.swift, seguir.swift, angulo.py
panel/             panel web para lanzar ediciones y planificar publicaciones
out/               reels renderizados (NO en el repo)
```

---

## 9. Problemas conocidos

- **Renders lentísimos o colgados**: el proyecto está en una carpeta sincronizada con iCloud. Muévelo a `~/Projects`.
- **`resampler=soxr` falla**: este ffmpeg de Homebrew no trae soxr. Ya se usa el remuestreador propio de ffmpeg.
- **La revisión se descoloca**: alguien ha pasado `--retranscribir` y la numeración de palabras ha cambiado. El render **reutiliza** la transcripción justo para evitarlo.
- **Whisper inventa palabras**: pasa. El control de calidad marca las dudosas por su confianza. Para las que no pilla, escuchar el fragmento ralentizado (`atempo=0.7`) suele resolverlo.

---

## 10. Licencias del material

La música, los efectos y los clips de stock son de **Mixkit** (licencia gratuita: uso comercial en redes, sin atribución obligatoria, pero **prohibido redistribuirlos**). Los inserts incluyen capturas de clientes y una portada de TIME.

**Por eso este repositorio es privado y debe seguir siéndolo.**

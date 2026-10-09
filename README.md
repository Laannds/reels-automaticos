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
| `--look clasico\|cristal` | Lenguaje visual. Ver el punto 3 bis. Por defecto `clasico`. |
| `--encuadre lienzo[:offsetY]` | Para crudos **horizontales**. Ver más abajo. |
| `--solo-graficos` | El reel ya viene montado y sonorizado (export de CapCut): solo se le superpone grafismo. Ver más abajo. |
| `--comprimir` | El máster clava -14 LUFS comprimiendo. Ver el punto 6. |
| `--musica <nombre>` | Fuerza una pista concreta (sin `.mp3`). |
| `--musica-db <n>` | Cuánto queda la música por debajo de la voz **antes** del ducking. Por defecto `-22`. Ver el punto 6. |
| `--sin-ducking` | Música a volumen fijo, sin sidechain. Para reels hablados sin pausas. Ver el punto 6. |
| `--concurrencia <n>` | Fotogramas en paralelo del render. Bájalo a 2-3 si el render se cae por timeout. Ver el punto 9. |
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
  "tomas": [[0.5, 3.1], [3.85, 5.55]],   // solo con --sin-cortes: ver abajo
  "elementos": [
    { "palabra": 12, "tipo": "checklist", "dato": "#Ingredientes|Huevo@0|Mayonesa@1.2",
      "y": 0.37, "duracion": 3.0 }
  ],
  "resumen": "Por qué está montado así. Se lee antes de retocar nada."
}
```

### `tomas`: acortar planos de un crudo ya montado

`"tomas": [[inicio, fin], ...]` son tramos **en segundos del crudo** que se
conservan. Solo se miran con `--sin-cortes` (y por tanto con `--sin-voz`), que
es justo cuando no hay palabras de las que colgar un `eliminar`. Cada tramo es
un segmento, así que:

- el reel dura la suma de los tramos, no lo que dure el crudo;
- **cada toma recibe su propio tamaño de plano** (no el encuadre alternado de
  dos en dos, que es para los microcortes de silencio) y suena un golpe en
  cada empalme;
- los `t` de los elementos van en la línea de tiempo **final**, ya recortada.

Para qué: un lifestyle mudo exportado de CapCut llega con planos de 3,5 s, que
en un reel se leen como lentos. Recortarlos a ~2,4 s es lo que le da ritmo, y
recortar (en vez de acelerar el vídeo) deja el movimiento natural. Los cortes
que ya trae el crudo se sacan con detección de escena:

```bash
ffmpeg -v error -i crudos/MI_VIDEO.mov -vf "select='gt(scene,0.03)',metadata=print:file=-" \
  -an -f null - 2>/dev/null | grep -o "pts_time:[0-9.]*"
```

Campos comunes de un elemento: `palabra` (ancla), `tipo`, `dato`, `duracion`, `y` (y a veces `x`), `tam`, `color`, `desfase` (retrasarlo respecto a su palabra), `ocultar` (tramos en los que se aparta), `tapaSubtitulos`, `pista` (seguimiento).

### El look `cristal`

`--look cristal` cambia el lenguaje visual entero, copiando el del reel de
@herasmedia que Pablo puso de referencia. Tres diferencias con el clásico:

1. **Subtítulos** en geométrica (Poppins 500, 60 px), en minúscula, de **dos o
   tres palabras** que se relevan al ritmo del habla. El clásico acumula hasta
   seis palabras por página y las va encendiendo una a una; aquí el bloque se
   ve entero desde que entra y dura lo que dura el aliento.
2. **Un encuadre por toma.** Con `--sin-cortes` el montaje es un único segmento
   y el render trataba los 40 s como un plano. Ahora busca los cortes que ya
   trae el crudo (diferencia entre fotogramas) y le da a cada toma su tamaño de
   plano, empujando despacio **sobre la cara** (la sitúa con Vision). Un
   trípode quieto pasa a verse como una pieza rodada.
3. **Nada macizo y nada permanente.** Blanco translúcido, sombras muy abiertas,
   y cada gráfico entra grande y desenfocado y se posa en dos décimas. No hay
   chips fijos: si no está diciendo algo, no está. (La barra de progreso que
   llevaba el clásico ya no existe en ningún look: es el mobiliario que delata
   una plantilla, y encima competía con la barra de reproducción que Instagram
   pinta justo ahí.)

Tipos propios de este look (los demás siguen funcionando):

| Tipo | `dato` | Notas |
|---|---|---|
| `cifra` | `"01\|¿LA HACES SIEMPRE IGUAL?"` | Cifra enorme translúcida + pie. Admite un tercer segmento de subpie. `tam` = tamaño del número (240 por defecto). |
| `chips` | `"Un correo@0\|Un Excel@0.9"` | Pastillas de cristal en cadena. Los `@` son segundos desde que entra el elemento. |
| `dm` | `"TEST"` | Barra de mensaje directo que escribe sola la palabra del CTA. |

`titulon` y `remate` se pintan en cristal automáticamente con este look.

### Reels ya montados: `--solo-graficos`

Cuando el reel llega ya cortado **y sonorizado** (lo normal si lo montas en
CapCut) y aquí solo se le pone grafismo encima:

```bash
npm run crudo -- ~/Movies/CapCut/MI_REEL.mov --solo-graficos \
  --handle "" --color "#F5B301" --revision public/generated/MI_REEL/revision.json
```

Qué cambia: no transcribe (los elementos se anclan con `"t"`, en segundos de la
línea final, no con `"palabra"`), **no añade música** encima de la suya y los
gráficos entran **mudos**. Meter un golpe de impacto sobre una mezcla que ya
está hecha es tocar justo lo que se ha pedido no tocar. El audio del crudo pasa
tal cual; el máster solo corrige sincronía y ganancia.

No hace falta copiar nada a `crudos/`: el script acepta una ruta absoluta.

Campos útiles en este modo:

| Campo | Qué hace |
|---|---|
| `"fijo": true` | El rótulo no tiene entrada ni salida: está puesto desde el primer fotograma y sigue en el último. Sin `duracion`, cubre el vídeo entero. |
| `"tam"` en `titulon` | Sube o baja el tamaño base (128). Necesario en titulares de **una** línea larga: el autoajuste es conservador y una frase de 41 caracteres se queda en 41 px. |
| `*asteriscos*` | Resaltan una palabra suelta en el color de marca. El `=` de siempre pinta la línea entera. |

> **Ojo con la columna de botones.** Un rótulo centrado a `y: 0.5` que ocupe
> todo el ancho cae bajo los iconos de like/comentar de Instagram (la franja va
> de 0.45 a 0.83). A `y: 0.42` los esquiva sin perder tamaño. El control de
> calidad lo avisa.

### Imagen fija del tema: `imagenFija`

Una captura de **de lo que se habla** (una noticia, la página de precios de lo
que se compara) flotando encima de la cabeza, **fija de principio a fin** y sin
animación. Es el recurso del reel de Reuters de @politecnic__ que Pablo puso de
referencia. Sustituye al vídeo de stock: ilustra el tema sin cortar el plano.

```jsonc
{ "t": 0, "tipo": "imagenFija", "dato": "inserts/planes-chatgpt.png",
  "x": 0.37, "y": 0.07, "tam": 580, "fijo": true }
```

`x` es el centro horizontal (poner el de la cara), `y` el borde superior y `tam`
el ancho en px. La imagen ocupa la banda de arriba (0.07-0.27), así que **los
gráficos que iban ahí (cifras, pastillas) no caben**: los textos grandes pasan a
la zona de subtítulos —que se silencian mientras están— y las consolas a la
derecha de la cabeza (`"x": 0.62, "y": 0.31`).

> **Ojo con la consola:** su `x` es el borde **izquierdo**, no el centro, y con
> `tam: 340` llega hasta x 0.935, o sea, dentro de la columna de botones de
> Instagram (x > 0.88, desde y 0.45). Con 3 líneas no llega a esa altura; con 4,
> a `y: 0.33` sí, y el QA avisa (etiquetándolo mal como "subtítulos"). Con cuatro
> líneas, `y: 0.31` o menos.

La imagen sale de la propia web, con el Chrome sin ventana del proyecto:

```bash
node scripts/capturar-movil.mjs public/inserts "https://chatgpt.com/pricing" \
  --escritorio --sin-cookies --scroll=350 "planes="
```

| Opción | Qué hace |
|---|---|
| `--sin-cookies` | Pulsa "rechazar las no esenciales" (nunca "aceptar") para que el banner no tape la captura |
| `--scroll=N` | Baja N px antes de capturar |
| `--escritorio` | 1440×900 a 2x en vez de móvil. Hace falta cuando el contenido sale en columnas (planes de precios) y en móvil se apila |
| `--pagina` | Página entera. Ojo: en webs largas puede salir enorme; mejor por pantallas con `--scroll` |

Luego se recorta con Pillow a la zona que interesa. **Comprueba que lo que
enseña la captura coincide con lo que se dice**: aquí, Pablo dice "20 euros" y la
página pone 23 €.

### Crudos horizontales: `--encuadre lienzo`

Por defecto, un crudo horizontal se recorta a 9:16 con un **recorte centrado**.
Si el presentador no está centrado, eso le parte la cara — y además tira la
parte del encuadre que suele estar vacía, que es justo donde cabría el texto.

`--encuadre lienzo:900` conserva el plano entero y lo encaja sobre negro dentro
del 1080×1920, pegado a 900 px del borde superior (sin el `:900`, centrado).
Es el formato del reel de @juradonegocios que Pablo puso de referencia: el
plano a un lado y el texto ocupando el hueco.

Con este modo, la cámara se queda **fija** (`camaraFija` en los props). No es
opcional: cualquier acercamiento escala también las bandas negras, así que el
plano crece, las bandas menguan y el encuadre baila durante todo el reel.

El elemento que acompaña a este formato:

| Tipo | `dato` | Notas |
|---|---|---|
| `noticia` | `"#ANTETÍTULO\|TITULAR\|dato@0\|dato@2.4"` | **El que se usa en este formato.** Antetítulo y titular pegados por ENCIMA del plano, datos entrando uno a uno por DEBAJO. Se ancla a los bordes del plano, no a una altura fija. |
| `listaPlana` | `"TÍTULO\|Línea@0\|Línea@2.4"` | Todo el bloque en un lado, estilo @juradonegocios puro. `color: "mejor"` numera las líneas. |

El fondo del lienzo **no es negro liso**: es el propio plano ampliado a cubrir el
cuadro, desenfocado (sigma 70), oscurecido y con viñeta, más un filete claro de
3 px alrededor del plano. Un negro plano detrás de un vídeo se ve barato —parece
una exportación mal hecha— y fue lo primero que Pablo señaló al ver la v1.

Y el texto se **ancla a los bordes del plano**. Flotando a una altura fija, los
tres bloques (titular, plano, datos) se leen como una diapositiva mal maquetada
en vez de como una pieza.

En este formato los subtítulos suelen ir en `"ninguno"`: el texto de la pantalla
**es** el contenido. Y solo se escribe lo que la voz dice o atribuye — una línea
que no se oye rompe la sincronía, que es lo único que sostiene el formato.

### Tapar rótulos que ya trae el crudo

Material de cliente que llega con sus propios grafismos quemados:

| Tipo | `dato` | Notas |
|---|---|---|
| `tapa` | `""` o `"#RRGGBB"` | Oculta una franja. `y` = borde superior, `tam` = alto en px. Vacío repinta el plano desenfocado (70 px + desaturado); con un hex, relleno liso. Los cantos van fundidos. |
| `comparativa` | `"IZQ\|cifra\|DER\|cifra"` | Dos tarjetas enfrentadas, la izquierda en color de marca y la derecha en rojo. |

**Mide siempre con rejilla, nunca a ojo sobre una hoja de contactos.** Fallar la
altura de un rótulo cuesta un render entero:

```bash
ffmpeg -ss 2 -i public/crudos/MI_VIDEO-1080.mp4 -frames:v 1 \
  -vf "drawgrid=w=1080:h=96:t=2:c=cyan@0.9" /tmp/g.png   # una línea cada 0.05
```

Y para colocar un gráfico, **no lances el pipeline entero**: unos fotogramas
sueltos tardan segundos.

```bash
npx remotion render ReelCrudo /tmp/v.mp4 --props=public/generated/MI_VIDEO/props.json --frames=140-141
```

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
| `broll` | `"stock/gym-barra.mp4"` | Clip a pantalla completa. Por debajo de **1,5 s** entra y sale a corte seco, sin fundido: a esas duraciones es un plano de recurso, no un inserto, y el fundido se comía media aparición. De 1,5 s en adelante, fundido de siempre. |
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

**Seguir un objeto** para pegarle un gráfico encima (la "?" roja sobre el iPad,
la carta de restaurante sobre la mano abierta de DV_Menu):

```bash
npm run seguir -- MI_VIDEO ipad 0 3 0.555 0.385 0.765 0.51
```

Deja `pista-ipad.json` junto a la revisión; luego se usa con `"pista": "ipad"`.

**Verifica la pista antes de montar nada**, sobre todo el final: el seguidor se
queda enganchado al fondo en cuanto el objeto cambia de forma (en DV_Menu, al
cerrar David la mano para el gesto del "uno"), y el gráfico tiene que irse
ANTES de ese fotograma o se queda flotando.

```bash
# dibuja la caja de la pista sobre el vídeo en el instante que quieras
ffmpeg -ss 3.1 -i public/crudos/MI_VIDEO-1080.mp4 -frames:v 1 \
  -vf "drawbox=x=..:y=..:w=..:h=..:color=red@1:t=5" /tmp/pista.png
```

Y **la pista en crudo tiembla**: es firme en posición, pero el ancho oscila
~20 % y el ángulo pega saltos de 1° por fotograma. Un gráfico que la use tal
cual respira y vibra. Lo que hace `carta` (y lo que conviene copiar): congelar
el tamaño en la mediana de toda la pista y pasar giro y posición por una media
móvil. Si además el objeto está pegado a un borde del cuadro, hay que desplazar
el gráfico hacia dentro o se sale de plano.

**Panel visual** (listar crudos, lanzar ediciones, calendario de publicación): `npm run panel` → <http://localhost:4322>.

---

## 6. Decisiones de audio (no tocar sin motivo)

- **La voz va tal cual la grabó el cliente**: sin reductor de ruido, sin compresor y sin normalizar. Un reductor mal calibrado le quitaba 7-10 dB a todo lo agudo y apagaba la voz. Con `--limpiar-voz` se puede activar una limpieza suave.
- **Música a -22 dB** respecto al volumen real de la voz, con *ducking*: baja mientras se habla y sube en las pausas. En la práctica, unos 30 dB por debajo de la voz.
  **Ese -22 da por hecho que hay pausas.** En un reel hablado a cañón de principio a
  fin, el ducking no suelta nunca y la música no llega a oírse: en David01_Octubre
  (36 s sin una sola pausa) entraba a 20 dB bajo la voz y el sidechain la dejaba en
  ~29 dB, inaudible en un móvil. Para esos casos está `--musica-db`. Medido sobre
  ese reel, con la voz a -22,2 dB de media: `-22` → música a -42,5 dB (20 dB por
  debajo), `-18` → -38,5, `-16` → -36,5, `-12` → -32,5 (10 dB por debajo; a Pablo le
  pareció que competía con la voz). **El valor por defecto no se toca**: se sube por
  reel, y solo cuando se ha comprobado que no se oye.
- **El `sidechaincompress` quita 10,5 dB de media, no 9.** Medido aislando la rama de
  música en David01_Octubre: a `--musica-db -16`, sin ducking la música sale a -36,5 dB
  y con ducking a -47,0. En un reel con pausas eso da igual, porque la música sube en
  los huecos; en uno hablado a cañón es una resta constante y la deja inaudible. Ahí
  se usa **`--sin-ducking`** y se fija el nivel con `--musica-db`: ese reel se entregó
  con `--musica-db -21 --sin-ducking`, o sea música 19,3 dB por debajo de la voz, fija.
- **Antes de tocar nada, medir si la música está.** `volumedetect` sobre el archivo
  entero no la ve (la voz domina la media). Comparar `voz.wav` y `mezcla.wav` filtrando
  graves (`-af "lowpass=f=70,volumedetect"`) sí: si la diferencia es de décimas, la
  música no está llegando.
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

- **El render se cae con `Timeout exceeded rendering the component at frame N`**: no es
  que el timeout sea corto, es que la máquina no da abasto decodificando vídeo. Pasó en
  David01_Octubre con seis clips de stock recién bajados (134 MB entre todos, 1920×1080):
  el render moría justo en el fotograma donde arrancaban los cortes. **Prepara el stock
  antes de usarlo**: recórtalo a lo que vas a usar y déjalo ya en 9:16, que es como se va
  a ver. Esos seis clips pasaron de 134 MB a 6,3 MB y el render dejó de caerse.

  ```bash
  ffmpeg -t 3 -i bruto.mp4 -an \
    -vf "crop=ih*9/16:ih,scale=1080:1920:flags=lanczos,fps=30" \
    -c:v libx264 -crf 23 -preset slow -pix_fmt yuv420p public/stock/mi-clip.mp4
  ```


- **Renders lentísimos o colgados**: el proyecto está en una carpeta sincronizada con iCloud. Muévelo a `~/Projects`.
- **`resampler=soxr` falla**: este ffmpeg de Homebrew no trae soxr. Ya se usa el remuestreador propio de ffmpeg.
- **La revisión se descoloca**: alguien ha pasado `--retranscribir` y la numeración de palabras ha cambiado. El render **reutiliza** la transcripción justo para evitarlo.
- **Whisper inventa palabras**: pasa. El control de calidad marca las dudosas por su confianza. Para las que no pilla, escuchar el fragmento ralentizado (`atempo=0.7`) suele resolverlo.

---

## 10. Licencias del material

La música, los efectos y los clips de stock son de **Mixkit** (licencia gratuita: uso comercial en redes, sin atribución obligatoria, pero **prohibido redistribuirlos**). Los inserts incluyen capturas de clientes y una portada de TIME.

**Por eso este repositorio es privado y debe seguir siéndolo.**

---
name: subtitulos-cuadrados
description: Pablo detecta enseguida subtítulos descentrados o desincronizados; revisar posición y tiempo antes de entregar
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 004b1b5f-9f81-49b4-9e83-49acfea0057d
  modified: 2026-09-11T09:08:31.577Z
---

Pablo nota a la primera cuando los subtítulos están "descuadrados", y la palabra le vale tanto para posición como para tiempo. En DV_SP3 (2026-09-11) eran las dos cosas a la vez: el texto visible salía descentrado mientras se completaba la frase (las palabras no dichas reservaban hueco), Whisper estiraba palabras sobre los silencios ("queméis" salía 1,5 s antes) y el audio iba 65-70 ms tarde por las codificaciones AAC intermedias.

**Why:** los subtítulos palabra a palabra delatan cualquier error de sincronía o de maqueta; el reel parece amateur aunque todo lo demás esté bien.
**How to apply:** tras cada render, mirar fotograma a fotograma los tramos con pausas y frases partidas por titulares. Comprobar la sincronía con el crudo (debe quedar en ~0 ms) y que ninguna palabra se quede sin salir. Antes de culpar a la transcripción, medir: Whisper acierta los inicios de frase (±20 ms). Probé DTW y era PEOR (mediana 45 ms frente a 20 ms), así que no volver a proponerlo como arreglo. Relacionado: [[audio-musica-discreta]].

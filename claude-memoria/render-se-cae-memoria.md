---
name: render-se-cae-memoria
description: "Timeout exceeded rendering the component" casi siempre es falta de memoria, no timeout corto; remedio por tramos
metadata:
  type: project
---

En el Mac de Pablo (disco al 87%, RAM casi siempre al límite) los renders largos de Remotion fallan con `Timeout (Nms) exceeded rendering the component at frame N`, cayendo en un fotograma distinto cada vez. No es el timeout: es que no llega a decodificar vídeo a tiempo.

**Why:** pasó cinco veces seguidas con David01_Octubre (1097 fotogramas, 2026-10-01). Descartado: timeout corto (subido a 30→120→180 s), keyframes del proxy (están cada 0,4 s), proxy corrupto (se lee bien con ffmpeg).

**How to apply, por orden:** (1) preparar el stock antes de usarlo — recortarlo y dejarlo ya en 9:16 1080×1920; seis clips pasaron de 134 MB a 6,3 MB. (2) `--concurrencia 2`. (3) Si sigue cayendo, renderizar por tramos de ~200 fotogramas con reintentos y `--muted`, unir con el demuxer `concat` y muxar el audio desde `mezcla.wav` — eso además evita los 45 ms de retraso que mete la cadena de audio de Remotion. El máster hay que aplicarlo a mano: ganancia `min(-14 - I, -1.5 - TP)`, sin comprimir. Ver [[musica-sin-pausas]].

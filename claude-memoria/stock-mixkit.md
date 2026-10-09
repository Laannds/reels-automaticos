---
name: stock-mixkit
description: Pablo aprueba descargar stock nuevo de Mixkit cuando falta un plano; patrón de URL y verificación
metadata:
  node_type: memory
  type: project
  originSessionId: 0125d352-cd7f-4a28-8258-02c03082365f
  modified: 2026-09-30T22:52:56.541Z
---

Cuando falta un plano de recurso, Pablo prefiere que se descargue de Mixkit antes que resolverlo solo con grafismo (aprobado el 2026-10-01 para David01_Octubre).

**Why:** la librería de `public/stock/` es pequeña y casi toda de gimnasio; las referencias de vida cotidiana (coche, oficina, sofá, escaleras) no estaban. Misma licencia que el resto del material.

**How to apply:** el asset directo es `https://assets.mixkit.co/videos/<id>/<id>-1080.mp4` (si da 403, probar `-720`); el `<id>` sale del slug de la ficha. Antes de usar un clip, recortarlo a 9:16 y mirarlo: varios llegan demasiado cerrados (una mano no lee «oficina») o demasiado oscuros (medir con `signalstats` YAVG; por debajo de ~50 no se lee en un corte de medio segundo). Ver [[ritmo-lifestyle]].

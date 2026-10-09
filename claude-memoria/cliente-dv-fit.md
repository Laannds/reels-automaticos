---
name: cliente-dv-fit
description: "Convenciones del cliente DV FIT 24X7 (David): marca, CTAs por tipo de reel, composición"
metadata: 
  node_type: memory
  type: project
  originSessionId: 004b1b5f-9f81-49b4-9e83-49acfea0057d
  modified: 2026-09-11T09:08:31.585Z
---

Cliente DV FIT 24X7 (entrenador David). Crudos con prefijo DV (DV_SP2, DV_SP3, 07Spet_DV, YDRAY…, DavidSandwich…).
- Marca: sin handle (`--handle ""`), amarillo `--color "#F5B301"` (muestreado a ojo; el hex oficial no se ha confirmado nunca).
- Reels de gimnasio: CTA "ESCRIBE RUTINA EN COMENTARIOS" en bocadillo.
- Reels de recetas: titulón centrado con dos líneas en amarillo y una en blanco ("=GAMBAS|=AL AJILLO|EN 5 MIN DE MICRO"), checklist de ingredientes que se marca al nombrarlos, anillos de tiempo, etiquetas PASO/TRUCO/OJO y CTA "GUARDA ESTA RECETA" en bocadillo. Si David no lo graba, se pone sobre el plano final con `desfase`.
- Composición: cuando se inclina, la cara le baja (barbilla hasta 0,35 en DV_SP3). Mapearla con el detector Vision (`scripts/qa/.bin/caras`) antes de colocar paneles; la franja de 0,33 de las primeras recetas le tapaba la boca.

**Why:** Pablo espera coherencia entre los reels del cliente y no quiere repetir instrucciones.
**How to apply:** replicar estas convenciones sin preguntar; con dudas sobre el copy del CTA, preguntar. Relacionado: [[audio-musica-discreta]], [[subtitulos-cuadrados]].

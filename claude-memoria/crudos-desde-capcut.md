---
name: crudos-desde-capcut
description: Pablo monta en CapCut y exporta a ~/Movies/CapCut; no copia los crudos al proyecto
metadata:
  type: project
---

Los crudos ya cortados salen de CapCut a `~/Movies/CapCut/<nombre>.mov`. Pablo **no los copia** a `crudos/` ("así no lo tengo que copiar dos veces"), así que si pide editar un reel y no está en `crudos/`, hay que buscarlo ahí antes de preguntar. El nombre que dice puede no ser exacto (dijo "autoomatizarchat" y el archivo era `autoomatizarchat.mov`, con doble o).

El pipeline acepta rutas absolutas: `npm run crudo -- ~/Movies/CapCut/X.mov ...` y deja todo en `public/generated/X/`.

Reexporta con frecuencia tras retocar el corte. Si solo ha quitado silencios, la numeración de palabras no cambia y la revisión sigue valiendo: hay que comparar las dos transcripciones con difflib y **recalcular solo las marcas `@` internas** (chips, terminal, checklist), que van en segundos. Si ha cortado habla, cambia la numeración y hay que remapear todas las anclas.

**Why:** buscar en `crudos/` y no encontrarlo hace perder un turno preguntando, y renderizar con las marcas `@` viejas descoloca los gráficos respecto a la voz (en el reel 0925 la línea del "x27" se iba tres décimas).
**How to apply:** ante un nombre que no está en `crudos/`, mirar `~/Movies/CapCut` antes de preguntar. Tras una reexportación, diff de transcripciones y recalcular las `@`. Relacionado: [[cliente-dv-fit]], [[audio-musica-discreta]].

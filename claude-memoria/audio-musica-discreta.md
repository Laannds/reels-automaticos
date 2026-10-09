---
name: audio-musica-discreta
description: Pablo quiere música y efectos muy por debajo de su voz; música ~-30 dB y efectos ≥15 dB bajo la voz
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 004b1b5f-9f81-49b4-9e83-49acfea0057d
  modified: 2026-09-22T00:00:00.000Z
---

La voz manda. Música y efectos tienen que quedar muy por debajo. Historial:
- DV_SP3 (2026-09-11): con MUSICA_DB -9 pidió "bajarla un poco" → -12.
- 30apps (2026-09-14): con -12 dijo que música y efectos se oían "casi más que mi voz" y que había que bajarlos "mucho". Medido: música a -20 dB de la voz mientras habla y golpes de los titulares a solo -4,5 dB. Se dejó MUSICA_DB = -22 (música ≈ -30 dB bajo la voz) y GANANCIA_SFX = 0,32 en ReelCrudo.tsx (efectos -10 dB; los más fuertes quedan entre -14 y -18 dB).

- Calidad de voz (2026-09-14): Pablo notó que la voz perdía "muchísima calidad". Causa: el reductor de ruido iba fijo en afftdn nf=-25 dB cuando el ruido real de sus grabaciones está en -52; se comía 7-10 dB de todo lo que hay por encima de 1 kHz (voz apagada). Ahora el nf se mide en cada crudo, la reducción es moderada (nr=8), la compresión suave y la ganancia fija. Resultado: espectro igual al del crudo (±0,5 dB).

- Voz INTACTA (2026-09-15, DV_SP_3): Pablo pidió que la voz se quede "tal cual te lo he pasado yo", solo con fondo muy bajo. Ahora por defecto la voz no pasa por reductor, compresor ni normalización (la limpieza suave queda tras --limpiar-voz); música y efectos se colocan relativos al volumen REAL medido de la voz, y el máster solo aplica ganancia. Si la voz está grabada baja (DV_SP_3: -23,6 LUFS), el reel se queda por debajo de -14 (-15,5) porque el pico manda. Es aceptable; comprimir no.

- Voz baja en los reels propios (2026-09-22, PL_1): el crudo entraba a -21,3 LUFS y el máster solo-ganancia lo dejaba en -22,4, cinco dB por debajo del feed. Pablo pidió expresamente `--limpiar-voz`: sube a -19 LUFS y le convenció. O sea, "voz intacta" es el defecto, pero cuando el crudo viene bajo él prefiere la limpieza suave antes que entregar un reel que se oye flojo. El arreglo de raíz es grabar más arriba.

**Why:** son reels hablados. Si la música o un efecto compite con la voz, el reel se oye mal aunque técnicamente esté a -14 LUFS.
**How to apply:** nunca volver a una limpieza de voz agresiva ni a un nf fijo; para verificar, comparar el espectro por bandas del reel final con el del crudo. No subir MUSICA_DB ni GANANCIA_SFX sin que lo pida. Para comprobar el equilibrio, medir la sonoridad momentánea separando las pistas: voz, música con el mismo ducking y efectos solos (render con la mezcla en silencio). No subir de oído. Relacionado: [[subtitulos-cuadrados]], [[cliente-dv-fit]].

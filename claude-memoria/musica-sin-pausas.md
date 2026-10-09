---
name: musica-sin-pausas
description: El -22 dB de música da por hecho pausas; en un reel hablado sin parar no se oye y hay que subirla con --musica-db
metadata:
  node_type: memory
  type: feedback
  originSessionId: 0125d352-cd7f-4a28-8258-02c03082365f
  modified: 2026-10-01T00:41:10.862Z
---

El nivel por defecto de la música (-22 dB bajo la voz, más ~10 dB de ducking) está calibrado para reels con pausas. David habla sin pausas largas, así que **en sus crudos pasa siempre**: el ducking no suelta y la música es inaudible. Le ha pasado a los tres últimos (David01_Octubre 2026-10-01, Cocina_DV_3 2026-10-03, DV_Suplementos 2026-10-06); en el primero Pablo dio por hecho que no se la había puesto.

**Why:** no es un fallo del pipeline, es que el valor asume huecos donde la música sube. Antes Pablo había rechazado -12 por competir con la voz, así que el rango útil está entre medias.

**How to apply:** medir antes de afirmar nada — `volumedetect` sobre el archivo entero no la ve porque la voz domina la media; comparar `voz.wav` y `mezcla.wav` filtrando graves (`lowpass=f=70`) sí la delata. El culpable real es el sidechain, que resta 10,5 dB constantes (medido), no el nivel base. En un crudo de David, dar por hecho que hará falta `--sin-ducking` y calibrar `--musica-db` para dejar la música **~19,5 dB por debajo de la voz**: el valor exacto depende de lo bajo que venga grabado (-21 con voz a -22,2 dB; -20 con voz a -29,9; -23 con voz a -32,3). Medir siempre, no copiar el número. Los valores por defecto (-22 con ducking) no se tocan. Ver [[audio-musica-discreta]].

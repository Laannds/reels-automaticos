---
name: ritmo-lifestyle
description: "Planos de 3,5 s le parecen lentos; recortar a ~2,4 s (y ~1,7 s si solo habla a cámara)"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 0125d352-cd7f-4a28-8258-02c03082365f
  modified: 2026-09-24T11:59:24.367Z
---

En reels lifestyle mudos, los planos que llegan del cliente (~3,5 s, típico de un export de CapCut) le parecen lentos a Pablo. El ritmo que pidió: ~2,4 s por plano, y ~1,7 s cuando el plano es solo alguien hablando a cámara sin acción que sostenga el tiempo.

**Why:** se recorta en vez de acelerar el vídeo para que el movimiento siga siendo natural. Lo pidió dos veces seguidas en DV_SP_C1 (2026-09-24), la segunda señalando un plano concreto.

**How to apply:** usar `tomas` en revision.json (tramos del crudo, solo con `--sin-cortes`). Elegir el trozo donde pasa algo, no el centro del plano. Ver [[cliente-dv-fit]].

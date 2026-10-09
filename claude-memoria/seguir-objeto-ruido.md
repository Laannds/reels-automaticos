---
name: seguir-objeto-ruido
description: La pista de Vision es firme en posición pero ruidosa en tamaño y ángulo; hay que congelar el tamaño y suavizar el giro
metadata:
  node_type: memory
  type: project
  originSessionId: 0125d352-cd7f-4a28-8258-02c03082365f
  modified: 2026-10-07T13:08:24.688Z
---

Un gráfico pegado con `npm run seguir` se ve «regulero» si se usa la pista en crudo. Medido en DV_Menu (2026-10-07): la posición es firme (salto medio 0,0003) pero **el ancho oscila un 19 %** y **el ángulo pega saltos de hasta 1° por fotograma**, así que el gráfico respira y tiembla.

**Why:** esa variación de tamaño es ruido del seguidor, no movimiento real — la mano no se acerca ni se aleja de cámara.

**How to apply:** en el componente, congelar el tamaño en la **mediana de toda la pista** y pasar giro y posición por una **media móvil** (±4 y ±2 fotogramas); así se quita el temblor y se conserva la inclinación real. Dos cosas más que costaron una vuelta: (1) verificar siempre la pista dibujando la caja sobre el vídeo con `drawbox` en varios instantes, sobre todo al final — en DV_Menu el seguidor se quedó enganchado a la pared en cuanto David cerró la mano, y el gráfico tiene que irse ANTES de ese fotograma; (2) un gráfico centrado en un objeto pegado al borde del cuadro se sale de plano: hay que desplazarlo hacia dentro. Ver [[cliente-dv-fit]].

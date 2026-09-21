# Ángulo de giro de un objeto rectangular dentro de un recuadro, fotograma a
# fotograma: los bordes de un rectángulo producen gradientes en dos direcciones
# perpendiculares, así que el pico del histograma (periodo 90°) da su giro.
# Uso: angulo.py <seguir.json> <img1> <img2> ...   → JSON con un ángulo por imagen
import json, math, sys
from PIL import Image, ImageFilter
cajas = json.load(open(sys.argv[1]))
salida = []
for caja, ruta in zip(cajas, sys.argv[2:]):
    if not caja.get("caja"):
        salida.append(salida[-1] if salida else 0); continue
    x0, y0, x1, y1 = caja["caja"]
    im = Image.open(ruta).convert("L").filter(ImageFilter.GaussianBlur(1))
    W, H = im.size
    reg = im.crop((int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H)))
    w, h = reg.size; p = reg.load()
    hist = [0.0] * 90
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            gx = p[x + 1, y] - p[x - 1, y]; gy = p[x, y + 1] - p[x, y - 1]
            m = gx * gx + gy * gy
            if m < 400: continue
            hist[int(math.degrees(math.atan2(gy, gx)) % 90)] += math.sqrt(m)
    sm = [sum(hist[(k + d) % 90] * (3 - abs(d)) for d in range(-2, 3)) for k in range(90)]
    pico = max(range(90), key=lambda k: sm[k])
    salida.append(pico if pico < 45 else pico - 90)
print(json.dumps(salida))

// Seguimiento de un objeto rectangular (una pantalla de iPad/móvil) fotograma a
// fotograma con Vision, para pegarle encima un gráfico que se mueva y gire con él.
//
// Uso: rectangulos <x> <y> <img1.png> <img2.png> ...
//   x, y: punto (0-1, origen arriba-izquierda) que cae dentro del objeto en la
//         primera imagen; sirve para elegir el rectángulo correcto.
// Salida (JSON): [{ "ok": bool, "esquinas": [[x,y] ×4: sup-izq, sup-der, inf-der, inf-izq] }]
// Coordenadas 0-1 con origen ARRIBA a la izquierda.
//
// Primero detecta el rectángulo que contiene el punto; luego lo sigue con
// VNTrackRectangleRequest, que aguanta giros y perspectiva. Si el seguimiento
// se pierde, vuelve a detectar cerca de la última posición conocida.
import Foundation
import Vision
import AppKit

typealias P = [Double]
func arriba(_ p: CGPoint) -> P { [Double(p.x), 1 - Double(p.y)] }

func imagen(_ ruta: String) -> CGImage? {
    NSImage(contentsOfFile: ruta)?.cgImage(forProposedRect: nil, context: nil, hints: nil)
}

// Busca el rectángulo solo en una ventana alrededor de `cerca` (coords de
// Vision): así una lámpara o un póster no compiten con el objeto.
func detectar(_ cg: CGImage, cerca: CGPoint, ventana: CGFloat = 0.34) -> VNRectangleObservation? {
    let req = VNDetectRectanglesRequest()
    req.maximumObservations = 8
    req.minimumAspectRatio = 0.35
    req.maximumAspectRatio = 1.0
    req.minimumSize = 0.25
    req.minimumConfidence = 0.2
    req.quadratureTolerance = 45
    let ancho = ventana, alto = ventana * 9 / 16 * 1.4
    let roi = CGRect(x: max(0, cerca.x - ancho / 2), y: max(0, cerca.y - alto / 2), width: ancho, height: alto)
        .intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
    req.regionOfInterest = roi
    try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([req])
    // Los resultados vienen relativos a la ventana: se pasan a la imagen entera
    func aImagen(_ p: CGPoint) -> CGPoint { CGPoint(x: roi.minX + p.x * roi.width, y: roi.minY + p.y * roi.height) }
    let rs = (req.results ?? []).map { r -> VNRectangleObservation in
        VNRectangleObservation(requestRevision: r.requestRevision,
                               topLeft: aImagen(r.topLeft), topRight: aImagen(r.topRight),
                               bottomRight: aImagen(r.bottomRight), bottomLeft: aImagen(r.bottomLeft))
    }
    func centro(_ r: VNRectangleObservation) -> CGPoint {
        CGPoint(x: (r.topLeft.x + r.topRight.x + r.bottomRight.x + r.bottomLeft.x) / 4,
                y: (r.topLeft.y + r.topRight.y + r.bottomRight.y + r.bottomLeft.y) / 4)
    }
    func area(_ r: VNRectangleObservation) -> CGFloat {
        let p = [r.topLeft, r.topRight, r.bottomRight, r.bottomLeft]
        var a: CGFloat = 0
        for i in 0..<4 { let j = (i + 1) % 4; a += p[i].x * p[j].y - p[j].x * p[i].y }
        return abs(a) / 2
    }
    // El más grande de los cercanos al centro previsto
    return rs.filter { hypot(centro($0).x - cerca.x, centro($0).y - cerca.y) < 0.12 }.max(by: { area($0) < area($1) })
}

let args = Array(CommandLine.arguments.dropFirst())
var punto = CGPoint(x: Double(args[0])!, y: 1 - Double(args[1])!) // a coords de Vision
let rutas = Array(args.dropFirst(2))
var salida: [[String: Any]] = []
var actual: VNRectangleObservation? = nil

for ruta in rutas {
    guard let cg = imagen(ruta) else { salida.append(["ok": false]); continue }
    let obs = detectar(cg, cerca: punto)
    if let o = obs {
        actual = o
        punto = CGPoint(x: (o.topLeft.x + o.topRight.x + o.bottomRight.x + o.bottomLeft.x) / 4,
                        y: (o.topLeft.y + o.topRight.y + o.bottomRight.y + o.bottomLeft.y) / 4)
        salida.append(["ok": true, "esquinas": [arriba(o.topLeft), arriba(o.topRight), arriba(o.bottomRight), arriba(o.bottomLeft)]])
    } else {
        salida.append(["ok": false])
    }
}
let json = try! JSONSerialization.data(withJSONObject: salida)
FileHandle.standardOutput.write(json)

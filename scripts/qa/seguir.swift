// Seguimiento de un objeto (posición y tamaño) fotograma a fotograma con el
// tracker de Vision, a partir de un recuadro inicial.
//
// Uso: seguir <x0> <y0> <x1> <y1> <img1.png> <img2.png> ...
//   recuadro inicial en la primera imagen, 0-1 con origen ARRIBA a la izquierda
// Salida (JSON): [{ "ok": bool, "caja": [x0, y0, x1, y1], "confianza": n }]
import Foundation
import Vision
import AppKit

let a = Array(CommandLine.arguments.dropFirst())
let (x0, y0, x1, y1) = (Double(a[0])!, Double(a[1])!, Double(a[2])!, Double(a[3])!)
let rutas = Array(a.dropFirst(4))
// Vision usa origen ABAJO a la izquierda
var obs = VNDetectedObjectObservation(boundingBox: CGRect(x: x0, y: 1 - y1, width: x1 - x0, height: y1 - y0))
let secuencia = VNSequenceRequestHandler()
var salida: [[String: Any]] = []
for ruta in rutas {
    guard let cg = NSImage(contentsOfFile: ruta)?.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        salida.append(["ok": false]); continue
    }
    let req = VNTrackObjectRequest(detectedObjectObservation: obs)
    req.trackingLevel = .accurate
    try? secuencia.perform([req], on: cg)
    if let r = req.results?.first as? VNDetectedObjectObservation {
        obs = r
        let b = r.boundingBox
        salida.append(["ok": r.confidence > 0.2, "caja": [b.minX, 1 - b.maxY, b.maxX, 1 - b.minY], "confianza": r.confidence])
    } else {
        salida.append(["ok": false])
    }
}
FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject: salida))

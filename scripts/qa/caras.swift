// Detector de caras para el control de calidad (scripts/qa-reel.mjs).
// Usa el framework Vision de macOS: local, gratis y sin descargar modelos.
//
// Uso: caras <imagen1.png> <imagen2.png> ...
// Salida (stdout, JSON): { "<ruta>": [{ "x", "y", "w", "h", "tipo" }] }
// Coordenadas normalizadas 0-1 con origen ARRIBA a la izquierda (Vision las da
// con origen abajo; aquí se voltean para que casen con las del render).
//
// Si no hay cara pero sí una persona (planos de perfil, que el detector de
// caras suele perder), se estima la cabeza como la parte alta de su silueta:
// tipo "estimada", para que el QA la trate con más margen.
import Foundation
import Vision
import AppKit

struct Caja: Codable { let x: Double; let y: Double; let w: Double; let h: Double; let tipo: String }

func cajas(_ ruta: String) -> [Caja] {
    guard let img = NSImage(contentsOfFile: ruta),
          let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { return [] }
    let caras = VNDetectFaceRectanglesRequest()
    let personas = VNDetectHumanRectanglesRequest()
    personas.upperBodyOnly = false
    let h = VNImageRequestHandler(cgImage: cg, options: [:])
    try? h.perform([caras, personas])

    let detectadas = (caras.results ?? []).filter { $0.confidence > 0.5 }
    if !detectadas.isEmpty {
        return detectadas.map { r in
            let b = r.boundingBox
            // La caja de Vision va de cejas a barbilla: se amplía un 25% hacia
            // arriba para cubrir frente y pelo, que también "son la cara" al
            // taparlas con un rótulo.
            let extra = b.height * 0.25
            return Caja(x: b.minX, y: 1 - b.maxY - extra, w: b.width, h: b.height + extra, tipo: "cara")
        }
    }
    return (personas.results ?? []).filter { $0.confidence > 0.5 }.map { r in
        let b = r.boundingBox
        // Cabeza ≈ 16% superior de la silueta, centrada y algo más estrecha
        let alto = b.height * 0.16
        let ancho = min(b.width, alto * 1.1 * 16 / 9)
        return Caja(x: b.midX - ancho / 2, y: 1 - b.maxY, w: ancho, h: alto, tipo: "estimada")
    }
}

var salida: [String: [Caja]] = [:]
for ruta in CommandLine.arguments.dropFirst() { salida[ruta] = cajas(ruta) }
let json = try! JSONEncoder().encode(salida)
FileHandle.standardOutput.write(json)

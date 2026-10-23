// OCR a scanned price-list PDF with macOS PDFKit + Vision. usage: swift ocr_pdf.swift <in.pdf> <out.txt>
import Foundation
import PDFKit
import Vision
import AppKit
let a = CommandLine.arguments
guard let doc = PDFDocument(url: URL(fileURLWithPath: a[1])) else { exit(1) }
var out = ""
for i in 0..<doc.pageCount {
    guard let page = doc.page(at: i) else { continue }
    let box = page.bounds(for: .mediaBox); let s: CGFloat = 3
    let img = NSImage(size: NSSize(width: box.width * s, height: box.height * s))
    img.lockFocus(); NSColor.white.set(); NSRect(origin: .zero, size: img.size).fill()
    let ctx = NSGraphicsContext.current!.cgContext; ctx.scaleBy(x: s, y: s); page.draw(with: .mediaBox, to: ctx); img.unlockFocus()
    guard let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
    let req = VNRecognizeTextRequest(); req.recognitionLevel = .accurate; req.usesLanguageCorrection = false
    try? VNImageRequestHandler(cgImage: cg).perform([req])
    // group observations into lines by y
    var obs = (req.results ?? []).compactMap { o -> (CGFloat, CGFloat, String)? in
        guard let t = o.topCandidates(1).first?.string else { return nil }; return (o.boundingBox.midY, o.boundingBox.minX, t) }
    obs.sort { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 > $1.0 }
    var lines: [[(CGFloat, CGFloat, String)]] = []
    for o in obs { if let l = lines.last, abs(l[0].0 - o.0) < 0.006 { lines[lines.count-1].append(o) } else { lines.append([o]) } }
    out += "=== page \(i+1)\n"
    for l in lines { out += l.sorted { $0.1 < $1.1 }.map { $0.2 }.joined(separator: " | ") + "\n" }
}
try! out.write(toFile: a[2], atomically: true, encoding: .utf8)
print("pages", doc.pageCount)

import Foundation
import Vision
// extract <list.txt> <out.bin>: one path per line -> float32 rows (D values each); "ok.txt" lists rows written
let paths = try String(contentsOfFile: CommandLine.arguments[1]).split(separator: "\n").map(String.init)
let out = FileHandle(forWritingAtPath: { FileManager.default.createFile(atPath: CommandLine.arguments[2], contents: nil); return CommandLine.arguments[2] }())!
var ok = [String]()
var dim = 0
let t0 = Date()
for (i, p) in paths.enumerated() {
    autoreleasepool {
        let req = VNGenerateImageFeaturePrintRequest()
        req.imageCropAndScaleOption = .scaleFill
        do {
            try VNImageRequestHandler(url: URL(fileURLWithPath: p)).perform([req])
            guard let fp = req.results?.first as? VNFeaturePrintObservation, fp.elementType == .float else { return }
            dim = fp.elementCount
            out.write(fp.data)
            ok.append(p)
        } catch { FileHandle.standardError.write("skip \(p): \(error)\n".data(using: .utf8)!) }
    }
    if i % 1000 == 0 { print(i, Int(Date().timeIntervalSince(t0)), "s"); fflush(stdout) }
}
try ok.joined(separator: "\n").write(toFile: CommandLine.arguments[2] + ".paths", atomically: true, encoding: .utf8)
print("done", ok.count, "dim", dim)

import CoreML
import Foundation
import Vision

// predict <model.mlmodel> <img>... -> JSON line per image: {"file":..,"top":[[label,p],...5]}
let modelURL = URL(fileURLWithPath: CommandLine.arguments[1])
let compiled = try MLModel.compileModel(at: modelURL)
let vm = try VNCoreMLModel(for: try MLModel(contentsOf: compiled))
for path in CommandLine.arguments.dropFirst(2) {
    let req = VNCoreMLRequest(model: vm)
    req.imageCropAndScaleOption = .centerCrop
    try VNImageRequestHandler(url: URL(fileURLWithPath: path)).perform([req])
    let obs = (req.results as? [VNClassificationObservation] ?? []).prefix(5)
    let top = obs.map { [$0.identifier.replacingOccurrences(of: "∕", with: "/"), String(format: "%.3f", $0.confidence)] }
    let d = try JSONSerialization.data(withJSONObject: ["file": path, "top": top])
    print(String(data: d, encoding: .utf8)!)
}

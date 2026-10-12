import CreateML
import Foundation

let base = URL(fileURLWithPath: CommandLine.arguments[1])
let train = base.appendingPathComponent("split/train")
let test = base.appendingPathComponent("split/test")
let out = base.appendingPathComponent("models/PartPhoto.mlmodel")
try? FileManager.default.createDirectory(at: base.appendingPathComponent("models"), withIntermediateDirectories: true)

var params = MLImageClassifier.ModelParameters()
params.featureExtractor = .scenePrint(revision: 2)
params.maxIterations = Int(CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "60") ?? 60
params.augmentationOptions = [.crop, .exposure]
let t0 = Date()
let model = try MLImageClassifier(trainingData: .labeledDirectories(at: train), parameters: params)
print("trained in", Int(Date().timeIntervalSince(t0)), "s")
print("train accuracy", 1 - model.trainingMetrics.classificationError)
print("validation accuracy", 1 - model.validationMetrics.classificationError)
let ev = model.evaluation(on: .labeledDirectories(at: test))
print("TEST accuracy (unseen cases)", 1 - ev.classificationError)
try model.write(to: out, metadata: MLModelMetadata(author: "mrm", shortDescription: "Merimen photo item name", version: "1"))
print("saved", out.path)

import Accelerate
import Foundation
// softmax <feats.bin> <meta.tsv> <out.jsonl> [epochs] — linear classifier on L2-normalised features (Adam, full batch)
let a = CommandLine.arguments
let meta = try String(contentsOfFile: a[2]).split(separator: "\n").map { $0.split(separator: "\t", omittingEmptySubsequences: false).map(String.init) }
let raw = try Data(contentsOf: URL(fileURLWithPath: a[1]))
let n = meta.count, D = raw.count / 4 / n
let epochs = a.count > 4 ? Int(a[4])! : 300
var X = [Float](repeating: 0, count: n * D)
_ = X.withUnsafeMutableBytes { raw.copyBytes(to: $0) }
for i in 0..<n {
    var s: Float = 0
    X.withUnsafeBufferPointer { vDSP_svesq($0.baseAddress! + i * D, 1, &s, vDSP_Length(D)) }
    var inv = 1 / max(sqrt(s), 1e-9)
    X.withUnsafeMutableBufferPointer { vDSP_vsmul($0.baseAddress! + i * D, 1, &inv, $0.baseAddress! + i * D, 1, vDSP_Length(D)) }
}
let tr = (0..<n).filter { meta[$0][3] == "train" }
let qs = (0..<n).filter { meta[$0][3] != "train" }
let labels = Array(Set(tr.map { meta[$0][0] })).sorted()
let li = Dictionary(uniqueKeysWithValues: labels.enumerated().map { ($1, $0) })
let C = labels.count, N = tr.count
func rows(_ ids: [Int]) -> [Float] { var M = [Float](repeating: 0, count: ids.count * D); for (r, i) in ids.enumerated() { for d in 0..<D { M[r * D + d] = X[i * D + d] * 10 } }; return M }
let XT = rows(tr)
let y = tr.map { li[meta[$0][0]]! }
var W = [Float](repeating: 0, count: D * C), b = [Float](repeating: 0, count: C)
var mW = W, vW = W, mb = b, vb = b
let lr: Float = 0.01, wd: Float = 1e-4, b1: Float = 0.9, b2: Float = 0.999
var L = [Float](repeating: 0, count: N * C)
func forward(_ M: [Float], _ m: Int) -> [Float] {
    var Z = [Float](repeating: 0, count: m * C)
    cblas_sgemm(CblasRowMajor, CblasNoTrans, CblasNoTrans, Int32(m), Int32(C), Int32(D), 1, M, Int32(D), W, Int32(C), 0, &Z, Int32(C))
    for r in 0..<m {
        var mx: Float = -1e30
        for c in 0..<C { Z[r * C + c] += b[c]; mx = max(mx, Z[r * C + c]) }
        var s: Float = 0
        for c in 0..<C { Z[r * C + c] = exp(Z[r * C + c] - mx); s += Z[r * C + c] }
        for c in 0..<C { Z[r * C + c] /= s }
    }
    return Z
}
for ep in 1...epochs {
    L = forward(XT, N)
    var loss: Float = 0
    for r in 0..<N { loss -= log(max(L[r * C + y[r]], 1e-9)); L[r * C + y[r]] -= 1 }
    var gW = [Float](repeating: 0, count: D * C)
    cblas_sgemm(CblasRowMajor, CblasTrans, CblasNoTrans, Int32(D), Int32(C), Int32(N), 1 / Float(N), XT, Int32(D), L, Int32(C), 0, &gW, Int32(C))
    var gb = [Float](repeating: 0, count: C)
    for r in 0..<N { for c in 0..<C { gb[c] += L[r * C + c] / Float(N) } }
    let t = Float(ep)
    for i in 0..<(D * C) {
        let g = gW[i] + wd * W[i]
        mW[i] = b1 * mW[i] + (1 - b1) * g; vW[i] = b2 * vW[i] + (1 - b2) * g * g
        W[i] -= lr * (mW[i] / (1 - pow(b1, t))) / (sqrt(vW[i] / (1 - pow(b2, t))) + 1e-8)
    }
    for c in 0..<C {
        mb[c] = b1 * mb[c] + (1 - b1) * gb[c]; vb[c] = b2 * vb[c] + (1 - b2) * gb[c] * gb[c]
        b[c] -= lr * (mb[c] / (1 - pow(b1, t))) / (sqrt(vb[c] / (1 - pow(b2, t))) + 1e-8)
    }
    if ep % 50 == 0 { print("epoch", ep, "loss", loss / Float(N)); fflush(stdout) }
}
let P = forward(rows(qs), qs.count)
FileManager.default.createFile(atPath: a[3], contents: nil)
let fh = FileHandle(forWritingAtPath: a[3])!
for (r, i) in qs.enumerated() {
    let order = (0..<C).sorted { P[r * C + $0] > P[r * C + $1] }.prefix(5)
    let obj: [String: Any] = ["i": i, "label": meta[i][0], "cid": meta[i][1], "seq": meta[i][2],
                              "top": order.map { [labels[$0], String(format: "%.3f", P[r * C + $0])] }]
    fh.write(try JSONSerialization.data(withJSONObject: obj)); fh.write("\n".data(using: .utf8)!)
}
// save model: labels + W + b
try labels.joined(separator: "\n").write(toFile: "models/softmax.labels", atomically: true, encoding: .utf8)
try W.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: URL(fileURLWithPath: "models/softmax.W"))
try b.withUnsafeBufferPointer { Data(buffer: $0) }.write(to: URL(fileURLWithPath: "models/softmax.b"))
print("classes", C, "train", N, "queries", qs.count)

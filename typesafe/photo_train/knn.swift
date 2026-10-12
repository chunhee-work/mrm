import Accelerate
import Foundation
// knn <feats.bin> <meta.tsv> <out.jsonl> [k]
// meta.tsv rows align with feats rows: label \t cid \t seq \t role(train|test|query)
let a = CommandLine.arguments
let meta = try String(contentsOfFile: a[2]).split(separator: "\n").map { $0.split(separator: "\t", omittingEmptySubsequences: false).map(String.init) }
let raw = try Data(contentsOf: URL(fileURLWithPath: a[1]))
let n = meta.count, D = raw.count / 4 / n
let k = a.count > 4 ? Int(a[4])! : 10
var X = [Float](repeating: 0, count: n * D)
_ = X.withUnsafeMutableBytes { raw.copyBytes(to: $0) }
for i in 0..<n {  // L2 normalise
    var s: Float = 0
    X.withUnsafeBufferPointer { vDSP_svesq($0.baseAddress! + i * D, 1, &s, vDSP_Length(D)) }
    var inv = 1 / max(sqrt(s), 1e-9)
    X.withUnsafeMutableBufferPointer { vDSP_vsmul($0.baseAddress! + i * D, 1, &inv, $0.baseAddress! + i * D, 1, vDSP_Length(D)) }
}
let tr = (0..<n).filter { meta[$0][3] == "train" }
let qs = (0..<n).filter { meta[$0][3] != "train" }
var T = [Float](repeating: 0, count: tr.count * D)
for (j, i) in tr.enumerated() { for d in 0..<D { T[j * D + d] = X[i * D + d] } }
FileManager.default.createFile(atPath: a[3], contents: nil)
let fh = FileHandle(forWritingAtPath: a[3])!
let B = 256
var start = 0
while start < qs.count {
    let qb = Array(qs[start..<min(start + B, qs.count)])
    var Q = [Float](repeating: 0, count: qb.count * D)
    for (r, i) in qb.enumerated() { for d in 0..<D { Q[r * D + d] = X[i * D + d] } }
    var S = [Float](repeating: 0, count: qb.count * tr.count)
    cblas_sgemm(CblasRowMajor, CblasNoTrans, CblasTrans, Int32(qb.count), Int32(tr.count), Int32(D), 1, Q, Int32(D), T, Int32(D), 0, &S, Int32(tr.count))
    for (r, i) in qb.enumerated() {
        let row = S[(r * tr.count)..<((r + 1) * tr.count)]
        let top = row.indices.sorted { row[$0] > row[$1] }.prefix(k)
        var votes = [String: Float]()
        var nb = [[String]]()
        for t in top {
            let j = t - r * tr.count
            let lab = meta[tr[j]][0]
            votes[lab, default: 0] += pow(max(row[t], 0), 4)
            if nb.count < 3 { nb.append([lab, meta[tr[j]][1], String(format: "%.3f", row[t])]) }
        }
        let tot = votes.values.reduce(0, +)
        let ranked = votes.sorted { $0.value > $1.value }.prefix(5).map { [$0.key, String(format: "%.3f", $0.value / max(tot, 1e-9))] }
        let obj: [String: Any] = ["i": i, "label": meta[i][0], "cid": meta[i][1], "seq": meta[i][2], "top": ranked, "nn": nb]
        fh.write(try JSONSerialization.data(withJSONObject: obj)); fh.write("\n".data(using: .utf8)!)
    }
    start += B
}
print("queries", qs.count, "train", tr.count, "dim", D)

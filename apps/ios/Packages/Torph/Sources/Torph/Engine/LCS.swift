import Foundation

enum LCS {
    /// Longest common subsequence as paired indices. Walked forwards so ties go to the
    /// earliest match — backwards, a repeated word flies across the block.
    static func indices<T: Equatable>(_ a: [T], _ b: [T]) -> ([Int], [Int]) {
        let m = a.count
        let n = b.count
        if m == 0 || n == 0 { return ([], []) }
        // dp[i][j] = length of the LCS of a[i..] and b[j..]
        var dp = [[Int]](repeating: [Int](repeating: 0, count: n + 1), count: m + 1)
        for i in stride(from: m - 1, through: 0, by: -1) {
            for j in stride(from: n - 1, through: 0, by: -1) {
                dp[i][j] = a[i] == b[j] ? dp[i + 1][j + 1] + 1 : max(dp[i + 1][j], dp[i][j + 1])
            }
        }

        var ai: [Int] = []
        var bi: [Int] = []
        var i = 0
        var j = 0
        while i < m && j < n {
            if a[i] == b[j] {
                ai.append(i)
                bi.append(j)
                i += 1
                j += 1
            } else if dp[i + 1][j] >= dp[i][j + 1] {
                i += 1
            } else {
                j += 1
            }
        }
        return (ai, bi)
    }
}

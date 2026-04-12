import Foundation
import OSLog

actor MessagePoller {
    private let logger = Logger(subsystem: "com.trythumos.app", category: "poller")
    let interval: TimeInterval
    let maxSilentPolls: Int?
    let maxDuration: TimeInterval

    init(
        interval: TimeInterval = 2,
        maxSilentPolls: Int? = 3,
        maxDuration: TimeInterval = 120
    ) {
        self.interval = interval
        self.maxSilentPolls = maxSilentPolls
        self.maxDuration = maxDuration
    }

    /// Polls until stopped. `fetch` returns true if new messages arrived, false if empty.
    /// Stops after maxSilentPolls consecutive empties, maxDuration elapsed, or Task cancelled.
    func poll(fetch: @escaping () async throws -> Bool) async {
        let startTime = Date()
        var consecutiveEmpties = 0

        while !Task.isCancelled {
            if Date().timeIntervalSince(startTime) >= maxDuration {
                logger.debug("MessagePoller: max duration reached")
                return
            }

            do {
                let hasNew = try await fetch()
                if hasNew {
                    consecutiveEmpties = 0
                } else {
                    consecutiveEmpties += 1
                    if let max = maxSilentPolls, consecutiveEmpties >= max {
                        logger.debug("MessagePoller: \(max) silent polls, stopping")
                        return
                    }
                }
            } catch {
                logger.error("MessagePoller fetch error: \(error.localizedDescription, privacy: .public)")
                // Continue polling on error
            }

            try? await Task.sleep(for: .seconds(interval))
            guard !Task.isCancelled else { return }
        }
    }
}

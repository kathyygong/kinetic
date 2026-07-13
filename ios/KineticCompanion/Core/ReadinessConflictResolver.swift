import Foundation

struct ReadinessMergeResult: Equatable {
    var entryToWrite: ReadinessEntry?
    var conflict: SyncConflict
    var status: DailySyncStatus
}

enum ReadinessConflictResolver {
    static func merge(
        existing: ReadinessEntry?,
        incomingHealthKit: ReadinessEntry
    ) -> ReadinessMergeResult {
        guard let existing else {
            var entry = incomingHealthKit
            entry.source = .healthkit
            return ReadinessMergeResult(
                entryToWrite: entry,
                conflict: .none,
                status: .synced
            )
        }

        switch existing.source {
        case .manual, .none:
            return ReadinessMergeResult(
                entryToWrite: nil,
                conflict: .manualWins,
                status: .skippedExistingUserEntry
            )
        case .appleHealthCsv:
            return ReadinessMergeResult(
                entryToWrite: nil,
                conflict: .csvWins,
                status: .skippedExistingUserEntry
            )
        case .healthkit:
            guard incomingHealthKit.updatedAt > existing.updatedAt else {
                return ReadinessMergeResult(
                    entryToWrite: nil,
                    conflict: .staleHealthkit,
                    status: .skippedExistingUserEntry
                )
            }

            var merged = existing
            if let sleepHours = incomingHealthKit.sleepHours {
                merged.sleepHours = sleepHours
            }
            if let hrv = incomingHealthKit.hrv {
                merged.hrv = hrv
            }
            if let restingHeartRate = incomingHealthKit.restingHeartRate {
                merged.restingHeartRate = restingHeartRate
            }
            merged.source = .healthkit
            merged.updatedAt = incomingHealthKit.updatedAt

            return ReadinessMergeResult(
                entryToWrite: merged,
                conflict: .healthkitUpdate,
                status: .synced
            )
        case .demo, .mixed:
            return ReadinessMergeResult(
                entryToWrite: nil,
                conflict: .manualWins,
                status: .skippedExistingUserEntry
            )
        }
    }
}

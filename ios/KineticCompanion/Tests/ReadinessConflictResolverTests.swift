import XCTest
@testable import KineticCompanion

final class ReadinessConflictResolverTests: XCTestCase {
    func testHealthKitWritesWhenNoExistingEntry() {
        let incoming = entry(source: .healthkit, updatedAt: Date())
        let result = ReadinessConflictResolver.merge(
            existing: nil,
            incomingHealthKit: incoming
        )

        XCTAssertEqual(result.conflict, .none)
        XCTAssertEqual(result.status, .synced)
        XCTAssertEqual(result.entryToWrite?.source, .healthkit)
    }

    func testManualEntryWinsOverHealthKit() {
        let existing = entry(source: .manual, updatedAt: Date())
        let incoming = entry(source: .healthkit, updatedAt: Date().addingTimeInterval(60))
        let result = ReadinessConflictResolver.merge(
            existing: existing,
            incomingHealthKit: incoming
        )

        XCTAssertNil(result.entryToWrite)
        XCTAssertEqual(result.conflict, .manualWins)
        XCTAssertEqual(result.status, .skippedExistingUserEntry)
    }

    func testAppleHealthCsvWinsDuringSpike() {
        let existing = entry(source: .appleHealthCsv, updatedAt: Date())
        let incoming = entry(source: .healthkit, updatedAt: Date().addingTimeInterval(60))
        let result = ReadinessConflictResolver.merge(
            existing: existing,
            incomingHealthKit: incoming
        )

        XCTAssertNil(result.entryToWrite)
        XCTAssertEqual(result.conflict, .csvWins)
    }

    func testNewerHealthKitMergesHealthKitFields() {
        let existing = entry(source: .healthkit, updatedAt: Date(), hrv: 50)
        let incoming = entry(source: .healthkit, updatedAt: Date().addingTimeInterval(60), hrv: 55)
        let result = ReadinessConflictResolver.merge(
            existing: existing,
            incomingHealthKit: incoming
        )

        XCTAssertEqual(result.conflict, .healthkitUpdate)
        XCTAssertEqual(result.entryToWrite?.hrv, 55)
    }

    private func entry(
        source: ReadinessSource?,
        updatedAt: Date,
        hrv: Double = 52
    ) -> ReadinessEntry {
        ReadinessEntry(
            date: "2026-07-10",
            sleepHours: 7.4,
            hrv: hrv,
            restingHeartRate: 49,
            fatigueLevel: nil,
            sorenessLevel: nil,
            source: source,
            updatedAt: updatedAt
        )
    }
}

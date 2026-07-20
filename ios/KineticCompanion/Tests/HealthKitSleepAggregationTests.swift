import Foundation
import XCTest
@testable import KineticCompanion

final class HealthKitSleepAggregationTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    func testOvernightEpisodeIsAssignedInFullToWakeDay() throws {
        let dayStart = try date("2026-07-20T00:00:00Z")
        let dayEnd = try date("2026-07-21T00:00:00Z")
        let intervals = [
            DateInterval(
                start: try date("2026-07-19T20:18:00Z"),
                end: try date("2026-07-20T07:18:00Z")
            )
        ]

        let hours = HealthKitSleepAggregator.appleDisplayedDailySleepHours(
            intervalsBySource: [intervals],
            dayStart: dayStart,
            dayEnd: dayEnd,
            calendar: calendar
        )

        XCTAssertEqual(try XCTUnwrap(hours), 11, accuracy: 0.001)
    }

    func testOverlappingSourcesAndSleepStagesAreNotDoubleCounted() throws {
        let dayStart = try date("2026-07-20T00:00:00Z")
        let dayEnd = try date("2026-07-21T00:00:00Z")
        let primary = try [
            interval("2026-07-19T22:00:00Z", "2026-07-20T02:00:00Z"),
            interval("2026-07-20T02:00:00Z", "2026-07-20T06:00:00Z")
        ]
        let duplicateSource = try [
            interval("2026-07-19T22:30:00Z", "2026-07-20T01:30:00Z")
        ]

        let hours = HealthKitSleepAggregator.appleDisplayedDailySleepHours(
            intervalsBySource: [primary, duplicateSource],
            dayStart: dayStart,
            dayEnd: dayEnd,
            calendar: calendar
        )

        XCTAssertEqual(try XCTUnwrap(hours), 8, accuracy: 0.001)
    }

    func testShortAwakeningKeepsStagesInOneEpisodeWithoutCountingAwakeTime() throws {
        let dayStart = try date("2026-07-20T00:00:00Z")
        let dayEnd = try date("2026-07-21T00:00:00Z")
        let intervals = try [
            interval("2026-07-19T22:00:00Z", "2026-07-20T02:00:00Z"),
            interval("2026-07-20T02:30:00Z", "2026-07-20T06:30:00Z")
        ]

        let hours = HealthKitSleepAggregator.appleDisplayedDailySleepHours(
            intervalsBySource: [intervals],
            dayStart: dayStart,
            dayEnd: dayEnd,
            calendar: calendar
        )

        XCTAssertEqual(try XCTUnwrap(hours), 8, accuracy: 0.001)
    }

    func testAppleDisplayedTotalRoundsEachSampleToThirtySecondEpoch() throws {
        let dayStart = try date("2026-07-20T00:00:00Z")
        let dayEnd = try date("2026-07-21T00:00:00Z")
        let intervals = try [
            interval("2026-07-20T05:00:00Z", "2026-07-20T05:00:46Z"),
            interval("2026-07-20T05:00:46Z", "2026-07-20T05:01:32Z")
        ]

        let hours = HealthKitSleepAggregator.appleDisplayedDailySleepHours(
            intervalsBySource: [intervals],
            dayStart: dayStart,
            dayEnd: dayEnd,
            calendar: calendar
        )

        XCTAssertEqual(try XCTUnwrap(hours), 2.0 / 60.0, accuracy: 0.001)
    }

    func testAppleDisplayedTotalUsesOneSourceWithoutDoubleCounting() throws {
        let dayStart = try date("2026-07-20T00:00:00Z")
        let dayEnd = try date("2026-07-21T00:00:00Z")
        let primary = try [
            interval("2026-07-19T22:00:00Z", "2026-07-20T06:00:00Z")
        ]
        let duplicate = try [
            interval("2026-07-19T22:30:00Z", "2026-07-20T05:30:00Z")
        ]

        let hours = HealthKitSleepAggregator.appleDisplayedDailySleepHours(
            intervalsBySource: [primary, duplicate],
            dayStart: dayStart,
            dayEnd: dayEnd,
            calendar: calendar
        )

        XCTAssertEqual(try XCTUnwrap(hours), 8, accuracy: 0.001)
    }

    func testAllEpisodesEndingOnDayContributeToDailyTimeAsleep() throws {
        let dayStart = try date("2026-07-20T00:00:00Z")
        let dayEnd = try date("2026-07-21T00:00:00Z")
        let intervals = try [
            interval("2026-07-19T22:00:00Z", "2026-07-20T06:00:00Z"),
            interval("2026-07-20T14:00:00Z", "2026-07-20T15:30:00Z")
        ]

        let hours = HealthKitSleepAggregator.appleDisplayedDailySleepHours(
            intervalsBySource: [intervals],
            dayStart: dayStart,
            dayEnd: dayEnd,
            calendar: calendar
        )

        XCTAssertEqual(try XCTUnwrap(hours), 9.5, accuracy: 0.001)
    }

    func testExactDuplicateWithinOneSourceIsNotDoubleCounted() throws {
        let dayStart = try date("2026-07-20T00:00:00Z")
        let dayEnd = try date("2026-07-21T00:00:00Z")
        let intervals = try [
            interval("2026-07-19T22:00:00Z", "2026-07-20T06:00:00Z"),
            interval("2026-07-19T22:00:00Z", "2026-07-20T06:00:00Z")
        ]

        let hours = HealthKitSleepAggregator.appleDisplayedDailySleepHours(
            intervalsBySource: [intervals],
            dayStart: dayStart,
            dayEnd: dayEnd,
            calendar: calendar
        )

        XCTAssertEqual(try XCTUnwrap(hours), 8, accuracy: 0.001)
    }

    func testEpisodeEndingOutsideTargetDayIsExcluded() throws {
        let dayStart = try date("2026-07-20T00:00:00Z")
        let dayEnd = try date("2026-07-21T00:00:00Z")
        let intervals = try [
            interval("2026-07-18T22:00:00Z", "2026-07-19T06:00:00Z"),
            interval("2026-07-20T22:00:00Z", "2026-07-21T06:00:00Z")
        ]

        XCTAssertNil(
            HealthKitSleepAggregator.appleDisplayedDailySleepHours(
                intervalsBySource: [intervals],
                dayStart: dayStart,
                dayEnd: dayEnd,
                calendar: calendar
            )
        )
    }

    func testInvalidEpochReturnsNoValue() throws {
        let dayStart = try date("2026-07-20T00:00:00Z")
        let dayEnd = try date("2026-07-21T00:00:00Z")
        let intervals = try [
            interval("2026-07-19T22:00:00Z", "2026-07-20T06:00:00Z")
        ]

        XCTAssertNil(
            HealthKitSleepAggregator.appleDisplayedDailySleepHours(
                intervalsBySource: [intervals],
                dayStart: dayStart,
                dayEnd: dayEnd,
                calendar: calendar,
                epoch: 0
            )
        )
    }

    private func interval(_ start: String, _ end: String) throws -> DateInterval {
        DateInterval(start: try date(start), end: try date(end))
    }

    private func date(_ value: String) throws -> Date {
        try XCTUnwrap(ISO8601DateFormatter().date(from: value))
    }
}

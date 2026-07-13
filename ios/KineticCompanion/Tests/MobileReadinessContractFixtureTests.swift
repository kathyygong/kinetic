import XCTest
@testable import KineticCompanion

final class MobileReadinessContractFixtureTests: XCTestCase {
    func testSharedEnvelopesDecode() throws {
        let fixtures = try loadFixtures()

        XCTAssertEqual(fixtures.readinessEnvelope.schemaVersion, 1)
        XCTAssertFalse(fixtures.readinessEnvelope.deleted)
        XCTAssertEqual(
            fixtures.readinessEnvelope.payload?.entries["2026-07-12"]?.source,
            .healthkit
        )
        XCTAssertEqual(fixtures.healthSyncEnvelope.payload?.provider, .appleHealth)
        XCTAssertEqual(fixtures.healthSyncEnvelope.payload?.permissionState, .partial)
        XCTAssertEqual(
            fixtures.healthSyncEnvelope.payload?.dailyStatus["2026-07-12"]?.confidence,
            .moderate
        )
    }

    func testSharedTombstonesDecodeAsDeletedWithoutPayload() throws {
        let fixtures = try loadFixtures()

        XCTAssertTrue(fixtures.readinessTombstone.deleted)
        XCTAssertNil(fixtures.readinessTombstone.payload)
        XCTAssertTrue(fixtures.healthSyncTombstone.deleted)
        XCTAssertNil(fixtures.healthSyncTombstone.payload)
    }

    func testSharedConflictCasesMatchNativeResolver() throws {
        for fixture in try loadFixtures().conflictCases {
            let result = ReadinessConflictResolver.merge(
                existing: fixture.existing,
                incomingHealthKit: fixture.incoming
            )

            XCTAssertEqual(result.conflict, fixture.expected.conflict, fixture.name)
            XCTAssertEqual(result.status, fixture.expected.status, fixture.name)
            XCTAssertEqual(result.entryToWrite, fixture.expected.entryToWrite, fixture.name)
        }
    }

    private func loadFixtures() throws -> ContractFixtures {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "mobile-readiness-contract",
                withExtension: "json",
                subdirectory: "Fixtures"
            )
        )
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(ContractFixtures.self, from: Data(contentsOf: url))
    }
}

private struct ContractFixtures: Decodable {
    var readinessEnvelope: PersistedEnvelope<ReadinessLog>
    var healthSyncEnvelope: PersistedEnvelope<HealthSyncPayload>
    var readinessTombstone: PersistedEnvelope<ReadinessLog>
    var healthSyncTombstone: PersistedEnvelope<HealthSyncPayload>
    var conflictCases: [ConflictFixture]

    enum CodingKeys: String, CodingKey {
        case readinessEnvelope = "readiness_envelope"
        case healthSyncEnvelope = "health_sync_envelope"
        case readinessTombstone = "readiness_tombstone"
        case healthSyncTombstone = "health_sync_tombstone"
        case conflictCases = "conflict_cases"
    }
}

private struct ConflictFixture: Decodable {
    var name: String
    var existing: ReadinessEntry?
    var incoming: ReadinessEntry
    var expected: ExpectedMerge
}

private struct ExpectedMerge: Decodable {
    var conflict: SyncConflict
    var status: DailySyncStatus
    var entryToWrite: ReadinessEntry?

    enum CodingKeys: String, CodingKey {
        case conflict
        case status
        case entryToWrite = "entry_to_write"
    }
}

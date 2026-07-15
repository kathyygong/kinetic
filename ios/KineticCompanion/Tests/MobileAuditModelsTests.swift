import XCTest
@testable import KineticCompanion

final class MobileAuditModelsTests: XCTestCase {
    func testDecisionAuditEncodesWebQaCompatibleKeys() throws {
        let envelope = MobileAuditEnvelope(
            at: Date(timeIntervalSince1970: 0),
            properties: MobileDecisionValidatedAudit(
                outcome: .success,
                selectedAction: .modify,
                confidenceBucket: .moderate,
                calendarState: .conflict,
                readinessState: .caution,
                deterministicValidation: .passed,
                hasCalendarWarning: true,
                hasRecoveryWarning: false,
                aiAssisted: true,
                latencyMs: 680
            )
        )

        let payload = try encodedJson(envelope)

        XCTAssertEqual(payload["name"] as? String, "mobile_decision_validated")
        let properties = try XCTUnwrap(payload["properties"] as? [String: Any])
        XCTAssertEqual(properties["platform"] as? String, "ios")
        XCTAssertEqual(properties["selected_action"] as? String, "modify")
        XCTAssertEqual(properties["calendar_state"] as? String, "conflict")
        XCTAssertEqual(properties["deterministic_validation"] as? String, "passed")
        XCTAssertEqual(properties["ai_assisted"] as? Bool, true)
        assertNoSensitiveKeys(properties)
    }

    func testSyncAuditEncodesCoarseStateOnly() throws {
        let envelope = MobileAuditEnvelope(
            at: Date(timeIntervalSince1970: 0),
            properties: MobileCompanionSyncAudit(
                syncType: .healthkitReadiness,
                outcome: .partial,
                permissionState: .partial,
                backgroundDelivery: .enabled,
                coverageBucket: .partial,
                confidenceBucket: .moderate,
                conflict: SyncConflict.none,
                latencyMs: 420
            )
        )

        let payload = try encodedJson(envelope)

        XCTAssertEqual(payload["name"] as? String, "mobile_companion_sync_completed")
        let properties = try XCTUnwrap(payload["properties"] as? [String: Any])
        XCTAssertEqual(properties["sync_type"] as? String, "healthkit_readiness")
        XCTAssertEqual(properties["permission_state"] as? String, "partial")
        XCTAssertEqual(properties["coverage_bucket"] as? String, "partial")
        XCTAssertEqual(properties["confidence_bucket"] as? String, "moderate")
        assertNoSensitiveKeys(properties)
    }

    func testAllMobileEventNamesMatchWebContract() {
        XCTAssertEqual(
            Set(MobileAuditEventName.allCases.map(\.rawValue)),
            Set([
                "mobile_companion_sync_completed",
                "mobile_decision_validated",
                "mobile_intake_lifecycle",
                "mobile_checkin_synced"
            ])
        )
    }

    private func encodedJson<Payload: Encodable>(_ payload: Payload) throws -> [String: Any] {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(payload)
        let object = try JSONSerialization.jsonObject(with: data)
        return try XCTUnwrap(object as? [String: Any])
    }

    private func assertNoSensitiveKeys(
        _ properties: [String: Any],
        file: StaticString = #filePath,
        line: UInt = #line
    ) {
        let blocked = [
            "note",
            "source_text",
            "calendar_text",
            "event_text",
            "sleep",
            "hrv",
            "resting_hr",
            "email",
            "uid",
            "token",
            "raw"
        ]
        for key in properties.keys {
            XCTAssertFalse(
                blocked.contains { key.localizedCaseInsensitiveContains($0) },
                "Sensitive key \(key) should not be encoded in mobile audit payloads",
                file: file,
                line: line
            )
        }
    }
}

import XCTest
@testable import KineticCompanion

final class MobileAuditModelsTests: XCTestCase {
    func testDecisionAuditEncodesWebQaCompatibleKeys() throws {
        let envelope = MobileAuditEnvelope(
            at: Date(timeIntervalSince1970: 0),
            properties: MobileDecisionValidatedAudit(
                outcome: .success,
                decisionSource: .live,
                failureState: .none,
                cacheState: .fresh,
                availabilitySource: .calendar,
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
        XCTAssertEqual(properties["decision_source"] as? String, "live")
        XCTAssertEqual(properties["failure_state"] as? String, "none")
        XCTAssertEqual(properties["cache_state"] as? String, "fresh")
        XCTAssertEqual(properties["availability_source"] as? String, "calendar")
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
                "mobile_checkin_synced",
                "mobile_pattern_result_lifecycle",
                "mobile_foundation_lifecycle",
                "mobile_plan_lifecycle"
            ])
        )
    }

    func testPlanLifecycleAuditUsesOnlyBoundedContractVocabulary() throws {
        let envelope = MobileAuditEnvelope(properties: MobilePlanLifecycleAudit(
            action: .move, outcome: .success, result: .commitReady,
            mutationState: .applied, deterministicValidation: .passed,
            failureState: .none, versionDelta: 1, affectedCount: 1,
            completedPreserved: 3, latencyMs: 120
        ))
        let payload = try encodedJson(envelope)
        XCTAssertEqual(payload["name"] as? String, "mobile_plan_lifecycle")
        let properties = try XCTUnwrap(payload["properties"] as? [String: Any])
        XCTAssertEqual(Set(properties.keys), ["platform", "action", "outcome", "result", "mutation_state", "deterministic_validation", "failure_state", "version_delta", "affected_count", "completed_preserved", "latency_ms"])
        XCTAssertEqual(properties["action"] as? String, "move")
        XCTAssertEqual(properties["result"] as? String, "commit_ready")
        assertNoSensitiveKeys(properties)
    }

    func testFoundationAuditUsesOnlyBoundedContractVocabulary() throws {
        let envelope = MobileAuditEnvelope(
            properties: MobileFoundationLifecycleAudit(
                action: .onboarding,
                outcome: .deferred,
                accountState: .active,
                permissionState: .partial,
                migrationState: .completed,
                latencyMs: 120
            )
        )
        let payload = try encodedJson(envelope)
        XCTAssertEqual(payload["name"] as? String, "mobile_foundation_lifecycle")
        let properties = try XCTUnwrap(payload["properties"] as? [String: Any])
        XCTAssertEqual(Set(properties.keys), ["platform", "action", "outcome", "account_state", "permission_state", "migration_state", "latency_ms"])
        assertNoSensitiveKeys(properties)
    }

    func testPatternResultAuditUsesOnlyContractVocabulary() throws {
        let envelope = MobileAuditEnvelope(
            properties: MobilePatternResultLifecycleAudit(
                action: .confirmed,
                outcome: .success,
                patternFamily: .heavyCalendarMisses,
                resultKind: .scoringPreferenceReview,
                mutationState: .applied,
                deterministicValidation: .passed,
                source: .deterministic
            )
        )
        let data = try JSONEncoder().encode(envelope)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
        XCTAssertEqual(object["name"] as? String, "mobile_pattern_result_lifecycle")
        let properties = try XCTUnwrap(object["properties"] as? [String: Any])
        XCTAssertEqual(
            Set(properties.keys),
            [
                "platform", "action", "outcome", "pattern_family", "result_kind",
                "mutation_state", "deterministic_validation", "source"
            ]
        )
        assertNoSensitiveKeys(properties)
    }

    func testIntakeAuditUsesOnlyFixedPrivacySafeVocabulary() throws {
        let envelope = MobileAuditEnvelope(
            properties: MobileIntakeLifecycleAudit(
                action: .routed,
                outcome: .success,
                route: .reviewDraft,
                draftKind: .availability,
                failureState: .none,
                parserSource: .deterministic,
                mutationState: .reviewOnly,
                deterministicValidation: .notRun,
                latencyMs: 512
            )
        )
        let data = try JSONEncoder().encode(envelope)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: data) as? [String: Any]
        )
        let properties = try XCTUnwrap(object["properties"] as? [String: Any])
        XCTAssertEqual(
            Set(properties.keys),
            [
                "platform", "action", "outcome", "route", "draft_kind",
                "failure_state", "parser_source", "mutation_state",
                "deterministic_validation", "latency_ms"
            ]
        )
        let serialized = String(decoding: data, as: UTF8.self)
        for forbidden in [
            "text", "note", "source_text", "generated_prose", "uid", "email",
            "token", "sleep_hours", "hrv", "fatigue", "soreness", "pain_severity"
        ] {
            XCTAssertFalse(serialized.contains("\"\(forbidden)\""))
        }
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

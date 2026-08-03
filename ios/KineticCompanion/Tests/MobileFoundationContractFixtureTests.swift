import XCTest
@testable import KineticCompanion

final class MobileFoundationContractFixtureTests: XCTestCase {
    private struct Fixture: Decodable {
        var schemaVersion: String
        var activeState: MobileFoundationState
        var newRunnerState: MobileFoundationState
        enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", activeState = "active_state", newRunnerState = "new_runner_state" }
    }

    func testCanonicalFoundationFixtureParity() throws {
        let fixture: Fixture = try decodeFixture("mobile-foundation-contract")
        XCTAssertEqual(fixture.schemaVersion, mobileFoundationSchema)
        XCTAssertNoThrow(try fixture.activeState.validated())
        XCTAssertNoThrow(try fixture.newRunnerState.validated())
        XCTAssertTrue(fixture.activeState.settings.eveningCheckinReminder.enabled)
        XCTAssertEqual(fixture.activeState.migration.source, .kineticCompanionV1)
        let activeData = try JSONEncoder().encode(fixture.activeState)
        XCTAssertEqual(try MobileFoundationState.decodeStrict(activeData), fixture.activeState)
    }

    func testStrictFoundationDecoderAndOnboardingAnswersFailClosed() throws {
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(MobileFoundationState.newRunner)) as? [String: Any])
        object["email"] = "forbidden@example.com"
        XCTAssertThrowsError(try MobileFoundationState.decodeStrict(JSONSerialization.data(withJSONObject: object)))
        XCTAssertNoThrow(try MobileOnboardingAnswers(raceDistance: "10k", targetDate: "2099-10-01", experience: "intermediate", weeklyMileage: 20, preferredDays: ["tue", "thu", "sat"]).validated())
        XCTAssertThrowsError(try MobileOnboardingAnswers(raceDistance: "ultra", targetDate: "2020-01-01", experience: "expert", weeklyMileage: -1, preferredDays: ["tue", "tue"]).validated())
    }

    func testFoundationRejectsUnsafeStateAndBuildsCompleteDeletionBoundary() throws {
        var state = MobileFoundationState.newRunner
        state.settings.eveningCheckinReminder.enabled = true
        XCTAssertThrowsError(try state.validated())
        var completed = MobileFoundationState.newRunner
        completed.onboarding = .init(status: .completed, completedSteps: MobileOnboardingStep.allCases, deferredPermissions: [])
        completed.route = .today
        let deletion = try completed.requestingAccountDeletion(at: "2026-08-03T17:00:00Z")
        XCTAssertEqual(Set(deletion.deletion.pendingDomains), Set(MobileFoundationDomain.allCases))
        XCTAssertFalse(deletion.settings.eveningCheckinReminder.enabled)
    }

    func testNotificationFixtureMatchesNativeDecisionEngine() throws {
        struct NotificationFixture: Decodable {
            struct Success: Decodable { var request: MobileNotificationRequest; var expectedAction: MobileNotificationAction; var expectedReason: MobileNotificationReason; enum CodingKeys: String, CodingKey { case request, expectedAction = "expected_action", expectedReason = "expected_reason" } }
            var successCases: [Success]
            enum CodingKeys: String, CodingKey { case successCases = "success_cases" }
        }
        let fixture: NotificationFixture = try decodeFixture("mobile-notification-contract")
        for item in fixture.successCases {
            let decision = try MobileNotificationContract.decide(item.request)
            XCTAssertEqual(decision.action, item.expectedAction)
            XCTAssertEqual(decision.reason, item.expectedReason)
            if decision.action == .schedule {
                XCTAssertEqual(decision.title, eveningCheckinTitle)
                XCTAssertEqual(decision.body, eveningCheckinBody)
            }
        }
    }

    private func decodeFixture<T: Decodable>(_ name: String) throws -> T {
        let url = try XCTUnwrap(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
        return try JSONDecoder().decode(T.self, from: Data(contentsOf: url))
    }
}

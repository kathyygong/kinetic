import XCTest
@testable import KineticCompanion

final class MobilePlanLifecycleContractFixtureTests: XCTestCase {
    private struct Fixture: Decodable {
        var schemaVersion: String
        var commitMoveRequest: MobilePlanLifecycleRequest
        var commitMoveResponse: MobilePlanLifecycleResponse
        enum CodingKeys: String, CodingKey {
            case schemaVersion = "schema_version"
            case commitMoveRequest = "commit_move_request"
            case commitMoveResponse = "commit_move_response"
        }
    }

    private struct GenerationFixture: Decodable {
        var schemaVersion: String
        var initialRequest: MobilePlanGenerationRequest
        var initialResponse: MobilePlanGenerationResponse
        enum CodingKeys: String, CodingKey {
            case schemaVersion = "schema_version"
            case initialRequest = "initial_request"
            case initialResponse = "initial_response"
        }
    }

    private struct SharedV2Fixture: Decodable {
        var schemaVersion: String
        var planningInputs: MobilePlanningInputs
        var accountCleanupRequest: MobileAccountCleanupRequest
        var readyReceipt: MobileAccountCleanupReceipt
        enum CodingKeys: String, CodingKey {
            case schemaVersion = "schema_version", planningInputs = "planning_inputs"
            case accountCleanupRequest = "account_cleanup_request", readyReceipt = "ready_receipt"
        }
    }

    func testCanonicalFixtureHasStrictSwiftParity() throws {
        let (fixture, object) = try loadFixture()
        XCTAssertEqual(fixture.schemaVersion, mobilePlanLifecycleSchema)
        XCTAssertEqual(fixture.commitMoveRequest.mutation.action, .move)
        XCTAssertEqual(fixture.commitMoveResponse.result, .commitReady)
        XCTAssertEqual(fixture.commitMoveResponse.commitPlan, fixture.commitMoveRequest.proposedPlan)
        XCTAssertEqual(fixture.commitMoveResponse.impact.completedWorkoutsPreserved, 1)

        let requestData = try JSONSerialization.data(withJSONObject: try XCTUnwrap(object["commit_move_request"]))
        let responseData = try JSONSerialization.data(withJSONObject: try XCTUnwrap(object["commit_move_response"]))
        XCTAssertEqual(try MobilePlanLifecycleRequest.decodeStrict(requestData), fixture.commitMoveRequest)
        XCTAssertEqual(try MobilePlanLifecycleResponse.decodeStrict(responseData), fixture.commitMoveResponse)
    }

    func testStrictBoundaryRejectsUnknownPrivacyMutationAndPersistenceDrift() throws {
        let (_, object) = try loadFixture()
        var request = try XCTUnwrap(object["commit_move_request"] as? [String: Any])
        request["email"] = "runner@example.com"
        XCTAssertThrowsError(try MobilePlanLifecycleRequest.decodeStrict(JSONSerialization.data(withJSONObject: request)))

        var response = try XCTUnwrap(object["commit_move_response"] as? [String: Any])
        response["mutation_performed"] = true
        XCTAssertThrowsError(try MobilePlanLifecycleResponse.decodeStrict(JSONSerialization.data(withJSONObject: response)))

        response = try XCTUnwrap(object["commit_move_response"] as? [String: Any])
        var persistence = try XCTUnwrap(response["persistence"] as? [String: Any])
        persistence["owner_scoped_domains"] = ["plan"]
        response["persistence"] = persistence
        XCTAssertThrowsError(try MobilePlanLifecycleResponse.decodeStrict(JSONSerialization.data(withJSONObject: response)))
    }

    func testSharedGenerationFixtureHasStrictSwiftParityAndAuthoritativeMetadata() throws {
        let (fixture, object) = try loadGenerationFixture()
        XCTAssertEqual(fixture.schemaVersion, mobilePlanGenerationSchema)
        XCTAssertEqual(fixture.initialRequest.mode, .initial)
        XCTAssertEqual(fixture.initialResponse.source, "deterministic_shared")
        XCTAssertEqual(fixture.initialResponse.weeks.last?.phase, .race)
        XCTAssertEqual(fixture.initialResponse.candidatePlan.workouts.first(where: { $0.type == .race })?.date, fixture.initialRequest.targetDate)

        let requestData = try JSONSerialization.data(withJSONObject: try XCTUnwrap(object["initial_request"]))
        let responseData = try JSONSerialization.data(withJSONObject: try XCTUnwrap(object["initial_response"]))
        XCTAssertEqual(try MobilePlanGenerationRequest.decodeStrict(requestData), fixture.initialRequest)
        XCTAssertEqual(try MobilePlanGenerationResponse.decodeStrict(responseData), fixture.initialResponse)

        let estimatedMileage = try MobilePlanGenerationRequestFactory.make(
            mode: .initial,
            context: .init(
                raceDistance: .fiveK, targetDate: "2026-09-06", experience: .beginner,
                weeklyMileage: 0, preferredDays: [.tue, .thu, .sun], personalBests: [:], goalRevision: 1
            ),
            planningDate: "2026-08-10", currentPlan: nil
        )
        XCTAssertNil(estimatedMileage.weeklyMileage)

        var response = try XCTUnwrap(object["initial_response"] as? [String: Any])
        response["email"] = "runner@example.com"
        XCTAssertThrowsError(try MobilePlanGenerationResponse.decodeStrict(JSONSerialization.data(withJSONObject: response)))
        response = try XCTUnwrap(object["initial_response"] as? [String: Any])
        var weeks = try XCTUnwrap(response["weeks"] as? [[String: Any]])
        weeks[0]["workout_ids"] = ["missing-workout"]
        response["weeks"] = weeks
        XCTAssertThrowsError(try MobilePlanGenerationResponse.decodeStrict(JSONSerialization.data(withJSONObject: response)))
    }

    func testEveryLifecycleActionBuildsAReviewableSequentialProposal() throws {
        let fixture = try loadFixture().0
        let active = fixture.commitMoveRequest.currentPlan!
        let target = active.workouts[1]
        let actions: [(MobilePlanAction, MobilePlanSnapshot)] = [
            (.move, try MobilePlanProposalBuilder.proposal(action: .move, current: active, targetWorkoutID: target.id, newDate: "2026-08-12")),
            (.shorten, try MobilePlanProposalBuilder.proposal(action: .shorten, current: active, targetWorkoutID: target.id, newDuration: 35)),
            (.replace, try MobilePlanProposalBuilder.proposal(action: .replace, current: active, targetWorkoutID: target.id, replacementType: .intervals)),
            (.skip, try MobilePlanProposalBuilder.proposal(action: .skip, current: active, targetWorkoutID: target.id)),
            (.availability, try MobilePlanProposalBuilder.proposal(action: .availability, current: active, targetWorkoutID: target.id, newDate: "2026-08-12")),
            (.preferredDay, try MobilePlanProposalBuilder.proposal(action: .preferredDay, current: active, targetWorkoutID: target.id, newDate: "2026-08-12")),
            (.pause, try MobilePlanProposalBuilder.proposal(action: .pause, current: active))
        ]
        for (action, proposal) in actions {
            XCTAssertEqual(proposal.version, active.version + 1, action.rawValue)
            XCTAssertEqual(proposal.workouts.first { $0.status == .completed }, active.workouts.first { $0.status == .completed }, action.rawValue)
            XCTAssertEqual(proposal.workouts.first { $0.type == .race }, active.workouts.first { $0.type == .race }, action.rawValue)
            let request = try MobilePlanRequestFactory.make(mode: .preview, operationID: "op-test-\(action.rawValue)", current: active, proposed: proposal, action: action, targetWorkoutID: action == .pause ? nil : target.id, priorOperation: nil)
            XCTAssertEqual(request.expectedVersion, active.version)
        }
        var draft = active; draft.status = .draft
        XCTAssertEqual(try MobilePlanProposalBuilder.proposal(action: .save, current: draft).status, .active)
        var paused = active; paused.status = .paused
        XCTAssertEqual(try MobilePlanProposalBuilder.proposal(action: .resume, current: paused).status, .active)

        XCTAssertThrowsError(try MobilePlanProposalBuilder.proposal(action: .generate, current: active))
        XCTAssertThrowsError(try MobilePlanProposalBuilder.proposal(action: .regenerateFuture, current: active))
    }

    func testFingerprintIsStableAndChangesWithModeOrContent() throws {
        let fixture = try loadFixture().0, current = fixture.commitMoveRequest.currentPlan!, proposed = fixture.commitMoveRequest.proposedPlan
        let first = try MobilePlanRequestFactory.make(mode: .preview, operationID: "op-fingerprint-0001", current: current, proposed: proposed, action: .move, targetWorkoutID: "workout-future-002", priorOperation: nil)
        let repeatValue = try MobilePlanRequestFactory.make(mode: .preview, operationID: "op-fingerprint-0001", current: current, proposed: proposed, action: .move, targetWorkoutID: "workout-future-002", priorOperation: nil)
        let commit = try MobilePlanRequestFactory.make(mode: .commit, operationID: "op-fingerprint-0001", current: current, proposed: proposed, action: .move, targetWorkoutID: "workout-future-002", priorOperation: nil)
        XCTAssertEqual(first.requestFingerprint, repeatValue.requestFingerprint)
        XCTAssertNotEqual(first.requestFingerprint, commit.requestFingerprint)
        XCTAssertTrue(first.requestFingerprint.hasPrefix("sha256-"))
    }

    func testTransactionGateRejectsStaleAndDifferentFingerprintButReplaysExactOperation() throws {
        let fixture = try loadFixture().0, request = fixture.commitMoveRequest, commit = try XCTUnwrap(fixture.commitMoveResponse.commitPlan)
        XCTAssertEqual(try MobilePlanTransactionGate.evaluate(current: request.currentPlan, priorOperation: nil, request: request, commitPlan: commit), .commit)
        let prior = MobilePlanPriorOperation(operationID: request.operationID, requestFingerprint: request.requestFingerprint, committedVersion: commit.version)
        XCTAssertEqual(try MobilePlanTransactionGate.evaluate(current: commit, priorOperation: prior, request: request, commitPlan: commit), .replay)
        var conflicting = prior; conflicting.requestFingerprint = "sha256-different-content"
        XCTAssertThrowsError(try MobilePlanTransactionGate.evaluate(current: request.currentPlan, priorOperation: conflicting, request: request, commitPlan: commit)) { XCTAssertEqual($0 as? MobilePlanStoreError, .idempotencyConflict) }
        var stale = request.currentPlan!; stale.version -= 1
        XCTAssertThrowsError(try MobilePlanTransactionGate.evaluate(current: stale, priorOperation: nil, request: request, commitPlan: commit)) { XCTAssertEqual($0 as? MobilePlanStoreError, .versionConflict) }
    }

    func testAuthenticatedClientUsesExactEndpointAndRejectsMalformedEnvelope() async throws {
        let fixture = try loadFixture().0
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [MobilePlanURLProtocol.self]
        let client = URLSessionMobilePlanLifecycleClient(baseURL: URL(string: "https://kinetic.test")!, session: URLSession(configuration: configuration), timeout: 1)
        MobilePlanURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/mobile/plan-lifecycle")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer bounded-token")
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, try JSONEncoder().encode(fixture.commitMoveResponse), nil)
        }
        let response = try await client.validate(request: fixture.commitMoveRequest, idToken: "bounded-token")
        XCTAssertEqual(response, fixture.commitMoveResponse)
        MobilePlanURLProtocol.handler = { request in (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8), nil) }
        do { _ = try await client.validate(request: fixture.commitMoveRequest, idToken: "bounded-token"); XCTFail("Malformed response should fail") }
        catch let error as MobilePlanNetworkError { XCTAssertEqual(error.failure, .invalidResponse) }

        do { _ = try await client.validate(request: fixture.commitMoveRequest, idToken: ""); XCTFail("Missing auth should fail") }
        catch let error as MobilePlanNetworkError { XCTAssertEqual(error.failure, .authRequired) }
        MobilePlanURLProtocol.handler = { _ in throw URLError(.notConnectedToInternet) }
        do { _ = try await client.validate(request: fixture.commitMoveRequest, idToken: "bounded-token"); XCTFail("Offline should fail") }
        catch let error as MobilePlanNetworkError { XCTAssertEqual(error.failure, .offline) }
    }

    func testAuthenticatedGenerationClientUsesSharedEndpointAndRejectsMalformedEnvelope() async throws {
        let fixture = try loadGenerationFixture().0
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [MobilePlanURLProtocol.self]
        let client = URLSessionMobilePlanGenerationClient(baseURL: URL(string: "https://kinetic.test")!, session: URLSession(configuration: configuration), timeout: 1)
        MobilePlanURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/mobile/plan-generation")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer bounded-token")
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, try JSONEncoder().encode(fixture.initialResponse), nil)
        }
        let response = try await client.generate(request: fixture.initialRequest, idToken: "bounded-token")
        XCTAssertEqual(response, fixture.initialResponse)
        MobilePlanURLProtocol.handler = { request in
            (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8), nil)
        }
        do { _ = try await client.generate(request: fixture.initialRequest, idToken: "bounded-token"); XCTFail("Malformed response should fail") }
        catch let error as MobilePlanNetworkError { XCTAssertEqual(error.failure, .invalidResponse) }
        do { _ = try await client.generate(request: fixture.initialRequest, idToken: ""); XCTFail("Missing auth should fail") }
        catch let error as MobilePlanNetworkError { XCTAssertEqual(error.failure, .authRequired) }
    }

    func testSharedV2FixtureHasBoundedAvailabilityAndCleanupParity() throws {
        let (fixture, object) = try loadSharedV2Fixture()
        XCTAssertEqual(fixture.schemaVersion, "mobile-plan-shared-v2")
        XCTAssertEqual(try fixture.planningInputs.validated().weeklyAvailability.map(\.availableMinutes), [0, 45, 35])
        XCTAssertEqual(fixture.planningInputs.weeklyAvailability.last?.easyOnly, true)
        XCTAssertEqual(fixture.accountCleanupRequest.schemaVersion, mobileAccountCleanupSchema)
        XCTAssertEqual(fixture.readyReceipt.status, .readyForAuthDeletion)
        XCTAssertTrue(fixture.readyReceipt.pendingDomains.isEmpty)

        var inputs = try XCTUnwrap(object["planning_inputs"] as? [String: Any])
        var availability = try XCTUnwrap(inputs["weekly_availability"] as? [[String: Any]])
        availability[1]["available_minutes"] = 10
        inputs["weekly_availability"] = availability
        XCTAssertThrowsError(try JSONDecoder().decode(MobilePlanningInputs.self, from: JSONSerialization.data(withJSONObject: inputs)).validated())
    }

    func testStrictV2MetadataLifecycleAndPrivacyValidation() throws {
        let plan = MobilePlanSnapshot(
            id: "plan-v2-test", version: 2, status: .active, goalRevision: 2,
            workouts: [.init(id: "race-v2", date: "2026-09-20", type: .race, status: .scheduled, distanceMiles: 13.1, durationMinutes: 120, paceSecondsPerMile: 550, reasonCode: .raceDay)]
        )
        let metadata = MobilePlanMetadataV2(
            planVersion: 2,
            weeks: [.init(weekNumber: 1, phase: .race, startDate: "2026-09-14", endDate: "2026-09-20", workoutIDs: ["race-v2"], explanationCodes: [.baseVolume, .raceWeek])],
            explanationCodes: [.baseVolume, .raceWeek]
        )
        let snapshot = try MobilePlanSnapshotV2(snapshot: plan, metadata: metadata).validated()
        let generation = MobilePlanGenerationResponseV2(schemaVersion: mobilePlanGenerationV2Schema, mode: .regenerateFuture, source: "deterministic_shared", mutationPerformed: false, candidatePlan: snapshot)
        XCTAssertEqual(try MobilePlanGenerationResponseV2.decodeStrict(JSONEncoder().encode(generation)), generation)

        let inputs = try loadSharedV2Fixture().0.planningInputs.validated()
        let response = MobilePlanLifecycleResponseV2(
            schemaVersion: mobilePlanLifecycleV2Schema, result: .preview, mutationPerformed: false,
            baseVersion: 1, proposedVersion: 2, reasonCodes: ["accepted"],
            impact: .init(affectedWorkoutIDs: ["race-v2"], completedWorkoutsPreserved: 0, totalWorkoutsBefore: 1, totalWorkoutsAfter: 1, warnings: []),
            commitPlan: snapshot, commitPlanningInputs: inputs,
            persistence: .init(required: false, ownerScopedDomains: ["profile", "goal", "plan", "plan_history", "plan_operations"], transactionPreconditions: ["authenticated_owner", "current_version_matches", "planning_revision_matches", "operation_id_absent_or_matching"])
        )
        XCTAssertEqual(try MobilePlanLifecycleResponseV2.decodeStrict(JSONEncoder().encode(response)), response)
        var object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(response)) as? [String: Any])
        object["email"] = "runner@example.com"
        XCTAssertThrowsError(try MobilePlanLifecycleResponseV2.decodeStrict(JSONSerialization.data(withJSONObject: object)))
    }

    func testInitialV2LifecycleRequestEncodesRequiredNullPreconditions() throws {
        let inputs = try MobilePlanningInputs(
            revision: 1, raceDistance: .tenK, targetDate: "2026-11-04",
            experienceLevel: .intermediate, weeklyMileage: 20,
            preferredDays: [.tue, .thu, .sun], personalBestsSeconds: [:], weeklyAvailability: []
        ).validated()
        let proposed = MobilePlanSnapshot(
            id: "plan-v2-initial", version: 1, status: .draft, goalRevision: 1,
            workouts: [.init(id: "race-v2-initial", date: "2026-11-04", type: .race, status: .scheduled, distanceMiles: 6.2, durationMinutes: 60, paceSecondsPerMile: 580, reasonCode: .raceDay)]
        )
        let metadata = MobilePlanMetadataV2(
            planVersion: 1,
            weeks: [.init(weekNumber: 1, phase: .race, startDate: "2026-11-02", endDate: "2026-11-08", workoutIDs: ["race-v2-initial"], explanationCodes: [.baseVolume, .raceWeek])],
            explanationCodes: [.baseVolume, .raceWeek]
        )
        let request = try MobilePlanV2RequestFactory.lifecycle(
            mode: .preview, operationID: "op-v2-initial-null", current: nil,
            proposed: proposed, metadata: metadata, currentInputs: nil,
            proposedInputs: inputs, action: .generate, targetWorkoutID: nil, priorOperation: nil
        )
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
        XCTAssertEqual(Set(object.keys), Set([
            "schema_version", "platform", "mode", "operation_id", "request_fingerprint",
            "expected_version", "current_plan", "proposed_plan", "current_planning_inputs",
            "proposed_planning_inputs", "mutation",
        ]))
        XCTAssertTrue(object["current_plan"] is NSNull)
        XCTAssertTrue(object["current_planning_inputs"] is NSNull)
    }

    func testAuthenticatedCleanupClientUsesExactEndpointAndStrictReceipt() async throws {
        let fixture = try loadSharedV2Fixture().0
        let configuration = URLSessionConfiguration.ephemeral; configuration.protocolClasses = [MobilePlanURLProtocol.self]
        let client = URLSessionMobileAccountCleanupClient(baseURL: URL(string: "https://kinetic.test")!, session: URLSession(configuration: configuration), timeout: 1)
        let response = MobileAccountCleanupResponse(schemaVersion: mobileAccountCleanupSchema, result: .progress, receipt: fixture.readyReceipt, mutationPerformed: true)
        MobilePlanURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/mobile/account-cleanup")
            XCTAssertEqual(request.value(forHTTPHeaderField: "Authorization"), "Bearer bounded-token")
            return (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, try JSONEncoder().encode(response), nil)
        }
        let received = try await client.perform(request: fixture.accountCleanupRequest, idToken: "bounded-token")
        XCTAssertEqual(received, response)
        MobilePlanURLProtocol.handler = { request in (HTTPURLResponse(url: request.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!, Data("{}".utf8), nil) }
        do { _ = try await client.perform(request: fixture.accountCleanupRequest, idToken: "bounded-token"); XCTFail("Malformed cleanup should fail") }
        catch let error as MobilePlanNetworkError { XCTAssertEqual(error.failure, .invalidResponse) }
    }

    private func loadFixture() throws -> (Fixture, [String: Any]) {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "mobile-plan-lifecycle-contract", withExtension: "json", subdirectory: "Fixtures"))
        let data = try Data(contentsOf: url)
        return (try JSONDecoder().decode(Fixture.self, from: data), try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any]))
    }
    private func loadGenerationFixture() throws -> (GenerationFixture, [String: Any]) {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "mobile-plan-generation-contract", withExtension: "json", subdirectory: "Fixtures"))
        let data = try Data(contentsOf: url)
        return (try JSONDecoder().decode(GenerationFixture.self, from: data), try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any]))
    }
    private func loadSharedV2Fixture() throws -> (SharedV2Fixture, [String: Any]) {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "mobile-plan-shared-v2-contract", withExtension: "json", subdirectory: "Fixtures"))
        let data = try Data(contentsOf: url)
        return (try JSONDecoder().decode(SharedV2Fixture.self, from: data), try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any]))
    }
    private func isoDate(_ value: String) -> Date? {
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0); formatter.dateFormat = "yyyy-MM-dd"; return formatter.date(from: value)
    }
}

private final class MobilePlanURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data, Error?))?
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (response, data, error) = try Self.handler!(request)
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            if !data.isEmpty { client?.urlProtocol(self, didLoad: data) }
            if let error { client?.urlProtocol(self, didFailWithError: error) } else { client?.urlProtocolDidFinishLoading(self) }
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

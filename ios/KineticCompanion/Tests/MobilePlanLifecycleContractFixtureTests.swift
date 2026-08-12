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

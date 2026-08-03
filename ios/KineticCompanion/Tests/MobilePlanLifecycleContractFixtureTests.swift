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

    func testNativeGeneratorIsDeterministicBoundedAndLocksRaceDay() throws {
        let context = MobilePlanGenerationContext(
            raceDistance: .half, targetDate: "2026-09-20", experience: .intermediate,
            weeklyMileage: 20, preferredDays: [.mon, .wed, .fri, .sun], personalBests: [:], goalRevision: 1
        )
        let today = try XCTUnwrap(isoDate("2026-08-03"))
        let first = try MobilePlanProposalBuilder.generate(context: context, today: today)
        let second = try MobilePlanProposalBuilder.generate(context: context, today: today)
        XCTAssertEqual(first, second)
        XCTAssertEqual(first.version, 1); XCTAssertEqual(first.status, .draft)
        XCTAssertEqual(first.workouts.filter { $0.type == .race }.count, 1)
        XCTAssertEqual(first.workouts.first { $0.type == .race }?.date, context.targetDate)
        XCTAssertTrue(first.workouts.allSatisfy { $0.distanceMiles <= 40 && $0.durationMinutes <= 480 })
        XCTAssertEqual(first.workouts.map(\.date).max(), context.targetDate)
        let hard = first.workouts.filter { [.tempo, .intervals, .longRun, .race].contains($0.type) }.sorted { $0.date < $1.date }
        for pair in zip(hard, hard.dropFirst()) {
            let left = try XCTUnwrap(isoDate(pair.0.date)), right = try XCTUnwrap(isoDate(pair.1.date))
            XCTAssertGreaterThanOrEqual(Calendar(identifier: .gregorian).dateComponents([.day], from: left, to: right).day ?? 0, 2)
        }
        var nullablePlan = first; nullablePlan.workouts[0].paceSecondsPerMile = nil
        let request = try MobilePlanRequestFactory.make(mode: .preview, operationID: "op-generation-null-0001", current: nil, proposed: nullablePlan, action: .generate, targetWorkoutID: nil, priorOperation: nil)
        let encoded = try XCTUnwrap(JSONSerialization.jsonObject(with: JSONEncoder().encode(request)) as? [String: Any])
        XCTAssertTrue(encoded["current_plan"] is NSNull); XCTAssertTrue(encoded["prior_operation"] is NSNull)
        let proposed = try XCTUnwrap(encoded["proposed_plan"] as? [String: Any]), workouts = try XCTUnwrap(proposed["workouts"] as? [[String: Any]])
        XCTAssertTrue(workouts[0]["pace_seconds_per_mile"] is NSNull)
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

        let context = MobilePlanGenerationContext(raceDistance: .half, targetDate: "2026-09-20", experience: .intermediate, weeklyMileage: 20, preferredDays: [.mon, .wed, .fri, .sun], personalBests: [:], goalRevision: 1)
        let generated = try MobilePlanProposalBuilder.generate(context: context, today: try XCTUnwrap(isoDate("2026-08-03")))
        let regenerated = try MobilePlanProposalBuilder.proposal(action: .regenerateFuture, current: active, regenerated: generated)
        XCTAssertEqual(regenerated.workouts.first { $0.status == .completed }, active.workouts.first { $0.status == .completed })
        XCTAssertEqual(regenerated.workouts.first { $0.type == .race }, active.workouts.first { $0.type == .race })
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

    private func loadFixture() throws -> (Fixture, [String: Any]) {
        let url = try XCTUnwrap(Bundle.module.url(forResource: "mobile-plan-lifecycle-contract", withExtension: "json", subdirectory: "Fixtures"))
        let data = try Data(contentsOf: url)
        return (try JSONDecoder().decode(Fixture.self, from: data), try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any]))
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

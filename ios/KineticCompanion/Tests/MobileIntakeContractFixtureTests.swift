import XCTest
@testable import KineticCompanion

final class MobileIntakeContractFixtureTests: XCTestCase {
    func testCanonicalFixtureCoversEveryRouteAndDraftKind() throws {
        let fixture = try loadFixture()
        XCTAssertEqual(fixture.schemaVersion, MobileIntakeContract.fixtureSchema)
        XCTAssertEqual(fixture.contractSchema, MobileIntakeContract.schema)
        XCTAssertEqual(
            Set(fixture.routeCases.map(\.expectedRoute)),
            Set(MobileIntakeRoute.allCases)
        )
        XCTAssertEqual(
            Set(fixture.routeCases.compactMap(\.expectedDraftKind)),
            Set(MobileIntakeDraftKind.allCases)
        )

        for testCase in fixture.routeCases {
            let response = try MobileIntakeResponse.decode(
                try JSONSerialization.data(withJSONObject: responseObject(for: testCase))
            )
            XCTAssertEqual(response.outcome.route, testCase.expectedRoute, testCase.id)
            XCTAssertEqual(response.outcome.mutable, testCase.mutable, testCase.id)
            if let expectedKind = testCase.expectedDraftKind {
                guard case .reviewDraft(let outcome) = response.outcome else {
                    return XCTFail("\(testCase.id) did not decode a review draft")
                }
                XCTAssertEqual(outcome.draftKinds, [expectedKind], testCase.id)
                XCTAssertTrue(outcome.reviewRequired)
                XCTAssertTrue(outcome.confirmationRequired)
                XCTAssertTrue(outcome.deterministicValidationRequired)
            }
            if let expectedReason = testCase.expectedReason {
                guard case .refusal(let outcome) = response.outcome else {
                    return XCTFail("\(testCase.id) did not decode a refusal")
                }
                XCTAssertEqual(outcome.reason, expectedReason)
            }
        }
    }

    func testBoundedRequestTrimsNoteAndClampsDecisionWarnings() throws {
        let fixture = try loadFixture()
        var context = fixture.context
        context.decision?.stalenessWarningCount = 99
        let request = try MobileIntakeRequestBuilder.build(
            text: "  Tuesday I only have 30 minutes. \n",
            context: context
        )
        XCTAssertEqual(request.text, "Tuesday I only have 30 minutes.")
        XCTAssertEqual(
            request.context.decision?.stalenessWarningCount,
            MobileIntakeContract.maximumStalenessWarnings
        )

        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(request))
                as? [String: Any]
        )
        XCTAssertEqual(
            Set(object.keys),
            ["schema_version", "platform", "text", "context"]
        )
        let serialized = String(data: try JSONEncoder().encode(request), encoding: .utf8)!
        for forbidden in ["full_name", "email", "uid", "token", "sleep_hours", "hrv"] {
            XCTAssertFalse(serialized.contains(forbidden))
        }
    }

    func testStrictResponseRejectsMutationUnknownStructureEnumsAndPrivacyKeys() throws {
        let fixture = try loadFixture()
        let testCase = try XCTUnwrap(fixture.routeCases.first)
        let valid = responseObject(for: testCase)

        var mutation = valid
        mutation["mutation_performed"] = true
        XCTAssertThrowsError(try decode(mutation))

        var extra = valid
        extra["raw_note"] = "private"
        XCTAssertThrowsError(try decode(extra))

        var forbidden = valid
        var outcome = try XCTUnwrap(forbidden["outcome"] as? [String: Any])
        outcome["uid"] = "private"
        forbidden["outcome"] = outcome
        XCTAssertThrowsError(try decode(forbidden))

        var unknownRoute = valid
        var unknownOutcome = try XCTUnwrap(unknownRoute["outcome"] as? [String: Any])
        unknownOutcome["route"] = "chat"
        unknownRoute["outcome"] = unknownOutcome
        XCTAssertThrowsError(try decode(unknownRoute))

        var extraDraft = valid
        var draftOutcome = try XCTUnwrap(extraDraft["outcome"] as? [String: Any])
        var draft = try XCTUnwrap(draftOutcome["draft"] as? [String: Any])
        draft["confidence"] = 0.9
        draftOutcome["draft"] = draft
        extraDraft["outcome"] = draftOutcome
        XCTAssertThrowsError(try decode(extraDraft))
    }

    func testFailureMappingMatchesCanonicalFixture() throws {
        let fixture = try loadFixture()
        for testCase in fixture.failureCases where testCase.kind == "http" {
            let status = try XCTUnwrap(testCase.status)
            XCTAssertEqual(
                URLSessionMobileIntakeClient.failure(for: status).rawValue,
                testCase.expectedFailure,
                testCase.id
            )
        }
        XCTAssertEqual(URLSessionMobileIntakeClient.failure(for: 504), .timeout)
        XCTAssertEqual(URLSessionMobileIntakeClient.failure(for: 422), .invalidResponse)
    }

    func testAuthenticatedNetworkingAcceptsContractAndRejectsMalformedResponse() async throws {
        let fixture = try loadFixture()
        let request = try MobileIntakeRequestBuilder.build(
            text: "Things changed and I am not sure.",
            context: fixture.context
        )
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MobileIntakeURLProtocol.self]
        let session = URLSession(configuration: configuration)
        let client = URLSessionMobileIntakeClient(
            baseURL: URL(string: "https://kinetic.test")!,
            session: session,
            timeout: 1
        )
        MobileIntakeURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/ai/parse-intake")
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "Authorization"),
                "Bearer bounded-token"
            )
            let response = HTTPURLResponse(
                url: request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            )!
            let object: [String: Any] = [
                "schema_version": MobileIntakeContract.schema,
                "mutation_performed": false,
                "parser": [
                    "source": "deterministic_router",
                    "ai_attempted": false,
                    "fallback_used": false,
                    "failure": "none"
                ],
                "outcome": [
                    "route": "clarification",
                    "mutable": false,
                    "reason": "ambiguous",
                    "choices": [
                        "schedule", "recovery", "pain_or_injury", "missed_workout",
                        "post_workout", "explanation"
                    ]
                ]
            ]
            return (response, try JSONSerialization.data(withJSONObject: object), nil)
        }
        let routed = try await client.route(request: request, idToken: "bounded-token")
        XCTAssertEqual(routed.outcome.route, .clarification)

        MobileIntakeURLProtocol.handler = { request in
            (
                HTTPURLResponse(
                    url: request.url!,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: nil
                )!,
                Data("not-json".utf8),
                nil
            )
        }
        do {
            _ = try await client.route(request: request, idToken: "bounded-token")
            XCTFail("Malformed response should fail")
        } catch let error as MobileIntakeRequestError {
            XCTAssertEqual(error.code, .invalidResponse)
        }
    }

    func testNetworkingMapsAuthTimeoutAndOfflineWithoutReturningDraft() async throws {
        let fixture = try loadFixture()
        let request = try MobileIntakeRequestBuilder.build(
            text: "Things changed and I am not sure.",
            context: fixture.context
        )
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [MobileIntakeURLProtocol.self]
        let client = URLSessionMobileIntakeClient(
            baseURL: URL(string: "https://kinetic.test")!,
            session: URLSession(configuration: configuration),
            timeout: 1
        )
        do {
            _ = try await client.route(request: request, idToken: "")
            XCTFail("Empty auth should fail")
        } catch let error as MobileIntakeRequestError {
            XCTAssertEqual(error.code, .authRequired)
        }
        for (urlError, expected) in [
            (URLError(.timedOut), MobileIntakeFailureCode.timeout),
            (URLError(.notConnectedToInternet), MobileIntakeFailureCode.offline)
        ] {
            MobileIntakeURLProtocol.handler = { _ in
                throw urlError
            }
            do {
                _ = try await client.route(request: request, idToken: "bounded-token")
                XCTFail("\(expected) should fail")
            } catch let error as MobileIntakeRequestError {
                XCTAssertEqual(error.code, expected)
            }
        }
    }

    private func loadFixture() throws -> MobileIntakeFixture {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "mobile-intake-contract",
                withExtension: "json",
                subdirectory: "Fixtures"
            )
        )
        return try JSONDecoder().decode(
            MobileIntakeFixture.self,
            from: Data(contentsOf: url)
        )
    }

    private func decode(_ object: [String: Any]) throws -> MobileIntakeResponse {
        try MobileIntakeResponse.decode(
            JSONSerialization.data(withJSONObject: object)
        )
    }

    private func responseObject(
        for testCase: MobileIntakeFixtureRouteCase
    ) -> [String: Any] {
        let parser: [String: Any] = [
            "source": testCase.expectedRoute == .reviewDraft
                ? "deterministic"
                : "deterministic_router",
            "ai_attempted": false,
            "fallback_used": testCase.expectedRoute == .reviewDraft,
            "failure": "none"
        ]
        let outcome: [String: Any]
        switch testCase.expectedRoute {
        case .reviewDraft:
            let kind = testCase.expectedDraftKind ?? .availability
            outcome = [
                "route": "review_draft",
                "mutable": true,
                "draft_kinds": [kind.rawValue],
                "review_required": true,
                "confirmation_required": true,
                "deterministic_validation_required": true,
                "draft": draftObject(for: kind)
            ]
        case .perceivedRecovery:
            outcome = [
                "route": "perceived_recovery",
                "mutable": false,
                "destination": "perceived_recovery_capture",
                "fields_to_capture": [
                    "perceived_recovery", "fatigue", "soreness", "sleep_correction"
                ],
                "inferred_values": false,
                "persistence_available": false
            ]
        case .caution:
            outcome = [
                "route": "caution",
                "mutable": false,
                "destination": "conservative_caution",
                "actions": [
                    "stop_or_reduce", "capture_discomfort_flag", "seek_qualified_care"
                ],
                "diagnosis_provided": false,
                "pain_severity_inferred": false,
                "clearance_provided": false
            ]
        case .missedWorkout:
            outcome = [
                "route": "missed_workout",
                "mutable": false,
                "destination": "missed_workout_choices",
                "choices": ["mark_skipped", "reschedule", "rebalance"],
                "completion_inferred": false,
                "persistence_available": false
            ]
        case .reflection:
            outcome = [
                "route": "reflection",
                "mutable": false,
                "destination": "post_workout_capture",
                "fields_to_capture": ["completion", "perceived_effort"],
                "completion_inferred": false,
                "effort_inferred": false,
                "persistence_available": false
            ]
        case .explanation:
            outcome = [
                "route": "explanation",
                "mutable": false,
                "destination": "deterministic_explanation",
                "template": "today_decision_trace",
                "facts": [
                    "selected_action": "modify",
                    "readiness_state": "caution",
                    "calendar_state": "conflict",
                    "confidence_bucket": "moderate",
                    "has_staleness_warning": true
                ],
                "generated_prose": false
            ]
        case .clarification:
            outcome = [
                "route": "clarification",
                "mutable": false,
                "reason": "ambiguous",
                "choices": [
                    "schedule", "recovery", "pain_or_injury", "missed_workout",
                    "post_workout", "explanation"
                ]
            ]
        case .refusal:
            let reason = testCase.expectedReason ?? .unsupported
            outcome = [
                "route": "refusal",
                "mutable": false,
                "reason": reason.rawValue,
                "safe_next_action": reason == .unsafe
                    ? "seek_qualified_care"
                    : "use_supported_intake"
            ]
        }
        return [
            "schema_version": MobileIntakeContract.schema,
            "mutation_performed": false,
            "parser": parser,
            "outcome": outcome
        ]
    }

    private func draftObject(for kind: MobileIntakeDraftKind) -> [String: Any] {
        var draft: [String: Any] = [
            "status": "ready",
            "summary": "One proposed change for review.",
            "goal_changes": [],
            "schedule_changes": [],
            "availability_changes": [],
            "preference_changes": [],
            "workout_swap_changes": [],
            "grounding": [],
            "warnings": []
        ]
        let identifier: String
        switch kind {
        case .goal:
            identifier = "goal-mileage"
            draft["goal_changes"] = [
                ["id": identifier, "field": "weekly_mileage", "value": 30]
            ]
        case .preferredDay:
            identifier = "schedule-days"
            draft["schedule_changes"] = [
                [
                    "id": identifier,
                    "field": "preferred_training_days",
                    "value": ["mon", "sat"]
                ]
            ]
        case .workoutSwap:
            identifier = "workout-swap-tue-thu"
            draft["workout_swap_changes"] = [
                ["id": identifier, "from_day": "tue", "to_day": "thu"]
            ]
        case .schedule, .availability, .travel:
            identifier = "availability-tue"
            draft["availability_changes"] = [
                [
                    "id": identifier,
                    "day": "tue",
                    "available_minutes": kind == .schedule ? 0 : 30,
                    "easy_only": kind == .travel
                ]
            ]
        }
        draft["grounding"] = [
            ["change_id": identifier, "evidence": "bounded evidence"]
        ]
        return draft
    }
}

private final class MobileIntakeURLProtocol: URLProtocol {
    static var handler: ((URLRequest) throws -> (HTTPURLResponse, Data, Error?))?

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let handler = Self.handler else {
            client?.urlProtocol(self, didFailWithError: URLError(.unknown))
            return
        }
        do {
            let (response, data, error) = try handler(request)
            if let error {
                client?.urlProtocol(self, didFailWithError: error)
                return
            }
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data)
            client?.urlProtocolDidFinishLoading(self)
        } catch {
            client?.urlProtocol(self, didFailWithError: error)
        }
    }

    override func stopLoading() {}
}

import XCTest
@testable import KineticCompanion

final class BehaviorPatternContractFixtureTests: XCTestCase {
    func testCanonicalFixtureCoversEveryFamilyAndResultRoute() throws {
        let root = try loadFixture()
        XCTAssertEqual(root["contract_schema"] as? String, BehaviorPatternContract.schema)
        let response = try BehaviorInsightsResponse.decode(
            try data(try XCTUnwrap(root["response"]))
        )
        XCTAssertEqual(Set(response.patterns.map(\.family)), Set(BehaviorPatternFamily.allCases))
        XCTAssertEqual(
            Set(response.patterns.map(\.result.kind)),
            Set([
                .scoringPreferenceReview,
                .preferredDayReview,
                .checkinPrompt,
                .caution
            ])
        )
        XCTAssertEqual(response.patterns.count, 7)

        #if DEBUG
        try BehaviorPatternValidator.validate(BehaviorPatternAccessibilityQA.response)
        XCTAssertEqual(
            Set(BehaviorPatternAccessibilityQA.response.patterns.map(\.result.kind)),
            Set([
                .scoringPreferenceReview,
                .preferredDayReview,
                .checkinPrompt,
                .caution
            ])
        )
        XCTAssertTrue(
            Set(BehaviorPatternAccessibilityQA.response.patterns.map(\.id))
                .isSubset(of: Set(response.patterns.map(\.id)))
        )
        #endif
    }

    func testStrictDecoderRejectsVersionUnknownKeysBoundsAndRouteDrift() throws {
        let root = try loadFixture()
        let valid = try XCTUnwrap(root["response"] as? [String: Any])

        var version = valid
        version["contract_version"] = "behavior-pattern-result.v2"
        XCTAssertThrowsError(try decode(version))

        var extra = valid
        extra["raw_note"] = "private"
        XCTAssertThrowsError(try decode(extra))

        XCTAssertThrowsError(
            try BehaviorInsightsResponse.decode(Data("{".utf8))
        )

        var tooMany = valid
        let patterns = try XCTUnwrap(valid["patterns"] as? [[String: Any]])
        tooMany["patterns"] = Array(repeating: patterns[0], count: 21)
        XCTAssertThrowsError(try decode(tooMany))

        var duplicates = valid
        duplicates["patterns"] = [patterns[0], patterns[0]]
        XCTAssertThrowsError(try decode(duplicates))

        var weakSupport = valid
        var weakPatterns = patterns
        weakPatterns[0]["support_count"] = 1
        weakSupport["patterns"] = weakPatterns
        XCTAssertThrowsError(try decode(weakSupport))

        for (key, value) in [
            ("family", "unknown_family"),
            ("preference_type", "unknown_preference")
        ] {
            var unknown = valid
            var unknownPatterns = patterns
            unknownPatterns[0][key] = value
            unknown["patterns"] = unknownPatterns
            XCTAssertThrowsError(try decode(unknown))
        }

        var routeDrift = valid
        var driftPatterns = patterns
        driftPatterns[0]["family"] = "pain_or_discomfort_recurrence"
        routeDrift["patterns"] = driftPatterns
        XCTAssertThrowsError(try decode(routeDrift))

        for (key, value) in [
            ("kind", "unknown_result"),
            ("mutation", "unknown_mutation"),
            ("preference_type", "unknown_preference")
        ] {
            var unknown = valid
            var unknownPatterns = patterns
            var unknownResult = try XCTUnwrap(
                unknownPatterns[0]["result"] as? [String: Any]
            )
            unknownResult[key] = value
            unknownPatterns[0]["result"] = unknownResult
            unknown["patterns"] = unknownPatterns
            XCTAssertThrowsError(try decode(unknown))
        }

        var unknownDay = valid
        var dayPatterns = patterns
        var dayResult = try XCTUnwrap(dayPatterns[1]["result"] as? [String: Any])
        dayResult["observed_day"] = "funday"
        dayPatterns[1]["result"] = dayResult
        unknownDay["patterns"] = dayPatterns
        XCTAssertThrowsError(try decode(unknownDay))

        var resultExtra = valid
        var extraPatterns = patterns
        var result = try XCTUnwrap(extraPatterns[0]["result"] as? [String: Any])
        result["native_only"] = true
        extraPatterns[0]["result"] = result
        resultExtra["patterns"] = extraPatterns
        XCTAssertThrowsError(try decode(resultExtra))
    }

    func testNativeRequestPrivacyAndExplicitPreferenceTombstoneRecovery() throws {
        let source = MobileCheckinRecommendationEvent(
            id: "mobile:2026-07-24:1:MON",
            date: "2026-07-24",
            plannedWorkout: "easy",
            recommendedWorkout: "easy",
            selectedAction: .proceed,
            confidence: .moderate,
            recoveryScore: 0.7,
            availableMinutes: 45,
            userResponse: "accepted",
            rejectionReason: "private free text",
            actualWorkout: MobileCheckinActualWorkout(
                completed: true,
                distanceMiles: 3,
                durationMinutes: 30,
                perceivedEffort: 5,
                reflectionCategory: .asExpected,
                skipReason: nil,
                note: "private workout note"
            ),
            context: MobileCheckinRecommendationContext(
                calendarLoad: "moderate",
                sleepStatus: "normal",
                recoveryStatus: "high",
                readinessFreshness: "fresh",
                checkinStatus: "completed"
            )
        )
        let request = BehaviorInsightsRequest(
            recommendationEvents: [BehaviorRecommendationEvent(source)]
        )
        let encoded = try JSONEncoder().encode(request)
        let serialized = String(decoding: encoded, as: UTF8.self)
        XCTAssertFalse(serialized.contains("private free text"))
        XCTAssertFalse(serialized.contains("private workout note"))
        XCTAssertFalse(serialized.contains("rejectionReason"))
        XCTAssertFalse(serialized.contains("\"note\""))
        XCTAssertTrue(serialized.contains("readinessFreshness"))
        XCTAssertTrue(serialized.contains("checkinStatus"))

        let empty = try FirestoreBehaviorPreferenceClient.preferencePayload(from: nil)
        XCTAssertEqual(empty["version"] as? Int, 1)
        XCTAssertEqual((empty["preferences"] as? [String: Any])?.count, 0)

        let restarted = try FirestoreBehaviorPreferenceClient.preferencePayload(
            from: [
                "schemaVersion": 1,
                "payload": NSNull(),
                "deleted": true
            ]
        )
        XCTAssertEqual((restarted["preferences"] as? [String: Any])?.count, 0)

        XCTAssertThrowsError(
            try FirestoreBehaviorPreferenceClient.preferencePayload(
                from: [
                    "schemaVersion": 1,
                    "payload": ["version": 1, "preferences": [String: Any]()],
                    "deleted": true
                ]
            )
        )
    }

    func testFailureMappingAndAuthenticatedNetworking() async throws {
        XCTAssertEqual(URLSessionBehaviorPatternClient.failure(for: 401), .authRequired)
        XCTAssertEqual(URLSessionBehaviorPatternClient.failure(for: 403), .authRequired)
        XCTAssertEqual(URLSessionBehaviorPatternClient.failure(for: 408), .timeout)
        XCTAssertEqual(URLSessionBehaviorPatternClient.failure(for: 429), .timeout)
        XCTAssertEqual(URLSessionBehaviorPatternClient.failure(for: 504), .timeout)
        XCTAssertEqual(URLSessionBehaviorPatternClient.failure(for: 500), .backendUnavailable)
        XCTAssertEqual(URLSessionBehaviorPatternClient.failure(for: 503), .backendUnavailable)
        XCTAssertEqual(URLSessionBehaviorPatternClient.failure(for: 422), .invalidResponse)

        let root = try loadFixture()
        let responseData = try data(try XCTUnwrap(root["response"]))
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [BehaviorPatternURLProtocol.self]
        let client = URLSessionBehaviorPatternClient(
            baseURL: URL(string: "https://kinetic.test")!,
            session: URLSession(configuration: configuration),
            timeout: 1
        )
        BehaviorPatternURLProtocol.handler = { request in
            XCTAssertEqual(request.url?.path, "/behavior-insights")
            XCTAssertEqual(
                request.value(forHTTPHeaderField: "Authorization"),
                "Bearer bounded-token"
            )
            return (
                HTTPURLResponse(
                    url: request.url!,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )!,
                responseData,
                nil
            )
        }
        let response = try await client.fetch(
            request: BehaviorInsightsRequest(recommendationEvents: []),
            idToken: "bounded-token"
        )
        XCTAssertEqual(response.contractVersion, BehaviorPatternContract.schema)

        do {
            _ = try await client.fetch(
                request: BehaviorInsightsRequest(recommendationEvents: []),
                idToken: ""
            )
            XCTFail("Empty auth should fail")
        } catch let error as BehaviorPatternRequestError {
            XCTAssertEqual(error.code, .authRequired)
        }

        BehaviorPatternURLProtocol.handler = { request in
            (
                HTTPURLResponse(
                    url: request.url!,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )!,
                Data("{}".utf8),
                nil
            )
        }
        await assertFailure(.invalidResponse, client: client)

        BehaviorPatternURLProtocol.handler = { request in
            (
                HTTPURLResponse(
                    url: request.url!,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: nil
                )!,
                Data(),
                URLError(.notConnectedToInternet)
            )
        }
        await assertFailure(.offline, client: client)

        BehaviorPatternURLProtocol.handler = { request in
            (
                HTTPURLResponse(
                    url: request.url!,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: nil
                )!,
                Data(),
                URLError(.timedOut)
            )
        }
        await assertFailure(.timeout, client: client)

        BehaviorPatternURLProtocol.handler = { request in
            (
                HTTPURLResponse(
                    url: request.url!,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: nil
                )!,
                Data(),
                URLError(.cancelled)
            )
        }
        do {
            _ = try await client.fetch(
                request: BehaviorInsightsRequest(recommendationEvents: []),
                idToken: "bounded-token"
            )
            XCTFail("Cancellation should propagate")
        } catch is CancellationError {
            // Expected: a dismissed surface must not render a synthetic failure.
        } catch {
            XCTFail("Expected CancellationError, got \(error)")
        }

        var attempts = 0
        BehaviorPatternURLProtocol.handler = { request in
            attempts += 1
            if attempts == 1 {
                return (
                    HTTPURLResponse(
                        url: request.url!,
                        statusCode: 504,
                        httpVersion: nil,
                        headerFields: nil
                    )!,
                    Data(),
                    nil
                )
            }
            return (
                HTTPURLResponse(
                    url: request.url!,
                    statusCode: 200,
                    httpVersion: nil,
                    headerFields: ["Content-Type": "application/json"]
                )!,
                responseData,
                nil
            )
        }
        await assertFailure(.timeout, client: client)
        let retried = try await client.fetch(
            request: BehaviorInsightsRequest(recommendationEvents: []),
            idToken: "bounded-token"
        )
        XCTAssertEqual(retried.contractVersion, BehaviorPatternContract.schema)
        XCTAssertEqual(attempts, 2)
    }

    private func assertFailure(
        _ expected: BehaviorPatternFailureCode,
        client: URLSessionBehaviorPatternClient,
        file: StaticString = #filePath,
        line: UInt = #line
    ) async {
        do {
            _ = try await client.fetch(
                request: BehaviorInsightsRequest(recommendationEvents: []),
                idToken: "bounded-token"
            )
            XCTFail("Expected \(expected.rawValue)", file: file, line: line)
        } catch let error as BehaviorPatternRequestError {
            XCTAssertEqual(error.code, expected, file: file, line: line)
        } catch {
            XCTFail("Expected BehaviorPatternRequestError, got \(error)", file: file, line: line)
        }
    }

    private func loadFixture() throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "mobile-pattern-result-contract",
                withExtension: "json",
                subdirectory: "Fixtures"
            )
        )
        return try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        )
    }

    private func data(_ object: Any) throws -> Data {
        try JSONSerialization.data(withJSONObject: object)
    }

    private func decode(_ object: [String: Any]) throws -> BehaviorInsightsResponse {
        try BehaviorInsightsResponse.decode(try data(object))
    }
}

private final class BehaviorPatternURLProtocol: URLProtocol {
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

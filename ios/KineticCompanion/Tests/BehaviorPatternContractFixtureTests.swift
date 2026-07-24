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

        var tooMany = valid
        let patterns = try XCTUnwrap(valid["patterns"] as? [[String: Any]])
        tooMany["patterns"] = Array(repeating: patterns[0], count: 21)
        XCTAssertThrowsError(try decode(tooMany))

        var weakSupport = valid
        var weakPatterns = patterns
        weakPatterns[0]["support_count"] = 1
        weakSupport["patterns"] = weakPatterns
        XCTAssertThrowsError(try decode(weakSupport))

        var routeDrift = valid
        var driftPatterns = patterns
        driftPatterns[0]["family"] = "pain_or_discomfort_recurrence"
        routeDrift["patterns"] = driftPatterns
        XCTAssertThrowsError(try decode(routeDrift))

        var resultExtra = valid
        var extraPatterns = patterns
        var result = try XCTUnwrap(extraPatterns[0]["result"] as? [String: Any])
        result["native_only"] = true
        extraPatterns[0]["result"] = result
        resultExtra["patterns"] = extraPatterns
        XCTAssertThrowsError(try decode(resultExtra))
    }

    func testNativeRequestDropsFreeTextAndSensitiveOutcomeFields() throws {
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
    }

    func testFailureMappingAndAuthenticatedNetworking() async throws {
        XCTAssertEqual(URLSessionBehaviorPatternClient.failure(for: 401), .authRequired)
        XCTAssertEqual(URLSessionBehaviorPatternClient.failure(for: 429), .timeout)
        XCTAssertEqual(URLSessionBehaviorPatternClient.failure(for: 504), .timeout)
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

import XCTest
@testable import KineticCompanion

final class MobileTodayContractFixtureTests: XCTestCase {
    func testCanonicalFixtureDecodesAndValidates() throws {
        let fixture = try loadFixture()

        try MobileTodayValidator.validate(fixture.requestContract)
        try MobileTodayValidator.validate(fixture.backendResponse.decision)
        try MobileTodayValidator.validate(fixture.expectedSnapshot)
        try MobileTodayValidator.validate(fixture.cacheEnvelope)
        XCTAssertEqual(fixture.requestContract.schema, "mobile-today.v1")
        XCTAssertEqual(fixture.cacheEnvelope.schema, "mobile-today-cache.v1")
    }

    func testNativeBuilderMatchesCanonicalRequest() throws {
        let fixture = try loadFixture()
        let now = try XCTUnwrap(MobileTodayDate.parse("2026-07-16T12:00:00.000Z"))
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "America/New_York"))
        let readiness = ReadinessLog(entries: [
            "2026-07-15": ReadinessEntry(
                date: "2026-07-15",
                sleepHours: 7.2,
                hrv: 50,
                restingHeartRate: 51,
                fatigueLevel: nil,
                sorenessLevel: nil,
                source: .healthkit,
                updatedAt: try XCTUnwrap(MobileTodayDate.parse("2026-07-15T10:00:00.000Z"))
            ),
            "2026-07-16": ReadinessEntry(
                date: "2026-07-16",
                sleepHours: 7.5,
                hrv: 54,
                restingHeartRate: 49,
                fatigueLevel: 2,
                sorenessLevel: 1,
                source: .mixed,
                updatedAt: try XCTUnwrap(MobileTodayDate.parse("2026-07-16T10:00:00.000Z"))
            )
        ])
        let healthSync = HealthSyncPayload(
            provider: .appleHealth,
            schema: .v1,
            permissionState: .granted,
            metricPermissions: [
                "sleep": .granted,
                "hrv": .granted,
                "resting_hr": .granted
            ],
            lastAttemptedSyncAt: now,
            lastSuccessfulSyncAt: now,
            latestReadinessDate: "2026-07-16",
            backgroundDelivery: .enabled,
            dailyStatus: [:],
            lastErrorCode: nil
        )
        let plan = TodaySavedPlan(
            planStart: "2026-07-13",
            weeks: [
                TodayPlanWeek(
                    weekNumber: 1,
                    workouts: [
                        TodayPlanWorkout(
                            day: "Mon",
                            type: .easy,
                            distance: 4,
                            pace: 8.5,
                            duration: 34
                        ),
                        TodayPlanWorkout(
                            day: "Wed",
                            type: .intervals,
                            distance: 5,
                            pace: 7.4,
                            duration: 37
                        ),
                        TodayPlanWorkout(
                            day: "Thu",
                            type: .tempo,
                            distance: 5,
                            pace: 7.7,
                            duration: 40
                        )
                    ]
                )
            ]
        )
        let context = MobileTodayBuildContext(
            profilePresent: true,
            goal: TodayGoal(
                raceDistance: .tenK,
                experienceLevel: .intermediate,
                currentPersonalRecords: ["5k": 1500]
            ),
            savedPlan: plan,
            readinessLog: readiness,
            healthSync: healthSync,
            calendar: MobileTodayCalendarInput(
                ageHours: 2,
                availableMinutesToday: 30,
                unhealthy: false
            ),
            learnedPreferences: [
                TodayPreference(
                    id: "pref-busy",
                    type: .busyDayPreference,
                    confidence: .high,
                    userConfirmed: true,
                    createdAt: "2026-07-01T10:00:00.000Z"
                ),
                TodayPreference(
                    id: "pref-unconfirmed",
                    type: .intensityTolerance,
                    confidence: .moderate,
                    userConfirmed: false,
                    createdAt: "2026-07-02T10:00:00.000Z"
                )
            ],
            workoutLog: [
                TodayWorkoutLogEntry(
                    weekNumber: 1,
                    day: "Mon",
                    status: "completed",
                    scheduledDate: "2026-07-13",
                    loggedAt: "2026-07-13T13:00:00.000Z",
                    acceptedAdjustment: false
                ),
                TodayWorkoutLogEntry(
                    weekNumber: 1,
                    day: "Wed",
                    status: "completed",
                    scheduledDate: "2026-07-15",
                    loggedAt: "2026-07-15T13:00:00.000Z",
                    acceptedAdjustment: false
                ),
                TodayWorkoutLogEntry(
                    weekNumber: 1,
                    day: "Thu",
                    status: "skipped",
                    scheduledDate: "2026-07-09",
                    loggedAt: "2026-07-09T13:00:00.000Z",
                    acceptedAdjustment: true
                )
            ],
            now: now,
            localDay: "2026-07-16",
            calendarSystem: calendar
        )

        XCTAssertEqual(try MobileTodayRequestBuilder.build(context), fixture.requestContract)
    }

    func testSnapshotCreationMatchesCanonicalFixture() throws {
        let fixture = try loadFixture()
        let generatedAt = try XCTUnwrap(MobileTodayDate.parse("2026-07-16T12:00:00.000Z"))
        let snapshot = try MobileTodayDecisionSnapshot.make(
            contract: fixture.requestContract,
            response: fixture.backendResponse,
            generatedAt: generatedAt
        )
        XCTAssertEqual(snapshot, fixture.expectedSnapshot)
        XCTAssertEqual(
            try MobileTodayCacheEnvelope.make(snapshot: snapshot, cachedAt: generatedAt),
            fixture.cacheEnvelope
        )
    }

    func testWrappedAndLegacyResponsesValidateWhileMalformedAIFallsBack() throws {
        let fixtureData = try fixtureData()
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: fixtureData) as? [String: Any]
        )
        let wrapped = try XCTUnwrap(object["backend_response"])
        let wrappedData = try JSONSerialization.data(withJSONObject: wrapped)
        let parsed = try DecisionResponse.parse(wrappedData)
        XCTAssertEqual(parsed.decision.selectedAction.name, .modify)

        let wrappedDictionary = try XCTUnwrap(wrapped as? [String: Any])
        let legacy = try XCTUnwrap(wrappedDictionary["decision"])
        XCTAssertEqual(
            try DecisionResponse.parse(JSONSerialization.data(withJSONObject: legacy)).decision,
            parsed.decision
        )

        var malformedAI = wrappedDictionary
        malformedAI["ai_reasoning"] = ["summary": "missing required fields"]
        let fallback = try DecisionResponse.parse(
            JSONSerialization.data(withJSONObject: malformedAI)
        )
        XCTAssertNil(fallback.aiReasoning)
        XCTAssertFalse(fallback.reasoningAvailable)
    }

    func testSameDayCacheAgingAndFailureMapping() throws {
        let cache = try loadFixture().cacheEnvelope
        XCTAssertEqual(
            MobileTodayCacheResolver.state(
                cache: cache,
                now: try XCTUnwrap(MobileTodayDate.parse("2026-07-16T14:00:00.000Z"))
            ),
            .fresh
        )
        XCTAssertEqual(
            MobileTodayCacheResolver.state(
                cache: cache,
                now: try XCTUnwrap(MobileTodayDate.parse("2026-07-16T20:00:00.000Z"))
            ),
            .stale
        )
        XCTAssertEqual(
            MobileTodayCacheResolver.state(
                cache: cache,
                now: try XCTUnwrap(MobileTodayDate.parse("2026-07-17T12:00:00.000Z"))
            ),
            .expired
        )
        XCTAssertEqual(URLSessionMobileTodayDecisionClient.failure(for: 401), .authRequired)
        XCTAssertEqual(URLSessionMobileTodayDecisionClient.failure(for: 504), .timeout)
        XCTAssertEqual(URLSessionMobileTodayDecisionClient.failure(for: 503), .backendUnavailable)
        XCTAssertEqual(URLSessionMobileTodayDecisionClient.failure(for: 422), .invalidResponse)
    }

    func testMissingContextStopsAndCalendarFallbackPreservesZero() throws {
        let fixture = try loadFixture()
        let now = try XCTUnwrap(MobileTodayDate.parse("2026-07-16T12:00:00.000Z"))
        let base = fixture.requestContract
        let goal = TodayGoal(
            raceDistance: .tenK,
            experienceLevel: .intermediate,
            currentPersonalRecords: ["5k": 1500]
        )
        let plan = TodaySavedPlan(
            planStart: "2026-07-13",
            weeks: [
                TodayPlanWeek(
                    weekNumber: 1,
                    workouts: [
                        TodayPlanWorkout(
                            day: "Thu",
                            type: .tempo,
                            distance: 5,
                            pace: 7.7,
                            duration: 40
                        )
                    ]
                )
            ]
        )
        let readiness = ReadinessLog(entries: [
            "2026-07-16": ReadinessEntry(
                date: "2026-07-16",
                sleepHours: 7.5,
                hrv: 54,
                restingHeartRate: 49,
                fatigueLevel: 2,
                sorenessLevel: 1,
                source: .mixed,
                updatedAt: try XCTUnwrap(MobileTodayDate.parse("2026-07-16T10:00:00.000Z"))
            )
        ])
        func context(
            goal: TodayGoal? = goal,
            plan: TodaySavedPlan? = plan,
            readiness: ReadinessLog? = readiness,
            calendar: MobileTodayCalendarInput?
        ) -> MobileTodayBuildContext {
            MobileTodayBuildContext(
                profilePresent: true,
                goal: goal,
                savedPlan: plan,
                readinessLog: readiness,
                healthSync: nil,
                calendar: calendar,
                learnedPreferences: [],
                workoutLog: [],
                now: now,
                localDay: base.localDay
            )
        }

        XCTAssertThrowsError(try MobileTodayRequestBuilder.build(context(goal: nil, calendar: nil))) {
            XCTAssertEqual(($0 as? MobileTodayBuildFailure)?.code, .missingGoal)
        }
        XCTAssertThrowsError(try MobileTodayRequestBuilder.build(context(plan: nil, calendar: nil))) {
            XCTAssertEqual(($0 as? MobileTodayBuildFailure)?.code, .missingPlan)
        }
        XCTAssertThrowsError(
            try MobileTodayRequestBuilder.build(context(readiness: nil, calendar: nil))
        ) {
            XCTAssertEqual(($0 as? MobileTodayBuildFailure)?.code, .missingReadiness)
        }

        let fallback = try MobileTodayRequestBuilder.build(context(calendar: nil))
        XCTAssertEqual(fallback.metadata.availabilitySource, .plannedWorkoutFallback)
        XCTAssertNil(fallback.request.dataFreshness.calendarAgeHours)
        XCTAssertTrue(fallback.request.constraints.calendarAuthoritative)

        let zero = try MobileTodayRequestBuilder.build(
            context(
                calendar: MobileTodayCalendarInput(
                    ageHours: 1,
                    availableMinutesToday: 0,
                    unhealthy: false
                )
            )
        )
        XCTAssertEqual(zero.request.constraints.availableMinutes, 0)
        XCTAssertEqual(zero.metadata.calendarState, .conflict)
    }

    func testPrivacyValidatorRejectsIdentityAndPreferenceDescription() throws {
        let fixture = try loadFixture()
        var object = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: JSONEncoder().encode(fixture.requestContract)
            ) as? [String: Any]
        )
        object["email"] = "forbidden@example.com"
        XCTAssertThrowsError(try inspectRawPrivacy(object))

        var request = try XCTUnwrap(object["request"] as? [String: Any])
        var preferences = try XCTUnwrap(request["learned_preferences"] as? [[String: Any]])
        preferences[0]["description"] = "free text"
        request["learned_preferences"] = preferences
        object.removeValue(forKey: "email")
        object["request"] = request
        XCTAssertThrowsError(try inspectRawPrivacy(object))
    }

    private func inspectRawPrivacy(_ object: Any) throws {
        struct Raw: Encodable {
            let object: Any
            func encode(to encoder: Encoder) throws {
                var container = encoder.singleValueContainer()
                let data = try JSONSerialization.data(withJSONObject: object)
                let value = try JSONDecoder().decode(JSONValue.self, from: data)
                try container.encode(value)
            }
        }
        try MobileTodayValidator.validatePrivacy(Raw(object: object))
    }

    private func loadFixture() throws -> MobileTodayFixture {
        try JSONDecoder().decode(MobileTodayFixture.self, from: fixtureData())
    }

    private func fixtureData() throws -> Data {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "mobile-today-contract",
                withExtension: "json",
                subdirectory: "Fixtures"
            )
        )
        return try Data(contentsOf: url)
    }
}

private struct MobileTodayFixture: Decodable {
    var requestContract: MobileTodayRequestContract
    var backendResponse: DecisionResponse
    var expectedSnapshot: MobileTodayDecisionSnapshot
    var cacheEnvelope: MobileTodayCacheEnvelope

    enum CodingKeys: String, CodingKey {
        case requestContract = "request_contract"
        case backendResponse = "backend_response"
        case expectedSnapshot = "expected_snapshot"
        case cacheEnvelope = "cache_envelope"
    }
}

private enum JSONValue: Codable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([String: JSONValue].self) { self = .object(value) }
        else { self = .array(try container.decode([JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .bool(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

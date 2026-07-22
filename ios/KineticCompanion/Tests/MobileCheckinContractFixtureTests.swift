import XCTest
@testable import KineticCompanion

final class MobileCheckinContractFixtureTests: XCTestCase {
    func testCanonicalFixtureMatchesEverySuccessAndFailure() throws {
        let root = try loadObject()
        XCTAssertEqual(root["schema_version"] as? String, MobileCheckinContract.fixtureSchema)
        XCTAssertEqual(root["contract_schema"] as? String, MobileCheckinContract.schema)
        let state: MobileCheckinState = try decode(root["state"])
        let now = try XCTUnwrap(MobileTodayDate.parse(try XCTUnwrap(root["now"] as? String)))
        let successes = try XCTUnwrap(root["success_cases"] as? [[String: Any]])
        XCTAssertEqual(successes.count, 3)

        for testCase in successes {
            let identifier = try XCTUnwrap(testCase["id"] as? String)
            let request = try MobileCheckinRequest.decode(data(testCase["request"]))
            let result = try MobileCheckinEngine.apply(request, to: state, now: now)
            XCTAssertEqual(
                result.writeDomains,
                try XCTUnwrap(testCase["expected_write_domains"] as? [String]),
                identifier
            )
            XCTAssertEqual(result.audit.outcome, .success, identifier)
            XCTAssertEqual(result.audit.failureState, .none, identifier)
            XCTAssertTrue(result.audit.updateSucceeded, identifier)

            if let expectedObject = testCase["expected_readiness"] {
                let expected: ReadinessEntry = try decode(expectedObject)
                XCTAssertEqual(result.readiness?.entries[request.localDay], expected, identifier)
                XCTAssertEqual(result.readiness?.entries[request.localDay]?.hrv, 55, identifier)
                XCTAssertEqual(
                    result.readiness?.entries[request.localDay]?.restingHeartRate,
                    49,
                    identifier
                )
            }
            if let eventID = testCase["expected_event_id"] as? String {
                let event = try XCTUnwrap(result.recommendations?.events[eventID], identifier)
                XCTAssertEqual(event.id, eventID, identifier)
                XCTAssertEqual(event.actualWorkout?.perceivedEffort,
                               testCase["expected_effort"] as? Int,
                               identifier)
                XCTAssertEqual(event.actualWorkout?.reflectionCategory?.rawValue,
                               testCase["expected_reflection"] as? String,
                               identifier)
                XCTAssertEqual(event.actualWorkout?.skipReason?.rawValue,
                               testCase["expected_skip_reason"] as? String,
                               identifier)
            }

            let replayState = MobileCheckinState(
                goalSignature: state.goalSignature,
                planSlots: state.planSlots,
                readiness: result.readiness,
                workouts: result.workouts,
                recommendations: result.recommendations
            )
            let replay = try MobileCheckinEngine.apply(request, to: replayState, now: now)
            XCTAssertEqual(replay.readiness, result.readiness, "\(identifier) readiness retry")
            XCTAssertEqual(replay.workouts, result.workouts, "\(identifier) workout retry")
            XCTAssertEqual(
                replay.recommendations,
                result.recommendations,
                "\(identifier) recommendation retry"
            )
        }

        let failures = try XCTUnwrap(root["failure_cases"] as? [[String: Any]])
        XCTAssertEqual(failures.count, 7)
        for testCase in failures {
            let identifier = try XCTUnwrap(testCase["id"] as? String)
            let expected = try XCTUnwrap(testCase["expected_failure"] as? String)
            do {
                let request = try MobileCheckinRequest.decode(data(testCase["request"]))
                _ = try MobileCheckinEngine.apply(request, to: state, now: now)
                XCTFail("\(identifier) unexpectedly applied")
            } catch let error as MobileCheckinValidationError {
                XCTAssertEqual(error.failureState.rawValue, expected, identifier)
            } catch {
                XCTFail("\(identifier) produced unexpected error \(error)")
            }
        }
    }

    func testStrictRequestRejectsUnknownStructureEnumsAndPrivacyFields() throws {
        let root = try loadObject()
        let success = try XCTUnwrap(
            (root["success_cases"] as? [[String: Any]])?.first
        )
        let base = try XCTUnwrap(success["request"] as? [String: Any])

        var extra = base
        extra["generated_prose"] = "private"
        XCTAssertThrowsError(try MobileCheckinRequest.decode(data(extra)))

        var unknown = base
        unknown["kind"] = "chat"
        XCTAssertThrowsError(try MobileCheckinRequest.decode(data(unknown)))

        var nested = base
        var recovery = try XCTUnwrap(nested["recovery"] as? [String: Any])
        recovery["raw_samples"] = []
        nested["recovery"] = recovery
        XCTAssertThrowsError(try MobileCheckinRequest.decode(data(nested)))

        let encoded = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(try MobileCheckinRequest.decode(data(base)))
        ) as? [String: Any]
        XCTAssertEqual(
            Set(try XCTUnwrap(encoded).keys),
            ["schema_version", "platform", "kind", "local_day", "captured_at", "recovery"]
        )
        let encodedRecovery = try XCTUnwrap(encoded?["recovery"] as? [String: Any])
        XCTAssertEqual(
            Set(encodedRecovery.keys),
            ["perceived_recovery", "fatigue_level", "soreness_level", "sleep_hours_correction"]
        )
        XCTAssertTrue(encodedRecovery["sleep_hours_correction"] is NSNull)

        let workoutCase = try XCTUnwrap(
            (root["success_cases"] as? [[String: Any]])?.first {
                ($0["request"] as? [String: Any])?["kind"] as? String == "workout_outcome"
            }
        )
        let workoutRequest = try MobileCheckinRequest.decode(data(workoutCase["request"]))
        let encodedWorkoutRequest = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(workoutRequest))
                as? [String: Any]
        )
        let encodedWorkout = try XCTUnwrap(encodedWorkoutRequest["workout"] as? [String: Any])
        XCTAssertEqual(
            Set(encodedWorkout.keys),
            [
                "week_number", "day", "scheduled_date", "status", "perceived_effort",
                "reflection", "skip_reason", "selected_action", "confidence_bucket",
                "planned_workout", "recommended_workout", "adjustment_response"
            ]
        )
        XCTAssertTrue(encodedWorkout["skip_reason"] is NSNull)
    }

    func testAuditUsesOnlyFixedPrivacySafeVocabulary() throws {
        let root = try loadObject()
        let state: MobileCheckinState = try decode(root["state"])
        let now = try XCTUnwrap(MobileTodayDate.parse(try XCTUnwrap(root["now"] as? String)))
        let successes = try XCTUnwrap(root["success_cases"] as? [[String: Any]])
        let forbidden = try XCTUnwrap(root["privacy_forbidden_keys"] as? [String])

        for testCase in successes {
            let request = try MobileCheckinRequest.decode(data(testCase["request"]))
            let result = try MobileCheckinEngine.apply(request, to: state, now: now)
            let audit = MobileCheckinSyncedAudit(
                checkinKind: result.audit.checkinKind,
                status: result.audit.status,
                outcome: result.audit.outcome,
                failureState: result.audit.failureState,
                writeScope: result.audit.writeScope,
                deterministicValidation: result.audit.deterministicValidation,
                hasEffort: result.audit.hasEffort,
                hasUserReflection: result.audit.hasUserReflection,
                updateSucceeded: result.audit.updateSucceeded,
                latencyMs: result.audit.latencyMs
            )
            let object = try XCTUnwrap(
                JSONSerialization.jsonObject(with: JSONEncoder().encode(audit))
                    as? [String: Any]
            )
            XCTAssertEqual(
                Set(object.keys),
                [
                    "platform", "checkin_kind", "status", "outcome", "failure_state",
                    "write_scope", "deterministic_validation", "has_effort",
                    "has_user_reflection", "update_succeeded", "latency_ms"
                ]
            )
            for key in forbidden {
                XCTAssertNil(object[key], "audit exposed \(key)")
            }
        }
    }

    func testAllFixedFailuresAreNonMutatingAuditStates() throws {
        let request = try MobileCheckinRequestBuilder.recovery(
            perceivedRecovery: 3,
            fatigueLevel: 3,
            sorenessLevel: 3,
            sleepHoursCorrection: nil,
            now: Date(timeIntervalSince1970: 1_753_035_600)
        )
        for failure in MobileCheckinFailureState.allCases where failure != .none {
            let outcome: MobileDecisionOutcome = failure == .timeout
                ? .timeout
                : failure == .invalidPayload || failure == .stateConflict ? .invalid : .failed
            let audit = try MobileCheckinEngine.audit(
                for: request,
                outcome: outcome,
                failureState: failure,
                writeScope: .none,
                validation: failure == .invalidPayload || failure == .stateConflict
                    ? .failed
                    : .notRun,
                updateSucceeded: false,
                latencyMs: Int.max
            )
            XCTAssertEqual(audit.writeScope, .none)
            XCTAssertFalse(audit.updateSucceeded)
            XCTAssertEqual(audit.latencyMs, MobileCheckinContract.maximumLatencyMs)
        }
    }

    func testFirestoreFailureMappingCoversVisibleNonMutatingStates() {
        let cases: [(NSError, MobileCheckinFailureState)] = [
            (NSError(domain: NSURLErrorDomain, code: NSURLErrorNotConnectedToInternet), .offline),
            (NSError(domain: NSURLErrorDomain, code: NSURLErrorTimedOut), .timeout),
            (NSError(domain: "FIRFirestoreErrorDomain", code: 7), .permissionDenied),
            (NSError(domain: "FIRFirestoreErrorDomain", code: 14), .offline),
            (NSError(domain: "FIRFirestoreErrorDomain", code: 16), .authRequired),
            (NSError(domain: "FIRFirestoreErrorDomain", code: 99), .unknown)
        ]
        for (error, expected) in cases {
            XCTAssertEqual(FirestoreMobileCheckinClient.failureState(for: error), expected)
        }
        XCTAssertEqual(
            FirestoreMobileCheckinClient.failureState(
                for: MobileCheckinValidationError.invalid("bad")
            ),
            .invalidPayload
        )
        XCTAssertEqual(
            FirestoreMobileCheckinClient.failureState(
                for: MobileCheckinValidationError.stateConflict("changed")
            ),
            .stateConflict
        )
    }

    func testPlanResolverAndGoalSignatureMatchWebDomainConventions() throws {
        let goal = TodayGoal(
            raceDistance: .tenK,
            targetDate: "2026-10-18",
            experienceLevel: .intermediate,
            currentPersonalRecords: ["5k": 1500, "10k": 3200],
            weeklyMileage: 24
        )
        XCTAssertEqual(
            MobileCheckinGoalSignature.make(goal),
            "{\"v\":2,\"g\":\"race\",\"rd\":\"10k\",\"td\":\"2026-10-18\",\"el\":\"intermediate\",\"pr\":{\"5k\":1500,\"10k\":3200},\"wm\":24}"
        )
        let plan = TodaySavedPlan(
            planStart: "2026-07-20",
            weeks: [
                TodayPlanWeek(
                    weekNumber: 3,
                    workouts: [
                        TodayPlanWorkout(day: "Mon", type: .tempo, distance: 4, pace: 9, duration: 40),
                        TodayPlanWorkout(day: "Sun", type: .longRun, distance: 8, pace: 10, duration: 80)
                    ]
                )
            ]
        )
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        XCTAssertEqual(
            MobileCheckinPlanResolver.slots(plan: plan, calendar: calendar),
            [
                MobileCheckinPlanSlot(
                    weekNumber: 3,
                    day: .mon,
                    scheduledDate: "2026-07-20",
                    workout: .tempo
                ),
                MobileCheckinPlanSlot(
                    weekNumber: 3,
                    day: .sun,
                    scheduledDate: "2026-07-26",
                    workout: .longRun
                )
            ]
        )
    }

    private func loadObject() throws -> [String: Any] {
        let url = try XCTUnwrap(
            Bundle.module.url(
                forResource: "mobile-checkin-contract",
                withExtension: "json",
                subdirectory: "Fixtures"
            )
        )
        return try XCTUnwrap(
            JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        )
    }

    private func data(_ value: Any?) throws -> Data {
        guard let value, JSONSerialization.isValidJSONObject(value) else {
            throw XCTSkip("Fixture object is missing or invalid")
        }
        return try JSONSerialization.data(withJSONObject: value)
    }

    private func decode<Value: Decodable>(_ value: Any?) throws -> Value {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(Value.self, from: data(value))
    }
}

import Foundation

enum MobileCheckinContract {
    static let schema = "mobile-checkin.v1"
    static let fixtureSchema = "mobile-checkin-fixture.v1"
    static let maximumLatencyMs = 120_000
    static let maximumPastAge: TimeInterval = 36 * 60 * 60
    static let maximumFutureSkew: TimeInterval = 5 * 60
}

enum MobileCheckinKind: String, Codable, CaseIterable {
    case perceivedRecovery = "perceived_recovery"
    case workoutOutcome = "workout_outcome"
}

enum MobileCheckinFailureState: String, Codable, CaseIterable {
    case none
    case authRequired = "auth_required"
    case offline
    case timeout
    case invalidPayload = "invalid_payload"
    case stateConflict = "state_conflict"
    case permissionDenied = "permission_denied"
    case unknown
}

enum MobileCheckinWriteScope: String, Codable {
    case readiness
    case workoutsRecommendations = "workouts_recommendations"
    case none
}

enum MobileCheckinDay: String, Codable, CaseIterable {
    case mon = "Mon"
    case tue = "Tue"
    case wed = "Wed"
    case thu = "Thu"
    case fri = "Fri"
    case sat = "Sat"
    case sun = "Sun"

    static func current(_ date: Date, calendar: Calendar = .current) -> MobileCheckinDay {
        switch calendar.component(.weekday, from: date) {
        case 1: .sun
        case 2: .mon
        case 3: .tue
        case 4: .wed
        case 5: .thu
        case 6: .fri
        default: .sat
        }
    }

    var mondayOffset: Int {
        switch self {
        case .mon: 0
        case .tue: 1
        case .wed: 2
        case .thu: 3
        case .fri: 4
        case .sat: 5
        case .sun: 6
        }
    }
}

enum MobileCheckinWorkoutKind: String, Codable, CaseIterable {
    case easy
    case tempo
    case intervals
    case longRun = "long_run"
    case race
    case rest

    init(_ type: TodayWorkoutType) {
        switch type {
        case .easy: self = .easy
        case .tempo: self = .tempo
        case .intervals: self = .intervals
        case .longRun: self = .longRun
        case .race: self = .race
        }
    }

    var persistedLabel: String {
        self == .longRun ? "long run" : rawValue
    }
}

enum MobileCheckinWorkoutStatus: String, Codable, CaseIterable {
    case completed
    case skipped
}

enum MobileCheckinReflection: String, Codable, CaseIterable {
    case easierThanExpected = "easier_than_expected"
    case asExpected = "as_expected"
    case harderThanExpected = "harder_than_expected"
}

enum MobileCheckinSkipReason: String, Codable, CaseIterable {
    case schedule
    case recovery
    case painOrDiscomfort = "pain_or_discomfort"
    case other
}

enum MobileCheckinAdjustmentResponse: String, Codable, CaseIterable {
    case accepted
    case rejected
}

struct MobileRecoveryCheckin: Codable, Equatable {
    var perceivedRecovery: Int
    var fatigueLevel: Int
    var sorenessLevel: Int
    var sleepHoursCorrection: Double?

    enum CodingKeys: String, CodingKey {
        case perceivedRecovery = "perceived_recovery"
        case fatigueLevel = "fatigue_level"
        case sorenessLevel = "soreness_level"
        case sleepHoursCorrection = "sleep_hours_correction"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(perceivedRecovery, forKey: .perceivedRecovery)
        try container.encode(fatigueLevel, forKey: .fatigueLevel)
        try container.encode(sorenessLevel, forKey: .sorenessLevel)
        if let sleepHoursCorrection {
            try container.encode(sleepHoursCorrection, forKey: .sleepHoursCorrection)
        } else {
            try container.encodeNil(forKey: .sleepHoursCorrection)
        }
    }
}

struct MobileWorkoutCheckin: Codable, Equatable {
    var weekNumber: Int
    var day: MobileCheckinDay
    var scheduledDate: String
    var status: MobileCheckinWorkoutStatus
    var perceivedEffort: Int?
    var reflection: MobileCheckinReflection?
    var skipReason: MobileCheckinSkipReason?
    var selectedAction: DecisionActionName
    var confidenceBucket: ConfidenceBucket
    var plannedWorkout: MobileCheckinWorkoutKind
    var recommendedWorkout: MobileCheckinWorkoutKind
    var adjustmentResponse: MobileCheckinAdjustmentResponse?

    enum CodingKeys: String, CodingKey {
        case weekNumber = "week_number"
        case day
        case scheduledDate = "scheduled_date"
        case status
        case perceivedEffort = "perceived_effort"
        case reflection
        case skipReason = "skip_reason"
        case selectedAction = "selected_action"
        case confidenceBucket = "confidence_bucket"
        case plannedWorkout = "planned_workout"
        case recommendedWorkout = "recommended_workout"
        case adjustmentResponse = "adjustment_response"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(weekNumber, forKey: .weekNumber)
        try container.encode(day, forKey: .day)
        try container.encode(scheduledDate, forKey: .scheduledDate)
        try container.encode(status, forKey: .status)
        if let perceivedEffort {
            try container.encode(perceivedEffort, forKey: .perceivedEffort)
        } else {
            try container.encodeNil(forKey: .perceivedEffort)
        }
        if let reflection {
            try container.encode(reflection, forKey: .reflection)
        } else {
            try container.encodeNil(forKey: .reflection)
        }
        if let skipReason {
            try container.encode(skipReason, forKey: .skipReason)
        } else {
            try container.encodeNil(forKey: .skipReason)
        }
        try container.encode(selectedAction, forKey: .selectedAction)
        try container.encode(confidenceBucket, forKey: .confidenceBucket)
        try container.encode(plannedWorkout, forKey: .plannedWorkout)
        try container.encode(recommendedWorkout, forKey: .recommendedWorkout)
        if let adjustmentResponse {
            try container.encode(adjustmentResponse, forKey: .adjustmentResponse)
        } else {
            try container.encodeNil(forKey: .adjustmentResponse)
        }
    }
}

enum MobileCheckinRequest: Codable, Equatable {
    case perceivedRecovery(localDay: String, capturedAt: String, recovery: MobileRecoveryCheckin)
    case workoutOutcome(localDay: String, capturedAt: String, workout: MobileWorkoutCheckin)

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case platform
        case kind
        case localDay = "local_day"
        case capturedAt = "captured_at"
        case recovery
        case workout
    }

    var kind: MobileCheckinKind {
        switch self {
        case .perceivedRecovery: .perceivedRecovery
        case .workoutOutcome: .workoutOutcome
        }
    }

    var localDay: String {
        switch self {
        case .perceivedRecovery(let value, _, _), .workoutOutcome(let value, _, _): value
        }
    }

    var capturedAt: String {
        switch self {
        case .perceivedRecovery(_, let value, _), .workoutOutcome(_, let value, _): value
        }
    }

    var status: MobileCheckinStatus {
        switch self {
        case .perceivedRecovery: .checkedIn
        case .workoutOutcome(_, _, let workout):
            workout.status == .completed ? .completed : .skipped
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard try container.decode(String.self, forKey: .schemaVersion) == MobileCheckinContract.schema,
              try container.decode(MobilePlatform.self, forKey: .platform) == .ios else {
            throw MobileCheckinValidationError.invalid("Unsupported mobile check-in envelope.")
        }
        let kind = try container.decode(MobileCheckinKind.self, forKey: .kind)
        let localDay = try container.decode(String.self, forKey: .localDay)
        let capturedAt = try container.decode(String.self, forKey: .capturedAt)
        switch kind {
        case .perceivedRecovery:
            self = .perceivedRecovery(
                localDay: localDay,
                capturedAt: capturedAt,
                recovery: try container.decode(MobileRecoveryCheckin.self, forKey: .recovery)
            )
        case .workoutOutcome:
            self = .workoutOutcome(
                localDay: localDay,
                capturedAt: capturedAt,
                workout: try container.decode(MobileWorkoutCheckin.self, forKey: .workout)
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(MobileCheckinContract.schema, forKey: .schemaVersion)
        try container.encode(MobilePlatform.ios, forKey: .platform)
        try container.encode(kind, forKey: .kind)
        try container.encode(localDay, forKey: .localDay)
        try container.encode(capturedAt, forKey: .capturedAt)
        switch self {
        case .perceivedRecovery(_, _, let recovery):
            try container.encode(recovery, forKey: .recovery)
        case .workoutOutcome(_, _, let workout):
            try container.encode(workout, forKey: .workout)
        }
    }

    static func decode(_ data: Data) throws -> MobileCheckinRequest {
        let object = try JSONSerialization.jsonObject(with: data)
        try MobileCheckinValidator.validateRequestStructure(object)
        let request: MobileCheckinRequest
        do {
            request = try JSONDecoder().decode(MobileCheckinRequest.self, from: data)
        } catch let error as MobileCheckinValidationError {
            throw error
        } catch {
            throw MobileCheckinValidationError.invalid("Malformed mobile check-in request.")
        }
        try MobileCheckinValidator.validate(request)
        return request
    }
}

struct MobileCheckinPlanSlot: Codable, Equatable {
    var weekNumber: Int
    var day: MobileCheckinDay
    var scheduledDate: String
    var workout: MobileCheckinWorkoutKind

    enum CodingKeys: String, CodingKey {
        case weekNumber = "week_number"
        case day
        case scheduledDate = "scheduled_date"
        case workout
    }
}

struct MobileCheckinWorkoutLogEntry: Codable, Equatable {
    var weekNumber: Int
    var day: MobileCheckinDay
    var status: MobileCheckinWorkoutStatus
    var scheduledDate: String
    var loggedAt: String
    var acceptedAdjustment: Bool?
}

struct MobileCheckinWorkoutLog: Codable, Equatable {
    var goalSig: String
    var entries: [MobileCheckinWorkoutLogEntry]
}

struct MobileCheckinActualWorkout: Codable, Equatable {
    var completed: Bool
    var distanceMiles: Double?
    var durationMinutes: Double?
    var perceivedEffort: Int?
    var reflectionCategory: MobileCheckinReflection?
    var skipReason: MobileCheckinSkipReason?
    var note: String?
}

struct MobileCheckinRecommendationContext: Codable, Equatable {
    var calendarLoad: String?
    var sleepStatus: String?
    var recoveryStatus: String?
}

struct MobileCheckinRecommendationEvent: Codable, Equatable {
    var id: String
    var date: String
    var plannedWorkout: String
    var recommendedWorkout: String
    var selectedAction: DecisionActionName
    var confidence: ConfidenceBucket
    var recoveryScore: Double?
    var availableMinutes: Int?
    var userResponse: String?
    var rejectionReason: String?
    var actualWorkout: MobileCheckinActualWorkout?
    var context: MobileCheckinRecommendationContext
}

struct MobileCheckinRecommendationLog: Codable, Equatable {
    var version: Int
    var events: [String: MobileCheckinRecommendationEvent]
}

struct MobileCheckinState: Codable, Equatable {
    var goalSignature: String
    var planSlots: [MobileCheckinPlanSlot]
    var readiness: ReadinessLog?
    var workouts: MobileCheckinWorkoutLog?
    var recommendations: MobileCheckinRecommendationLog?

    enum CodingKeys: String, CodingKey {
        case goalSignature = "goal_signature"
        case planSlots = "plan_slots"
        case readiness
        case workouts
        case recommendations
    }
}

struct MobileCheckinAuditProperties: Equatable {
    var checkinKind: MobileCheckinKind
    var status: MobileCheckinStatus
    var outcome: MobileDecisionOutcome
    var failureState: MobileCheckinFailureState
    var writeScope: MobileCheckinWriteScope
    var deterministicValidation: DeterministicValidationState
    var hasEffort: Bool
    var hasUserReflection: Bool
    var updateSucceeded: Bool
    var latencyMs: Int
}

struct MobileCheckinApplyResult: Equatable {
    var readiness: ReadinessLog?
    var workouts: MobileCheckinWorkoutLog?
    var recommendations: MobileCheckinRecommendationLog?
    var writeDomains: [String]
    var audit: MobileCheckinAuditProperties
}

enum MobileCheckinValidationError: Error, Equatable, LocalizedError {
    case invalid(String)
    case stateConflict(String)

    var failureState: MobileCheckinFailureState {
        switch self {
        case .invalid: .invalidPayload
        case .stateConflict: .stateConflict
        }
    }

    var errorDescription: String? {
        switch self {
        case .invalid(let message), .stateConflict(let message): message
        }
    }
}

enum MobileCheckinValidator {
    static func validate(_ request: MobileCheckinRequest, now: Date? = nil) throws {
        guard MobileTodayDate.isLocalDay(request.localDay),
              request.capturedAt.count <= 40,
              MobileTodayDate.parse(request.capturedAt) != nil else {
            throw MobileCheckinValidationError.invalid("Invalid mobile check-in day or timestamp.")
        }
        if let now { try validateTiming(request, now: now) }

        switch request {
        case .perceivedRecovery(_, _, let recovery):
            guard (1...5).contains(recovery.perceivedRecovery),
                  (1...5).contains(recovery.fatigueLevel),
                  (1...5).contains(recovery.sorenessLevel),
                  recovery.sleepHoursCorrection.map({ $0.isFinite && (0...24).contains($0) }) ?? true else {
                throw MobileCheckinValidationError.invalid("Recovery values are outside their fixed bounds.")
            }
        case .workoutOutcome(let localDay, _, let workout):
            guard (1...52).contains(workout.weekNumber),
                  MobileTodayDate.isLocalDay(workout.scheduledDate),
                  workout.scheduledDate == localDay,
                  workout.plannedWorkout != .rest else {
                throw MobileCheckinValidationError.invalid("Workout check-in does not identify a current plan slot.")
            }
            switch workout.status {
            case .completed:
                guard workout.perceivedEffort.map({ (1...10).contains($0) }) == true,
                      workout.skipReason == nil else {
                    throw MobileCheckinValidationError.invalid("Completed workouts require effort and cannot carry a skip reason.")
                }
            case .skipped:
                guard workout.perceivedEffort == nil,
                      workout.reflection == nil,
                      workout.skipReason != nil else {
                    throw MobileCheckinValidationError.invalid("Skipped workouts require one bounded reason only.")
                }
            }
            switch workout.selectedAction {
            case .proceed:
                guard workout.adjustmentResponse == nil,
                      workout.recommendedWorkout == workout.plannedWorkout else {
                    throw MobileCheckinValidationError.invalid("Proceed check-ins cannot claim an adjustment.")
                }
            case .modify:
                guard workout.adjustmentResponse != nil else {
                    throw MobileCheckinValidationError.invalid("Modified decisions require an explicit response.")
                }
            case .rest:
                guard workout.adjustmentResponse != nil,
                      workout.recommendedWorkout == .rest else {
                    throw MobileCheckinValidationError.invalid("Rest decisions must retain the rest recommendation and response.")
                }
                if workout.status == .completed, workout.adjustmentResponse != .rejected {
                    throw MobileCheckinValidationError.invalid("Completing after a rest recommendation rejects it.")
                }
                if workout.status == .skipped, workout.adjustmentResponse != .accepted {
                    throw MobileCheckinValidationError.invalid("Skipping after a rest recommendation accepts it.")
                }
            }
        }
    }

    static func validateTiming(_ request: MobileCheckinRequest, now: Date) throws {
        guard let captured = MobileTodayDate.parse(request.capturedAt) else {
            throw MobileCheckinValidationError.invalid("Invalid mobile check-in timestamp.")
        }
        let age = now.timeIntervalSince(captured)
        guard age >= -MobileCheckinContract.maximumFutureSkew,
              age <= MobileCheckinContract.maximumPastAge else {
            throw MobileCheckinValidationError.invalid(
                "Mobile check-in timestamp is outside the allowed daily window."
            )
        }
    }

    static func validate(_ state: MobileCheckinState) throws {
        guard !state.goalSignature.isEmpty,
              state.goalSignature.count <= 500,
              state.planSlots.count <= 366 else {
            throw MobileCheckinValidationError.stateConflict("Current goal or plan state is invalid.")
        }
        for slot in state.planSlots {
            guard (1...52).contains(slot.weekNumber),
                  MobileTodayDate.isLocalDay(slot.scheduledDate),
                  slot.workout != .rest else {
                throw MobileCheckinValidationError.stateConflict("Current plan contains an invalid slot.")
            }
        }
        if let readiness = state.readiness {
            guard readiness.entries.count <= 1_000 else {
                throw MobileCheckinValidationError.stateConflict("Readiness history is too large.")
            }
            for (day, entry) in readiness.entries {
                guard day == entry.date,
                      MobileTodayDate.isLocalDay(day),
                      entry.sleepHours.map({ $0.isFinite && (0...24).contains($0) }) ?? true,
                      entry.hrv.map({ $0.isFinite && (1...300).contains($0) }) ?? true,
                      entry.restingHeartRate.map({ $0.isFinite && (20...220).contains($0) }) ?? true,
                      entry.fatigueLevel.map({ (1...5).contains($0) }) ?? true,
                      entry.sorenessLevel.map({ (1...5).contains($0) }) ?? true,
                      entry.perceivedRecovery.map({ (1...5).contains($0) }) ?? true else {
                    throw MobileCheckinValidationError.stateConflict("Readiness state is invalid.")
                }
            }
        }
        if let workouts = state.workouts {
            guard workouts.goalSig.count <= 500,
                  !workouts.goalSig.isEmpty,
                  workouts.entries.count <= 1_000 else {
                throw MobileCheckinValidationError.stateConflict("Workout history is invalid.")
            }
            for entry in workouts.entries {
                guard (1...52).contains(entry.weekNumber),
                      MobileTodayDate.isLocalDay(entry.scheduledDate),
                      entry.loggedAt.count <= 40,
                      MobileTodayDate.parse(entry.loggedAt) != nil else {
                    throw MobileCheckinValidationError.stateConflict("Workout history is invalid.")
                }
            }
        }
        if let recommendations = state.recommendations {
            guard recommendations.version == 1,
                  recommendations.events.count <= 1_000,
                  recommendations.events.allSatisfy({ $0.key == $0.value.id }) else {
                throw MobileCheckinValidationError.stateConflict("Recommendation history is invalid.")
            }
            for event in recommendations.events.values {
                let allowedResponses: Set<String> = [
                    "accepted", "rejected", "modified", "skipped"
                ]
                let allowedCalendar: Set<String> = ["light", "moderate", "heavy"]
                let allowedSleep: Set<String> = [
                    "below_baseline", "normal", "above_baseline"
                ]
                let allowedRecovery: Set<String> = ["low", "moderate", "high"]
                guard !event.id.isEmpty,
                      event.id.count <= 500,
                      MobileTodayDate.isLocalDay(event.date),
                      (1...500).contains(event.plannedWorkout.count),
                      (1...500).contains(event.recommendedWorkout.count),
                      event.userResponse.map(allowedResponses.contains) ?? true,
                      event.context.calendarLoad.map(allowedCalendar.contains) ?? true,
                      event.context.sleepStatus.map(allowedSleep.contains) ?? true,
                      event.context.recoveryStatus.map(allowedRecovery.contains) ?? true else {
                    throw MobileCheckinValidationError.stateConflict(
                        "Recommendation history is invalid."
                    )
                }
                if let actual = event.actualWorkout {
                    guard actual.perceivedEffort.map({ (1...10).contains($0) }) ?? true,
                          actual.note.map({ (1...500).contains($0.count) }) ?? true else {
                        throw MobileCheckinValidationError.stateConflict(
                            "Recommendation workout outcome is invalid."
                        )
                    }
                }
            }
        }
    }

    static func validateRequestStructure(_ value: Any) throws {
        try rejectForbiddenKeys(value)
        let request = try object(value, "mobile check-in request")
        guard let rawKind = request["kind"] as? String,
              let kind = MobileCheckinKind(rawValue: rawKind) else {
            throw MobileCheckinValidationError.invalid("Unsupported mobile check-in kind.")
        }
        switch kind {
        case .perceivedRecovery:
            try exactKeys(
                request,
                ["schema_version", "platform", "kind", "local_day", "captured_at", "recovery"]
            )
            try exactKeys(
                try object(request["recovery"], "recovery check-in"),
                ["perceived_recovery", "fatigue_level", "soreness_level", "sleep_hours_correction"]
            )
        case .workoutOutcome:
            try exactKeys(
                request,
                ["schema_version", "platform", "kind", "local_day", "captured_at", "workout"]
            )
            try exactKeys(
                try object(request["workout"], "workout check-in"),
                [
                    "week_number", "day", "scheduled_date", "status", "perceived_effort",
                    "reflection", "skip_reason", "selected_action", "confidence_bucket",
                    "planned_workout", "recommended_workout", "adjustment_response"
                ]
            )
        }
    }

    private static func object(_ value: Any?, _ label: String) throws -> [String: Any] {
        guard let value = value as? [String: Any] else {
            throw MobileCheckinValidationError.invalid("\(label) must be an object.")
        }
        return value
    }

    private static func exactKeys(_ value: [String: Any], _ expected: Set<String>) throws {
        guard Set(value.keys) == expected else {
            throw MobileCheckinValidationError.invalid("Unexpected mobile check-in structure.")
        }
    }

    private static func rejectForbiddenKeys(_ value: Any) throws {
        if let values = value as? [Any] {
            for child in values { try rejectForbiddenKeys(child) }
            return
        }
        guard let object = value as? [String: Any] else { return }
        let forbidden: Set<String> = [
            "uid", "email", "full_name", "name", "token", "secret", "note", "notes",
            "raw_note", "reflection_text", "workout_text", "calendar_text", "healthkit_samples",
            "raw_samples", "hrv", "resting_hr", "pain_severity", "injury", "diagnosis",
            "medical_data"
        ]
        for (key, child) in object {
            if forbidden.contains(key.lowercased()) {
                throw MobileCheckinValidationError.invalid("Forbidden mobile check-in key: \(key)")
            }
            try rejectForbiddenKeys(child)
        }
    }
}

enum MobileCheckinEngine {
    static func apply(
        _ request: MobileCheckinRequest,
        to state: MobileCheckinState,
        now: Date
    ) throws -> MobileCheckinApplyResult {
        try MobileCheckinValidator.validate(request, now: now)
        try MobileCheckinValidator.validate(state)
        switch request {
        case .perceivedRecovery:
            return try applyRecovery(request, state: state)
        case .workoutOutcome:
            return try applyWorkout(request, state: state)
        }
    }

    static func audit(
        for request: MobileCheckinRequest,
        outcome: MobileDecisionOutcome,
        failureState: MobileCheckinFailureState,
        writeScope: MobileCheckinWriteScope,
        validation: DeterministicValidationState,
        updateSucceeded: Bool,
        latencyMs: Int
    ) throws -> MobileCheckinAuditProperties {
        let success = outcome == .success
        guard success
            ? failureState == .none && writeScope != .none
                && validation == .passed && updateSucceeded
            : failureState != .none && writeScope == .none && !updateSucceeded else {
            throw MobileCheckinValidationError.invalid("Mobile check-in audit state is inconsistent.")
        }
        let workout: MobileWorkoutCheckin? = if case .workoutOutcome(_, _, let value) = request {
            value
        } else {
            nil
        }
        return MobileCheckinAuditProperties(
            checkinKind: request.kind,
            status: request.status,
            outcome: outcome,
            failureState: failureState,
            writeScope: writeScope,
            deterministicValidation: validation,
            hasEffort: workout?.perceivedEffort != nil,
            hasUserReflection: workout?.reflection != nil,
            updateSucceeded: updateSucceeded,
            latencyMs: min(MobileCheckinContract.maximumLatencyMs, max(0, latencyMs))
        )
    }

    static func recommendationEventID(_ request: MobileCheckinRequest) -> String? {
        guard case .workoutOutcome(let day, _, let workout) = request else { return nil }
        return "mobile:\(day):\(workout.weekNumber):\(workout.day.rawValue.lowercased())"
    }

    private static func applyRecovery(
        _ request: MobileCheckinRequest,
        state: MobileCheckinState
    ) throws -> MobileCheckinApplyResult {
        guard case .perceivedRecovery(let day, let capturedAt, let recovery) = request,
              let updatedAt = MobileTodayDate.parse(capturedAt) else {
            throw MobileCheckinValidationError.invalid("Invalid recovery check-in.")
        }
        var readiness = state.readiness ?? ReadinessLog(entries: [:])
        var entry = readiness.entries[day] ?? ReadinessEntry(
            date: day,
            sleepHours: nil,
            hrv: nil,
            restingHeartRate: nil,
            fatigueLevel: nil,
            sorenessLevel: nil,
            perceivedRecovery: nil,
            source: nil,
            updatedAt: updatedAt
        )
        let existingSource = entry.source
        entry.date = day
        entry.perceivedRecovery = recovery.perceivedRecovery
        entry.fatigueLevel = recovery.fatigueLevel
        entry.sorenessLevel = recovery.sorenessLevel
        if let correction = recovery.sleepHoursCorrection {
            entry.sleepHours = correction
        }
        entry.source = [.healthkit, .appleHealthCsv, .demo, .mixed].contains(existingSource)
            ? .mixed
            : .manual
        entry.updatedAt = updatedAt
        readiness.entries[day] = entry
        return MobileCheckinApplyResult(
            readiness: readiness,
            workouts: state.workouts,
            recommendations: state.recommendations,
            writeDomains: ["readiness"],
            audit: try audit(
                for: request,
                outcome: .success,
                failureState: .none,
                writeScope: .readiness,
                validation: .passed,
                updateSucceeded: true,
                latencyMs: 0
            )
        )
    }

    private static func applyWorkout(
        _ request: MobileCheckinRequest,
        state: MobileCheckinState
    ) throws -> MobileCheckinApplyResult {
        guard case .workoutOutcome(let day, let capturedAt, let workout) = request else {
            throw MobileCheckinValidationError.invalid("Invalid workout check-in.")
        }
        guard state.planSlots.contains(where: {
            $0.weekNumber == workout.weekNumber && $0.day == workout.day
                && $0.scheduledDate == workout.scheduledDate && $0.workout == workout.plannedWorkout
        }) else {
            throw MobileCheckinValidationError.stateConflict(
                "Workout check-in no longer matches the current plan slot."
            )
        }
        if let current = state.workouts, current.goalSig != state.goalSignature {
            throw MobileCheckinValidationError.stateConflict(
                "Workout history belongs to a different goal."
            )
        }

        let entry = MobileCheckinWorkoutLogEntry(
            weekNumber: workout.weekNumber,
            day: workout.day,
            status: workout.status,
            scheduledDate: workout.scheduledDate,
            loggedAt: capturedAt,
            acceptedAdjustment: workout.adjustmentResponse.map { $0 == .accepted }
        )
        let priorEntries = state.workouts?.entries ?? []
        let workouts = MobileCheckinWorkoutLog(
            goalSig: state.goalSignature,
            entries: priorEntries.filter {
                $0.weekNumber != entry.weekNumber || $0.day != entry.day
            } + [entry]
        )

        let eventID = recommendationEventID(request)!
        let actual = MobileCheckinActualWorkout(
            completed: workout.status == .completed,
            distanceMiles: nil,
            durationMinutes: nil,
            perceivedEffort: workout.perceivedEffort,
            reflectionCategory: workout.reflection,
            skipReason: workout.skipReason,
            note: nil
        )
        let event = MobileCheckinRecommendationEvent(
            id: eventID,
            date: day,
            plannedWorkout: workout.plannedWorkout.persistedLabel,
            recommendedWorkout: workout.recommendedWorkout.persistedLabel,
            selectedAction: workout.selectedAction,
            confidence: workout.confidenceBucket,
            recoveryScore: nil,
            availableMinutes: nil,
            userResponse: workout.status == .skipped
                ? "skipped"
                : workout.adjustmentResponse == .rejected ? "rejected" : "accepted",
            rejectionReason: nil,
            actualWorkout: actual,
            context: MobileCheckinRecommendationContext(
                calendarLoad: nil,
                sleepStatus: nil,
                recoveryStatus: nil
            )
        )
        var events = state.recommendations?.events ?? [:]
        events[eventID] = event
        let recommendations = MobileCheckinRecommendationLog(version: 1, events: events)
        return MobileCheckinApplyResult(
            readiness: state.readiness,
            workouts: workouts,
            recommendations: recommendations,
            writeDomains: ["workouts", "recommendations"],
            audit: try audit(
                for: request,
                outcome: .success,
                failureState: .none,
                writeScope: .workoutsRecommendations,
                validation: .passed,
                updateSucceeded: true,
                latencyMs: 0
            )
        )
    }
}

enum MobileCheckinRequestBuilder {
    static func recovery(
        perceivedRecovery: Int,
        fatigueLevel: Int,
        sorenessLevel: Int,
        sleepHoursCorrection: Double?,
        now: Date = Date(),
        calendar: Calendar = .current
    ) throws -> MobileCheckinRequest {
        let request = MobileCheckinRequest.perceivedRecovery(
            localDay: MobileTodayDate.localDay(now, calendar: calendar),
            capturedAt: MobileTodayDate.isoString(now),
            recovery: MobileRecoveryCheckin(
                perceivedRecovery: perceivedRecovery,
                fatigueLevel: fatigueLevel,
                sorenessLevel: sorenessLevel,
                sleepHoursCorrection: sleepHoursCorrection
            )
        )
        try MobileCheckinValidator.validate(request, now: now)
        return request
    }

    static func workout(
        shared: MobileTodaySharedState,
        snapshot: MobileTodayDecisionSnapshot,
        status: MobileCheckinWorkoutStatus,
        perceivedEffort: Int?,
        reflection: MobileCheckinReflection?,
        skipReason: MobileCheckinSkipReason?,
        adjustmentResponse: MobileCheckinAdjustmentResponse?,
        now: Date = Date(),
        calendar: Calendar = .current
    ) throws -> MobileCheckinRequest {
        let localDay = MobileTodayDate.localDay(now, calendar: calendar)
        guard snapshot.localDay == localDay,
              let plan = shared.plan,
              let slot = MobileCheckinPlanResolver.currentSlot(
                plan: plan,
                now: now,
                calendar: calendar
              ) else {
            throw MobileCheckinValidationError.stateConflict(
                "Refresh Today before saving a workout outcome."
            )
        }
        let action = snapshot.decision.selectedAction.name
        let response: MobileCheckinAdjustmentResponse?
        switch action {
        case .proceed:
            response = nil
        case .rest:
            response = status == .completed ? .rejected : .accepted
        case .modify:
            response = adjustmentResponse
        }
        let request = MobileCheckinRequest.workoutOutcome(
            localDay: localDay,
            capturedAt: MobileTodayDate.isoString(now),
            workout: MobileWorkoutCheckin(
                weekNumber: slot.weekNumber,
                day: slot.day,
                scheduledDate: slot.scheduledDate,
                status: status,
                perceivedEffort: perceivedEffort,
                reflection: reflection,
                skipReason: skipReason,
                selectedAction: action,
                confidenceBucket: confidence(snapshot.decision.confidence),
                plannedWorkout: slot.workout,
                recommendedWorkout: action == .rest ? .rest : slot.workout,
                adjustmentResponse: response
            )
        )
        try MobileCheckinValidator.validate(request, now: now)
        return request
    }

    private static func confidence(_ value: Double) -> ConfidenceBucket {
        if value >= 0.75 { return .high }
        if value >= 0.5 { return .moderate }
        return .low
    }
}

enum MobileCheckinPlanResolver {
    static func currentSlot(
        plan: TodaySavedPlan,
        now: Date,
        calendar: Calendar = .current
    ) -> MobileCheckinPlanSlot? {
        let localDay = MobileTodayDate.localDay(now, calendar: calendar)
        return slots(plan: plan, calendar: calendar).first { $0.scheduledDate == localDay }
    }

    static func slots(
        plan: TodaySavedPlan,
        calendar: Calendar = .current
    ) -> [MobileCheckinPlanSlot] {
        guard let start = localDayDate(plan.planStart, calendar: calendar) else { return [] }
        return plan.weeks.enumerated().flatMap { index, week in
            week.workouts.compactMap { workout in
                guard let day = MobileCheckinDay(rawValue: workout.day),
                      let scheduled = calendar.date(
                        byAdding: .day,
                        value: index * 7 + day.mondayOffset,
                        to: start
                      ) else { return nil }
                return MobileCheckinPlanSlot(
                    weekNumber: week.weekNumber,
                    day: day,
                    scheduledDate: MobileTodayDate.localDay(scheduled, calendar: calendar),
                    workout: MobileCheckinWorkoutKind(workout.type)
                )
            }
        }
    }

    private static func localDayDate(_ value: String, calendar: Calendar) -> Date? {
        guard MobileTodayDate.isLocalDay(value) else { return nil }
        let parts = value.split(separator: "-").compactMap { Int($0) }
        return calendar.date(
            from: DateComponents(year: parts[0], month: parts[1], day: parts[2])
        )
    }
}

enum MobileCheckinGoalSignature {
    private static let recordKeys = ["5k", "10k", "half", "marathon"]

    static func make(_ goal: TodayGoal) -> String {
        let records = recordKeys.compactMap { key -> String? in
            guard let value = goal.currentPersonalRecords[key] else { return nil }
            return "\(json(key)):\(json(value))"
        }.joined(separator: ",")
        let mileage = goal.weeklyMileage.map(json) ?? "null"
        return "{" + [
            "\"v\":2",
            "\"g\":\(json("race"))",
            "\"rd\":\(json(goal.raceDistance.rawValue))",
            "\"td\":\(goal.targetDate.map(json) ?? "null")",
            "\"el\":\(json(goal.experienceLevel.rawValue))",
            "\"pr\":{\(records)}",
            "\"wm\":\(mileage)"
        ].joined(separator: ",") + "}"
    }

    static func matches(_ signature: String, goal: TodayGoal) -> Bool {
        guard let data = signature.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data),
              let value = object as? [String: Any],
              Set(value.keys) == Set(["v", "g", "rd", "td", "el", "pr", "wm"]),
              number(value["v"]) == 2,
              value["g"] as? String == "race",
              value["rd"] as? String == goal.raceDistance.rawValue,
              matchesNullableString(value["td"], expected: goal.targetDate),
              value["el"] as? String == goal.experienceLevel.rawValue,
              let records = value["pr"] as? [String: Any],
              Set(records.keys) == Set(goal.currentPersonalRecords.keys),
              Set(records.keys).isSubset(of: Set(recordKeys)),
              records.allSatisfy({ key, stored in
                  number(stored) == goal.currentPersonalRecords[key]
              }),
              matchesNullableNumber(value["wm"], expected: goal.weeklyMileage) else {
            return false
        }
        return true
    }

    private static func matchesNullableString(_ value: Any?, expected: String?) -> Bool {
        guard let value, !(value is NSNull) else { return expected == nil }
        guard let string = value as? String else { return false }
        return string == expected
    }

    private static func matchesNullableNumber(_ value: Any?, expected: Double?) -> Bool {
        guard let value, !(value is NSNull) else { return expected == nil }
        guard let stored = number(value), let expected else { return false }
        return stored == expected
    }

    private static func number(_ value: Any?) -> Double? {
        guard let value, !(value is Bool), let number = value as? NSNumber else {
            return nil
        }
        return number.doubleValue
    }

    private static func json(_ value: String) -> String {
        let data = try! JSONSerialization.data(withJSONObject: [value])
        return String(decoding: data.dropFirst().dropLast(), as: UTF8.self)
    }

    private static func json(_ value: Double) -> String {
        let data = try! JSONSerialization.data(withJSONObject: [value])
        return String(decoding: data.dropFirst().dropLast(), as: UTF8.self)
    }
}

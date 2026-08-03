import Foundation

let mobilePlanLifecycleSchema = "mobile-plan-lifecycle.v1"

enum MobilePlanContractError: Error, Equatable {
    case invalid(String)
}

enum MobilePlanMode: String, Codable { case preview, commit }
enum MobilePlanResult: String, Codable { case preview, commitReady = "commit_ready", replayed, conflict, rejected }
enum MobilePlanStatus: String, Codable, CaseIterable { case draft, active, paused, completed }
enum MobilePlanWorkoutType: String, Codable, CaseIterable {
    case easy, tempo, intervals, longRun = "long_run", race
}
enum MobilePlanWorkoutStatus: String, Codable { case scheduled, completed, skipped }
enum MobilePlanReasonCode: String, Codable {
    case basePlan = "base_plan", availability, preferredDay = "preferred_day"
    case runnerEdit = "runner_edit", futureRegeneration = "future_regeneration", raceDay = "race_day"
}
enum MobilePlanAction: String, Codable, CaseIterable {
    case generate, save, move, shorten, replace, skip, availability
    case preferredDay = "preferred_day", regenerateFuture = "regenerate_future", pause, resume
}
enum MobilePlanExplanationCode: String, Codable {
    case initialGeneration = "initial_generation", runnerConfirmed = "runner_confirmed"
    case scheduleChange = "schedule_change", durationChange = "duration_change"
    case workoutReplacement = "workout_replacement", runnerSkip = "runner_skip"
    case availabilityChange = "availability_change"
    case preferredDayConfirmation = "preferred_day_confirmation"
    case goalOrPreferenceChange = "goal_or_preference_change"
    case runnerPause = "runner_pause", runnerResume = "runner_resume"
}
enum MobilePlanReason: String, Codable, CaseIterable {
    case accepted, versionConflict = "version_conflict", idempotencyConflict = "idempotency_conflict"
    case completedHistoryChanged = "completed_history_changed", raceDayChanged = "race_day_changed"
    case invalidVersionIncrement = "invalid_version_increment", duplicateWorkoutID = "duplicate_workout_id"
    case invalidActionTransition = "invalid_action_transition", planIdentityChanged = "plan_identity_changed"
    case goalRevisionChanged = "goal_revision_changed", invalidActionDelta = "invalid_action_delta"
    case duplicateWorkoutDate = "duplicate_workout_date", spacingViolation = "spacing_violation"
    case raceDayMissingOrInvalid = "race_day_missing_or_invalid"
}
enum MobilePlanWarning: String, Codable, CaseIterable {
    case completedHistoryLocked = "completed_history_locked", raceDayLocked = "race_day_locked"
    case spacingRequiresReview = "spacing_requires_review", weeklyGrowthRequiresReview = "weekly_growth_requires_review"
}

struct MobilePlanWorkout: Codable, Equatable, Identifiable {
    var id: String
    var date: String
    var type: MobilePlanWorkoutType
    var status: MobilePlanWorkoutStatus
    var distanceMiles: Double
    var durationMinutes: Int
    var paceSecondsPerMile: Int?
    var reasonCode: MobilePlanReasonCode

    enum CodingKeys: String, CodingKey {
        case id, date, type, status
        case distanceMiles = "distance_miles"
        case durationMinutes = "duration_minutes"
        case paceSecondsPerMile = "pace_seconds_per_mile"
        case reasonCode = "reason_code"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(id, forKey: .id); try container.encode(date, forKey: .date)
        try container.encode(type, forKey: .type); try container.encode(status, forKey: .status)
        try container.encode(distanceMiles, forKey: .distanceMiles); try container.encode(durationMinutes, forKey: .durationMinutes)
        if let paceSecondsPerMile { try container.encode(paceSecondsPerMile, forKey: .paceSecondsPerMile) }
        else { try container.encodeNil(forKey: .paceSecondsPerMile) }
        try container.encode(reasonCode, forKey: .reasonCode)
    }

    func validated() throws -> Self {
        guard (1...80).contains(id.count), MobilePlanValidation.isISODate(date),
              distanceMiles.isFinite, (0...40).contains(distanceMiles),
              (0...480).contains(durationMinutes),
              paceSecondsPerMile.map({ (180...1800).contains($0) }) ?? true else {
            throw MobilePlanContractError.invalid("Invalid workout.")
        }
        return self
    }
}

struct MobilePlanSnapshot: Codable, Equatable, Identifiable {
    var id: String
    var version: Int
    var status: MobilePlanStatus
    var goalRevision: Int
    var workouts: [MobilePlanWorkout]

    enum CodingKeys: String, CodingKey {
        case id, version, status, workouts
        case goalRevision = "goal_revision"
    }

    func validated() throws -> Self {
        guard (1...80).contains(id.count), version >= 0, goalRevision >= 1,
              (1...200).contains(workouts.count) else {
            throw MobilePlanContractError.invalid("Invalid plan snapshot.")
        }
        for workout in workouts { _ = try workout.validated() }
        guard Set(workouts.map(\.id)).count == workouts.count else {
            throw MobilePlanContractError.invalid("Duplicate workout identifier.")
        }
        return self
    }

    var scheduledWorkouts: [MobilePlanWorkout] {
        workouts.filter { $0.status == .scheduled }.sorted { $0.date < $1.date }
    }
}

struct MobilePlanMutation: Codable, Equatable {
    var action: MobilePlanAction
    var targetWorkoutID: String?
    var explanationCode: MobilePlanExplanationCode

    enum CodingKeys: String, CodingKey {
        case action
        case targetWorkoutID = "target_workout_id"
        case explanationCode = "explanation_code"
    }
}

struct MobilePlanPriorOperation: Codable, Equatable {
    var operationID: String
    var requestFingerprint: String
    var committedVersion: Int

    enum CodingKeys: String, CodingKey {
        case operationID = "operation_id"
        case requestFingerprint = "request_fingerprint"
        case committedVersion = "committed_version"
    }

    func validated() throws -> Self {
        guard (8...100).contains(operationID.count), (8...128).contains(requestFingerprint.count), committedVersion >= 1 else {
            throw MobilePlanContractError.invalid("Invalid prior operation.")
        }
        return self
    }
}

struct MobilePlanLifecycleRequest: Codable, Equatable {
    var schemaVersion = mobilePlanLifecycleSchema
    var platform = MobilePlatform.ios
    var mode: MobilePlanMode
    var operationID: String
    var requestFingerprint: String
    var expectedVersion: Int
    var currentPlan: MobilePlanSnapshot?
    var proposedPlan: MobilePlanSnapshot
    var mutation: MobilePlanMutation
    var priorOperation: MobilePlanPriorOperation?

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", platform, mode
        case operationID = "operation_id", requestFingerprint = "request_fingerprint"
        case expectedVersion = "expected_version", currentPlan = "current_plan"
        case proposedPlan = "proposed_plan", mutation, priorOperation = "prior_operation"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(schemaVersion, forKey: .schemaVersion); try container.encode(platform, forKey: .platform)
        try container.encode(mode, forKey: .mode); try container.encode(operationID, forKey: .operationID)
        try container.encode(requestFingerprint, forKey: .requestFingerprint); try container.encode(expectedVersion, forKey: .expectedVersion)
        if let currentPlan { try container.encode(currentPlan, forKey: .currentPlan) } else { try container.encodeNil(forKey: .currentPlan) }
        try container.encode(proposedPlan, forKey: .proposedPlan); try container.encode(mutation, forKey: .mutation)
        if let priorOperation { try container.encode(priorOperation, forKey: .priorOperation) } else { try container.encodeNil(forKey: .priorOperation) }
    }

    func validated() throws -> Self {
        guard schemaVersion == mobilePlanLifecycleSchema, platform == .ios,
              (8...100).contains(operationID.count), (8...128).contains(requestFingerprint.count),
              expectedVersion >= 0 else {
            throw MobilePlanContractError.invalid("Invalid lifecycle request.")
        }
        _ = try currentPlan?.validated(); _ = try proposedPlan.validated(); _ = try priorOperation?.validated()
        if currentPlan == nil && (mutation.action != .generate || expectedVersion != 0) {
            throw MobilePlanContractError.invalid("Only generation may omit the current plan.")
        }
        guard proposedPlan.version >= 1,
              mutation.targetWorkoutID.map({ (1...80).contains($0.count) }) ?? true,
              MobilePlanValidation.explanation(for: mutation.action) == mutation.explanationCode else {
            throw MobilePlanContractError.invalid("Invalid lifecycle mutation.")
        }
        return self
    }

    static func decodeStrict(_ data: Data) throws -> Self {
        let object = try JSONSerialization.jsonObject(with: data)
        try MobilePlanValidation.validateRequestShape(object)
        let value = try JSONDecoder().decode(Self.self, from: data)
        return try value.validated()
    }
}

struct MobilePlanImpact: Codable, Equatable {
    var affectedWorkoutIDs: [String]
    var completedWorkoutsPreserved: Int
    var totalWorkoutsBefore: Int
    var totalWorkoutsAfter: Int
    var warnings: [MobilePlanWarning]

    enum CodingKeys: String, CodingKey {
        case affectedWorkoutIDs = "affected_workout_ids"
        case completedWorkoutsPreserved = "completed_workouts_preserved"
        case totalWorkoutsBefore = "total_workouts_before"
        case totalWorkoutsAfter = "total_workouts_after", warnings
    }
}

struct MobilePlanPersistence: Codable, Equatable {
    var required: Bool
    var ownerScopedDomains: [String]
    var transactionPreconditions: [String]

    enum CodingKeys: String, CodingKey {
        case required
        case ownerScopedDomains = "owner_scoped_domains"
        case transactionPreconditions = "transaction_preconditions"
    }
}

struct MobilePlanLifecycleResponse: Codable, Equatable {
    var schemaVersion: String
    var result: MobilePlanResult
    var mutationPerformed: Bool
    var baseVersion: Int
    var proposedVersion: Int?
    var reasonCodes: [MobilePlanReason]
    var impact: MobilePlanImpact
    var commitPlan: MobilePlanSnapshot?
    var persistence: MobilePlanPersistence

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", result
        case mutationPerformed = "mutation_performed", baseVersion = "base_version"
        case proposedVersion = "proposed_version", reasonCodes = "reason_codes"
        case impact, commitPlan = "commit_plan", persistence
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(schemaVersion, forKey: .schemaVersion); try container.encode(result, forKey: .result)
        try container.encode(mutationPerformed, forKey: .mutationPerformed); try container.encode(baseVersion, forKey: .baseVersion)
        if let proposedVersion { try container.encode(proposedVersion, forKey: .proposedVersion) } else { try container.encodeNil(forKey: .proposedVersion) }
        try container.encode(reasonCodes, forKey: .reasonCodes); try container.encode(impact, forKey: .impact)
        if let commitPlan { try container.encode(commitPlan, forKey: .commitPlan) } else { try container.encodeNil(forKey: .commitPlan) }
        try container.encode(persistence, forKey: .persistence)
    }

    func validated() throws -> Self {
        guard schemaVersion == mobilePlanLifecycleSchema, mutationPerformed == false,
              baseVersion >= 0, proposedVersion.map({ $0 >= 1 }) ?? true,
              !reasonCodes.isEmpty, Set(reasonCodes).count == reasonCodes.count,
              impact.completedWorkoutsPreserved >= 0, impact.totalWorkoutsBefore >= 0,
              impact.totalWorkoutsAfter >= 0, Set(impact.warnings).count == impact.warnings.count,
              persistence.ownerScopedDomains == ["plan", "plan_history", "plan_operations"],
              persistence.transactionPreconditions == ["authenticated_owner", "current_version_matches", "operation_id_absent_or_matching"],
              persistence.required == (result == .commitReady) else {
            throw MobilePlanContractError.invalid("Invalid lifecycle response.")
        }
        _ = try commitPlan?.validated()
        switch result {
        case .preview, .commitReady:
            guard proposedVersion == baseVersion + 1, commitPlan?.version == proposedVersion else {
                throw MobilePlanContractError.invalid("Accepted response has no sequential plan.")
            }
        case .replayed:
            guard proposedVersion != nil, commitPlan == nil else {
                throw MobilePlanContractError.invalid("Invalid replay response.")
            }
        case .conflict, .rejected:
            guard commitPlan == nil else { throw MobilePlanContractError.invalid("Rejected response contains a plan.") }
        }
        return self
    }

    static func decodeStrict(_ data: Data) throws -> Self {
        let object = try JSONSerialization.jsonObject(with: data)
        try MobilePlanValidation.validateResponseShape(object)
        return try JSONDecoder().decode(Self.self, from: data).validated()
    }
}

enum MobilePlanValidation {
    static let snapshotKeys = ["id", "version", "status", "goal_revision", "workouts"]
    static let workoutKeys = ["id", "date", "type", "status", "distance_miles", "duration_minutes", "pace_seconds_per_mile", "reason_code"]

    static func explanation(for action: MobilePlanAction) -> MobilePlanExplanationCode {
        switch action {
        case .generate: .initialGeneration
        case .save: .runnerConfirmed
        case .move: .scheduleChange
        case .shorten: .durationChange
        case .replace: .workoutReplacement
        case .skip: .runnerSkip
        case .availability: .availabilityChange
        case .preferredDay: .preferredDayConfirmation
        case .regenerateFuture: .goalOrPreferenceChange
        case .pause: .runnerPause
        case .resume: .runnerResume
        }
    }

    static func isISODate(_ value: String) -> Bool {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else { return false }
        let formatter = DateFormatter(); formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"; formatter.isLenient = false
        return formatter.date(from: value) != nil
    }

    static func validateRequestShape(_ object: Any) throws {
        let root = try dictionary(object, keys: ["schema_version", "platform", "mode", "operation_id", "request_fingerprint", "expected_version", "current_plan", "proposed_plan", "mutation", "prior_operation"])
        if !(root["current_plan"] is NSNull) { try validateSnapshotShape(root["current_plan"] as Any) }
        try validateSnapshotShape(root["proposed_plan"] as Any)
        _ = try dictionary(root["mutation"] as Any, keys: ["action", "target_workout_id", "explanation_code"])
        if !(root["prior_operation"] is NSNull) {
            _ = try dictionary(root["prior_operation"] as Any, keys: ["operation_id", "request_fingerprint", "committed_version"])
        }
        try assertPrivacySafe(root)
    }

    static func validateResponseShape(_ object: Any) throws {
        let root = try dictionary(object, keys: ["schema_version", "result", "mutation_performed", "base_version", "proposed_version", "reason_codes", "impact", "commit_plan", "persistence"])
        _ = try dictionary(root["impact"] as Any, keys: ["affected_workout_ids", "completed_workouts_preserved", "total_workouts_before", "total_workouts_after", "warnings"])
        _ = try dictionary(root["persistence"] as Any, keys: ["required", "owner_scoped_domains", "transaction_preconditions"])
        if !(root["commit_plan"] is NSNull) { try validateSnapshotShape(root["commit_plan"] as Any) }
        try assertPrivacySafe(root)
    }

    static func validateSnapshotShape(_ object: Any) throws {
        let snapshot = try dictionary(object, keys: snapshotKeys)
        guard let workouts = snapshot["workouts"] as? [Any] else { throw MobilePlanContractError.invalid("Invalid workouts shape.") }
        for workout in workouts { _ = try dictionary(workout, keys: workoutKeys) }
    }

    static func dictionary(_ object: Any, keys: [String]) throws -> [String: Any] {
        guard let value = object as? [String: Any], Set(value.keys) == Set(keys) else {
            throw MobilePlanContractError.invalid("Unexpected contract keys.")
        }
        return value
    }

    static func assertPrivacySafe(_ value: Any) throws {
        if let dictionary = value as? [String: Any] {
            for (key, child) in dictionary {
                let lowered = key.lowercased()
                if lowered == "uid" || lowered == "email" || lowered.hasPrefix("full_name") || lowered.hasPrefix("token") || lowered.hasPrefix("secret") || lowered.hasPrefix("raw_") || lowered.hasPrefix("pain") || lowered.hasPrefix("medical") || lowered.hasPrefix("biometric") {
                    throw MobilePlanContractError.invalid("Forbidden plan lifecycle key.")
                }
                try assertPrivacySafe(child)
            }
        } else if let array = value as? [Any] {
            for child in array { try assertPrivacySafe(child) }
        }
    }
}

enum MobilePlanTransactionGate {
    enum Decision: Equatable { case commit, replay }

    static func evaluate(current: MobilePlanSnapshot?, priorOperation: MobilePlanPriorOperation?, request: MobilePlanLifecycleRequest, commitPlan: MobilePlanSnapshot) throws -> Decision {
        if let priorOperation, priorOperation.operationID == request.operationID {
            guard priorOperation.requestFingerprint == request.requestFingerprint,
                  priorOperation.committedVersion == commitPlan.version else {
                throw MobilePlanStoreError.idempotencyConflict
            }
            return .replay
        }
        guard (current?.version ?? 0) == request.expectedVersion,
              current == request.currentPlan else { throw MobilePlanStoreError.versionConflict }
        return .commit
    }
}

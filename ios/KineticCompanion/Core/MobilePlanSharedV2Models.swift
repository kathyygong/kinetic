import CryptoKit
import Foundation

let mobilePlanGenerationV2Schema = "mobile-plan-generation.v2"
let mobilePlanLifecycleV2Schema = "mobile-plan-lifecycle.v2"
let mobileAccountCleanupSchema = "mobile-account-cleanup.v1"

struct MobileWeeklyAvailability: Codable, Equatable, Identifiable {
    var day: MobilePlanDay
    var availableMinutes: Int
    var easyOnly: Bool
    var id: MobilePlanDay { day }

    enum CodingKeys: String, CodingKey {
        case day, availableMinutes = "available_minutes", easyOnly = "easy_only"
    }

    func validated() throws -> Self {
        guard (availableMinutes == 0 || (15...240).contains(availableMinutes)) else {
            throw MobilePlanContractError.invalid("Invalid weekly availability.")
        }
        return self
    }
}

struct MobilePlanningInputs: Codable, Equatable {
    var revision: Int
    var raceDistance: MobilePlanRaceDistance
    var targetDate: String
    var experienceLevel: MobilePlanExperience
    var weeklyMileage: Double?
    var preferredDays: [MobilePlanDay]
    var personalBestsSeconds: [String: Int]
    var weeklyAvailability: [MobileWeeklyAvailability]

    enum CodingKeys: String, CodingKey {
        case revision, raceDistance = "race_distance", targetDate = "target_date"
        case experienceLevel = "experience_level", weeklyMileage = "weekly_mileage"
        case preferredDays = "preferred_days", personalBestsSeconds = "personal_bests_seconds"
        case weeklyAvailability = "weekly_availability"
    }

    init(revision: Int, raceDistance: MobilePlanRaceDistance, targetDate: String, experienceLevel: MobilePlanExperience, weeklyMileage: Double?, preferredDays: [MobilePlanDay], personalBestsSeconds: [String: Int], weeklyAvailability: [MobileWeeklyAvailability]) {
        self.revision = revision; self.raceDistance = raceDistance; self.targetDate = targetDate
        self.experienceLevel = experienceLevel; self.weeklyMileage = weeklyMileage
        self.preferredDays = preferredDays; self.personalBestsSeconds = personalBestsSeconds
        self.weeklyAvailability = weeklyAvailability
    }

    func validated() throws -> Self {
        guard revision >= 1, MobilePlanValidation.isISODate(targetDate),
              weeklyMileage.map({ $0.isFinite && (1...150).contains($0) }) ?? true,
              preferredDays.count <= 7, Set(preferredDays).count == preferredDays.count,
              Set(personalBestsSeconds.keys).isSubset(of: Set(MobilePlanRaceDistance.allCases.map(\.rawValue))),
              personalBestsSeconds.values.allSatisfy({ (180...86_400).contains($0) }),
              weeklyAvailability.count <= 7,
              Set(weeklyAvailability.map(\.day)).count == weeklyAvailability.count else {
            throw MobilePlanContractError.invalid("Invalid planning inputs.")
        }
        for value in weeklyAvailability { _ = try value.validated() }
        return self
    }

    init(context: MobilePlanGenerationContext) {
        revision = context.goalRevision
        raceDistance = context.raceDistance
        targetDate = context.targetDate
        experienceLevel = context.experience
        weeklyMileage = context.weeklyMileage > 0 ? context.weeklyMileage : nil
        preferredDays = context.preferredDays
        personalBestsSeconds = Dictionary(uniqueKeysWithValues: context.personalBests.map { ($0.key.rawValue, $0.value) })
        weeklyAvailability = context.weeklyAvailability
    }
}

struct MobilePlanMetadataV2: Codable, Equatable {
    var planVersion: Int
    var weeks: [MobilePlanWeekMetadata]
    var explanationCodes: [MobilePlanGenerationExplanationCode]

    enum CodingKeys: String, CodingKey {
        case planVersion = "plan_version", weeks, explanationCodes = "explanation_codes"
    }

    func validated(for plan: MobilePlanSnapshot) throws -> Self {
        guard planVersion == plan.version, plan.version >= 1,
              (1...20).contains(weeks.count),
              Set(weeks.map(\.weekNumber)).count == weeks.count,
              !explanationCodes.isEmpty, explanationCodes.count <= 8,
              Set(explanationCodes).count == explanationCodes.count else {
            throw MobilePlanContractError.invalid("Invalid plan metadata.")
        }
        for week in weeks { _ = try week.validatedV2() }
        let referenced = weeks.flatMap(\.workoutIDs)
        guard Set(referenced).count == referenced.count,
              Set(referenced) == Set(plan.workouts.map(\.id)) else {
            throw MobilePlanContractError.invalid("Plan metadata coverage drifted.")
        }
        return self
    }

    func rebound(to plan: MobilePlanSnapshot) throws -> Self {
        var copy = self
        copy.planVersion = plan.version
        return try copy.validated(for: plan)
    }
}

struct MobilePlanSnapshotV2: Codable, Equatable, Identifiable {
    var id: String
    var version: Int
    var status: MobilePlanStatus
    var goalRevision: Int
    var workouts: [MobilePlanWorkout]
    var metadata: MobilePlanMetadataV2

    enum CodingKeys: String, CodingKey {
        case id, version, status, workouts, metadata
        case goalRevision = "goal_revision"
    }

    var snapshot: MobilePlanSnapshot {
        .init(id: id, version: version, status: status, goalRevision: goalRevision, workouts: workouts)
    }

    init(snapshot: MobilePlanSnapshot, metadata: MobilePlanMetadataV2) {
        id = snapshot.id; version = snapshot.version; status = snapshot.status
        goalRevision = snapshot.goalRevision; workouts = snapshot.workouts; self.metadata = metadata
    }

    func validated() throws -> Self {
        let plan = try snapshot.validated()
        _ = try metadata.validated(for: plan)
        return self
    }
}

struct MobilePlanGenerationRequestV2: Codable, Equatable {
    var schemaVersion = mobilePlanGenerationV2Schema
    var platform = MobilePlatform.ios
    var mode: MobilePlanGenerationMode
    var planningDate: String
    var planningInputs: MobilePlanningInputs
    var currentPlan: MobilePlanSnapshot?

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", platform, mode
        case planningDate = "planning_date", planningInputs = "planning_inputs"
        case currentPlan = "current_plan"
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(schemaVersion, forKey: .schemaVersion); try container.encode(platform, forKey: .platform)
        try container.encode(mode, forKey: .mode); try container.encode(planningDate, forKey: .planningDate)
        try container.encode(planningInputs, forKey: .planningInputs)
        if let currentPlan { try container.encode(currentPlan, forKey: .currentPlan) }
        else { try container.encodeNil(forKey: .currentPlan) }
    }

    func validated() throws -> Self {
        guard schemaVersion == mobilePlanGenerationV2Schema, platform == .ios,
              MobilePlanValidation.isISODate(planningDate),
              MobilePlanValidation.dayDistance(from: planningDate, to: planningInputs.targetDate).map({ $0 >= 21 }) == true else {
            throw MobilePlanContractError.invalid("Invalid v2 generation request.")
        }
        _ = try planningInputs.validated(); _ = try currentPlan?.validated()
        if mode == .initial && currentPlan != nil { throw MobilePlanContractError.invalid("Initial generation included a plan.") }
        if mode == .regenerateFuture && currentPlan == nil { throw MobilePlanContractError.invalid("Regeneration omitted the plan.") }
        return self
    }
}

struct MobilePlanGenerationResponseV2: Codable, Equatable {
    var schemaVersion: String
    var mode: MobilePlanGenerationMode
    var source: String
    var mutationPerformed: Bool
    var candidatePlan: MobilePlanSnapshotV2

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", mode, source
        case mutationPerformed = "mutation_performed", candidatePlan = "candidate_plan"
    }

    func validated() throws -> Self {
        guard schemaVersion == mobilePlanGenerationV2Schema, source == "deterministic_shared", !mutationPerformed else {
            throw MobilePlanContractError.invalid("Invalid v2 generation response.")
        }
        _ = try candidatePlan.validated()
        return self
    }

    static func decodeStrict(_ data: Data) throws -> Self {
        let object = try MobilePlanV2Validation.object(data)
        try MobilePlanV2Validation.exact(object, ["schema_version", "mode", "source", "mutation_performed", "candidate_plan"])
        try MobilePlanV2Validation.validateSnapshot(object["candidate_plan"])
        try MobilePlanV2Validation.rejectPrivacy(object)
        return try JSONDecoder().decode(Self.self, from: data).validated()
    }
}

struct MobilePlanLifecycleRequestV2: Codable, Equatable {
    var schemaVersion = mobilePlanLifecycleV2Schema
    var platform = MobilePlatform.ios
    var mode: MobilePlanMode
    var operationID: String
    var requestFingerprint: String
    var expectedVersion: Int
    var currentPlan: MobilePlanSnapshot?
    var proposedPlan: MobilePlanSnapshotV2
    var currentPlanningInputs: MobilePlanningInputs?
    var proposedPlanningInputs: MobilePlanningInputs
    var mutation: MobilePlanMutation
    var priorOperation: MobilePlanPriorOperation?

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", platform, mode
        case operationID = "operation_id", requestFingerprint = "request_fingerprint"
        case expectedVersion = "expected_version", currentPlan = "current_plan"
        case proposedPlan = "proposed_plan", currentPlanningInputs = "current_planning_inputs"
        case proposedPlanningInputs = "proposed_planning_inputs", mutation
        case priorOperation = "prior_operation"
    }

    func validated() throws -> Self {
        guard schemaVersion == mobilePlanLifecycleV2Schema, platform == .ios,
              (8...100).contains(operationID.count), (8...128).contains(requestFingerprint.count),
              expectedVersion >= 0 else { throw MobilePlanContractError.invalid("Invalid v2 lifecycle request.") }
        _ = try currentPlan?.validated(); _ = try proposedPlan.validated()
        _ = try currentPlanningInputs?.validated(); _ = try proposedPlanningInputs.validated()
        _ = try priorOperation?.validated()
        guard proposedPlan.goalRevision == proposedPlanningInputs.revision,
              proposedPlan.version >= 1,
              MobilePlanValidation.explanation(for: mutation.action) == mutation.explanationCode else {
            throw MobilePlanContractError.invalid("Invalid v2 lifecycle mutation.")
        }
        return self
    }
}

struct MobilePlanLifecycleResponseV2: Codable, Equatable {
    var schemaVersion: String
    var result: MobilePlanResult
    var mutationPerformed: Bool
    var baseVersion: Int
    var proposedVersion: Int?
    var reasonCodes: [String]
    var impact: MobilePlanImpact
    var commitPlan: MobilePlanSnapshotV2?
    var commitPlanningInputs: MobilePlanningInputs?
    var persistence: MobilePlanPersistence

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version", result
        case mutationPerformed = "mutation_performed", baseVersion = "base_version"
        case proposedVersion = "proposed_version", reasonCodes = "reason_codes", impact
        case commitPlan = "commit_plan", commitPlanningInputs = "commit_planning_inputs", persistence
    }

    func validated() throws -> Self {
        let domains = ["profile", "goal", "plan", "plan_history", "plan_operations"]
        let preconditions = ["authenticated_owner", "current_version_matches", "planning_revision_matches", "operation_id_absent_or_matching"]
        guard schemaVersion == mobilePlanLifecycleV2Schema, !mutationPerformed, baseVersion >= 0,
              (1...4).contains(reasonCodes.count), Set(reasonCodes).count == reasonCodes.count,
              persistence.ownerScopedDomains == domains,
              persistence.transactionPreconditions == preconditions,
              persistence.required == (result == .commitReady) else {
            throw MobilePlanContractError.invalid("Invalid v2 lifecycle response.")
        }
        _ = try commitPlan?.validated(); _ = try commitPlanningInputs?.validated()
        if let plan = commitPlan, let inputs = commitPlanningInputs, plan.goalRevision != inputs.revision {
            throw MobilePlanContractError.invalid("Planning package revision drifted.")
        }
        return self
    }

    static func decodeStrict(_ data: Data) throws -> Self {
        let object = try MobilePlanV2Validation.object(data)
        try MobilePlanV2Validation.exact(object, ["schema_version", "result", "mutation_performed", "base_version", "proposed_version", "reason_codes", "impact", "commit_plan", "commit_planning_inputs", "persistence"])
        if let plan = object["commit_plan"], !(plan is NSNull) { try MobilePlanV2Validation.validateSnapshot(plan) }
        if let inputs = object["commit_planning_inputs"], !(inputs is NSNull) { try MobilePlanV2Validation.validatePlanningInputs(inputs) }
        try MobilePlanV2Validation.rejectPrivacy(object)
        return try JSONDecoder().decode(Self.self, from: data).validated()
    }
}

enum MobilePlanV2RequestFactory {
    static func generation(mode: MobilePlanGenerationMode, context: MobilePlanGenerationContext, planningDate: String, currentPlan: MobilePlanSnapshot?) throws -> MobilePlanGenerationRequestV2 {
        try MobilePlanGenerationRequestV2(mode: mode, planningDate: planningDate, planningInputs: .init(context: context), currentPlan: currentPlan).validated()
    }

    static func lifecycle(
        mode: MobilePlanMode, operationID: String, current: MobilePlanSnapshot?,
        proposed: MobilePlanSnapshot, metadata: MobilePlanMetadataV2,
        currentInputs: MobilePlanningInputs?, proposedInputs: MobilePlanningInputs,
        action: MobilePlanAction, targetWorkoutID: String?, priorOperation: MobilePlanPriorOperation?
    ) throws -> MobilePlanLifecycleRequestV2 {
        let proposedV2 = try MobilePlanSnapshotV2(snapshot: proposed, metadata: metadata.rebound(to: proposed)).validated()
        let material = FingerprintMaterial(mode: mode, operationID: operationID, expectedVersion: current?.version ?? 0, currentPlan: current, proposedPlan: proposedV2, currentPlanningInputs: currentInputs, proposedPlanningInputs: proposedInputs, action: action, targetWorkoutID: targetWorkoutID)
        let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
        let digest = SHA256.hash(data: try encoder.encode(material)).map { String(format: "%02x", $0) }.joined()
        return try MobilePlanLifecycleRequestV2(
            mode: mode, operationID: operationID, requestFingerprint: "sha256-\(digest)",
            expectedVersion: current?.version ?? 0, currentPlan: current, proposedPlan: proposedV2,
            currentPlanningInputs: currentInputs, proposedPlanningInputs: proposedInputs,
            mutation: .init(action: action, targetWorkoutID: targetWorkoutID, explanationCode: MobilePlanValidation.explanation(for: action)),
            priorOperation: priorOperation
        ).validated()
    }

    private struct FingerprintMaterial: Codable {
        var mode: MobilePlanMode; var operationID: String; var expectedVersion: Int
        var currentPlan: MobilePlanSnapshot?; var proposedPlan: MobilePlanSnapshotV2
        var currentPlanningInputs: MobilePlanningInputs?; var proposedPlanningInputs: MobilePlanningInputs
        var action: MobilePlanAction; var targetWorkoutID: String?
    }
}

enum MobileAccountCleanupMode: String, Codable { case cleanup, finalizeAuth = "finalize_auth" }
enum MobileAccountCleanupResult: String, Codable { case progress, replayed, reauthenticationRequired = "reauthentication_required", completed }
enum MobileAccountCleanupStatus: String, Codable { case cleanupPending = "cleanup_pending", reauthenticationRequired = "reauthentication_required", readyForAuthDeletion = "ready_for_auth_deletion", completed }
enum MobileAccountCleanupAuthState: String, Codable { case retained, deletionStarted = "deletion_started", deleted }

struct MobileAccountCleanupRequest: Codable, Equatable {
    var schemaVersion = mobileAccountCleanupSchema
    var platform = MobilePlatform.ios
    var mode: MobileAccountCleanupMode
    var operationID: String
    var requestFingerprint: String
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", platform, mode, operationID = "operation_id", requestFingerprint = "request_fingerprint" }

    static func make(mode: MobileAccountCleanupMode) -> Self {
        let operationID = "op-ios-account-\(UUID().uuidString.lowercased())"
        let digest = SHA256.hash(data: Data("\(mode.rawValue)|\(operationID)".utf8)).map { String(format: "%02x", $0) }.joined()
        return .init(mode: mode, operationID: operationID, requestFingerprint: "sha256-\(digest)")
    }
}

struct MobileAccountCleanupReceipt: Codable, Equatable {
    var revision: Int; var status: MobileAccountCleanupStatus
    var pendingDomains: [String]; var authState: MobileAccountCleanupAuthState
    var lastOperationID: String; var lastRequestFingerprint: String; var updatedAt: String
    enum CodingKeys: String, CodingKey {
        case revision, status, pendingDomains = "pending_domains", authState = "auth_state"
        case lastOperationID = "last_operation_id", lastRequestFingerprint = "last_request_fingerprint", updatedAt = "updated_at"
    }
}

struct MobileAccountCleanupResponse: Codable, Equatable {
    var schemaVersion: String; var result: MobileAccountCleanupResult
    var receipt: MobileAccountCleanupReceipt; var mutationPerformed: Bool
    enum CodingKeys: String, CodingKey { case schemaVersion = "schema_version", result, receipt, mutationPerformed = "mutation_performed" }

    func validated() throws -> Self {
        let domains = Set(["profile", "goal", "plan", "plan_history", "plan_operations", "readiness", "workouts", "recommendations", "preferences", "settings", "onboarding", "dismissed_preferences", "today", "schedule", "calendar_sync", "calendar_failure", "health_sync", "mobile_audit"])
        guard schemaVersion == mobileAccountCleanupSchema, receipt.revision >= 1,
              Set(receipt.pendingDomains).count == receipt.pendingDomains.count,
              Set(receipt.pendingDomains).isSubset(of: domains),
              (8...100).contains(receipt.lastOperationID.count),
              (8...128).contains(receipt.lastRequestFingerprint.count),
              ISO8601DateFormatter().date(from: receipt.updatedAt) != nil else {
            throw MobilePlanContractError.invalid("Invalid account cleanup response.")
        }
        if result == .completed && (!receipt.pendingDomains.isEmpty || receipt.status != .completed || receipt.authState != .deleted) {
            throw MobilePlanContractError.invalid("Incomplete account cleanup receipt.")
        }
        return self
    }

    static func decodeStrict(_ data: Data) throws -> Self {
        let object = try MobilePlanV2Validation.object(data)
        try MobilePlanV2Validation.exact(object, ["schema_version", "result", "receipt", "mutation_performed"])
        guard let receipt = object["receipt"] as? [String: Any] else { throw MobilePlanContractError.invalid("Invalid cleanup receipt.") }
        try MobilePlanV2Validation.exact(receipt, ["revision", "status", "pending_domains", "auth_state", "last_operation_id", "last_request_fingerprint", "updated_at"])
        try MobilePlanV2Validation.rejectPrivacy(object)
        return try JSONDecoder().decode(Self.self, from: data).validated()
    }
}

private enum MobilePlanV2Validation {
    static func object(_ data: Data) throws -> [String: Any] {
        guard let value = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw MobilePlanContractError.invalid("Invalid v2 structure.") }
        return value
    }
    static func exact(_ object: [String: Any], _ keys: Set<String>) throws {
        guard Set(object.keys) == keys else { throw MobilePlanContractError.invalid("Unexpected v2 keys.") }
    }
    static func validateSnapshot(_ value: Any?) throws {
        guard let object = value as? [String: Any] else { throw MobilePlanContractError.invalid("Invalid v2 plan.") }
        try exact(object, ["id", "version", "status", "goal_revision", "workouts", "metadata"])
        guard let metadata = object["metadata"] as? [String: Any], let workouts = object["workouts"] as? [[String: Any]] else { throw MobilePlanContractError.invalid("Invalid v2 metadata.") }
        try exact(metadata, ["plan_version", "weeks", "explanation_codes"])
        for workout in workouts { try exact(workout, Set(MobilePlanValidation.workoutKeys)) }
        guard let weeks = metadata["weeks"] as? [[String: Any]] else { throw MobilePlanContractError.invalid("Invalid v2 weeks.") }
        for week in weeks { try exact(week, ["week_number", "phase", "start_date", "end_date", "workout_ids", "explanation_codes"]) }
    }
    static func validatePlanningInputs(_ value: Any?) throws {
        guard let object = value as? [String: Any] else { throw MobilePlanContractError.invalid("Invalid planning inputs.") }
        try exact(object, ["revision", "race_distance", "target_date", "experience_level", "weekly_mileage", "preferred_days", "personal_bests_seconds", "weekly_availability"])
        guard let availability = object["weekly_availability"] as? [[String: Any]] else { throw MobilePlanContractError.invalid("Invalid availability.") }
        for item in availability { try exact(item, ["day", "available_minutes", "easy_only"]) }
    }
    static func rejectPrivacy(_ value: Any) throws {
        try MobilePlanValidation.assertPrivacySafe(value)
    }
}

private extension MobilePlanWeekMetadata {
    func validatedV2() throws -> Self {
        guard (1...20).contains(weekNumber), MobilePlanValidation.isISODate(startDate),
              MobilePlanValidation.isISODate(endDate),
              (1...7).contains(workoutIDs.count), Set(workoutIDs).count == workoutIDs.count,
              (1...5).contains(explanationCodes.count), Set(explanationCodes).count == explanationCodes.count else {
            throw MobilePlanContractError.invalid("Invalid v2 week metadata.")
        }
        return self
    }
}

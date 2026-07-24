import Foundation

enum MobileAuditEventName: String, Codable, CaseIterable {
    case companionSyncCompleted = "mobile_companion_sync_completed"
    case decisionValidated = "mobile_decision_validated"
    case intakeLifecycle = "mobile_intake_lifecycle"
    case checkinSynced = "mobile_checkin_synced"
    case patternResultLifecycle = "mobile_pattern_result_lifecycle"
}

enum MobilePlatform: String, Codable {
    case ios
}

enum MobileSyncType: String, Codable {
    case healthkitReadiness = "healthkit_readiness"
    case calendarContext = "calendar_context"
    case decisionReadback = "decision_readback"
}

enum MobileSyncOutcome: String, Codable {
    case success
    case failed
    case partial
    case stale
}

enum CoverageBucket: String, Codable {
    case none
    case partial
    case complete
}

enum MobileDecisionOutcome: String, Codable {
    case success
    case failed
    case invalid
    case timeout
}

enum SelectedActionBucket: String, Codable {
    case proceed
    case modify
    case rest
    case unknown
    case other
}

enum MobileCalendarState: String, Codable {
    case clear
    case conflict
    case stale
    case missing
}

enum MobileReadinessState: String, Codable {
    case ready
    case caution
    case unknown
    case stale
}

enum DeterministicValidationState: String, Codable {
    case passed
    case failed
    case notRun = "not_run"
}

enum MobileIntakeAction: String, Codable {
    case routed
    case reviewed
    case confirmed
    case discarded
    case failed
}

enum MobileIntakeAuditRoute: String, Codable {
    case reviewDraft = "review_draft"
    case perceivedRecovery = "perceived_recovery"
    case caution
    case missedWorkout = "missed_workout"
    case reflection
    case explanation
    case clarification
    case refusal
    case none

    init(_ route: MobileIntakeRoute?) {
        self = route.flatMap { MobileIntakeAuditRoute(rawValue: $0.rawValue) } ?? .none
    }
}

enum MobileIntakeAuditDraftKind: String, Codable {
    case schedule
    case availability
    case travel
    case workoutSwap = "workout_swap"
    case goal
    case preferredDay = "preferred_day"
    case multiple
    case none

    init(_ kinds: [MobileIntakeDraftKind]) {
        if kinds.count > 1 {
            self = .multiple
        } else if let kind = kinds.first {
            self = MobileIntakeAuditDraftKind(rawValue: kind.rawValue) ?? .none
        } else {
            self = .none
        }
    }
}

enum MobileIntakeAuditFailureState: String, Codable {
    case none
    case authRequired = "auth_required"
    case offline
    case timeout
    case backendUnavailable = "backend_unavailable"
    case invalidResponse = "invalid_response"
    case unknown
    case aiUnavailable = "ai_unavailable"
    case malformedAI = "malformed_ai"
    case ambiguous
    case unsupported
    case unsafe
}

enum MobileIntakeAuditParserSource: String, Codable {
    case deterministic
    case ollama
    case deterministicRouter = "deterministic_router"
    case none
}

enum MobileIntakeMutationState: String, Codable {
    case notRequested = "not_requested"
    case reviewOnly = "review_only"
    case applied
    case rejected
}

enum MobilePatternResultAction: String, Codable {
    case reviewed
    case confirmed
    case dismissed
    case prompted
    case caution
    case failed
}

enum MobilePatternResultOutcome: String, Codable {
    case success
    case failed
    case invalid
}

struct MobilePatternResultLifecycleAudit: MobileAuditPayload {
    static let eventName = MobileAuditEventName.patternResultLifecycle

    var platform = MobilePlatform.ios
    var action: MobilePatternResultAction
    var outcome: MobilePatternResultOutcome
    var patternFamily: BehaviorPatternFamily
    var resultKind: BehaviorPatternResultKind
    var mutationState: MobileIntakeMutationState
    var deterministicValidation: DeterministicValidationState
    var source: BehaviorPatternSource

    enum CodingKeys: String, CodingKey {
        case platform
        case action
        case outcome
        case patternFamily = "pattern_family"
        case resultKind = "result_kind"
        case mutationState = "mutation_state"
        case deterministicValidation = "deterministic_validation"
        case source
    }
}

enum MobileCheckinStatus: String, Codable {
    case completed
    case skipped
    case checkedIn = "checked_in"
}

protocol MobileAuditPayload: Codable, Equatable {
    static var eventName: MobileAuditEventName { get }
}

struct MobileAuditEnvelope<Payload: MobileAuditPayload>: Codable, Equatable {
    var schemaVersion = 2
    var id: String
    var name: MobileAuditEventName
    var at: Date
    var properties: Payload

    init(
        id: String = UUID().uuidString.lowercased(),
        at: Date = Date(),
        properties: Payload
    ) {
        self.id = id
        self.name = Payload.eventName
        self.at = at
        self.properties = properties
    }
}

struct MobileCompanionSyncAudit: MobileAuditPayload {
    static let eventName = MobileAuditEventName.companionSyncCompleted

    var platform = MobilePlatform.ios
    var syncType: MobileSyncType
    var outcome: MobileSyncOutcome
    var permissionState: PermissionState?
    var backgroundDelivery: BackgroundDeliveryState?
    var coverageBucket: CoverageBucket?
    var confidenceBucket: ConfidenceBucket
    var conflict: SyncConflict?
    var latencyMs: Int

    enum CodingKeys: String, CodingKey {
        case platform
        case syncType = "sync_type"
        case outcome
        case permissionState = "permission_state"
        case backgroundDelivery = "background_delivery"
        case coverageBucket = "coverage_bucket"
        case confidenceBucket = "confidence_bucket"
        case conflict
        case latencyMs = "latency_ms"
    }
}

struct MobileDecisionValidatedAudit: MobileAuditPayload {
    static let eventName = MobileAuditEventName.decisionValidated

    var platform = MobilePlatform.ios
    var outcome: MobileDecisionOutcome
    var decisionSource: MobileTodayDecisionSource
    var failureState: MobileAuditFailureState
    var cacheState: MobileTodayCacheState
    var availabilitySource: MobileTodayAvailabilitySource
    var selectedAction: SelectedActionBucket
    var confidenceBucket: ConfidenceBucket
    var calendarState: MobileCalendarState
    var readinessState: MobileReadinessState
    var deterministicValidation: DeterministicValidationState
    var hasCalendarWarning: Bool
    var hasRecoveryWarning: Bool
    var aiAssisted: Bool
    var latencyMs: Int

    enum CodingKeys: String, CodingKey {
        case platform
        case outcome
        case decisionSource = "decision_source"
        case failureState = "failure_state"
        case cacheState = "cache_state"
        case availabilitySource = "availability_source"
        case selectedAction = "selected_action"
        case confidenceBucket = "confidence_bucket"
        case calendarState = "calendar_state"
        case readinessState = "readiness_state"
        case deterministicValidation = "deterministic_validation"
        case hasCalendarWarning = "has_calendar_warning"
        case hasRecoveryWarning = "has_recovery_warning"
        case aiAssisted = "ai_assisted"
        case latencyMs = "latency_ms"
    }
}

enum MobileAuditFailureState: String, Codable {
    case none
    case authRequired = "auth_required"
    case offline
    case timeout
    case backendUnavailable = "backend_unavailable"
    case invalidResponse = "invalid_response"
    case missingContext = "missing_context"
    case unknown

    init(_ failure: MobileTodayFailureCode?) {
        guard let failure else {
            self = .none
            return
        }
        self = MobileAuditFailureState(rawValue: failure.rawValue) ?? .unknown
    }
}

struct MobileIntakeLifecycleAudit: MobileAuditPayload {
    static let eventName = MobileAuditEventName.intakeLifecycle

    var platform = MobilePlatform.ios
    var action: MobileIntakeAction
    var outcome: MobileDecisionOutcome
    var route: MobileIntakeAuditRoute
    var draftKind: MobileIntakeAuditDraftKind
    var failureState: MobileIntakeAuditFailureState
    var parserSource: MobileIntakeAuditParserSource
    var mutationState: MobileIntakeMutationState
    var deterministicValidation: DeterministicValidationState
    var latencyMs: Int

    enum CodingKeys: String, CodingKey {
        case platform
        case action
        case outcome
        case route
        case draftKind = "draft_kind"
        case failureState = "failure_state"
        case parserSource = "parser_source"
        case mutationState = "mutation_state"
        case deterministicValidation = "deterministic_validation"
        case latencyMs = "latency_ms"
    }
}

struct MobileCheckinSyncedAudit: MobileAuditPayload {
    static let eventName = MobileAuditEventName.checkinSynced

    var platform = MobilePlatform.ios
    var checkinKind = MobileCheckinKind.workoutOutcome
    var status: MobileCheckinStatus
    var outcome: MobileDecisionOutcome
    var failureState = MobileCheckinFailureState.none
    var writeScope = MobileCheckinWriteScope.none
    var deterministicValidation = DeterministicValidationState.notRun
    var hasEffort: Bool
    var hasUserReflection: Bool
    var updateSucceeded: Bool
    var latencyMs: Int

    enum CodingKeys: String, CodingKey {
        case platform
        case checkinKind = "checkin_kind"
        case status
        case outcome
        case failureState = "failure_state"
        case writeScope = "write_scope"
        case deterministicValidation = "deterministic_validation"
        case hasEffort = "has_effort"
        case hasUserReflection = "has_user_reflection"
        case updateSucceeded = "update_succeeded"
        case latencyMs = "latency_ms"
    }
}

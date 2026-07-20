import Foundation

enum MobileIntakeContract {
    static let schema = "mobile-intake.v1"
    static let fixtureSchema = "mobile-intake-fixture.v1"
    static let maximumNoteLength = 280
    static let maximumStalenessWarnings = 10
    static let maximumLatencyMs = 60_000
}

enum MobileIntakeDay: String, Codable, CaseIterable {
    case mon, tue, wed, thu, fri, sat, sun

    var title: String {
        switch self {
        case .mon: "Monday"
        case .tue: "Tuesday"
        case .wed: "Wednesday"
        case .thu: "Thursday"
        case .fri: "Friday"
        case .sat: "Saturday"
        case .sun: "Sunday"
        }
    }

    var planLabel: String {
        String(title.prefix(3))
    }
}

enum MobileIntakeRaceDistance: String, Codable, CaseIterable {
    case fiveK = "5k"
    case tenK = "10k"
    case half
    case marathon
}

enum MobileIntakeExperience: String, Codable, CaseIterable {
    case beginner, intermediate, advanced
}

enum MobileIntakeSelectedAction: String, Codable {
    case proceed, modify, rest, unknown
}

enum MobileIntakeReadinessState: String, Codable {
    case ready, caution, unknown, stale
}

enum MobileIntakeCalendarState: String, Codable {
    case clear, conflict, stale, missing
}

enum MobileIntakeConfidenceBucket: String, Codable {
    case low, moderate, high, unknown
}

struct MobileIntakeGoalContext: Codable, Equatable {
    var raceDistance: MobileIntakeRaceDistance?
    var targetDate: String?
    var weeklyMileage: Double?

    enum CodingKeys: String, CodingKey {
        case raceDistance = "race_distance"
        case targetDate = "target_date"
        case weeklyMileage = "weekly_mileage"
    }
}

struct MobileIntakeProfileContext: Codable, Equatable {
    var experienceLevel: MobileIntakeExperience?
    var preferredTrainingDays: [MobileIntakeDay]

    enum CodingKeys: String, CodingKey {
        case experienceLevel = "experience_level"
        case preferredTrainingDays = "preferred_training_days"
    }
}

struct MobileIntakeDecisionContext: Codable, Equatable {
    var selectedAction: MobileIntakeSelectedAction
    var readinessState: MobileIntakeReadinessState
    var calendarState: MobileIntakeCalendarState
    var confidenceBucket: MobileIntakeConfidenceBucket
    var stalenessWarningCount: Int

    enum CodingKeys: String, CodingKey {
        case selectedAction = "selected_action"
        case readinessState = "readiness_state"
        case calendarState = "calendar_state"
        case confidenceBucket = "confidence_bucket"
        case stalenessWarningCount = "staleness_warning_count"
    }
}

struct MobileIntakeContext: Codable, Equatable {
    var today: String
    var currentGoal: MobileIntakeGoalContext?
    var currentProfile: MobileIntakeProfileContext?
    var decision: MobileIntakeDecisionContext?

    enum CodingKeys: String, CodingKey {
        case today
        case currentGoal = "current_goal"
        case currentProfile = "current_profile"
        case decision
    }
}

struct MobileIntakeRequest: Codable, Equatable {
    var schemaVersion = MobileIntakeContract.schema
    var platform = MobilePlatform.ios
    var text: String
    var context: MobileIntakeContext

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case platform
        case text
        case context
    }
}

enum MobileIntakeDraftKind: String, Codable, CaseIterable {
    case schedule
    case availability
    case travel
    case workoutSwap = "workout_swap"
    case goal
    case preferredDay = "preferred_day"
}

enum MobileIntakeRoute: String, Codable, CaseIterable {
    case reviewDraft = "review_draft"
    case perceivedRecovery = "perceived_recovery"
    case caution
    case missedWorkout = "missed_workout"
    case reflection
    case explanation
    case clarification
    case refusal
}

enum MobileIntakeParserSource: String, Codable {
    case deterministic
    case ollama
    case deterministicRouter = "deterministic_router"
}

enum MobileIntakeParserFailure: String, Codable {
    case none
    case aiDisabled = "ai_disabled"
    case aiTimeout = "ai_timeout"
    case aiUnavailable = "ai_unavailable"
    case malformedAI = "malformed_ai"
    case ungroundedAI = "ungrounded_ai"
    case parserError = "parser_error"
}

enum MobileIntakeFailureCode: String, Codable {
    case authRequired = "auth_required"
    case offline
    case timeout
    case backendUnavailable = "backend_unavailable"
    case invalidResponse = "invalid_response"
    case unknown
}

struct MobileIntakeParserMetadata: Codable, Equatable {
    var source: MobileIntakeParserSource
    var aiAttempted: Bool
    var fallbackUsed: Bool
    var failure: MobileIntakeParserFailure

    enum CodingKeys: String, CodingKey {
        case source
        case aiAttempted = "ai_attempted"
        case fallbackUsed = "fallback_used"
        case failure
    }
}

enum MobileIntakeDraftStatus: String, Codable {
    case ready
    case needsClarification = "needs_clarification"
    case unsupported
}

enum MobileIntakeGoalField: String, Codable {
    case raceDistance = "race_distance"
    case targetDate = "target_date"
    case weeklyMileage = "weekly_mileage"
}

enum MobileIntakeGoalValue: Codable, Equatable {
    case text(String)
    case number(Double)

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else {
            self = .text(try container.decode(String.self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .text(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        }
    }

    var displayValue: String {
        switch self {
        case .text(let value): value
        case .number(let value):
            value.rounded() == value ? String(Int(value)) : String(value)
        }
    }
}

struct MobileIntakeGoalChange: Codable, Equatable {
    var id: String
    var field: MobileIntakeGoalField
    var value: MobileIntakeGoalValue
}

enum MobileIntakeScheduleField: String, Codable {
    case preferredTrainingDays = "preferred_training_days"
}

struct MobileIntakeScheduleChange: Codable, Equatable {
    var id: String
    var field: MobileIntakeScheduleField
    var value: [MobileIntakeDay]
}

struct MobileIntakeAvailabilityChange: Codable, Equatable {
    var id: String
    var day: MobileIntakeDay
    var availableMinutes: Int?
    var easyOnly: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case day
        case availableMinutes = "available_minutes"
        case easyOnly = "easy_only"
    }
}

enum MobileIntakePreferenceField: String, Codable {
    case experienceLevel = "experience_level"
}

struct MobileIntakePreferenceChange: Codable, Equatable {
    var id: String
    var field: MobileIntakePreferenceField
    var value: MobileIntakeExperience
}

struct MobileIntakeWorkoutSwapChange: Codable, Equatable {
    var id: String
    var fromDay: MobileIntakeDay
    var toDay: MobileIntakeDay

    enum CodingKeys: String, CodingKey {
        case id
        case fromDay = "from_day"
        case toDay = "to_day"
    }
}

struct MobileIntakeGrounding: Codable, Equatable {
    var changeID: String
    var evidence: String

    enum CodingKeys: String, CodingKey {
        case changeID = "change_id"
        case evidence
    }
}

struct MobileIntakeDraft: Codable, Equatable {
    var status: MobileIntakeDraftStatus
    var summary: String
    var goalChanges: [MobileIntakeGoalChange]
    var scheduleChanges: [MobileIntakeScheduleChange]
    var availabilityChanges: [MobileIntakeAvailabilityChange]
    var preferenceChanges: [MobileIntakePreferenceChange]
    var workoutSwapChanges: [MobileIntakeWorkoutSwapChange]
    var grounding: [MobileIntakeGrounding]
    var warnings: [String]

    enum CodingKeys: String, CodingKey {
        case status
        case summary
        case goalChanges = "goal_changes"
        case scheduleChanges = "schedule_changes"
        case availabilityChanges = "availability_changes"
        case preferenceChanges = "preference_changes"
        case workoutSwapChanges = "workout_swap_changes"
        case grounding
        case warnings
    }

    var changeCount: Int {
        goalChanges.count
            + scheduleChanges.count
            + availabilityChanges.count
            + preferenceChanges.count
            + workoutSwapChanges.count
    }
}

struct MobileIntakeReviewDraftOutcome: Codable, Equatable {
    var route: MobileIntakeRoute
    var mutable: Bool
    var draftKinds: [MobileIntakeDraftKind]
    var reviewRequired: Bool
    var confirmationRequired: Bool
    var deterministicValidationRequired: Bool
    var draft: MobileIntakeDraft

    enum CodingKeys: String, CodingKey {
        case route
        case mutable
        case draftKinds = "draft_kinds"
        case reviewRequired = "review_required"
        case confirmationRequired = "confirmation_required"
        case deterministicValidationRequired = "deterministic_validation_required"
        case draft
    }
}

enum MobileIntakeRecoveryField: String, Codable {
    case perceivedRecovery = "perceived_recovery"
    case fatigue
    case soreness
    case sleepCorrection = "sleep_correction"
}

struct MobileIntakePerceivedRecoveryOutcome: Codable, Equatable {
    var route: MobileIntakeRoute
    var mutable: Bool
    var destination: String
    var fieldsToCapture: [MobileIntakeRecoveryField]
    var inferredValues: Bool
    var persistenceAvailable: Bool

    enum CodingKeys: String, CodingKey {
        case route
        case mutable
        case destination
        case fieldsToCapture = "fields_to_capture"
        case inferredValues = "inferred_values"
        case persistenceAvailable = "persistence_available"
    }
}

enum MobileIntakeCautionAction: String, Codable {
    case stopOrReduce = "stop_or_reduce"
    case captureDiscomfortFlag = "capture_discomfort_flag"
    case seekQualifiedCare = "seek_qualified_care"
}

struct MobileIntakeCautionOutcome: Codable, Equatable {
    var route: MobileIntakeRoute
    var mutable: Bool
    var destination: String
    var actions: [MobileIntakeCautionAction]
    var diagnosisProvided: Bool
    var painSeverityInferred: Bool
    var clearanceProvided: Bool

    enum CodingKeys: String, CodingKey {
        case route
        case mutable
        case destination
        case actions
        case diagnosisProvided = "diagnosis_provided"
        case painSeverityInferred = "pain_severity_inferred"
        case clearanceProvided = "clearance_provided"
    }
}

enum MobileIntakeMissedWorkoutChoice: String, Codable {
    case markSkipped = "mark_skipped"
    case reschedule
    case rebalance
}

struct MobileIntakeMissedWorkoutOutcome: Codable, Equatable {
    var route: MobileIntakeRoute
    var mutable: Bool
    var destination: String
    var choices: [MobileIntakeMissedWorkoutChoice]
    var completionInferred: Bool
    var persistenceAvailable: Bool

    enum CodingKeys: String, CodingKey {
        case route
        case mutable
        case destination
        case choices
        case completionInferred = "completion_inferred"
        case persistenceAvailable = "persistence_available"
    }
}

enum MobileIntakeReflectionField: String, Codable {
    case completion
    case perceivedEffort = "perceived_effort"
}

struct MobileIntakeReflectionOutcome: Codable, Equatable {
    var route: MobileIntakeRoute
    var mutable: Bool
    var destination: String
    var fieldsToCapture: [MobileIntakeReflectionField]
    var completionInferred: Bool
    var effortInferred: Bool
    var persistenceAvailable: Bool

    enum CodingKeys: String, CodingKey {
        case route
        case mutable
        case destination
        case fieldsToCapture = "fields_to_capture"
        case completionInferred = "completion_inferred"
        case effortInferred = "effort_inferred"
        case persistenceAvailable = "persistence_available"
    }
}

struct MobileIntakeExplanationFacts: Codable, Equatable {
    var selectedAction: MobileIntakeSelectedAction
    var readinessState: MobileIntakeReadinessState
    var calendarState: MobileIntakeCalendarState
    var confidenceBucket: MobileIntakeConfidenceBucket
    var hasStalenessWarning: Bool

    enum CodingKeys: String, CodingKey {
        case selectedAction = "selected_action"
        case readinessState = "readiness_state"
        case calendarState = "calendar_state"
        case confidenceBucket = "confidence_bucket"
        case hasStalenessWarning = "has_staleness_warning"
    }
}

struct MobileIntakeExplanationOutcome: Codable, Equatable {
    var route: MobileIntakeRoute
    var mutable: Bool
    var destination: String
    var template: String
    var facts: MobileIntakeExplanationFacts
    var generatedProse: Bool

    enum CodingKeys: String, CodingKey {
        case route
        case mutable
        case destination
        case template
        case facts
        case generatedProse = "generated_prose"
    }
}

enum MobileIntakeClarificationReason: String, Codable {
    case ambiguous
    case incompleteDraft = "incomplete_draft"
}

enum MobileIntakeClarificationChoice: String, Codable {
    case schedule
    case recovery
    case painOrInjury = "pain_or_injury"
    case missedWorkout = "missed_workout"
    case postWorkout = "post_workout"
    case explanation
}

struct MobileIntakeClarificationOutcome: Codable, Equatable {
    var route: MobileIntakeRoute
    var mutable: Bool
    var reason: MobileIntakeClarificationReason
    var choices: [MobileIntakeClarificationChoice]
}

enum MobileIntakeRefusalReason: String, Codable {
    case unsupported
    case unsafe
}

enum MobileIntakeSafeNextAction: String, Codable {
    case useSupportedIntake = "use_supported_intake"
    case seekQualifiedCare = "seek_qualified_care"
}

struct MobileIntakeRefusalOutcome: Codable, Equatable {
    var route: MobileIntakeRoute
    var mutable: Bool
    var reason: MobileIntakeRefusalReason
    var safeNextAction: MobileIntakeSafeNextAction

    enum CodingKeys: String, CodingKey {
        case route
        case mutable
        case reason
        case safeNextAction = "safe_next_action"
    }
}

enum MobileIntakeOutcome: Codable, Equatable {
    case reviewDraft(MobileIntakeReviewDraftOutcome)
    case perceivedRecovery(MobileIntakePerceivedRecoveryOutcome)
    case caution(MobileIntakeCautionOutcome)
    case missedWorkout(MobileIntakeMissedWorkoutOutcome)
    case reflection(MobileIntakeReflectionOutcome)
    case explanation(MobileIntakeExplanationOutcome)
    case clarification(MobileIntakeClarificationOutcome)
    case refusal(MobileIntakeRefusalOutcome)

    private enum CodingKeys: String, CodingKey { case route }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        switch try container.decode(MobileIntakeRoute.self, forKey: .route) {
        case .reviewDraft:
            self = .reviewDraft(try MobileIntakeReviewDraftOutcome(from: decoder))
        case .perceivedRecovery:
            self = .perceivedRecovery(try MobileIntakePerceivedRecoveryOutcome(from: decoder))
        case .caution:
            self = .caution(try MobileIntakeCautionOutcome(from: decoder))
        case .missedWorkout:
            self = .missedWorkout(try MobileIntakeMissedWorkoutOutcome(from: decoder))
        case .reflection:
            self = .reflection(try MobileIntakeReflectionOutcome(from: decoder))
        case .explanation:
            self = .explanation(try MobileIntakeExplanationOutcome(from: decoder))
        case .clarification:
            self = .clarification(try MobileIntakeClarificationOutcome(from: decoder))
        case .refusal:
            self = .refusal(try MobileIntakeRefusalOutcome(from: decoder))
        }
    }

    func encode(to encoder: Encoder) throws {
        switch self {
        case .reviewDraft(let value): try value.encode(to: encoder)
        case .perceivedRecovery(let value): try value.encode(to: encoder)
        case .caution(let value): try value.encode(to: encoder)
        case .missedWorkout(let value): try value.encode(to: encoder)
        case .reflection(let value): try value.encode(to: encoder)
        case .explanation(let value): try value.encode(to: encoder)
        case .clarification(let value): try value.encode(to: encoder)
        case .refusal(let value): try value.encode(to: encoder)
        }
    }

    var route: MobileIntakeRoute {
        switch self {
        case .reviewDraft: .reviewDraft
        case .perceivedRecovery: .perceivedRecovery
        case .caution: .caution
        case .missedWorkout: .missedWorkout
        case .reflection: .reflection
        case .explanation: .explanation
        case .clarification: .clarification
        case .refusal: .refusal
        }
    }

    var mutable: Bool {
        if case .reviewDraft = self { return true }
        return false
    }

    var draft: MobileIntakeDraft? {
        if case .reviewDraft(let outcome) = self { return outcome.draft }
        return nil
    }
}

struct MobileIntakeResponse: Codable, Equatable {
    var schemaVersion: String
    var mutationPerformed: Bool
    var parser: MobileIntakeParserMetadata
    var outcome: MobileIntakeOutcome

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case mutationPerformed = "mutation_performed"
        case parser
        case outcome
    }

    static func decode(_ data: Data) throws -> MobileIntakeResponse {
        let object = try JSONSerialization.jsonObject(with: data)
        try MobileIntakeValidator.validateResponseStructure(object)
        let response = try JSONDecoder().decode(MobileIntakeResponse.self, from: data)
        try MobileIntakeValidator.validate(response)
        return response
    }
}

enum MobileIntakeValidationError: Error, Equatable, LocalizedError {
    case invalid(String)

    var errorDescription: String? {
        guard case .invalid(let message) = self else { return nil }
        return message
    }
}

enum MobileIntakeRequestBuilder {
    static func build(text: String, context: MobileIntakeContext) throws -> MobileIntakeRequest {
        let note = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !note.isEmpty, note.count <= MobileIntakeContract.maximumNoteLength else {
            throw MobileIntakeValidationError.invalid(
                "Mobile intake text must contain 1 to 280 characters."
            )
        }
        guard MobileTodayDate.isLocalDay(context.today) else {
            throw MobileIntakeValidationError.invalid("Mobile intake requires a valid local day.")
        }
        var bounded = context
        if var decision = bounded.decision {
            decision.stalenessWarningCount = min(
                MobileIntakeContract.maximumStalenessWarnings,
                max(0, decision.stalenessWarningCount)
            )
            bounded.decision = decision
        }
        let request = MobileIntakeRequest(text: note, context: bounded)
        try MobileIntakeValidator.validate(request)
        return request
    }
}

enum MobileIntakeValidator {
    static func validate(_ request: MobileIntakeRequest) throws {
        guard request.schemaVersion == MobileIntakeContract.schema,
              request.platform == .ios else {
            throw MobileIntakeValidationError.invalid("Unsupported mobile intake request.")
        }
        guard !request.text.isEmpty,
              request.text == request.text.trimmingCharacters(in: .whitespacesAndNewlines),
              request.text.count <= MobileIntakeContract.maximumNoteLength,
              MobileTodayDate.isLocalDay(request.context.today) else {
            throw MobileIntakeValidationError.invalid("Invalid mobile intake request bounds.")
        }
        if let mileage = request.context.currentGoal?.weeklyMileage,
           !mileage.isFinite || !(1...150).contains(mileage) {
            throw MobileIntakeValidationError.invalid("Weekly mileage is out of bounds.")
        }
        if let date = request.context.currentGoal?.targetDate,
           !MobileTodayDate.isLocalDay(date) {
            throw MobileIntakeValidationError.invalid("Goal date must be an ISO local day.")
        }
        guard request.context.currentProfile?.preferredTrainingDays.count ?? 0 <= 7,
              request.context.decision?.stalenessWarningCount ?? 0
                <= MobileIntakeContract.maximumStalenessWarnings else {
            throw MobileIntakeValidationError.invalid("Mobile intake context is out of bounds.")
        }
    }

    static func validate(_ response: MobileIntakeResponse) throws {
        guard response.schemaVersion == MobileIntakeContract.schema,
              response.mutationPerformed == false else {
            throw MobileIntakeValidationError.invalid(
                "Routing responses cannot mutate training state."
            )
        }
        switch response.outcome {
        case .reviewDraft(let value):
            guard value.route == .reviewDraft,
                  value.mutable,
                  value.reviewRequired,
                  value.confirmationRequired,
                  value.deterministicValidationRequired,
                  !value.draftKinds.isEmpty,
                  Set(value.draftKinds).count == value.draftKinds.count else {
                throw MobileIntakeValidationError.invalid("Invalid review-draft boundary.")
            }
            try validate(value.draft)
        case .perceivedRecovery(let value):
            guard value.route == .perceivedRecovery, !value.mutable,
                  value.destination == "perceived_recovery_capture",
                  !value.fieldsToCapture.isEmpty,
                  !value.inferredValues, !value.persistenceAvailable else {
                throw MobileIntakeValidationError.invalid("Invalid recovery route.")
            }
        case .caution(let value):
            guard value.route == .caution, !value.mutable,
                  value.destination == "conservative_caution",
                  !value.actions.isEmpty, !value.diagnosisProvided,
                  !value.painSeverityInferred, !value.clearanceProvided else {
                throw MobileIntakeValidationError.invalid("Invalid caution route.")
            }
        case .missedWorkout(let value):
            guard value.route == .missedWorkout, !value.mutable,
                  value.destination == "missed_workout_choices",
                  !value.choices.isEmpty, !value.completionInferred,
                  !value.persistenceAvailable else {
                throw MobileIntakeValidationError.invalid("Invalid missed-workout route.")
            }
        case .reflection(let value):
            guard value.route == .reflection, !value.mutable,
                  value.destination == "post_workout_capture",
                  !value.fieldsToCapture.isEmpty, !value.completionInferred,
                  !value.effortInferred, !value.persistenceAvailable else {
                throw MobileIntakeValidationError.invalid("Invalid reflection route.")
            }
        case .explanation(let value):
            guard value.route == .explanation, !value.mutable,
                  value.destination == "deterministic_explanation",
                  value.template == "today_decision_trace",
                  !value.generatedProse else {
                throw MobileIntakeValidationError.invalid("Invalid explanation route.")
            }
        case .clarification(let value):
            guard value.route == .clarification, !value.mutable,
                  !value.choices.isEmpty else {
                throw MobileIntakeValidationError.invalid("Invalid clarification route.")
            }
        case .refusal(let value):
            guard value.route == .refusal, !value.mutable,
                  (value.reason == .unsafe
                    ? value.safeNextAction == .seekQualifiedCare
                    : value.safeNextAction == .useSupportedIntake) else {
                throw MobileIntakeValidationError.invalid("Invalid refusal route.")
            }
        }
    }

    static func validate(_ draft: MobileIntakeDraft) throws {
        guard draft.status == .ready, !draft.summary.isEmpty, draft.changeCount > 0 else {
            throw MobileIntakeValidationError.invalid("Reviewable draft has no ready changes.")
        }
        let identifiers = draft.goalChanges.map(\.id)
            + draft.scheduleChanges.map(\.id)
            + draft.availabilityChanges.map(\.id)
            + draft.preferenceChanges.map(\.id)
            + draft.workoutSwapChanges.map(\.id)
        guard identifiers.allSatisfy({ !$0.isEmpty }),
              Set(identifiers).count == identifiers.count else {
            throw MobileIntakeValidationError.invalid("Draft identifiers must be unique.")
        }
        let grounded = Set(draft.grounding.compactMap {
            $0.evidence.isEmpty ? nil : $0.changeID
        })
        guard identifiers.allSatisfy(grounded.contains) else {
            throw MobileIntakeValidationError.invalid("Every draft change must have grounding.")
        }
        for change in draft.goalChanges {
            switch (change.field, change.value) {
            case (.raceDistance, .text(let value)):
                guard MobileIntakeRaceDistance(rawValue: value) != nil else {
                    throw MobileIntakeValidationError.invalid("Unsupported race distance.")
                }
            case (.targetDate, .text(let value)):
                guard MobileTodayDate.isLocalDay(value) else {
                    throw MobileIntakeValidationError.invalid("Invalid target date.")
                }
            case (.weeklyMileage, .number(let value)):
                guard value.isFinite, (1...150).contains(value) else {
                    throw MobileIntakeValidationError.invalid("Invalid weekly mileage.")
                }
            default:
                throw MobileIntakeValidationError.invalid("Goal field and value do not match.")
            }
        }
        for change in draft.scheduleChanges {
            guard !change.value.isEmpty, change.value.count <= 7,
                  Set(change.value).count == change.value.count else {
                throw MobileIntakeValidationError.invalid("Preferred days are invalid.")
            }
        }
        for change in draft.availabilityChanges {
            if let minutes = change.availableMinutes, !(0...240).contains(minutes) {
                throw MobileIntakeValidationError.invalid("Availability is out of bounds.")
            }
            guard change.availableMinutes != nil || change.easyOnly else {
                throw MobileIntakeValidationError.invalid(
                    "Availability needs minutes or an easy-only constraint."
                )
            }
        }
        guard draft.workoutSwapChanges.allSatisfy({ $0.fromDay != $0.toDay }) else {
            throw MobileIntakeValidationError.invalid("Workout swap days must differ.")
        }
    }

    static func validateResponseStructure(_ value: Any) throws {
        try rejectForbiddenKeys(value)
        let envelope = try object(value, "mobile intake response")
        try exactKeys(envelope, ["schema_version", "mutation_performed", "parser", "outcome"])
        let parser = try object(envelope["parser"], "mobile intake parser")
        try exactKeys(parser, ["source", "ai_attempted", "fallback_used", "failure"])
        let outcome = try object(envelope["outcome"], "mobile intake outcome")
        guard let routeValue = outcome["route"] as? String,
              let route = MobileIntakeRoute(rawValue: routeValue) else {
            throw MobileIntakeValidationError.invalid("Unsupported mobile intake route.")
        }
        switch route {
        case .reviewDraft:
            try exactKeys(outcome, [
                "route", "mutable", "draft_kinds", "review_required",
                "confirmation_required", "deterministic_validation_required", "draft"
            ])
            let draft = try object(outcome["draft"], "mobile intake draft")
            try exactKeys(draft, [
                "status", "summary", "goal_changes", "schedule_changes",
                "availability_changes", "preference_changes", "workout_swap_changes",
                "grounding", "warnings"
            ])
            try exactArrayObjects(draft["goal_changes"], keys: ["id", "field", "value"])
            try exactArrayObjects(
                draft["schedule_changes"],
                keys: ["id", "field", "value"]
            )
            try exactArrayObjects(
                draft["availability_changes"],
                keys: ["id", "day", "available_minutes", "easy_only"]
            )
            try exactArrayObjects(
                draft["preference_changes"],
                keys: ["id", "field", "value"]
            )
            try exactArrayObjects(
                draft["workout_swap_changes"],
                keys: ["id", "from_day", "to_day"]
            )
            try exactArrayObjects(draft["grounding"], keys: ["change_id", "evidence"])
        case .perceivedRecovery:
            try exactKeys(outcome, [
                "route", "mutable", "destination", "fields_to_capture",
                "inferred_values", "persistence_available"
            ])
        case .caution:
            try exactKeys(outcome, [
                "route", "mutable", "destination", "actions", "diagnosis_provided",
                "pain_severity_inferred", "clearance_provided"
            ])
        case .missedWorkout:
            try exactKeys(outcome, [
                "route", "mutable", "destination", "choices", "completion_inferred",
                "persistence_available"
            ])
        case .reflection:
            try exactKeys(outcome, [
                "route", "mutable", "destination", "fields_to_capture",
                "completion_inferred", "effort_inferred", "persistence_available"
            ])
        case .explanation:
            try exactKeys(outcome, [
                "route", "mutable", "destination", "template", "facts", "generated_prose"
            ])
            try exactKeys(
                try object(outcome["facts"], "explanation facts"),
                [
                    "selected_action", "readiness_state", "calendar_state",
                    "confidence_bucket", "has_staleness_warning"
                ]
            )
        case .clarification:
            try exactKeys(outcome, ["route", "mutable", "reason", "choices"])
        case .refusal:
            try exactKeys(outcome, ["route", "mutable", "reason", "safe_next_action"])
        }
    }

    private static func object(_ value: Any?, _ label: String) throws -> [String: Any] {
        guard let object = value as? [String: Any] else {
            throw MobileIntakeValidationError.invalid("\(label) must be an object.")
        }
        return object
    }

    private static func exactKeys(_ object: [String: Any], _ expected: Set<String>) throws {
        guard Set(object.keys) == expected else {
            throw MobileIntakeValidationError.invalid("Unexpected mobile intake structure.")
        }
    }

    private static func exactArrayObjects(_ value: Any?, keys: Set<String>) throws {
        guard let array = value as? [Any] else {
            throw MobileIntakeValidationError.invalid("Expected a bounded object array.")
        }
        for item in array {
            try exactKeys(try object(item, "array item"), keys)
        }
    }

    private static func rejectForbiddenKeys(_ value: Any) throws {
        if let array = value as? [Any] {
            for child in array { try rejectForbiddenKeys(child) }
            return
        }
        guard let object = value as? [String: Any] else { return }
        let forbidden: Set<String> = [
            "uid", "email", "full_name", "fullname", "token", "secret",
            "raw_note", "generated_text", "generated_copy", "sleep_hours", "hrv",
            "resting_hr", "biometric_value", "pain_severity", "medical_data"
        ]
        for (key, child) in object {
            if forbidden.contains(key.lowercased()) {
                throw MobileIntakeValidationError.invalid(
                    "Forbidden mobile intake response key: \(key)"
                )
            }
            try rejectForbiddenKeys(child)
        }
    }
}

struct MobileIntakeFixture: Codable {
    var schemaVersion: String
    var contractSchema: String
    var context: MobileIntakeContext
    var routeCases: [MobileIntakeFixtureRouteCase]
    var failureCases: [MobileIntakeFixtureFailureCase]
    var privacyForbiddenAuditKeys: [String]

    enum CodingKeys: String, CodingKey {
        case schemaVersion = "schema_version"
        case contractSchema = "contract_schema"
        case context
        case routeCases = "route_cases"
        case failureCases = "failure_cases"
        case privacyForbiddenAuditKeys = "privacy_forbidden_audit_keys"
    }
}

struct MobileIntakeFixtureRouteCase: Codable {
    var id: String
    var text: String
    var expectedRoute: MobileIntakeRoute
    var expectedDraftKind: MobileIntakeDraftKind?
    var expectedReason: MobileIntakeRefusalReason?
    var mutable: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case text
        case expectedRoute = "expected_route"
        case expectedDraftKind = "expected_draft_kind"
        case expectedReason = "expected_reason"
        case mutable
    }
}

struct MobileIntakeFixtureFailureCase: Codable {
    var id: String
    var kind: String
    var status: Int?
    var expectedFailure: String
    var safeRoute: MobileIntakeRoute?

    enum CodingKeys: String, CodingKey {
        case id
        case kind
        case status
        case expectedFailure = "expected_failure"
        case safeRoute = "safe_route"
    }
}

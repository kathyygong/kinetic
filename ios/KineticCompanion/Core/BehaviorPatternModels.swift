import Foundation

enum BehaviorPatternContract {
    static let schema = "behavior-pattern-result.v1"
    static let maximumPatterns = 20
    static let maximumWarnings = 20
    static let maximumHistoryEvents = 1_000
    static let maximumTextLength = 500
    static let maximumLatencyMs = 30_000
}

enum BehaviorPatternSource: String, Codable {
    case deterministic
    case ollama
}

enum BehaviorPatternAnalysisFailure: String, Codable {
    case none
    case timeout
    case aiUnavailable = "ai_unavailable"
    case malformedAI = "malformed_ai"
    case invalidAI = "invalid_ai"
    case unsupportedAI = "unsupported_ai"
    case unknown
}

struct BehaviorPatternAnalysis: Codable, Equatable {
    var source: BehaviorPatternSource
    var fallbackUsed: Bool
    var failure: BehaviorPatternAnalysisFailure

    enum CodingKeys: String, CodingKey {
        case source
        case fallbackUsed = "fallback_used"
        case failure
    }
}

enum BehaviorPatternFamily: String, Codable, CaseIterable {
    case heavyCalendarMisses = "heavy_calendar_misses"
    case specificDaySkips = "specific_day_skips"
    case longRunDayPreference = "long_run_day_preference"
    case restOverride = "rest_override"
    case adjustmentTolerance = "adjustment_tolerance"
    case staleDataOrCheckinGap = "stale_data_or_checkin_gap"
    case painOrDiscomfortRecurrence = "pain_or_discomfort_recurrence"
}

enum BehaviorPatternConfidence: String, Codable {
    case low
    case moderate
    case high
}

enum BehaviorPatternPreferenceType: String, Codable {
    case busyDayPreference = "busy_day_preference"
    case restDayPreference = "rest_day_preference"
    case intensityTolerance = "intensity_tolerance"
    case schedulePreference = "schedule_preference"
    case none
}

enum BehaviorPatternResultKind: String, Codable {
    case scoringPreferenceReview = "scoring_preference_review"
    case preferredDayReview = "preferred_day_review"
    case checkinPrompt = "checkin_prompt"
    case caution
}

enum BehaviorPatternMutation: String, Codable {
    case none
    case confirmedPreference = "confirmed_preference"
    case preferredTrainingDays = "preferred_training_days"
}

enum BehaviorPatternAdjustmentDirection: String, Codable {
    case shorterOrEasier = "shorter_or_easier"
    case recoveryAlternative = "recovery_alternative"
    case reduceIntensity = "reduce_intensity"
    case increaseIntensity = "increase_intensity"
}

enum BehaviorPatternPreferredDayStrategy: String, Codable {
    case avoidDay = "avoid_day"
    case preferLongRunDay = "prefer_long_run_day"
}

enum BehaviorPatternPromptKind: String, Codable {
    case syncReadiness = "sync_readiness"
    case completeCheckin = "complete_checkin"
}

enum BehaviorPatternCautionAction: String, Codable {
    case stopOrReduce = "stop_or_reduce"
    case captureDiscomfortFlag = "capture_discomfort_flag"
    case seekQualifiedCare = "seek_qualified_care"
}

enum BehaviorPatternResult: Codable, Equatable {
    case scoringPreference(
        actionLabel: String,
        willChange: String,
        willNeverChange: String,
        preferenceType: BehaviorPatternPreferenceType,
        direction: BehaviorPatternAdjustmentDirection
    )
    case preferredDay(
        actionLabel: String,
        willChange: String,
        willNeverChange: String,
        strategy: BehaviorPatternPreferredDayStrategy,
        observedDay: MobileIntakeDay
    )
    case checkinPrompt(
        actionLabel: String,
        willChange: String,
        willNeverChange: String,
        prompt: BehaviorPatternPromptKind
    )
    case caution(
        actionLabel: String,
        willChange: String,
        willNeverChange: String,
        actions: [BehaviorPatternCautionAction]
    )

    enum CodingKeys: String, CodingKey {
        case kind
        case reviewRequired = "review_required"
        case confirmationRequired = "confirmation_required"
        case mutation
        case actionLabel = "action_label"
        case willChange = "will_change_if_confirmed"
        case willNeverChange = "will_never_change"
        case preferenceType = "preference_type"
        case adjustmentDirection = "adjustment_direction"
        case strategy
        case observedDay = "observed_day"
        case promptKind = "prompt_kind"
        case cautionActions = "caution_actions"
    }

    var kind: BehaviorPatternResultKind {
        switch self {
        case .scoringPreference: .scoringPreferenceReview
        case .preferredDay: .preferredDayReview
        case .checkinPrompt: .checkinPrompt
        case .caution: .caution
        }
    }

    var mutation: BehaviorPatternMutation {
        switch self {
        case .scoringPreference: .confirmedPreference
        case .preferredDay: .preferredTrainingDays
        case .checkinPrompt, .caution: .none
        }
    }

    var actionLabel: String {
        switch self {
        case .scoringPreference(let value, _, _, _, _),
             .preferredDay(let value, _, _, _, _),
             .checkinPrompt(let value, _, _, _),
             .caution(let value, _, _, _):
            value
        }
    }

    var willChange: String {
        switch self {
        case .scoringPreference(_, let value, _, _, _),
             .preferredDay(_, let value, _, _, _),
             .checkinPrompt(_, let value, _, _),
             .caution(_, let value, _, _):
            value
        }
    }

    var willNeverChange: String {
        switch self {
        case .scoringPreference(_, _, let value, _, _),
             .preferredDay(_, _, let value, _, _),
             .checkinPrompt(_, _, let value, _),
             .caution(_, _, let value, _):
            value
        }
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let kind = try values.decode(BehaviorPatternResultKind.self, forKey: .kind)
        let action = try values.decode(String.self, forKey: .actionLabel)
        let willChange = try values.decode(String.self, forKey: .willChange)
        let willNeverChange = try values.decode(String.self, forKey: .willNeverChange)
        switch kind {
        case .scoringPreferenceReview:
            guard try values.decode(Bool.self, forKey: .reviewRequired),
                  try values.decode(Bool.self, forKey: .confirmationRequired),
                  try values.decode(BehaviorPatternMutation.self, forKey: .mutation)
                    == .confirmedPreference else {
                throw BehaviorPatternValidationError.invalid("Invalid scoring review boundary.")
            }
            self = .scoringPreference(
                actionLabel: action,
                willChange: willChange,
                willNeverChange: willNeverChange,
                preferenceType: try values.decode(
                    BehaviorPatternPreferenceType.self,
                    forKey: .preferenceType
                ),
                direction: try values.decode(
                    BehaviorPatternAdjustmentDirection.self,
                    forKey: .adjustmentDirection
                )
            )
        case .preferredDayReview:
            guard try values.decode(Bool.self, forKey: .reviewRequired),
                  try values.decode(Bool.self, forKey: .confirmationRequired),
                  try values.decode(BehaviorPatternMutation.self, forKey: .mutation)
                    == .preferredTrainingDays else {
                throw BehaviorPatternValidationError.invalid("Invalid preferred-day boundary.")
            }
            self = .preferredDay(
                actionLabel: action,
                willChange: willChange,
                willNeverChange: willNeverChange,
                strategy: try values.decode(
                    BehaviorPatternPreferredDayStrategy.self,
                    forKey: .strategy
                ),
                observedDay: try values.decode(MobileIntakeDay.self, forKey: .observedDay)
            )
        case .checkinPrompt:
            guard try values.decode(Bool.self, forKey: .reviewRequired) == false,
                  try values.decode(Bool.self, forKey: .confirmationRequired) == false,
                  try values.decode(BehaviorPatternMutation.self, forKey: .mutation) == .none else {
                throw BehaviorPatternValidationError.invalid("Invalid check-in prompt boundary.")
            }
            self = .checkinPrompt(
                actionLabel: action,
                willChange: willChange,
                willNeverChange: willNeverChange,
                prompt: try values.decode(BehaviorPatternPromptKind.self, forKey: .promptKind)
            )
        case .caution:
            guard try values.decode(Bool.self, forKey: .reviewRequired) == false,
                  try values.decode(Bool.self, forKey: .confirmationRequired) == false,
                  try values.decode(BehaviorPatternMutation.self, forKey: .mutation) == .none else {
                throw BehaviorPatternValidationError.invalid("Invalid caution boundary.")
            }
            self = .caution(
                actionLabel: action,
                willChange: willChange,
                willNeverChange: willNeverChange,
                actions: try values.decode(
                    [BehaviorPatternCautionAction].self,
                    forKey: .cautionActions
                )
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)
        try values.encode(kind, forKey: .kind)
        try values.encode(kind == .scoringPreferenceReview || kind == .preferredDayReview,
                          forKey: .reviewRequired)
        try values.encode(kind == .scoringPreferenceReview || kind == .preferredDayReview,
                          forKey: .confirmationRequired)
        try values.encode(mutation, forKey: .mutation)
        try values.encode(actionLabel, forKey: .actionLabel)
        try values.encode(willChange, forKey: .willChange)
        try values.encode(willNeverChange, forKey: .willNeverChange)
        switch self {
        case .scoringPreference(_, _, _, let type, let direction):
            try values.encode(type, forKey: .preferenceType)
            try values.encode(direction, forKey: .adjustmentDirection)
        case .preferredDay(_, _, _, let strategy, let day):
            try values.encode(strategy, forKey: .strategy)
            try values.encode(day, forKey: .observedDay)
        case .checkinPrompt(_, _, _, let prompt):
            try values.encode(prompt, forKey: .promptKind)
        case .caution(_, _, _, let actions):
            try values.encode(actions, forKey: .cautionActions)
        }
    }
}

struct BehaviorPattern: Codable, Equatable, Identifiable {
    var id: String
    var family: BehaviorPatternFamily
    var title: String
    var description: String
    var confidence: BehaviorPatternConfidence
    var suggestedAdjustment: String
    var preferenceType: BehaviorPatternPreferenceType
    var supportCount: Int
    var whyItMatters: String
    var result: BehaviorPatternResult

    enum CodingKeys: String, CodingKey {
        case id
        case family
        case title
        case description
        case confidence
        case suggestedAdjustment = "suggested_adjustment"
        case preferenceType = "preference_type"
        case supportCount = "support_count"
        case whyItMatters = "why_it_matters"
        case result
    }
}

struct BehaviorInsightsResponse: Codable, Equatable {
    var contractVersion: String
    var analysis: BehaviorPatternAnalysis
    var patterns: [BehaviorPattern]
    var warnings: [String]

    enum CodingKeys: String, CodingKey {
        case contractVersion = "contract_version"
        case analysis
        case patterns
        case warnings
    }

    static func decode(_ data: Data) throws -> BehaviorInsightsResponse {
        let object: Any
        do {
            object = try JSONSerialization.jsonObject(with: data)
        } catch {
            throw BehaviorPatternValidationError.invalid("Malformed behavior response.")
        }
        try BehaviorPatternValidator.validateStructure(object)
        let response: BehaviorInsightsResponse
        do {
            response = try JSONDecoder().decode(BehaviorInsightsResponse.self, from: data)
        } catch let error as BehaviorPatternValidationError {
            throw error
        } catch {
            throw BehaviorPatternValidationError.invalid("Malformed behavior response.")
        }
        try BehaviorPatternValidator.validate(response)
        return response
    }
}

struct BehaviorRecommendationActualWorkout: Codable, Equatable {
    var completed: Bool
    var distanceMiles: Double?
    var durationMinutes: Double?
    var perceivedEffort: Int?
    var reflectionCategory: MobileCheckinReflection?
    var skipReason: MobileCheckinSkipReason?
}

struct BehaviorRecommendationContext: Codable, Equatable {
    var calendarLoad: String?
    var sleepStatus: String?
    var recoveryStatus: String?
    var readinessFreshness: String?
    var checkinStatus: String?
}

struct BehaviorRecommendationEvent: Codable, Equatable {
    var id: String
    var date: String
    var plannedWorkout: String
    var recommendedWorkout: String
    var selectedAction: DecisionActionName
    var confidence: ConfidenceBucket
    var recoveryScore: Double?
    var availableMinutes: Int?
    var userResponse: String?
    var actualWorkout: BehaviorRecommendationActualWorkout?
    var context: BehaviorRecommendationContext

    init(_ event: MobileCheckinRecommendationEvent) {
        id = event.id
        date = event.date
        plannedWorkout = event.plannedWorkout
        recommendedWorkout = event.recommendedWorkout
        selectedAction = event.selectedAction
        confidence = event.confidence
        recoveryScore = event.recoveryScore
        availableMinutes = event.availableMinutes
        userResponse = event.userResponse
        actualWorkout = event.actualWorkout.map {
            BehaviorRecommendationActualWorkout(
                completed: $0.completed,
                distanceMiles: $0.distanceMiles,
                durationMinutes: $0.durationMinutes,
                perceivedEffort: $0.perceivedEffort,
                reflectionCategory: $0.reflectionCategory,
                skipReason: $0.skipReason
            )
        }
        context = BehaviorRecommendationContext(
            calendarLoad: event.context.calendarLoad,
            sleepStatus: event.context.sleepStatus,
            recoveryStatus: event.context.recoveryStatus,
            readinessFreshness: event.context.readinessFreshness,
            checkinStatus: event.context.checkinStatus
        )
    }
}

struct BehaviorInsightsRequest: Codable, Equatable {
    var recommendationEvents: [BehaviorRecommendationEvent]

    enum CodingKeys: String, CodingKey {
        case recommendationEvents = "recommendation_events"
    }
}

enum BehaviorPatternValidationError: Error, Equatable, LocalizedError {
    case invalid(String)

    var errorDescription: String? {
        switch self {
        case .invalid(let message): message
        }
    }
}

enum BehaviorPatternValidator {
    static func validate(_ request: BehaviorInsightsRequest) throws {
        let events = request.recommendationEvents
        guard events.count <= BehaviorPatternContract.maximumHistoryEvents,
              Set(events.map(\.id)).count == events.count else {
            throw BehaviorPatternValidationError.invalid("Behavior history is not bounded.")
        }
        let responses: Set<String> = ["accepted", "rejected", "modified", "skipped"]
        let calendarLoads: Set<String> = ["light", "moderate", "heavy"]
        let sleepStates: Set<String> = ["below_baseline", "normal", "above_baseline"]
        let recoveryStates: Set<String> = ["low", "moderate", "high"]
        let freshnessStates: Set<String> = ["fresh", "stale", "missing"]
        let checkinStates: Set<String> = ["completed", "missing", "not_due"]
        for event in events {
            guard !event.id.isEmpty,
                  event.id.count <= BehaviorPatternContract.maximumTextLength,
                  MobileTodayDate.isLocalDay(event.date),
                  isText(event.plannedWorkout),
                  isText(event.recommendedWorkout),
                  event.recoveryScore.map({ $0.isFinite && (0...1).contains($0) }) ?? true,
                  event.availableMinutes.map({ (0...240).contains($0) }) ?? true,
                  event.userResponse.map(responses.contains) ?? true,
                  event.context.calendarLoad.map(calendarLoads.contains) ?? true,
                  event.context.sleepStatus.map(sleepStates.contains) ?? true,
                  event.context.recoveryStatus.map(recoveryStates.contains) ?? true,
                  event.context.readinessFreshness.map(freshnessStates.contains) ?? true,
                  event.context.checkinStatus.map(checkinStates.contains) ?? true else {
                throw BehaviorPatternValidationError.invalid("Behavior history is invalid.")
            }
            if let actual = event.actualWorkout {
                guard actual.distanceMiles.map({ $0.isFinite && (0...1_000).contains($0) }) ?? true,
                      actual.durationMinutes.map({ $0.isFinite && (0...10_000).contains($0) }) ?? true,
                      actual.perceivedEffort.map({ (1...10).contains($0) }) ?? true else {
                    throw BehaviorPatternValidationError.invalid(
                        "Behavior workout outcome is invalid."
                    )
                }
            }
        }
    }

    static func validate(_ response: BehaviorInsightsResponse) throws {
        guard response.contractVersion == BehaviorPatternContract.schema,
              response.patterns.count <= BehaviorPatternContract.maximumPatterns,
              response.warnings.count <= BehaviorPatternContract.maximumWarnings,
              Set(response.patterns.map(\.id)).count == response.patterns.count else {
            throw BehaviorPatternValidationError.invalid("Behavior envelope is invalid.")
        }
        if !response.analysis.fallbackUsed && response.analysis.failure != .none {
            throw BehaviorPatternValidationError.invalid("Behavior fallback metadata is invalid.")
        }
        try response.warnings.forEach(validateText)
        try response.patterns.forEach(validate)
    }

    static func validate(_ pattern: BehaviorPattern) throws {
        guard pattern.id.range(
            of: #"^pattern_[a-z0-9_]+$"#,
            options: .regularExpression
        ) != nil,
        pattern.id.count <= 160,
        (2...1_000).contains(pattern.supportCount) else {
            throw BehaviorPatternValidationError.invalid("Behavior pattern identity is invalid.")
        }
        try validateText(pattern.title)
        try validateText(pattern.description)
        try validateText(pattern.suggestedAdjustment)
        try validateText(pattern.whyItMatters)
        try validateText(pattern.result.actionLabel)
        try validateText(pattern.result.willChange)
        try validateText(pattern.result.willNeverChange)

        switch (pattern.family, pattern.preferenceType, pattern.result) {
        case (
            .heavyCalendarMisses,
            .busyDayPreference,
            .scoringPreference(_, _, _, .busyDayPreference, .shorterOrEasier)
        ),
        (
            .restOverride,
            .restDayPreference,
            .scoringPreference(_, _, _, .restDayPreference, .recoveryAlternative)
        ),
        (
            .adjustmentTolerance,
            .intensityTolerance,
            .scoringPreference(_, _, _, .intensityTolerance, .reduceIntensity)
        ),
        (
            .adjustmentTolerance,
            .intensityTolerance,
            .scoringPreference(_, _, _, .intensityTolerance, .increaseIntensity)
        ),
        (
            .specificDaySkips,
            .schedulePreference,
            .preferredDay(_, _, _, .avoidDay, _)
        ),
        (
            .longRunDayPreference,
            .schedulePreference,
            .preferredDay(_, _, _, .preferLongRunDay, _)
        ),
        (
            .staleDataOrCheckinGap,
            .none,
            .checkinPrompt(_, _, _, _)
        ):
            break
        case (
            .painOrDiscomfortRecurrence,
            .none,
            .caution(_, _, _, let actions)
        ):
            guard actions == [.stopOrReduce, .captureDiscomfortFlag, .seekQualifiedCare] else {
                throw BehaviorPatternValidationError.invalid("Caution actions drifted.")
            }
        default:
            throw BehaviorPatternValidationError.invalid("Behavior result route drifted.")
        }
    }

    static func validateStructure(_ value: Any) throws {
        let root = try object(value, keys: ["contract_version", "analysis", "patterns", "warnings"])
        _ = try object(
            root["analysis"],
            keys: ["source", "fallback_used", "failure"]
        )
        guard let patterns = root["patterns"] as? [Any],
              patterns.count <= BehaviorPatternContract.maximumPatterns,
              let warnings = root["warnings"] as? [Any],
              warnings.count <= BehaviorPatternContract.maximumWarnings,
              warnings.allSatisfy({ $0 is String }) else {
            throw BehaviorPatternValidationError.invalid("Behavior arrays are invalid.")
        }
        for value in patterns {
            let pattern = try object(
                value,
                keys: [
                    "id", "family", "title", "description", "confidence",
                    "suggested_adjustment", "preference_type", "support_count",
                    "why_it_matters", "result"
                ]
            )
            guard let result = pattern["result"] as? [String: Any],
                  let kind = result["kind"] as? String else {
                throw BehaviorPatternValidationError.invalid("Behavior result is missing.")
            }
            let common = [
                "kind", "review_required", "confirmation_required", "mutation",
                "action_label", "will_change_if_confirmed", "will_never_change"
            ]
            let keys: [String]
            switch kind {
            case BehaviorPatternResultKind.scoringPreferenceReview.rawValue:
                keys = common + ["preference_type", "adjustment_direction"]
            case BehaviorPatternResultKind.preferredDayReview.rawValue:
                keys = common + ["strategy", "observed_day"]
            case BehaviorPatternResultKind.checkinPrompt.rawValue:
                keys = common + ["prompt_kind"]
            case BehaviorPatternResultKind.caution.rawValue:
                keys = common + ["caution_actions"]
            default:
                throw BehaviorPatternValidationError.invalid("Behavior result kind is unsupported.")
            }
            _ = try object(result, keys: keys)
        }
    }

    private static func object(_ value: Any?, keys: [String]) throws -> [String: Any] {
        guard let value = value as? [String: Any],
              Set(value.keys) == Set(keys) else {
            throw BehaviorPatternValidationError.invalid("Behavior object keys are invalid.")
        }
        return value
    }

    private static func validateText(_ value: String) throws {
        guard isText(value) else {
            throw BehaviorPatternValidationError.invalid("Behavior text is invalid.")
        }
    }

    private static func isText(_ value: String) -> Bool {
        !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && value.count <= BehaviorPatternContract.maximumTextLength
    }
}

#if DEBUG
enum BehaviorPatternAccessibilityQA {
    enum State: String {
        case success
        case confirmed
        case loading
        case failure
    }

    static var isEnabled: Bool {
        UserDefaults.standard.bool(forKey: "kinetic.qa-behavior-patterns")
    }

    static var state: State {
        guard
            let rawValue = UserDefaults.standard.string(
                forKey: "kinetic.qa-behavior-patterns-state"
            ),
            let state = State(rawValue: rawValue)
        else {
            return .success
        }
        return state
    }

    static let response = BehaviorInsightsResponse(
        contractVersion: BehaviorPatternContract.schema,
        analysis: BehaviorPatternAnalysis(
            source: .deterministic,
            fallbackUsed: false,
            failure: .none
        ),
        patterns: [
            BehaviorPattern(
                id: "pattern_heavy_calendar_misses",
                family: .heavyCalendarMisses,
                title: "Heavy calendar",
                description: "Repeated heavy-calendar days ended with skipped sessions.",
                confidence: .moderate,
                suggestedAdjustment: "Review a shorter-or-easier preference.",
                preferenceType: .busyDayPreference,
                supportCount: 3,
                whyItMatters:
                    "A smaller option may make training more feasible on constrained days.",
                result: .scoringPreference(
                    actionLabel: "Review busy-day preference",
                    willChange:
                        "Shorter or easier candidates may receive a small bounded score nudge on heavy-calendar days.",
                    willNeverChange:
                        "Safety state, available candidates, mileage, and the saved plan.",
                    preferenceType: .busyDayPreference,
                    direction: .shorterOrEasier
                )
            ),
            BehaviorPattern(
                id: "pattern_long_run_day_preference_sat",
                family: .longRunDayPreference,
                title: "Saturday long runs",
                description: "Completed long runs repeatedly landed on Saturday.",
                confidence: .high,
                suggestedAdjustment: "Review Saturday as a preferred long-run day.",
                preferenceType: .schedulePreference,
                supportCount: 4,
                whyItMatters:
                    "A reviewed long-run day can improve fit without changing load or spacing rules.",
                result: .preferredDay(
                    actionLabel: "Review preferred training days",
                    willChange:
                        "Preferred-day inputs and the deterministically regenerated saved plan.",
                    willNeverChange:
                        "Weekly load, workout validity, phase structure, taper, or safety spacing.",
                    strategy: .preferLongRunDay,
                    observedDay: .sat
                )
            ),
            BehaviorPattern(
                id: "pattern_stale_data_or_checkin_gap_sync_readiness",
                family: .staleDataOrCheckinGap,
                title: "Readiness needs a refresh",
                description: "Recent recommendations repeatedly used stale readiness inputs.",
                confidence: .moderate,
                suggestedAdjustment: "Prompt for a readiness sync.",
                preferenceType: .none,
                supportCount: 2,
                whyItMatters: "Fresh bounded inputs make Today explanations more complete.",
                result: .checkinPrompt(
                    actionLabel: "Sync readiness",
                    willChange: "No training state changes from this prompt.",
                    willNeverChange:
                        "The saved plan, readiness values, completion state, or preferences.",
                    prompt: .syncReadiness
                )
            ),
            BehaviorPattern(
                id: "pattern_pain_or_discomfort_recurrence",
                family: .painOrDiscomfortRecurrence,
                title: "Repeated discomfort",
                description: "A bounded discomfort flag appeared more than once.",
                confidence: .moderate,
                suggestedAdjustment: "Stay conservative and review the fixed caution options.",
                preferenceType: .none,
                supportCount: 2,
                whyItMatters:
                    "Repeated discomfort belongs in a conservative safety flow, not personalization.",
                result: .caution(
                    actionLabel: "Review caution guidance",
                    willChange: "No training state changes from this guidance.",
                    willNeverChange:
                        "No sensitive health record or automatic training mutation is created.",
                    actions: [
                        .stopOrReduce,
                        .captureDiscomfortFlag,
                        .seekQualifiedCare
                    ]
                )
            )
        ],
        warnings: []
    )
}
#endif

import Foundation

enum MobileTodayContract {
    static let schema = "mobile-today.v1"
    static let cacheSchema = "mobile-today-cache.v1"
    static let freshCacheHours = 6.0
    static let maximumCacheHours = 24.0
    static let maximumTextLength = 500
    static let maximumListLength = 20
}

enum DecisionActionName: String, Codable {
    case proceed
    case modify
    case rest
}

struct DecisionCandidate: Codable, Equatable {
    var name: DecisionActionName
    var description: String
    var intensityModifier: Double
    var durationModifier: Double

    enum CodingKeys: String, CodingKey {
        case name
        case description
        case intensityModifier = "intensity_modifier"
        case durationModifier = "duration_modifier"
    }
}

struct DecisionBiometrics: Codable, Equatable {
    var hrv: Double
    var hrvBaseline: Double
    var sleepHours: Double
    var restingHeartRate: Double
    var fatigueLevel: Int?
    var sorenessLevel: Int?

    enum CodingKeys: String, CodingKey {
        case hrv
        case hrvBaseline = "hrv_baseline"
        case sleepHours = "sleep_hours"
        case restingHeartRate = "resting_hr"
        case fatigueLevel = "fatigue_level"
        case sorenessLevel = "soreness_level"
    }
}

struct DecisionTrainingContext: Codable, Equatable {
    var plannedWorkout: String
    var recentWorkouts: [String]

    enum CodingKeys: String, CodingKey {
        case plannedWorkout = "planned_workout"
        case recentWorkouts = "recent_workouts"
    }
}

struct DecisionConstraints: Codable, Equatable {
    var availableMinutes: Int
    var calendarAuthoritative: Bool

    enum CodingKeys: String, CodingKey {
        case availableMinutes = "available_minutes"
        case calendarAuthoritative = "calendar_authoritative"
    }
}

struct DecisionDataFreshness: Codable, Equatable {
    var recoveryAgeHours: Double?
    var calendarAgeHours: Double?

    enum CodingKeys: String, CodingKey {
        case recoveryAgeHours = "recovery_age_hours"
        case calendarAgeHours = "calendar_age_hours"
    }
}

enum LearnedPreferenceType: String, Codable {
    case busyDayPreference = "busy_day_preference"
    case restDayPreference = "rest_day_preference"
    case intensityTolerance = "intensity_tolerance"
    case schedulePreference = "schedule_preference"
}

struct DecisionLearnedPreference: Codable, Equatable {
    var id: String
    var type: LearnedPreferenceType
    var confidence: ConfidenceBucket
    var userConfirmed: Bool
    var createdAt: String
}

struct DecisionRequest: Codable, Equatable {
    var biometrics: DecisionBiometrics
    var trainingContext: DecisionTrainingContext
    var constraints: DecisionConstraints
    var dataFreshness: DecisionDataFreshness
    var biasTowardOriginal: Double
    var learnedPreferences: [DecisionLearnedPreference]

    enum CodingKeys: String, CodingKey {
        case biometrics
        case trainingContext = "training_context"
        case constraints
        case dataFreshness = "data_freshness"
        case biasTowardOriginal = "bias_toward_original"
        case learnedPreferences = "learned_preferences"
    }
}

enum MobileTodayPresenceState: String, Codable {
    case present
    case missing
}

enum MobileTodayPlanState: String, Codable {
    case scheduled
    case rest
    case missing
}

enum MobileTodayReadinessContractState: String, Codable {
    case complete
    case partial
    case missing
    case stale
}

enum MobileTodayReadinessSource: String, Codable {
    case manual
    case appleHealthCsv = "apple_health_csv"
    case healthkit
    case demo
    case mixed
    case missing
}

enum MobileTodayBaselineSource: String, Codable {
    case rollingHistory = "rolling_history"
    case currentNeutral = "current_neutral"
    case missing
}

enum MobileTodayCalendarContractState: String, Codable {
    case clear
    case conflict
    case stale
    case missing
}

enum MobileTodayAvailabilitySource: String, Codable {
    case calendar
    case plannedWorkoutFallback = "planned_workout_fallback"
    case missing
}

enum MobileTodayHealthPermissionState: String, Codable {
    case notDetermined = "not_determined"
    case denied
    case partial
    case granted
    case missing
}

struct MobileTodayRequestMetadata: Codable, Equatable {
    var profileState: MobileTodayPresenceState
    var goalState: MobileTodayPresenceState
    var planState: MobileTodayPlanState
    var readinessState: MobileTodayReadinessContractState
    var readinessSource: MobileTodayReadinessSource
    var readinessAgeHours: Double?
    var baselineSource: MobileTodayBaselineSource
    var calendarState: MobileTodayCalendarContractState
    var calendarAgeHours: Double?
    var availabilitySource: MobileTodayAvailabilitySource
    var confirmedPreferenceCount: Int
    var recentWorkoutCount: Int
    var healthPermissionState: MobileTodayHealthPermissionState

    enum CodingKeys: String, CodingKey {
        case profileState = "profile_state"
        case goalState = "goal_state"
        case planState = "plan_state"
        case readinessState = "readiness_state"
        case readinessSource = "readiness_source"
        case readinessAgeHours = "readiness_age_hours"
        case baselineSource = "baseline_source"
        case calendarState = "calendar_state"
        case calendarAgeHours = "calendar_age_hours"
        case availabilitySource = "availability_source"
        case confirmedPreferenceCount = "confirmed_preference_count"
        case recentWorkoutCount = "recent_workout_count"
        case healthPermissionState = "health_permission_state"
    }
}

struct MobileTodayRequestContract: Codable, Equatable {
    var schema: String
    var localDay: String
    var request: DecisionRequest
    var metadata: MobileTodayRequestMetadata

    enum CodingKeys: String, CodingKey {
        case schema
        case localDay = "local_day"
        case request
        case metadata
    }
}

struct DecisionOutput: Codable, Equatable {
    var state: String
    var recoveryScore: Double
    var selectedAction: DecisionCandidate
    var finalWorkout: String
    var confidence: Double
    var availableMinutes: Int
    var keyFactors: [String]
    var alternatives: [DecisionCandidate]
    var scores: [String: Double]
    var decisionTrace: [String]
    var stalenessWarnings: [String]

    enum CodingKeys: String, CodingKey {
        case state
        case recoveryScore = "recovery_score"
        case selectedAction = "selected_action"
        case finalWorkout = "final_workout"
        case confidence
        case availableMinutes = "available_minutes"
        case keyFactors = "key_factors"
        case alternatives
        case scores
        case decisionTrace = "decision_trace"
        case stalenessWarnings = "staleness_warnings"
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        state = try values.decode(String.self, forKey: .state)
        recoveryScore = try values.decode(Double.self, forKey: .recoveryScore)
        selectedAction = try values.decode(DecisionCandidate.self, forKey: .selectedAction)
        finalWorkout = try values.decode(String.self, forKey: .finalWorkout)
        confidence = try values.decode(Double.self, forKey: .confidence)
        availableMinutes = try values.decode(Int.self, forKey: .availableMinutes)
        keyFactors = try values.decode([String].self, forKey: .keyFactors)
        alternatives = try values.decode([DecisionCandidate].self, forKey: .alternatives)
        scores = try values.decode([String: Double].self, forKey: .scores)
        decisionTrace = try values.decode([String].self, forKey: .decisionTrace)
        stalenessWarnings = try values.decodeIfPresent([String].self, forKey: .stalenessWarnings) ?? []
    }
}

enum DailyReasoningImpact: String, Codable {
    case positive
    case negative
    case neutral
}

struct DailyReasoningFactor: Codable, Equatable {
    var title: String
    var explanation: String
    var impact: DailyReasoningImpact
}

struct DailyReasoning: Codable, Equatable {
    var summary: String
    var factors: [DailyReasoningFactor]
    var tradeoff: String
    var confidenceNote: String

    enum CodingKeys: String, CodingKey {
        case summary
        case factors
        case tradeoff
        case confidenceNote = "confidence_note"
    }
}

struct DecisionResponse: Codable, Equatable {
    var decision: DecisionOutput
    var aiReasoning: DailyReasoning?
    var reasoningAvailable: Bool

    enum CodingKeys: String, CodingKey {
        case decision
        case aiReasoning = "ai_reasoning"
        case reasoningAvailable = "reasoning_available"
    }

    static func parse(_ data: Data) throws -> DecisionResponse {
        let raw = try JSONSerialization.jsonObject(with: data)
        guard let dictionary = raw as? [String: Any] else {
            throw MobileTodayValidationError.invalid("decision response must be an object")
        }
        let decisionObject = dictionary["decision"] ?? dictionary
        guard JSONSerialization.isValidJSONObject(decisionObject) else {
            throw MobileTodayValidationError.invalid("decision response is malformed")
        }
        let decoder = JSONDecoder()
        let decision = try decoder.decode(
            DecisionOutput.self,
            from: JSONSerialization.data(withJSONObject: decisionObject)
        )
        try MobileTodayValidator.validate(decision)

        var reasoning: DailyReasoning?
        if let rawReasoning = dictionary["ai_reasoning"],
           !(rawReasoning is NSNull),
           JSONSerialization.isValidJSONObject(rawReasoning),
           let parsed = try? decoder.decode(
               DailyReasoning.self,
               from: JSONSerialization.data(withJSONObject: rawReasoning)
           ),
           (try? MobileTodayValidator.validate(parsed)) != nil {
            reasoning = parsed
        }

        return DecisionResponse(
            decision: decision,
            aiReasoning: reasoning,
            reasoningAvailable: reasoning != nil
        )
    }
}

struct MobileTodaySnapshotDecision: Codable, Equatable {
    var state: String
    var recoveryScore: Double
    var selectedAction: DecisionCandidate
    var finalWorkout: String
    var confidence: Double
    var availableMinutes: Int
    var keyFactors: [String]
    var stalenessWarnings: [String]

    enum CodingKeys: String, CodingKey {
        case state
        case recoveryScore = "recovery_score"
        case selectedAction = "selected_action"
        case finalWorkout = "final_workout"
        case confidence
        case availableMinutes = "available_minutes"
        case keyFactors = "key_factors"
        case stalenessWarnings = "staleness_warnings"
    }
}

enum MobileTodayExplanationSource: String, Codable {
    case cachedAI = "cached_ai"
    case deterministic
}

struct MobileTodayExplanation: Codable, Equatable {
    var source: MobileTodayExplanationSource
    var summary: String
    var factors: [DailyReasoningFactor]
    var tradeoff: String
    var confidenceNote: String

    enum CodingKeys: String, CodingKey {
        case source
        case summary
        case factors
        case tradeoff
        case confidenceNote = "confidence_note"
    }
}

struct MobileTodayDecisionSnapshot: Codable, Equatable {
    var schema: String
    var localDay: String
    var generatedAt: String
    var decision: MobileTodaySnapshotDecision
    var explanation: MobileTodayExplanation
    var context: MobileTodayRequestMetadata

    enum CodingKeys: String, CodingKey {
        case schema
        case localDay = "local_day"
        case generatedAt = "generated_at"
        case decision
        case explanation
        case context
    }

    static func make(
        contract: MobileTodayRequestContract,
        response: DecisionResponse,
        generatedAt: Date = Date()
    ) throws -> MobileTodayDecisionSnapshot {
        let output = response.decision
        let explanation: MobileTodayExplanation
        if let reasoning = response.aiReasoning {
            explanation = MobileTodayExplanation(
                source: .cachedAI,
                summary: reasoning.summary,
                factors: reasoning.factors,
                tradeoff: reasoning.tradeoff,
                confidenceNote: reasoning.confidenceNote
            )
        } else {
            let action = output.selectedAction.name
            let summary: String
            switch action {
            case .rest:
                summary = "Recovery and schedule constraints support a rest day: \(output.finalWorkout)"
            case .modify:
                summary = "Kinetic safely adjusted today's plan: \(output.finalWorkout)"
            case .proceed:
                summary = "Today's planned workout remains appropriate: \(output.finalWorkout)"
            }
            explanation = MobileTodayExplanation(
                source: .deterministic,
                summary: summary,
                factors: output.keyFactors.prefix(3).map {
                    DailyReasoningFactor(
                        title: "Decision factor",
                        explanation: $0,
                        impact: .neutral
                    )
                },
                tradeoff: action == .proceed
                    ? "Proceed preserves the planned training stimulus."
                    : "The safer option protects consistency while respecting current constraints.",
                confidenceNote: output.stalenessWarnings.isEmpty
                    ? "Readiness and calendar inputs are current enough for this recommendation."
                    : output.stalenessWarnings.joined(separator: " ")
            )
        }

        let snapshot = MobileTodayDecisionSnapshot(
            schema: MobileTodayContract.schema,
            localDay: contract.localDay,
            generatedAt: MobileTodayDate.isoString(generatedAt),
            decision: MobileTodaySnapshotDecision(
                state: output.state,
                recoveryScore: output.recoveryScore,
                selectedAction: output.selectedAction,
                finalWorkout: output.finalWorkout,
                confidence: output.confidence,
                availableMinutes: output.availableMinutes,
                keyFactors: output.keyFactors,
                stalenessWarnings: output.stalenessWarnings
            ),
            explanation: explanation,
            context: contract.metadata
        )
        try MobileTodayValidator.validate(snapshot)
        return snapshot
    }
}

struct MobileTodayCacheEnvelope: Codable, Equatable {
    var schema: String
    var localDay: String
    var cachedAt: String
    var snapshot: MobileTodayDecisionSnapshot

    enum CodingKeys: String, CodingKey {
        case schema
        case localDay = "local_day"
        case cachedAt = "cached_at"
        case snapshot
    }

    static func make(
        snapshot: MobileTodayDecisionSnapshot,
        cachedAt: Date = Date()
    ) throws -> MobileTodayCacheEnvelope {
        let cache = MobileTodayCacheEnvelope(
            schema: MobileTodayContract.cacheSchema,
            localDay: snapshot.localDay,
            cachedAt: MobileTodayDate.isoString(cachedAt),
            snapshot: snapshot
        )
        try MobileTodayValidator.validate(cache)
        return cache
    }
}

enum MobileTodayCacheState: String, Codable {
    case fresh
    case stale
    case expired
    case missing
}

enum MobileTodayFailureCode: String, Codable {
    case authRequired = "auth_required"
    case offline
    case timeout
    case backendUnavailable = "backend_unavailable"
    case invalidResponse = "invalid_response"
    case missingContext = "missing_context"
    case unknown
}

enum MobileTodayDecisionSource: String, Codable {
    case live
    case cache
    case fallback
}

struct MobileTodayLoadResult: Equatable {
    var source: MobileTodayDecisionSource
    var cacheState: MobileTodayCacheState
    var snapshot: MobileTodayDecisionSnapshot?
    var failure: MobileTodayFailureCode?
}

enum MobileTodayCacheResolver {
    static func state(
        cache: MobileTodayCacheEnvelope?,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> MobileTodayCacheState {
        guard let cache else { return .missing }
        guard (try? MobileTodayValidator.validate(cache)) != nil else { return .expired }
        guard cache.localDay == MobileTodayDate.localDay(now, calendar: calendar) else {
            return .expired
        }
        guard let cachedAt = MobileTodayDate.parse(cache.cachedAt) else { return .expired }
        let age = max(0, now.timeIntervalSince(cachedAt) / 3600)
        guard age <= MobileTodayContract.maximumCacheHours else { return .expired }
        return age <= MobileTodayContract.freshCacheHours ? .fresh : .stale
    }

    static func resolve(
        live: MobileTodayDecisionSnapshot? = nil,
        cache: MobileTodayCacheEnvelope?,
        failure: MobileTodayFailureCode? = nil,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> MobileTodayLoadResult {
        let cacheState = state(cache: cache, now: now, calendar: calendar)
        if let live, (try? MobileTodayValidator.validate(live)) != nil {
            return MobileTodayLoadResult(
                source: .live,
                cacheState: cacheState,
                snapshot: live,
                failure: nil
            )
        }
        if let cache, cacheState == .fresh || cacheState == .stale {
            return MobileTodayLoadResult(
                source: .cache,
                cacheState: cacheState,
                snapshot: cache.snapshot,
                failure: failure ?? .unknown
            )
        }
        return MobileTodayLoadResult(
            source: .fallback,
            cacheState: cacheState,
            snapshot: nil,
            failure: failure ?? .unknown
        )
    }
}

enum MobileTodayValidationError: Error, Equatable {
    case invalid(String)
}

enum MobileTodayValidator {
    static func validate(_ contract: MobileTodayRequestContract) throws {
        guard contract.schema == MobileTodayContract.schema else {
            throw MobileTodayValidationError.invalid("unsupported request schema")
        }
        try validateDay(contract.localDay)
        let request = contract.request
        try validateRange(request.biometrics.hrv, 1, 300)
        try validateRange(request.biometrics.hrvBaseline, 1, 300)
        try validateRange(request.biometrics.sleepHours, 0, 24)
        try validateRange(request.biometrics.restingHeartRate, 20, 220)
        if let fatigue = request.biometrics.fatigueLevel {
            try validateRange(Double(fatigue), 1, 5)
        }
        if let soreness = request.biometrics.sorenessLevel {
            try validateRange(Double(soreness), 1, 5)
        }
        try validateText(request.trainingContext.plannedWorkout)
        try validateTextList(request.trainingContext.recentWorkouts, maximum: 5)
        try validateRange(Double(request.constraints.availableMinutes), 0, 240)
        guard request.constraints.calendarAuthoritative else {
            throw MobileTodayValidationError.invalid("calendar must be caller-authoritative")
        }
        try validateRange(request.biasTowardOriginal, 0, 1)
        guard request.learnedPreferences.count <= 20 else {
            throw MobileTodayValidationError.invalid("too many learned preferences")
        }
        for preference in request.learnedPreferences {
            try validateText(preference.id)
            try validateText(preference.createdAt)
            guard preference.userConfirmed else {
                throw MobileTodayValidationError.invalid("unconfirmed preference")
            }
        }
        try validateMetadata(contract.metadata)
        try validatePrivacy(contract)
    }

    static func validate(_ output: DecisionOutput) throws {
        try validateText(output.state)
        try validateRange(output.recoveryScore, 0, 1)
        try validate(output.selectedAction)
        try validateText(output.finalWorkout)
        try validateRange(output.confidence, 0, 1)
        try validateRange(Double(output.availableMinutes), 0, 240)
        try validateTextList(output.keyFactors)
        guard output.alternatives.count <= MobileTodayContract.maximumListLength else {
            throw MobileTodayValidationError.invalid("too many alternatives")
        }
        try output.alternatives.forEach(validate)
        for score in output.scores.values {
            try validateRange(score, 0, 2)
        }
        try validateTextList(output.decisionTrace, maximum: 100)
        try validateTextList(output.stalenessWarnings)
    }

    static func validate(_ reasoning: DailyReasoning) throws {
        try validateText(reasoning.summary)
        guard reasoning.factors.count <= MobileTodayContract.maximumListLength else {
            throw MobileTodayValidationError.invalid("too many reasoning factors")
        }
        for factor in reasoning.factors {
            try validateText(factor.title)
            try validateText(factor.explanation)
        }
        try validateText(reasoning.tradeoff)
        try validateText(reasoning.confidenceNote)
    }

    static func validate(_ snapshot: MobileTodayDecisionSnapshot) throws {
        guard snapshot.schema == MobileTodayContract.schema else {
            throw MobileTodayValidationError.invalid("unsupported snapshot schema")
        }
        try validateDay(snapshot.localDay)
        guard MobileTodayDate.parse(snapshot.generatedAt) != nil else {
            throw MobileTodayValidationError.invalid("invalid generated timestamp")
        }
        let decision = snapshot.decision
        try validateText(decision.state)
        try validateRange(decision.recoveryScore, 0, 1)
        try validate(decision.selectedAction)
        try validateText(decision.finalWorkout)
        try validateRange(decision.confidence, 0, 1)
        try validateRange(Double(decision.availableMinutes), 0, 240)
        try validateTextList(decision.keyFactors)
        try validateTextList(decision.stalenessWarnings)
        try validateText(snapshot.explanation.summary)
        try validateText(snapshot.explanation.tradeoff)
        try validateText(snapshot.explanation.confidenceNote)
        try validateMetadata(snapshot.context)
        try validatePrivacy(snapshot)
    }

    static func validate(_ cache: MobileTodayCacheEnvelope) throws {
        guard cache.schema == MobileTodayContract.cacheSchema else {
            throw MobileTodayValidationError.invalid("unsupported cache schema")
        }
        try validateDay(cache.localDay)
        guard MobileTodayDate.parse(cache.cachedAt) != nil else {
            throw MobileTodayValidationError.invalid("invalid cache timestamp")
        }
        try validate(cache.snapshot)
        guard cache.localDay == cache.snapshot.localDay else {
            throw MobileTodayValidationError.invalid("cache day mismatch")
        }
    }

    static func validatePrivacy<T: Encodable>(_ value: T) throws {
        let encoder = JSONEncoder()
        let object = try JSONSerialization.jsonObject(with: encoder.encode(value))
        try inspectPrivacy(object)
    }

    private static func validate(_ candidate: DecisionCandidate) throws {
        try validateText(candidate.description)
        try validateRange(candidate.intensityModifier, 0, 1)
        try validateRange(candidate.durationModifier, 0, 1)
    }

    private static func validateMetadata(_ metadata: MobileTodayRequestMetadata) throws {
        if let age = metadata.readinessAgeHours { try validateRange(age, 0, 100_000) }
        if let age = metadata.calendarAgeHours { try validateRange(age, 0, 100_000) }
        try validateRange(Double(metadata.confirmedPreferenceCount), 0, 20)
        try validateRange(Double(metadata.recentWorkoutCount), 0, 5)
    }

    private static func validateRange(_ value: Double, _ minimum: Double, _ maximum: Double) throws {
        guard value.isFinite, value >= minimum, value <= maximum else {
            throw MobileTodayValidationError.invalid("numeric value is out of bounds")
        }
    }

    private static func validateText(_ value: String) throws {
        guard !value.isEmpty, value.count <= MobileTodayContract.maximumTextLength else {
            throw MobileTodayValidationError.invalid("text is empty or too long")
        }
    }

    private static func validateTextList(
        _ values: [String],
        maximum: Int = MobileTodayContract.maximumListLength
    ) throws {
        guard values.count <= maximum else {
            throw MobileTodayValidationError.invalid("list is too long")
        }
        try values.forEach(validateText)
    }

    private static func validateDay(_ value: String) throws {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}$"#, options: .regularExpression) != nil else {
            throw MobileTodayValidationError.invalid("local day must be YYYY-MM-DD")
        }
    }

    private static func inspectPrivacy(_ value: Any) throws {
        if let values = value as? [Any] {
            try values.forEach(inspectPrivacy)
            return
        }
        guard let dictionary = value as? [String: Any] else { return }
        let forbidden = Set([
            "uid", "email", "full_name", "profile", "readiness_log", "health_sync",
            "workout_log", "note", "notes", "calendar_text", "event_text", "raw",
            "raw_sample", "raw_samples", "sample", "samples", "token"
        ])
        for (key, child) in dictionary {
            if forbidden.contains(key.lowercased()) {
                throw MobileTodayValidationError.invalid("forbidden mobile Today key: \(key)")
            }
            if key == "learned_preferences",
               let preferences = child as? [[String: Any]],
               preferences.contains(where: { $0["description"] != nil }) {
                throw MobileTodayValidationError.invalid("preference description is forbidden")
            }
            try inspectPrivacy(child)
        }
    }
}

enum MobileTodayDate {
    static func isoString(_ date: Date) -> String {
        fractionalFormatter.string(from: date)
    }

    static func parse(_ value: String) -> Date? {
        fractionalFormatter.date(from: value) ?? basicFormatter.date(from: value)
    }

    static func localDay(_ date: Date, calendar: Calendar = .current) -> String {
        let components = calendar.dateComponents([.year, .month, .day], from: date)
        return String(
            format: "%04d-%02d-%02d",
            components.year ?? 0,
            components.month ?? 0,
            components.day ?? 0
        )
    }

    static func isLocalDay(_ value: String) -> Bool {
        guard value.range(
            of: #"^\d{4}-\d{2}-\d{2}$"#,
            options: .regularExpression
        ) != nil else { return false }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        let formatter = DateFormatter()
        formatter.calendar = calendar
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = calendar.timeZone
        formatter.dateFormat = "yyyy-MM-dd"
        formatter.isLenient = false
        guard let date = formatter.date(from: value) else { return false }
        return formatter.string(from: date) == value
    }

    private static let fractionalFormatter: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let basicFormatter = ISO8601DateFormatter()
}

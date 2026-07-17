import Foundation

enum MobileTodayBuildFailureCode: String, Codable {
    case missingGoal = "missing_goal"
    case missingPlan = "missing_plan"
    case missingReadiness = "missing_readiness"
}

enum MobileTodaySafeAction: String, Codable {
    case completeSetup = "complete_setup"
    case logReadiness = "log_readiness"
}

struct MobileTodayBuildFailure: Error, Equatable {
    var code: MobileTodayBuildFailureCode
    var retryable = false
    var safeAction: MobileTodaySafeAction
}

enum TodayRaceDistance: String, Codable, CaseIterable {
    case fiveK = "5k"
    case tenK = "10k"
    case half
    case marathon
}

enum TodayExperienceLevel: String, Codable {
    case beginner
    case intermediate
    case advanced
}

struct TodayGoal: Codable, Equatable {
    var raceDistance: TodayRaceDistance
    var experienceLevel: TodayExperienceLevel
    var currentPersonalRecords: [String: Double]

    enum CodingKeys: String, CodingKey {
        case raceDistance = "race_distance"
        case experienceLevel = "experience_level"
        case currentPersonalRecords = "current_prs"
    }
}

enum TodayWorkoutType: String, Codable {
    case easy
    case tempo
    case intervals
    case longRun = "long run"
    case race
}

struct TodayPlanWorkout: Codable, Equatable {
    var day: String
    var type: TodayWorkoutType
    var distance: Double
    var pace: Double
    var duration: Double
}

struct TodayPlanWeek: Codable, Equatable {
    var weekNumber: Int
    var workouts: [TodayPlanWorkout]
}

struct TodaySavedPlan: Codable, Equatable {
    var planStart: String
    var weeks: [TodayPlanWeek]
}

struct TodayWorkoutLogEntry: Codable, Equatable {
    var weekNumber: Int
    var day: String
    var status: String
    var scheduledDate: String
    var loggedAt: String
    var acceptedAdjustment: Bool?
}

struct TodayWorkoutLog: Codable, Equatable {
    var entries: [TodayWorkoutLogEntry]
}

struct TodayPreference: Codable, Equatable {
    var id: String
    var type: LearnedPreferenceType
    var confidence: ConfidenceBucket
    var userConfirmed: Bool
    var createdAt: String
}

struct TodayPreferenceLog: Codable, Equatable {
    var preferences: [String: TodayPreference]
}

struct MobileTodayCalendarInput: Codable, Equatable {
    var ageHours: Double?
    var availableMinutesToday: Int?
    var unhealthy: Bool
    var bypassCloudFreshnessForQA: Bool = false
}

struct MobileTodayBuildContext {
    var profilePresent: Bool
    var goal: TodayGoal?
    var savedPlan: TodaySavedPlan?
    var readinessLog: ReadinessLog?
    var healthSync: HealthSyncPayload?
    var calendar: MobileTodayCalendarInput?
    var learnedPreferences: [TodayPreference]
    var workoutLog: [TodayWorkoutLogEntry]
    var now: Date
    var localDay: String?
    var calendarSystem: Calendar

    init(
        profilePresent: Bool,
        goal: TodayGoal?,
        savedPlan: TodaySavedPlan?,
        readinessLog: ReadinessLog?,
        healthSync: HealthSyncPayload?,
        calendar: MobileTodayCalendarInput?,
        learnedPreferences: [TodayPreference],
        workoutLog: [TodayWorkoutLogEntry],
        now: Date = Date(),
        localDay: String? = nil,
        calendarSystem: Calendar = .current
    ) {
        self.profilePresent = profilePresent
        self.goal = goal
        self.savedPlan = savedPlan
        self.readinessLog = readinessLog
        self.healthSync = healthSync
        self.calendar = calendar
        self.learnedPreferences = learnedPreferences
        self.workoutLog = workoutLog
        self.now = now
        self.localDay = localDay
        self.calendarSystem = calendarSystem
    }
}

enum MobileTodayRequestBuilder {
    static func build(_ context: MobileTodayBuildContext) throws -> MobileTodayRequestContract {
        guard let goal = context.goal else {
            throw MobileTodayBuildFailure(code: .missingGoal, safeAction: .completeSetup)
        }
        guard let plan = context.savedPlan, !plan.weeks.isEmpty else {
            throw MobileTodayBuildFailure(code: .missingPlan, safeAction: .completeSetup)
        }
        guard let readiness = latestCompleteReadiness(context.readinessLog) else {
            throw MobileTodayBuildFailure(code: .missingReadiness, safeAction: .logReadiness)
        }

        let workout = resolveWorkout(
            goal: goal,
            plan: plan,
            now: context.now,
            calendar: context.calendarSystem
        )
        let readinessAge = hoursSince(readiness.updatedAt, now: context.now)
        let baseline = hrvBaseline(context.readinessLog, current: readiness)
        let plannedMinutes = boundedMinutes(workout.minutes)
        let calendar = resolveCalendar(context.calendar, fallbackMinutes: plannedMinutes)
        let recent = recentWorkouts(plan: plan, log: context.workoutLog)
        let preferences = context.learnedPreferences
            .filter(\.userConfirmed)
            .prefix(20)
            .map {
                DecisionLearnedPreference(
                    id: String($0.id.prefix(100)),
                    type: $0.type,
                    confidence: $0.confidence,
                    userConfirmed: true,
                    createdAt: $0.createdAt
                )
            }

        let contract = MobileTodayRequestContract(
            schema: MobileTodayContract.schema,
            localDay: context.localDay ?? MobileTodayDate.localDay(
                context.now,
                calendar: context.calendarSystem
            ),
            request: DecisionRequest(
                biometrics: DecisionBiometrics(
                    hrv: readiness.hrv!,
                    hrvBaseline: baseline.value,
                    sleepHours: readiness.sleepHours!,
                    restingHeartRate: readiness.restingHeartRate!,
                    fatigueLevel: readiness.fatigueLevel,
                    sorenessLevel: readiness.sorenessLevel
                ),
                trainingContext: DecisionTrainingContext(
                    plannedWorkout: workout.label,
                    recentWorkouts: recent
                ),
                constraints: DecisionConstraints(
                    availableMinutes: calendar.minutes,
                    calendarAuthoritative: true
                ),
                dataFreshness: DecisionDataFreshness(
                    recoveryAgeHours: readinessAge,
                    calendarAgeHours: calendar.age
                ),
                biasTowardOriginal: adjustmentBias(context.workoutLog),
                learnedPreferences: Array(preferences)
            ),
            metadata: MobileTodayRequestMetadata(
                profileState: context.profilePresent ? .present : .missing,
                goalState: .present,
                planState: workout.type == nil ? .rest : .scheduled,
                readinessState: readinessState(readiness, age: readinessAge),
                readinessSource: readiness.source.map {
                    MobileTodayReadinessSource(rawValue: $0.rawValue) ?? .missing
                } ?? .missing,
                readinessAgeHours: readinessAge,
                baselineSource: baseline.source,
                calendarState: calendar.state,
                calendarAgeHours: calendar.age,
                availabilitySource: calendar.source,
                confirmedPreferenceCount: preferences.count,
                recentWorkoutCount: recent.count,
                healthPermissionState: context.healthSync.map {
                    MobileTodayHealthPermissionState(rawValue: $0.permissionState.rawValue) ?? .missing
                } ?? .missing
            )
        )
        try MobileTodayValidator.validate(contract)
        return contract
    }

    private struct ResolvedWorkout {
        var type: TodayWorkoutType?
        var minutes: Double
        var label: String
    }

    private static func resolveWorkout(
        goal: TodayGoal,
        plan: TodaySavedPlan,
        now: Date,
        calendar: Calendar
    ) -> ResolvedWorkout {
        let weekIndex = currentWeekIndex(plan: plan, now: now, calendar: calendar)
        let week = plan.weeks[weekIndex]
        let symbols = calendar.shortWeekdaySymbols
        let weekday = calendar.component(.weekday, from: now)
        let day = symbols[max(0, min(symbols.count - 1, weekday - 1))]
        guard let workout = week.workouts.first(where: { $0.day == day }) else {
            return ResolvedWorkout(type: nil, minutes: 0, label: "rest day")
        }

        let minutes: Double
        switch workout.type {
        case .tempo where workout.distance >= 3,
             .intervals where workout.distance >= 3:
            let easyPace = trainingEasyPace(goal: goal, weekIndex: weekIndex, totalWeeks: plan.weeks.count)
            minutes = Double(Int(easyPace.rounded())) * 2
                + Double(Int(((workout.distance - 2) * workout.pace).rounded()))
        default:
            minutes = Double(Int((workout.distance * workout.pace).rounded()))
        }
        let bounded = max(1, Int(minutes.rounded()))
        return ResolvedWorkout(
            type: workout.type,
            minutes: Double(bounded),
            label: "\(bounded) min \(workoutLabel(workout.type))"
        )
    }

    private static func currentWeekIndex(
        plan: TodaySavedPlan,
        now: Date,
        calendar: Calendar
    ) -> Int {
        guard
            let start = localDayDate(plan.planStart, calendar: calendar),
            !plan.weeks.isEmpty
        else { return 0 }
        let days = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: start),
            to: calendar.startOfDay(for: now)
        ).day ?? 0
        return max(0, min(plan.weeks.count - 1, Int(floor(Double(days) / 7))))
    }

    private static func localDayDate(_ value: String, calendar: Calendar) -> Date? {
        let parts = value.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
    }

    private static func trainingEasyPace(
        goal: TodayGoal,
        weekIndex: Int,
        totalWeeks: Int
    ) -> Double {
        let distanceMiles: [TodayRaceDistance: Double] = [
            .fiveK: 3.107, .tenK: 6.214, .half: 13.109, .marathon: 26.219
        ]
        let candidates = TodayRaceDistance.allCases.compactMap { distance -> Double? in
            guard
                let seconds = goal.currentPersonalRecords[distance.rawValue],
                seconds > 0,
                let from = distanceMiles[distance],
                let to = distanceMiles[.fiveK]
            else { return nil }
            return seconds * pow(to / from, 1.06)
        }
        let currentFiveK = candidates.min() ?? 1500
        let improvement: Double
        switch goal.experienceLevel {
        case .beginner: improvement = 0.045
        case .intermediate: improvement = 0.035
        case .advanced: improvement = 0.025
        }
        let progress = totalWeeks > 1
            ? min(1, max(0, Double(weekIndex) / Double(totalWeeks - 1)))
            : 0
        let seconds = currentFiveK + (currentFiveK * (1 - improvement) - currentFiveK) * progress
        return ((seconds / 60 / 3.107) + 1.75).rounded(toPlaces: 2)
    }

    private static func latestCompleteReadiness(_ log: ReadinessLog?) -> ReadinessEntry? {
        log?.entries.values
            .filter {
                guard
                    let hrv = $0.hrv,
                    let sleep = $0.sleepHours,
                    let heartRate = $0.restingHeartRate,
                    (1...300).contains(hrv),
                    (0...24).contains(sleep),
                    (20...220).contains(heartRate)
                else { return false }
                if let fatigue = $0.fatigueLevel, !(1...5).contains(fatigue) { return false }
                if let soreness = $0.sorenessLevel, !(1...5).contains(soreness) { return false }
                return true
            }
            .sorted { $0.updatedAt > $1.updatedAt }
            .first
    }

    private static func hrvBaseline(
        _ log: ReadinessLog?,
        current: ReadinessEntry
    ) -> (value: Double, source: MobileTodayBaselineSource) {
        let values = (log?.entries.values ?? Dictionary<String, ReadinessEntry>().values)
            .filter { $0.hrv.map { (1...300).contains($0) } == true }
            .sorted { $0.updatedAt > $1.updatedAt }
            .prefix(30)
            .compactMap(\.hrv)
        guard values.count >= 2 else {
            return (current.hrv!, .currentNeutral)
        }
        return ((values.reduce(0, +) / Double(values.count)).rounded(toPlaces: 2), .rollingHistory)
    }

    private static func hoursSince(_ date: Date, now: Date) -> Double {
        max(0, now.timeIntervalSince(date) / 3600).rounded(toPlaces: 2)
    }

    private static func readinessState(
        _ readiness: ReadinessEntry,
        age: Double
    ) -> MobileTodayReadinessContractState {
        if age > 36 { return .stale }
        if readiness.fatigueLevel == nil || readiness.sorenessLevel == nil { return .partial }
        return .complete
    }

    private static func resolveCalendar(
        _ input: MobileTodayCalendarInput?,
        fallbackMinutes: Int
    ) -> (
        minutes: Int,
        age: Double?,
        state: MobileTodayCalendarContractState,
        source: MobileTodayAvailabilitySource
    ) {
        let age = input?.ageHours.map { max(0, $0) }
        if let input,
           !input.unhealthy,
           let age,
           age <= 24,
           let available = input.availableMinutesToday,
           (0...240).contains(available) {
            return (
                available,
                age,
                available <= 30 ? .conflict : .clear,
                .calendar
            )
        }
        return (
            fallbackMinutes,
            age,
            input == nil ? .missing : .stale,
            .plannedWorkoutFallback
        )
    }

    private static func recentWorkouts(
        plan: TodaySavedPlan,
        log: [TodayWorkoutLogEntry]
    ) -> [String] {
        log.filter { $0.status == "completed" }
            .sorted { $0.scheduledDate > $1.scheduledDate }
            .prefix(5)
            .map { entry in
                let workout = plan.weeks
                    .first(where: { $0.weekNumber == entry.weekNumber })?
                    .workouts.first(where: { $0.day == entry.day })
                return workout.map { workoutLabel($0.type) } ?? "completed run"
            }
    }

    private static func adjustmentBias(_ log: [TodayWorkoutLogEntry]) -> Double {
        let responses = log
            .sorted { $0.loggedAt > $1.loggedAt }
            .compactMap(\.acceptedAdjustment)
            .prefix(14)
        guard responses.count >= 3 else { return 0 }
        let rejected = responses.filter { !$0 }.count
        return (Double(rejected) / Double(responses.count)).rounded(toPlaces: 3)
    }

    private static func workoutLabel(_ type: TodayWorkoutType) -> String {
        switch type {
        case .easy: "easy run"
        case .tempo: "tempo run"
        case .intervals: "interval run"
        case .longRun: "long run"
        case .race: "race effort"
        }
    }

    private static func boundedMinutes(_ value: Double) -> Int {
        min(240, max(0, Int(value.rounded())))
    }
}

private extension Double {
    func rounded(toPlaces places: Int) -> Double {
        let scale = pow(10, Double(places))
        return (self * scale).rounded() / scale
    }
}

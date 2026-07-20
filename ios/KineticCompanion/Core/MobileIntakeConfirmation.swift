import Foundation

enum MobileIntakePlanWorkoutType: String, Codable, Equatable {
    case easy
    case tempo
    case intervals
    case longRun = "long run"
    case race

    var priority: Int {
        switch self {
        case .race: 100
        case .longRun: 80
        case .tempo, .intervals: 60
        case .easy: 30
        }
    }

    var isHard: Bool {
        self != .easy
    }

    var minimumDuration: Double {
        switch self {
        case .race: .infinity
        case .longRun: 45
        case .tempo, .intervals: 25
        case .easy: 20
        }
    }
}

struct MobileIntakePlanWorkout: Codable, Equatable {
    var day: String
    var type: MobileIntakePlanWorkoutType
    var distance: Double
    var pace: Double
    var duration: Double
}

struct MobileIntakePlanWeek: Codable, Equatable {
    var weekNumber: Int
    var phase: String?
    var workouts: [MobileIntakePlanWorkout]
}

struct MobileIntakePlanSnapshot: Codable, Equatable {
    var weeks: [MobileIntakePlanWeek]
}

struct MobileIntakeEasyOnlyDay: Codable, Equatable {
    var weekIndex: Int
    var day: String
    var reason: String
}

struct MobileIntakePlanUpdate: Equatable {
    var weeks: [MobileIntakePlanWeek]
    var reasoning: [String]
    var easyOnlyDays: [MobileIntakeEasyOnlyDay]?
}

enum MobileIntakePlanDisposition: Equatable {
    case unchanged
    case updated(MobileIntakePlanUpdate)
    case deleteForRegeneration
}

struct MobileIntakeConfirmationResult: Equatable {
    var goalChanges: [MobileIntakeGoalChange]
    var scheduleChanges: [MobileIntakeScheduleChange]
    var preferenceChanges: [MobileIntakePreferenceChange]
    var planDisposition: MobileIntakePlanDisposition
    var appliedCount: Int
}

enum MobileIntakeConfirmationEngine {
    private static let dayOrder = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

    static func prepare(
        draft: MobileIntakeDraft,
        sourceText: String,
        today: String,
        currentGoalExists: Bool,
        currentPlan: MobileIntakePlanSnapshot?
    ) throws -> MobileIntakeConfirmationResult {
        try MobileIntakeValidator.validate(draft)
        guard MobileTodayDate.isLocalDay(today) else {
            throw MobileIntakeValidationError.invalid("Confirmation day is invalid.")
        }
        let source = sourceText.lowercased()
        let evidence = Dictionary(
            uniqueKeysWithValues: draft.grounding.map { ($0.changeID, $0.evidence) }
        )
        let identifiers = draft.goalChanges.map(\.id)
            + draft.scheduleChanges.map(\.id)
            + draft.availabilityChanges.map(\.id)
            + draft.preferenceChanges.map(\.id)
            + draft.workoutSwapChanges.map(\.id)
        for identifier in identifiers {
            guard let phrase = evidence[identifier]?
                .trimmingCharacters(in: .whitespacesAndNewlines),
                  !phrase.isEmpty,
                  source.contains(phrase.lowercased()) else {
                throw MobileIntakeValidationError.invalid(
                    "Every proposed change must remain grounded in the transient note."
                )
            }
        }
        for change in draft.goalChanges where change.field == .targetDate {
            guard case .text(let targetDate) = change.value, targetDate > today else {
                throw MobileIntakeValidationError.invalid(
                    "Target date must be a valid future ISO date."
                )
            }
        }
        if !currentGoalExists {
            let fields = Set(draft.goalChanges.map(\.field))
            if !draft.availabilityChanges.isEmpty {
                throw MobileIntakeValidationError.invalid(
                    "Set a race goal before applying availability."
                )
            }
            guard fields.contains(.raceDistance), fields.contains(.targetDate) else {
                throw MobileIntakeValidationError.invalid(
                    "A new goal needs both a race distance and target date."
                )
            }
        }
        if !draft.workoutSwapChanges.isEmpty,
           !draft.goalChanges.isEmpty
            || !draft.scheduleChanges.isEmpty
            || !draft.preferenceChanges.isEmpty {
            throw MobileIntakeValidationError.invalid(
                "Confirm plan-input changes before reviewing a workout swap."
            )
        }

        var disposition = MobileIntakePlanDisposition.unchanged
        var plan = currentPlan
        var reasoning: [String] = []
        var easyOnlyDays: [MobileIntakeEasyOnlyDay]?

        if !draft.goalChanges.isEmpty || !draft.preferenceChanges.isEmpty {
            disposition = .deleteForRegeneration
            if !draft.availabilityChanges.isEmpty {
                throw MobileIntakeValidationError.invalid(
                    "Confirm goal or experience changes before availability changes."
                )
            }
        } else {
            if !draft.scheduleChanges.isEmpty {
                guard var scheduledPlan = plan else {
                    throw MobileIntakeValidationError.invalid(
                        "A saved plan is required before applying preferred days."
                    )
                }
                for change in draft.scheduleChanges {
                    scheduledPlan.weeks = applyPreferredDays(
                        scheduledPlan.weeks,
                        preferred: change.value
                    )
                }
                plan = scheduledPlan
                reasoning.append("Confirmed preferred training days")
            }

            if !draft.workoutSwapChanges.isEmpty {
                guard let existing = plan else {
                    throw MobileIntakeValidationError.invalid(
                        "A saved plan is required before reviewing a workout swap."
                    )
                }
                plan = try applyWorkoutSwaps(existing, draft.workoutSwapChanges)
                reasoning.append(
                    contentsOf: draft.workoutSwapChanges.map {
                        "Confirmed workout swap: \($0.fromDay.planLabel) to \($0.toDay.planLabel)"
                    }
                )
            }

            if !draft.availabilityChanges.isEmpty {
                guard var availablePlan = plan, !availablePlan.weeks.isEmpty else {
                    throw MobileIntakeValidationError.invalid(
                        "The current plan has no week available to adjust."
                    )
                }
                let adjustment = adjust(
                    availablePlan.weeks[0],
                    changes: draft.availabilityChanges
                )
                availablePlan.weeks[0] = adjustment.week
                plan = availablePlan
                reasoning.append(contentsOf: adjustment.reasoning)
                easyOnlyDays = adjustment.easyOnlyDays
            }

            if let plan,
               !draft.scheduleChanges.isEmpty
                || !draft.workoutSwapChanges.isEmpty
                || !draft.availabilityChanges.isEmpty {
                disposition = .updated(
                    MobileIntakePlanUpdate(
                        weeks: plan.weeks,
                        reasoning: reasoning,
                        easyOnlyDays: easyOnlyDays
                    )
                )
            }
        }

        return MobileIntakeConfirmationResult(
            goalChanges: draft.goalChanges,
            scheduleChanges: draft.scheduleChanges,
            preferenceChanges: draft.preferenceChanges,
            planDisposition: disposition,
            appliedCount: draft.changeCount
        )
    }

    private static func applyWorkoutSwaps(
        _ plan: MobileIntakePlanSnapshot,
        _ changes: [MobileIntakeWorkoutSwapChange]
    ) throws -> MobileIntakePlanSnapshot {
        guard !plan.weeks.isEmpty else {
            throw MobileIntakeValidationError.invalid(
                "The current plan has no week available to swap."
            )
        }
        var next = plan
        let original = next.weeks[0].workouts
        let originalHardPairs = adjacentHardPairs(original)
        for change in changes {
            let from = change.fromDay.planLabel
            let to = change.toDay.planLabel
            guard let sourceIndex = next.weeks[0].workouts.firstIndex(
                where: { $0.day == from }
            ) else {
                throw MobileIntakeValidationError.invalid(
                    "There is no planned workout on \(from) to move."
                )
            }
            let targetIndex = next.weeks[0].workouts.firstIndex(where: { $0.day == to })
            if next.weeks[0].workouts[sourceIndex].type == .race
                || targetIndex.map({ next.weeks[0].workouts[$0].type == .race }) == true {
                throw MobileIntakeValidationError.invalid(
                    "Race-day workouts cannot be moved by intake."
                )
            }
            next.weeks[0].workouts[sourceIndex].day = to
            if let targetIndex {
                next.weeks[0].workouts[targetIndex].day = from
            }
        }
        let updated = next.weeks[0].workouts
        guard Set(updated.map(\.day)).count == updated.count else {
            throw MobileIntakeValidationError.invalid(
                "The workout swap would create duplicate plan days."
            )
        }
        guard adjacentHardPairs(updated) <= originalHardPairs else {
            throw MobileIntakeValidationError.invalid(
                "The workout swap would create unsafe hard-workout spacing."
            )
        }
        let beforeLoad = original.reduce(0) { $0 + $1.duration }
        let afterLoad = updated.reduce(0) { $0 + $1.duration }
        guard updated.count == original.count, beforeLoad == afterLoad else {
            throw MobileIntakeValidationError.invalid(
                "The workout swap changed weekly training load."
            )
        }
        next.weeks[0].workouts.sort {
            (dayOrder.firstIndex(of: $0.day) ?? 99)
                < (dayOrder.firstIndex(of: $1.day) ?? 99)
        }
        return next
    }

    private static func adjacentHardPairs(_ workouts: [MobileIntakePlanWorkout]) -> Int {
        let indices = workouts
            .filter { $0.type.isHard }
            .compactMap { dayOrder.firstIndex(of: $0.day) }
            .sorted()
        guard indices.count > 1 else { return 0 }
        return zip(indices, indices.dropFirst()).filter { $1 - $0 == 1 }.count
    }

    private static func applyPreferredDays(
        _ weeks: [MobileIntakePlanWeek],
        preferred: [MobileIntakeDay]
    ) -> [MobileIntakePlanWeek] {
        guard let first = weeks.first, !preferred.isEmpty else { return weeks }
        let template = first.workouts.map { dayOrder.firstIndex(of: $0.day) ?? 0 }
        let preferredRanks = preferred
            .compactMap { dayOrder.firstIndex(of: $0.planLabel) }
            .sorted()
        guard preferredRanks.count >= template.count else { return weeks }
        var remaining = Set(preferredRanks)
        var result = Array(repeating: 0, count: template.count)
        for item in template.enumerated().sorted(by: { $0.element > $1.element }) {
            guard let best = remaining.min(by: {
                let left = abs($0 - item.element)
                let right = abs($1 - item.element)
                return left == right ? $0 > $1 : left < right
            }) else { continue }
            result[item.offset] = best
            remaining.remove(best)
        }
        return weeks.map { week in
            var next = week
            next.workouts = week.workouts.enumerated().map { index, workout in
                var changed = workout
                changed.day = dayOrder[result[index]]
                return changed
            }
            return next
        }
    }

    private struct AvailabilityAdjustment {
        var week: MobileIntakePlanWeek
        var reasoning: [String]
        var easyOnlyDays: [MobileIntakeEasyOnlyDay]
    }

    private static func adjust(
        _ week: MobileIntakePlanWeek,
        changes: [MobileIntakeAvailabilityChange]
    ) -> AvailabilityAdjustment {
        var dayMap = Dictionary(uniqueKeysWithValues: week.workouts.map { ($0.day, $0) })
        let minutes = Dictionary(
            uniqueKeysWithValues: changes.compactMap { change in
                change.availableMinutes.map { (change.day.planLabel, $0) }
            }
        )
        let easyReasons = Dictionary(
            uniqueKeysWithValues: changes.filter(\.easyOnly).map {
                ($0.day.planLabel, "Confirmed natural-language intake constraint")
            }
        )
        var reasoning: [String] = []
        var easyOnlyDays: [MobileIntakeEasyOnlyDay] = easyReasons.map {
            MobileIntakeEasyOnlyDay(weekIndex: 0, day: $0.key, reason: $0.value)
        }

        for (day, reason) in easyReasons {
            guard var workout = dayMap[day], workout.type != .easy,
                  workout.type != .race else { continue }
            if workout.type == .longRun {
                dayMap.removeValue(forKey: day)
                reasoning.append("\(reason) — long run dropped")
            } else {
                workout.type = .easy
                workout.pace += 1.5
                workout.distance = roundedTenth(workout.duration / workout.pace)
                dayMap[day] = workout
                reasoning.append("\(reason) — hard workout downgraded to easy")
            }
        }

        let initial = dayMap.sorted { $0.value.type.priority > $1.value.type.priority }
        for (day, workout) in initial {
            guard dayMap[day] == workout, workout.duration > available(minutes, day) else {
                continue
            }
            guard let target = swapTarget(
                originalDay: day,
                workout: workout,
                dayMap: dayMap,
                minutes: minutes,
                easyOnly: Set(easyReasons.keys)
            ) else { continue }
            let occupant = dayMap[target]
            var moved = workout
            moved.day = target
            dayMap[target] = moved
            if var occupant {
                occupant.day = day
                dayMap[day] = occupant
            } else {
                dayMap.removeValue(forKey: day)
            }
            reasoning.append("Moved \(workout.type.rawValue) from \(day) to \(target)")
        }

        for (day, var workout) in dayMap {
            let limit = available(minutes, day)
            guard workout.duration > limit else { continue }
            if limit >= workout.type.minimumDuration,
               workout.type.minimumDuration.isFinite {
                let duration = Double(Int(limit.rounded()))
                workout.duration = duration
                workout.distance = roundedTenth(duration / workout.pace)
                dayMap[day] = workout
                reasoning.append("Reduced \(workout.type.rawValue) on \(day) to \(Int(duration)) min")
            } else if workout.type.priority <= MobileIntakePlanWorkoutType.easy.priority {
                dayMap.removeValue(forKey: day)
                reasoning.append("Dropped low-priority easy run on \(day)")
            } else {
                reasoning.append(
                    "\(workout.type.rawValue) on \(day) kept for manual rescheduling"
                )
            }
        }

        var next = week
        next.workouts = dayOrder.compactMap { dayMap[$0] }
        easyOnlyDays.sort {
            (dayOrder.firstIndex(of: $0.day) ?? 99)
                < (dayOrder.firstIndex(of: $1.day) ?? 99)
        }
        return AvailabilityAdjustment(
            week: next,
            reasoning: reasoning,
            easyOnlyDays: easyOnlyDays
        )
    }

    private static func available(_ minutes: [String: Int], _ day: String) -> Double {
        minutes[day].map(Double.init) ?? .infinity
    }

    private static func swapTarget(
        originalDay: String,
        workout: MobileIntakePlanWorkout,
        dayMap: [String: MobileIntakePlanWorkout],
        minutes: [String: Int],
        easyOnly: Set<String>
    ) -> String? {
        var best: String?
        var bestScore = Int.min
        for candidate in dayOrder where candidate != originalDay {
            guard workout.duration <= available(minutes, candidate),
                  !easyOnly.contains(candidate) || workout.type == .easy else { continue }
            let occupant = dayMap[candidate]
            if let occupant {
                guard occupant.type.priority < workout.type.priority,
                      occupant.duration <= available(minutes, originalDay),
                      !easyOnly.contains(originalDay) || occupant.type == .easy else {
                    continue
                }
            }
            let distance = abs(
                (dayOrder.firstIndex(of: originalDay) ?? 0)
                    - (dayOrder.firstIndex(of: candidate) ?? 0)
            )
            let score = (occupant == nil ? 100 : 0) - distance
            if score > bestScore {
                bestScore = score
                best = candidate
            }
        }
        return best
    }

    private static func roundedTenth(_ value: Double) -> Double {
        (value * 10).rounded() / 10
    }
}

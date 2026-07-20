import Foundation

enum MobileIntakeContextBuilder {
    static func build(
        shared: MobileTodaySharedState,
        snapshot: MobileTodayDecisionSnapshot?,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> MobileIntakeContext {
        MobileIntakeContext(
            today: MobileTodayDate.localDay(now, calendar: calendar),
            currentGoal: shared.goal.map {
                MobileIntakeGoalContext(
                    raceDistance: MobileIntakeRaceDistance(rawValue: $0.raceDistance.rawValue),
                    targetDate: $0.targetDate,
                    weeklyMileage: $0.weeklyMileage
                )
            },
            currentProfile: shared.intakeProfile.map {
                MobileIntakeProfileContext(
                    experienceLevel: $0.experienceLevel,
                    preferredTrainingDays: Array($0.preferredTrainingDays.prefix(7))
                )
            },
            decision: snapshot.map(decisionContext)
        )
    }

    private static func decisionContext(
        _ snapshot: MobileTodayDecisionSnapshot
    ) -> MobileIntakeDecisionContext {
        let readiness: MobileIntakeReadinessState = switch snapshot.context.readinessState {
        case .complete: .ready
        case .partial: .caution
        case .stale: .stale
        case .missing: .unknown
        }
        let calendar: MobileIntakeCalendarState = switch snapshot.context.calendarState {
        case .clear: .clear
        case .conflict: .conflict
        case .stale: .stale
        case .missing: .missing
        }
        let confidence: MobileIntakeConfidenceBucket
        if snapshot.decision.confidence >= 0.75 {
            confidence = .high
        } else if snapshot.decision.confidence >= 0.5 {
            confidence = .moderate
        } else {
            confidence = .low
        }
        return MobileIntakeDecisionContext(
            selectedAction: MobileIntakeSelectedAction(
                rawValue: snapshot.decision.selectedAction.name.rawValue
            ) ?? .unknown,
            readinessState: readiness,
            calendarState: calendar,
            confidenceBucket: confidence,
            stalenessWarningCount: min(
                MobileIntakeContract.maximumStalenessWarnings,
                snapshot.decision.stalenessWarnings.count
            )
        )
    }
}

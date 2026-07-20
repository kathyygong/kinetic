import XCTest
@testable import KineticCompanion

final class MobileIntakeConfirmationTests: XCTestCase {
    func testUngroundedDraftIsRejectedAtConfirmation() {
        let draft = availabilityDraft(evidence: "30 minutes")
        XCTAssertThrowsError(
            try MobileIntakeConfirmationEngine.prepare(
                draft: draft,
                sourceText: "Tuesday is open.",
                today: "2026-07-20",
                currentGoalExists: true,
                currentPlan: plan()
            )
        )
    }

    func testAvailabilityAndPreferredDaysUseDeterministicExistingPlan() throws {
        var draft = availabilityDraft(evidence: "30 minutes")
        draft.scheduleChanges = [
            MobileIntakeScheduleChange(
                id: "days",
                field: .preferredTrainingDays,
                value: [.mon, .thu, .sat]
            )
        ]
        draft.grounding.append(
            MobileIntakeGrounding(changeID: "days", evidence: "Monday Thursday Saturday")
        )
        let result = try MobileIntakeConfirmationEngine.prepare(
            draft: draft,
            sourceText: "I prefer Monday Thursday Saturday and Tuesday has 30 minutes.",
            today: "2026-07-20",
            currentGoalExists: true,
            currentPlan: plan()
        )
        guard case .updated(let update) = result.planDisposition else {
            return XCTFail("Expected a deterministic plan update")
        }
        XCTAssertEqual(result.appliedCount, 2)
        XCTAssertEqual(Set(update.weeks[0].workouts.map(\.day)).count, 3)
        XCTAssertTrue(update.weeks[0].workouts.allSatisfy { $0.duration > 0 })
    }

    func testWorkoutSwapPreservesLoadAndRejectsRaceDay() throws {
        let draft = swapDraft(from: .tue, to: .thu)
        let result = try MobileIntakeConfirmationEngine.prepare(
            draft: draft,
            sourceText: "Move Tuesday workout to Thursday.",
            today: "2026-07-20",
            currentGoalExists: true,
            currentPlan: plan()
        )
        guard case .updated(let update) = result.planDisposition else {
            return XCTFail("Expected swap plan update")
        }
        XCTAssertEqual(update.weeks[0].workouts.map(\.duration).reduce(0, +), 150)
        XCTAssertEqual(Set(update.weeks[0].workouts.map(\.day)).count, 3)

        var racePlan = plan()
        racePlan.weeks[0].workouts[0].type = .race
        XCTAssertThrowsError(
            try MobileIntakeConfirmationEngine.prepare(
                draft: draft,
                sourceText: "Move Tuesday workout to Thursday.",
                today: "2026-07-20",
                currentGoalExists: true,
                currentPlan: racePlan
            )
        )
    }

    func testGoalChangeInvalidatesPlanForSafeRegeneration() throws {
        let draft = MobileIntakeDraft(
            status: .ready,
            summary: "Update weekly mileage.",
            goalChanges: [
                MobileIntakeGoalChange(
                    id: "mileage",
                    field: .weeklyMileage,
                    value: .number(30)
                )
            ],
            scheduleChanges: [],
            availabilityChanges: [],
            preferenceChanges: [],
            workoutSwapChanges: [],
            grounding: [
                MobileIntakeGrounding(changeID: "mileage", evidence: "30 miles")
            ],
            warnings: []
        )
        let result = try MobileIntakeConfirmationEngine.prepare(
            draft: draft,
            sourceText: "I can train 30 miles per week.",
            today: "2026-07-20",
            currentGoalExists: true,
            currentPlan: plan()
        )
        XCTAssertEqual(result.planDisposition, .deleteForRegeneration)
        XCTAssertEqual(result.appliedCount, 1)
    }

    private func availabilityDraft(evidence: String) -> MobileIntakeDraft {
        MobileIntakeDraft(
            status: .ready,
            summary: "Update availability.",
            goalChanges: [],
            scheduleChanges: [],
            availabilityChanges: [
                MobileIntakeAvailabilityChange(
                    id: "availability",
                    day: .tue,
                    availableMinutes: 30,
                    easyOnly: false
                )
            ],
            preferenceChanges: [],
            workoutSwapChanges: [],
            grounding: [
                MobileIntakeGrounding(changeID: "availability", evidence: evidence)
            ],
            warnings: []
        )
    }

    private func swapDraft(
        from: MobileIntakeDay,
        to: MobileIntakeDay
    ) -> MobileIntakeDraft {
        MobileIntakeDraft(
            status: .ready,
            summary: "Move one workout.",
            goalChanges: [],
            scheduleChanges: [],
            availabilityChanges: [],
            preferenceChanges: [],
            workoutSwapChanges: [
                MobileIntakeWorkoutSwapChange(
                    id: "swap",
                    fromDay: from,
                    toDay: to
                )
            ],
            grounding: [
                MobileIntakeGrounding(
                    changeID: "swap",
                    evidence: "Tuesday workout to Thursday"
                )
            ],
            warnings: []
        )
    }

    private func plan() -> MobileIntakePlanSnapshot {
        MobileIntakePlanSnapshot(
            weeks: [
                MobileIntakePlanWeek(
                    weekNumber: 1,
                    phase: "build",
                    workouts: [
                        MobileIntakePlanWorkout(
                            day: "Tue",
                            type: .tempo,
                            distance: 5,
                            pace: 9,
                            duration: 45
                        ),
                        MobileIntakePlanWorkout(
                            day: "Thu",
                            type: .easy,
                            distance: 4,
                            pace: 10,
                            duration: 40
                        ),
                        MobileIntakePlanWorkout(
                            day: "Sat",
                            type: .longRun,
                            distance: 7,
                            pace: 9.5,
                            duration: 65
                        )
                    ]
                )
            ]
        )
    }
}

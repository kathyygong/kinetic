import SwiftUI

struct MobileIntakeView: View {
    @ObservedObject var viewModel: TodayViewModel
    @Environment(\.dismiss) private var dismiss
    @State private var note = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    entry
                    if viewModel.intakeLoading {
                        ProgressView("Routing safely")
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    if let failure = viewModel.intakeFailure {
                        failureCard(failure)
                    }
                    if let message = viewModel.intakeMessage {
                        Label(message, systemImage: "checkmark.shield")
                            .font(.subheadline)
                            .padding(16)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .kineticCard()
                    }
                    if let response = viewModel.intakeResponse {
                        destination(response)
                    }
                }
                .padding()
            }
            .background(KineticColor.canvas.ignoresSafeArea())
            .navigationTitle("What changed?")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    private var entry: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Keep it concrete and under 280 characters.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            TextEditor(text: $note)
                .frame(minHeight: 100)
                .padding(8)
                .background(.white)
                .clipShape(RoundedRectangle(cornerRadius: 14))
                .onChange(of: note) { _, value in
                    if value.count > MobileIntakeContract.maximumNoteLength {
                        note = String(value.prefix(MobileIntakeContract.maximumNoteLength))
                    }
                }
            HStack {
                Text("\(note.count)/\(MobileIntakeContract.maximumNoteLength)")
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Route note") {
                    Task { await viewModel.routeIntake(note: note) }
                }
                .buttonStyle(.borderedProminent)
                .disabled(
                    note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || viewModel.intakeLoading
                        || viewModel.intakeApplying
                )
            }
            Label("The note is transient and never enters audit or Firestore.", systemImage: "lock")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .kineticCard()
    }

    @ViewBuilder
    private func destination(_ response: MobileIntakeResponse) -> some View {
        switch response.outcome {
        case .reviewDraft(let outcome):
            reviewDraft(outcome)
        case .perceivedRecovery(let outcome):
            checkinRouteCard(
                title: "Perceived recovery capture",
                icon: "heart.text.square",
                detail: "Kinetic inferred no recovery value. Capture these explicitly:",
                items: outcome.fieldsToCapture.map(label),
                launch: .recovery
            )
        case .caution(let outcome):
            routeCard(
                title: "Conservative caution",
                icon: "cross.case",
                detail: "Kinetic did not diagnose, infer severity, or clear training.",
                items: outcome.actions.map(label),
                showsDeferredPersistence: true
            )
        case .missedWorkout(let outcome):
            checkinRouteCard(
                title: "Missed-workout choices",
                icon: "calendar.badge.exclamationmark",
                detail: "Completion was not inferred. Choose a bounded skipped outcome explicitly:",
                items: outcome.choices.map(label),
                launch: .workout(defaultStatus: .skipped)
            )
        case .reflection(let outcome):
            checkinRouteCard(
                title: "Post-workout capture",
                icon: "figure.run.circle",
                detail: "Completion and effort were not inferred. Capture them explicitly:",
                items: outcome.fieldsToCapture.map(label),
                launch: .workout(defaultStatus: .completed)
            )
        case .explanation(let outcome):
            explanation(outcome)
        case .clarification(let outcome):
            clarification(outcome)
        case .refusal(let outcome):
            routeCard(
                title: outcome.reason == .unsafe ? "Kinetic cannot do that safely" : "Outside bounded intake",
                icon: "hand.raised",
                detail: outcome.reason == .unsafe
                    ? "Kinetic cannot diagnose, prescribe, or provide training clearance."
                    : "Try a schedule, recovery, discomfort, missed-workout, reflection, or Today explanation note.",
                items: [
                    outcome.safeNextAction == .seekQualifiedCare
                        ? "Seek qualified care when appropriate"
                        : "Use one supported intake route"
                ]
            )
        }
    }

    private func reviewDraft(_ outcome: MobileIntakeReviewDraftOutcome) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Reviewable draft", systemImage: "checklist")
                .font(.headline)
            Text(outcome.draft.summary)
                .font(.subheadline)
            ForEach(descriptions(outcome.draft), id: \.self) { description in
                Label(description, systemImage: "circle.fill")
                    .font(.footnote)
            }
            ForEach(outcome.draft.warnings, id: \.self) { warning in
                Label(warning, systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(KineticColor.amber)
            }
            Text(
                "Confirmation re-reads the owner-scoped domains and reruns deterministic grounding, plan, race-day, load, and spacing validation."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            HStack {
                Button("Confirm changes") {
                    Task { await viewModel.confirmIntakeDraft() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.intakeApplying)
                Button("Discard", role: .destructive) {
                    viewModel.discardIntake()
                }
                .buttonStyle(.bordered)
            }
            if viewModel.intakeApplying {
                ProgressView("Validating and applying")
            }
        }
        .padding(18)
        .kineticCard()
    }

    private func explanation(_ outcome: MobileIntakeExplanationOutcome) -> some View {
        let facts = outcome.facts
        return routeCard(
            title: "Deterministic Today explanation",
            icon: "list.bullet.clipboard",
            detail: "Today selected \(label(facts.selectedAction.rawValue)) with \(label(facts.confidenceBucket.rawValue)) confidence.",
            items: [
                "Readiness: \(label(facts.readinessState.rawValue))",
                "Calendar: \(label(facts.calendarState.rawValue))",
                facts.hasStalenessWarning ? "A staleness warning is present" : "No staleness warning"
            ]
        )
    }

    private func clarification(_ outcome: MobileIntakeClarificationOutcome) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("What kind of change?", systemImage: "questionmark.bubble")
                .font(.headline)
            Text("Choose a bounded direction, then make the note concrete.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            ForEach(outcome.choices, id: \.rawValue) { choice in
                Button(label(choice.rawValue)) {
                    note = prompt(for: choice)
                    viewModel.resetIntake()
                }
                .buttonStyle(.bordered)
            }
        }
        .padding(18)
        .kineticCard()
    }

    private func routeCard(
        title: String,
        icon: String,
        detail: String,
        items: [String],
        showsDeferredPersistence: Bool = false
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: icon)
                .font(.headline)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            ForEach(items, id: \.self) {
                Label($0, systemImage: "chevron.right")
                    .font(.footnote)
            }
            if showsDeferredPersistence {
                Text("This caution route remains non-persisting and never records pain severity or medical data.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .kineticCard()
    }

    private func checkinRouteCard(
        title: String,
        icon: String,
        detail: String,
        items: [String],
        launch: MobileCheckinLaunch
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(title, systemImage: icon)
                .font(.headline)
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
            ForEach(items, id: \.self) {
                Label($0, systemImage: "chevron.right")
                    .font(.footnote)
            }
            NavigationLink {
                MobileCheckinView(viewModel: viewModel, launch: launch)
            } label: {
                Label("Open explicit check-in", systemImage: "checkmark.circle")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(18)
        .kineticCard()
    }

    private func failureCard(_ failure: MobileIntakeFailureCode) -> some View {
        routeCard(
            title: failureTitle(failure),
            icon: "exclamationmark.triangle",
            detail: "No draft was confirmed or applied.",
            items: [failureDetail(failure)]
        )
    }

    private func descriptions(_ draft: MobileIntakeDraft) -> [String] {
        draft.goalChanges.map { "\($0.field.rawValue): \($0.value.displayValue)" }
            + draft.scheduleChanges.map {
                "Preferred days: \($0.value.map(\.title).joined(separator: ", "))"
            }
            + draft.availabilityChanges.map {
                "\($0.day.title): \($0.availableMinutes.map { "\($0) minutes" } ?? "easy only")"
            }
            + draft.preferenceChanges.map { "Experience: \($0.value.rawValue)" }
            + draft.workoutSwapChanges.map {
                "Move \($0.fromDay.title) to \($0.toDay.title)"
            }
    }

    private func prompt(for choice: MobileIntakeClarificationChoice) -> String {
        switch choice {
        case .schedule: "I cannot run on "
        case .recovery: "I slept badly and feel "
        case .painOrInjury: "I have discomfort during "
        case .missedWorkout: "I missed my workout on "
        case .postWorkout: "I completed my run and it felt "
        case .explanation: "Why did Kinetic change today's workout?"
        }
    }

    private func failureTitle(_ failure: MobileIntakeFailureCode) -> String {
        switch failure {
        case .authRequired: "Sign-in required"
        case .offline: "Intake is offline"
        case .timeout: "Intake timed out"
        case .backendUnavailable: "Intake service unavailable"
        case .invalidResponse: "Response rejected"
        case .unknown: "Intake unavailable"
        }
    }

    private func failureDetail(_ failure: MobileIntakeFailureCode) -> String {
        switch failure {
        case .authRequired: "Sign in again before routing a protected note."
        case .offline: "Reconnect before trying again; drafts are never cached."
        case .timeout: "The finite deadline elapsed safely."
        case .backendUnavailable: "Retry after the bounded parser service recovers."
        case .invalidResponse: "Kinetic rejected malformed or non-contract data."
        case .unknown: "Retry when the connection is stable."
        }
    }

    private func label<T: RawRepresentable>(_ value: T) -> String where T.RawValue == String {
        label(value.rawValue)
    }

    private func label(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

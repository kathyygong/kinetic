import SwiftUI

enum MobileCheckinLaunch: Equatable {
    case recovery
    case workout(defaultStatus: MobileCheckinWorkoutStatus)
}

struct MobileCheckinView: View {
    @ObservedObject var viewModel: TodayViewModel
    let launch: MobileCheckinLaunch
    @Environment(\.dismiss) private var dismiss

    @State private var perceivedRecovery = 3
    @State private var fatigueLevel = 3
    @State private var sorenessLevel = 3
    @State private var includesSleepCorrection = false
    @State private var sleepHoursCorrection = 7.5
    @State private var workoutStatus: MobileCheckinWorkoutStatus
    @State private var perceivedEffort = 5
    @State private var reflection: MobileCheckinReflection?
    @State private var skipReason = MobileCheckinSkipReason.schedule
    @State private var adjustmentResponse = MobileCheckinAdjustmentResponse.accepted
    @State private var reviewing = false

    init(viewModel: TodayViewModel, launch: MobileCheckinLaunch) {
        self.viewModel = viewModel
        self.launch = launch
        if case .workout(let status) = launch {
            _workoutStatus = State(initialValue: status)
        } else {
            _workoutStatus = State(initialValue: .completed)
        }
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    privacyCard
                    if reviewing {
                        reviewCard
                    } else {
                        switch launch {
                        case .recovery:
                            recoveryControls
                        case .workout:
                            workoutControls
                        }
                    }
                    if let message = viewModel.checkinMessage {
                        statusCard(message)
                    }
                }
                .padding()
            }
            .background(KineticColor.canvas.ignoresSafeArea())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .onAppear { viewModel.resetCheckin() }
        .onChange(of: workoutStatus) { _, _ in reviewing = false }
    }

    private var title: String {
        switch launch {
        case .recovery: "Recovery check-in"
        case .workout: "Workout outcome"
        }
    }

    private var privacyCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Explicit values only", systemImage: "checkmark.shield")
                .font(.headline)
            Text(
                "Kinetic does not infer these values from your note. Review is required before the owner-scoped write."
            )
            .font(.footnote)
            .foregroundStyle(.secondary)
            Label("No raw note or HealthKit sample is stored.", systemImage: "lock")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .kineticCard()
    }

    private var recoveryControls: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("How do you feel today?", systemImage: "heart.text.square")
                .font(.headline)
            boundedStepper(
                title: "Perceived recovery",
                value: $perceivedRecovery,
                low: "Very poor",
                high: "Excellent"
            )
            Divider()
            boundedStepper(
                title: "Fatigue",
                value: $fatigueLevel,
                low: "Fresh",
                high: "Wiped"
            )
            Divider()
            boundedStepper(
                title: "Soreness",
                value: $sorenessLevel,
                low: "None",
                high: "Very sore"
            )
            Divider()
            Toggle("Correct today’s sleep total", isOn: $includesSleepCorrection)
            if includesSleepCorrection {
                Stepper(
                    "\(sleepHoursCorrection.formatted(.number.precision(.fractionLength(1)))) hours",
                    value: $sleepHoursCorrection,
                    in: 0...24,
                    step: 0.25
                )
            }
            Button("Review recovery check-in") {
                viewModel.resetCheckin()
                reviewing = true
            }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .padding(18)
        .kineticCard()
    }

    private var workoutControls: some View {
        VStack(alignment: .leading, spacing: 16) {
            Label("What happened?", systemImage: "figure.run.circle")
                .font(.headline)
            Picker("Outcome", selection: $workoutStatus) {
                Text("Completed").tag(MobileCheckinWorkoutStatus.completed)
                Text("Skipped").tag(MobileCheckinWorkoutStatus.skipped)
            }
            .pickerStyle(.segmented)

            if workoutStatus == .completed {
                Stepper("Perceived effort: \(perceivedEffort)/10", value: $perceivedEffort, in: 1...10)
                Picker("Reflection", selection: $reflection) {
                    Text("No reflection").tag(nil as MobileCheckinReflection?)
                    ForEach(MobileCheckinReflection.allCases, id: \.rawValue) { value in
                        Text(label(value.rawValue)).tag(value as MobileCheckinReflection?)
                    }
                }
            } else {
                Picker("Reason", selection: $skipReason) {
                    ForEach(MobileCheckinSkipReason.allCases, id: \.rawValue) { value in
                        Text(label(value.rawValue)).tag(value)
                    }
                }
            }

            if viewModel.workoutCheckinAction == .modify {
                Picker("Adjustment response", selection: $adjustmentResponse) {
                    Text("Accepted safer adjustment").tag(MobileCheckinAdjustmentResponse.accepted)
                    Text("Kept original workout").tag(MobileCheckinAdjustmentResponse.rejected)
                }
                .pickerStyle(.inline)
            } else if let action = viewModel.workoutCheckinAction {
                LabeledContent("Today action", value: label(action.rawValue))
            }

            Button("Review workout outcome") {
                viewModel.resetCheckin()
                reviewing = true
            }
            .buttonStyle(.borderedProminent)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .disabled(!viewModel.workoutCheckinAvailable)
        }
        .padding(18)
        .kineticCard()
    }

    private var reviewCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Review before saving", systemImage: "checklist")
                .font(.headline)
            switch launch {
            case .recovery:
                reviewLine("Perceived recovery", "\(perceivedRecovery)/5")
                reviewLine("Fatigue", "\(fatigueLevel)/5")
                reviewLine("Soreness", "\(sorenessLevel)/5")
                reviewLine(
                    "Sleep correction",
                    includesSleepCorrection
                        ? "\(sleepHoursCorrection.formatted(.number.precision(.fractionLength(1)))) hours"
                        : "None — preserve existing sleep"
                )
                Text("Existing HRV and resting heart rate are preserved.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            case .workout:
                reviewLine("Outcome", label(workoutStatus.rawValue))
                if workoutStatus == .completed {
                    reviewLine("Effort", "\(perceivedEffort)/10")
                    reviewLine("Reflection", reflection.map { label($0.rawValue) } ?? "None")
                } else {
                    reviewLine("Skip reason", label(skipReason.rawValue))
                }
                if let action = viewModel.workoutCheckinAction {
                    reviewLine("Displayed Today action", label(action.rawValue))
                    if action == .modify {
                        reviewLine("Adjustment", label(adjustmentResponse.rawValue))
                    } else if action == .rest {
                        reviewLine(
                            "Rest response",
                            workoutStatus == .completed ? "Rejected" : "Accepted"
                        )
                    }
                }
                Text("Workouts and recommendations commit together or neither changes.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            HStack {
                Button("Edit") { reviewing = false }
                    .buttonStyle(.bordered)
                Button(viewModel.checkinSaving ? "Saving…" : "Save check-in") {
                    Task { await save() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(viewModel.checkinSaving || viewModel.checkinFailure == .authRequired)
            }
            if viewModel.checkinSaving {
                ProgressView("Re-reading current state and validating")
            }
        }
        .padding(18)
        .kineticCard()
    }

    private func statusCard(_ message: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(
                viewModel.checkinFailure == nil ? "Saved" : failureTitle,
                systemImage: viewModel.checkinFailure == nil
                    ? "checkmark.circle.fill"
                    : "exclamationmark.triangle"
            )
            .font(.headline)
            .foregroundStyle(viewModel.checkinFailure == nil ? KineticColor.emerald : KineticColor.rose)
            Text(message)
                .font(.subheadline)
            if viewModel.checkinFailure != nil {
                Text("No partial domain update is treated as success. Refresh Today and retry safely.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .kineticCard()
    }

    private var failureTitle: String {
        switch viewModel.checkinFailure {
        case .authRequired: "Sign-in required"
        case .offline: "You’re offline"
        case .timeout: "Save timed out"
        case .invalidPayload: "Values rejected"
        case .stateConflict: "Today changed"
        case .permissionDenied: "Write denied"
        case .some(.unknown), .some(.none), nil: "Check-in not saved"
        }
    }

    private func boundedStepper(
        title: String,
        value: Binding<Int>,
        low: String,
        high: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Stepper("\(title): \(value.wrappedValue)/5", value: value, in: 1...5)
            Text("1 \(low.lowercased()) · 5 \(high.lowercased())")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func reviewLine(_ title: String, _ value: String) -> some View {
        LabeledContent(title, value: value)
    }

    private func save() async {
        switch launch {
        case .recovery:
            await viewModel.saveRecoveryCheckin(
                perceivedRecovery: perceivedRecovery,
                fatigueLevel: fatigueLevel,
                sorenessLevel: sorenessLevel,
                sleepHoursCorrection: includesSleepCorrection ? sleepHoursCorrection : nil
            )
        case .workout:
            await viewModel.saveWorkoutCheckin(
                status: workoutStatus,
                perceivedEffort: workoutStatus == .completed ? perceivedEffort : nil,
                reflection: workoutStatus == .completed ? reflection : nil,
                skipReason: workoutStatus == .skipped ? skipReason : nil,
                adjustmentResponse: viewModel.workoutCheckinAction == .modify
                    ? adjustmentResponse
                    : nil
            )
        }
    }

    private func label(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

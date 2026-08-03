import SwiftUI

struct MobilePlanView: View {
    @ObservedObject var viewModel: MobilePlanViewModel

    var body: some View {
        NavigationStack {
            Group {
                if let plan = viewModel.plan { planList(plan) }
                else { emptyState }
            }
            .navigationTitle("Plan")
            .toolbar { if viewModel.isWorking { ProgressView().accessibilityLabel("Validating plan") } }
            .task { await viewModel.restore() }
            .sheet(item: Binding(get: { viewModel.preview.map(IdentifiedPreview.init) }, set: { if $0 == nil { viewModel.discardPreview() } })) { identified in
                MobilePlanPreviewView(preview: identified.value, isWorking: viewModel.isWorking, message: viewModel.message, confirm: { Task { await viewModel.commitPreview() } }, discard: viewModel.discardPreview)
            }
        }
    }

    private var emptyState: some View {
        ContentUnavailableView {
            Label("Build your plan", systemImage: "calendar.badge.plus")
        } description: {
            Text(viewModel.legacyPlanPresent ? "Your earlier plan stays untouched until the validator approves and you confirm a native replacement." : "Kinetic will build a deterministic proposal from your saved goal, then ask the backend authority to validate it.")
        } actions: {
            Button("Generate preview") { Task { await viewModel.previewGeneration() } }.buttonStyle(.borderedProminent).disabled(viewModel.isWorking)
            if let message = viewModel.message { Text(message).font(.footnote).foregroundStyle(.secondary) }
        }
    }

    private func planList(_ plan: MobilePlanSnapshot) -> some View {
        List {
            Section {
                LabeledContent("Status", value: plan.status.rawValue.capitalized)
                LabeledContent("Version", value: String(plan.version))
                LabeledContent("Workouts", value: String(plan.workouts.count))
                if plan.status == .draft { Button("Review activation") { Task { await viewModel.previewChange(action: .save) } }.buttonStyle(.borderedProminent) }
                if plan.status == .active { Button("Review pause") { Task { await viewModel.previewChange(action: .pause) } } }
                if plan.status == .paused { Button("Review resume") { Task { await viewModel.previewChange(action: .resume) } }.buttonStyle(.borderedProminent) }
                Button("Regenerate future workouts") { Task { await viewModel.previewChange(action: .regenerateFuture) } }.disabled(plan.status == .completed)
            } header: { Text("Plan control") } footer: { Text("Every button creates a review-only proposal. Only a separately confirmed commit-ready package is written.") }

            if let message = viewModel.message { Section { Label(message, systemImage: "info.circle") } }

            ForEach(Array(weekGroups(plan).enumerated()), id: \.element.id) { index, week in
                Section("Week \(index + 1) · \(phaseLabel(index: index, weeks: weekGroups(plan), plan: plan))") {
                    ForEach(week.workouts) { workout in workoutRow(workout) }
                }
            }
        }
        .refreshable { await viewModel.restore() }
    }

    private func workoutRow(_ workout: MobilePlanWorkout) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(workoutTitle(workout.type)).font(.headline)
                Spacer()
                Text(workout.status.rawValue.capitalized).font(.caption).foregroundStyle(workout.status == .completed ? KineticColor.blue : .secondary)
            }
            Text("\(displayDate(workout.date)) · \(distance(workout.distanceMiles)) mi · \(workout.durationMinutes) min").font(.subheadline).foregroundStyle(.secondary)
            HStack(spacing: 8) {
                if let pace = workout.paceSecondsPerMile { Text("\(pace / 60):\(String(format: "%02d", pace % 60))/mi") }
                Text(workout.reasonCode.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
            }.font(.caption).foregroundStyle(.secondary)
            if workout.status == .scheduled && workout.type != .race {
                Menu("Review a change") {
                    Button("Move one day later") { previewMove(workout, days: 1, action: .move) }
                    Button("Shorten by 25%") { Task { await viewModel.previewChange(action: .shorten, target: workout, duration: max(0, Int(Double(workout.durationMinutes) * 0.75))) } }
                    Button("Replace workout type") { Task { await viewModel.previewChange(action: .replace, target: workout, replacement: replacement(for: workout.type)) } }
                    Button("Mark day unavailable") { previewMove(workout, days: 1, action: .availability) }
                    Button("Confirm preferred day") { previewMove(workout, days: 2, action: .preferredDay) }
                    Button("Skip workout", role: .destructive) { Task { await viewModel.previewChange(action: .skip, target: workout) } }
                }
                .font(.subheadline)
                .accessibilityHint("Opens bounded plan changes for this workout")
            }
        }
        .padding(.vertical, 4)
    }

    private func previewMove(_ workout: MobilePlanWorkout, days: Int, action: MobilePlanAction) {
        guard let next = shifted(workout.date, days: days) else { return }
        Task { await viewModel.previewChange(action: action, target: workout, date: next) }
    }
    private func replacement(for type: MobilePlanWorkoutType) -> MobilePlanWorkoutType {
        switch type { case .easy: .tempo; case .tempo: .intervals; case .intervals, .longRun: .easy; case .race: .easy }
    }
    private func workoutTitle(_ type: MobilePlanWorkoutType) -> String { type.rawValue.replacingOccurrences(of: "_", with: " ").capitalized }
    private func distance(_ value: Double) -> String { value.rounded() == value ? String(Int(value)) : String(format: "%.1f", value) }
    private func displayDate(_ value: String) -> String { guard let date = isoFormatter.date(from: value) else { return value }; return date.formatted(date: .abbreviated, time: .omitted) }
    private func shifted(_ value: String, days: Int) -> String? { guard let date = isoFormatter.date(from: value), let next = Calendar(identifier: .gregorian).date(byAdding: .day, value: days, to: date) else { return nil }; return isoFormatter.string(from: next) }
    private var isoFormatter: DateFormatter { let value = DateFormatter(); value.calendar = Calendar(identifier: .gregorian); value.locale = Locale(identifier: "en_US_POSIX"); value.timeZone = TimeZone(secondsFromGMT: 0); value.dateFormat = "yyyy-MM-dd"; return value }

    private func weekGroups(_ plan: MobilePlanSnapshot) -> [MobilePlanWeekGroup] {
        let calendar = Calendar(identifier: .gregorian)
        let grouped = Dictionary(grouping: plan.workouts) { workout -> String in
            guard let date = isoFormatter.date(from: workout.date) else { return workout.date }
            let weekday = calendar.component(.weekday, from: date), offset = (weekday + 5) % 7
            return isoFormatter.string(from: calendar.date(byAdding: .day, value: -offset, to: date) ?? date)
        }
        return grouped.keys.sorted().map { .init(id: $0, workouts: grouped[$0]!.sorted { $0.date < $1.date }) }
    }

    private func phaseLabel(index: Int, weeks: [MobilePlanWeekGroup], plan: MobilePlanSnapshot) -> String {
        if weeks[index].workouts.contains(where: { $0.type == .race }) { return "Race" }
        let raceMiles = plan.workouts.first(where: { $0.type == .race })?.distanceMiles ?? 0
        let taperLength = raceMiles >= 20 ? 3 : raceMiles >= 10 ? 2 : 1
        if index >= max(0, weeks.count - 1 - taperLength) { return "Taper" }
        if weeks.count >= 6 && index > 0 && (index + 1).isMultiple(of: 4) { return "Recovery" }
        return "Build"
    }
}

private struct MobilePlanWeekGroup: Identifiable {
    var id: String
    var workouts: [MobilePlanWorkout]
}

private struct IdentifiedPreview: Identifiable {
    var value: MobilePlanPendingPreview
    var id: String { value.operationID }
}

struct MobilePlanPreviewView: View {
    var preview: MobilePlanPendingPreview
    var isWorking: Bool
    var message: String?
    var confirm: () -> Void
    var discard: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                Section("Impact") {
                    LabeledContent("Action", value: preview.action.rawValue.replacingOccurrences(of: "_", with: " ").capitalized)
                    LabeledContent("Affected workouts", value: String(preview.response.impact.affectedWorkoutIDs.count))
                    LabeledContent("Completed preserved", value: String(preview.response.impact.completedWorkoutsPreserved))
                    LabeledContent("New version", value: String(preview.proposedPlan.version))
                }
                if !preview.response.impact.warnings.isEmpty {
                    Section("Review warnings") { ForEach(preview.response.impact.warnings, id: \.rawValue) { Label($0.rawValue.replacingOccurrences(of: "_", with: " ").capitalized, systemImage: "exclamationmark.triangle") } }
                }
                if let message { Section { Label(message, systemImage: "info.circle") } }
                Section("Proposed schedule") {
                    ForEach(preview.proposedPlan.workouts.sorted { $0.date < $1.date }) { workout in
                        VStack(alignment: .leading) { Text(workout.type.rawValue.replacingOccurrences(of: "_", with: " ").capitalized); Text("\(workout.date) · \(workout.durationMinutes) min · \(workout.status.rawValue)").font(.footnote).foregroundStyle(.secondary) }
                    }
                }
                Section { Button("Confirm and save", action: confirm).buttonStyle(.borderedProminent).disabled(isWorking).frame(maxWidth: .infinity) } footer: { Text("Confirmation requests a fresh commit-ready package, then writes plan, history, and operation metadata in one owner-scoped transaction.") }
            }
            .navigationTitle("Review change")
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Discard") { discard(); dismiss() }.disabled(isWorking) } }
        }
    }
}

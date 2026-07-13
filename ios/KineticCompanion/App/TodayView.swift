import SwiftUI

enum TodaySyncState: String {
    case synced
    case stale
    case denied
}

enum TodayCalendarState: String {
    case clear
    case conflict
    case stale
}

enum TodayWorkoutStatus: String {
    case pending
    case accepted
    case checkedIn
    case completed
    case skipped
}

enum TodayIntakeStatus: String {
    case idle
    case drafted
    case applied
}

@MainActor
final class TodayViewModel: ObservableObject {
    @Published var syncState: TodaySyncState
    @Published var calendarState: TodayCalendarState
    @Published var status: TodayWorkoutStatus = .pending
    @Published var intakeStatus: TodayIntakeStatus = .idle
    @Published var notificationEnabled = false

    init(syncState: TodaySyncState, calendarState: TodayCalendarState = .clear) {
        self.syncState = syncState
        self.calendarState = calendarState
    }

    var content: TodayContent {
        TodayContent.content(for: syncState)
    }

    var calendar: TodayCalendarContext {
        TodayCalendarContext.context(for: calendarState)
    }

    var decision: TodayDecision {
        TodayDecision.build(readiness: content, calendarState: calendarState, syncState: syncState)
    }

    func accept() {
        status = .accepted
    }

    func checkIn() {
        status = .checkedIn
    }

    func complete() {
        status = .completed
    }

    func skip() {
        status = .skipped
    }

    static func previewSynced() -> TodayViewModel {
        TodayViewModel(syncState: .synced)
    }
}

struct TodayCalendarContext {
    let pill: String
    let title: String
    let detail: String

    static func context(for state: TodayCalendarState) -> TodayCalendarContext {
        switch state {
        case .clear:
            TodayCalendarContext(
                pill: "Calendar clear until 11:30 AM",
                title: "Planned slot available",
                detail: "Tempo still fits before the first meeting."
            )
        case .conflict:
            TodayCalendarContext(
                pill: "Calendar conflict at 8:45 AM",
                title: "30 min window today",
                detail: "Kinetic scales the session before it asks for effort."
            )
        case .stale:
            TodayCalendarContext(
                pill: "Calendar not refreshed",
                title: "Schedule confidence low",
                detail: "Review the schedule before accepting harder work."
            )
        }
    }
}

struct TodayDecision {
    let workoutTitle: String
    let workoutMeta: String
    let primaryAction: String
    let reasoning: [String]

    static func build(
        readiness: TodayContent,
        calendarState: TodayCalendarState,
        syncState: TodaySyncState
    ) -> TodayDecision {
        switch calendarState {
        case .clear:
            return TodayDecision(
                workoutTitle: readiness.workoutTitle,
                workoutMeta: readiness.workoutMeta,
                primaryAction: readiness.primaryAction,
                reasoning: readiness.reasoning
            )
        case .conflict:
            return TodayDecision(
                workoutTitle: syncState == .denied ? "Manual check-in first" : "Scale to 30 min easy",
                workoutMeta: syncState == .denied ? "2 min - then adapt safely" : "30 min - aerobic - preserves load cap",
                primaryAction: syncState == .denied ? "Log readiness" : "Apply safe adjustment",
                reasoning: [
                    "Calendar leaves only a 30 min training window.",
                    "The deterministic engine keeps weekly load inside bounds."
                ] + readiness.reasoning
            )
        case .stale:
            return TodayDecision(
                workoutTitle: syncState == .denied ? "Manual check-in first" : "Confirm schedule first",
                workoutMeta: syncState == .denied ? "2 min - readiness fallback" : "Calendar stale - no unsafe mutation",
                primaryAction: syncState == .denied ? "Log readiness" : "Review schedule",
                reasoning: [
                    "Calendar freshness is low, so Kinetic does not invent availability.",
                    "The current plan stays unchanged until the schedule is confirmed."
                ] + readiness.reasoning
            )
        }
    }
}

struct TodayContent {
    let readinessLabel: String
    let confidenceLabel: String
    let confidence: Int
    let readinessScore: Int
    let tone: Color
    let workoutTitle: String
    let workoutMeta: String
    let syncCopy: String
    let primaryAction: String
    let reasoning: [String]
    let metrics: [TodayMetric]
    let privacyCopy: String

    static func content(for state: TodaySyncState) -> TodayContent {
        switch state {
        case .synced:
            TodayContent(
                readinessLabel: "Ready",
                confidenceLabel: "High confidence",
                confidence: 78,
                readinessScore: 84,
                tone: KineticColor.emerald,
                workoutTitle: "Tempo intervals",
                workoutMeta: "42 min - 5.1 mi - quality day",
                syncCopy: "Health synced 8:12 AM",
                primaryAction: "Run the planned session",
                reasoning: [
                    "Sleep and HRV are inside your recent baseline.",
                    "No stale data warnings are active.",
                    "The quality session still fits the block."
                ],
                metrics: [
                    TodayMetric(label: "Sleep", value: "7h 28m", state: .good),
                    TodayMetric(label: "HRV", value: "54 ms", state: .good),
                    TodayMetric(label: "Resting HR", value: "49 bpm", state: .good)
                ],
                privacyCopy: "Daily summary only. Raw HealthKit samples stay on device."
            )
        case .stale:
            TodayContent(
                readinessLabel: "Caution",
                confidenceLabel: "Moderate confidence",
                confidence: 54,
                readinessScore: 66,
                tone: KineticColor.amber,
                workoutTitle: "Short aerobic run",
                workoutMeta: "30 min - easy effort",
                syncCopy: "Health last synced yesterday",
                primaryAction: "Use the scaled option",
                reasoning: [
                    "Readiness is more than a day old.",
                    "Kinetic reduces certainty instead of guessing.",
                    "The aerobic option protects the training rhythm."
                ],
                metrics: [
                    TodayMetric(label: "Sleep", value: "stale", state: .warn),
                    TodayMetric(label: "HRV", value: "stale", state: .warn),
                    TodayMetric(label: "Resting HR", value: "51 bpm", state: .muted)
                ],
                privacyCopy: "Open the app to refresh HealthKit before trusting harder work."
            )
        case .denied:
            TodayContent(
                readinessLabel: "Unknown",
                confidenceLabel: "Low confidence",
                confidence: 38,
                readinessScore: 50,
                tone: KineticColor.rose,
                workoutTitle: "Manual check-in first",
                workoutMeta: "2 min - sleep, fatigue, soreness",
                syncCopy: "Health permission needed",
                primaryAction: "Log readiness",
                reasoning: [
                    "Kinetic has no fresh HealthKit signal.",
                    "Manual readiness is the safest next input.",
                    "The plan will not change until deterministic validation runs."
                ],
                metrics: [
                    TodayMetric(label: "Sleep", value: "not shared", state: .muted),
                    TodayMetric(label: "HRV", value: "not shared", state: .muted),
                    TodayMetric(label: "Resting HR", value: "not shared", state: .muted)
                ],
                privacyCopy: "Granting access reads summaries locally; raw samples are not uploaded."
            )
        }
    }
}

struct TodayMetric: Identifiable {
    enum State {
        case good
        case warn
        case muted
    }

    let id = UUID()
    let label: String
    let value: String
    let state: State
}

struct TodayView: View {
    @StateObject var viewModel: TodayViewModel

    var body: some View {
        let content = viewModel.content
        let calendar = viewModel.calendar
        let decision = viewModel.decision

        ScrollView {
            VStack(spacing: 18) {
                header

                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("MORNING CHECK")
                            .font(.caption.weight(.semibold))
                            .tracking(2.8)
                            .foregroundStyle(KineticColor.blue)
                        Text(content.readinessLabel)
                            .font(.largeTitle.weight(.semibold))
                    }
                    Spacer()
                    confidencePill(content)
                }

                readinessArc(content)

                recommendationCard(content, decision: decision, calendar: calendar)
                reasoningCard(content, decision: decision)
                intakeCard
                checkInActions
                privacyCard(content)
            }
            .padding(20)
        }
        .background(KineticColor.canvas.ignoresSafeArea())
    }

    private var header: some View {
        HStack {
            CircleButton(systemName: "chevron.left")
            Spacer()
            HStack(spacing: 8) {
                KineticMark()
                Text("Today")
                    .font(.subheadline.weight(.semibold))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.88))
            .clipShape(Capsule())
            .shadow(color: .black.opacity(0.07), radius: 12, y: 5)
            Spacer()
            CircleButton(systemName: "lock")
        }
    }

    private func confidencePill(_ content: TodayContent) -> some View {
        VStack(spacing: 2) {
            Text("Confidence")
                .font(.caption)
                .foregroundStyle(KineticColor.muted)
            Text("\(content.confidence)%")
                .font(.headline.weight(.semibold))
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Color.white.opacity(0.9))
        .clipShape(Capsule())
        .shadow(color: .black.opacity(0.08), radius: 12, y: 5)
    }

    private func readinessArc(_ content: TodayContent) -> some View {
        VStack(spacing: 2) {
            Gauge(value: Double(content.readinessScore), in: 0...100) {
                EmptyView()
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .tint(content.tone)
            .scaleEffect(2.1)
            .frame(height: 160)

            Text("\(content.readinessScore)")
                .font(.system(size: 56, weight: .semibold, design: .rounded))
            Text("READINESS")
                .font(.caption.weight(.semibold))
                .tracking(3)
                .foregroundStyle(KineticColor.muted)
        }
    }

    private func recommendationCard(
        _ content: TodayContent,
        decision: TodayDecision,
        calendar: TodayCalendarContext
    ) -> some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("RECOMMENDATION")
                        .font(.caption.weight(.semibold))
                        .tracking(2.4)
                        .foregroundStyle(KineticColor.muted)
                    Text(decision.workoutTitle)
                        .font(.title2.weight(.semibold))
                    Text(decision.workoutMeta)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "dumbbell")
                    .foregroundStyle(KineticColor.blue)
                    .font(.title3.weight(.semibold))
            }

            HStack(spacing: 8) {
                ForEach(content.metrics) { metric in
                    MetricTile(metric: metric)
                }
            }

            Label(content.syncCopy, systemImage: "applewatch")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(KineticColor.blue)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(Color.blue.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            Label(calendar.pill, systemImage: "calendar")
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(KineticColor.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding()
                .background(Color.white.opacity(0.92))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

            HStack(spacing: 10) {
                Button(decision.primaryAction) {
                    if viewModel.syncState == .denied {
                        viewModel.checkIn()
                    } else {
                        viewModel.accept()
                    }
                }
                .buttonStyle(PrimaryButtonStyle())

                Button {
                    viewModel.skip()
                } label: {
                    Image(systemName: "timer")
                        .frame(width: 48, height: 48)
                }
                .buttonStyle(SecondaryIconButtonStyle())
            }
        }
        .padding(18)
        .kineticCard()
    }

    private func reasoningCard(_ content: TodayContent, decision: TodayDecision) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Why this call", systemImage: "checkmark.shield")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(KineticColor.ink)
                Spacer()
                Text(content.confidenceLabel)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(KineticColor.muted)
            }

            ForEach(decision.reasoning, id: \.self) { reason in
                Label(reason, systemImage: "checkmark.circle")
                    .font(.subheadline)
                    .foregroundStyle(KineticColor.ink)
            }
        }
        .padding(18)
        .kineticCard()
    }

    private var intakeCard: some View {
        HStack(spacing: 14) {
            Image(systemName: viewModel.intakeStatus == .idle ? "text.bubble" : "sparkles")
                .foregroundStyle(KineticColor.blue)
                .frame(width: 42, height: 42)
                .background(Color.blue.opacity(0.1))
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 5) {
                Text(viewModel.intakeStatus == .idle ? "Tell Kinetic what changed" : "Review-only AI draft")
                    .font(.headline.weight(.semibold))
                Text(viewModel.intakeStatus == .idle
                    ? "Example: I only have 30 minutes today."
                    : "Parsed intent still needs deterministic validation before applying.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .padding(18)
        .kineticCard()
    }

    private var checkInActions: some View {
        HStack(spacing: 12) {
            Button("Complete") {
                viewModel.complete()
            }
            .buttonStyle(CheckInButtonStyle(active: viewModel.status == .completed))

            Button("Skip") {
                viewModel.skip()
            }
            .buttonStyle(CheckInButtonStyle(active: viewModel.status == .skipped))
        }
    }

    private func privacyCard(_ content: TodayContent) -> some View {
        HStack(spacing: 14) {
            Image(systemName: viewModel.notificationEnabled ? "bell" : "moon")
                .foregroundStyle(KineticColor.emerald)
                .frame(width: 42, height: 42)
                .background(KineticColor.emerald.opacity(0.11))
                .clipShape(Circle())
            VStack(alignment: .leading, spacing: 5) {
                Text(viewModel.notificationEnabled ? "Quiet check-in enabled" : "No nudges by default")
                    .font(.headline.weight(.semibold))
                Text(content.privacyCopy)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                Text("Web QA can audit mobile-originated decisions.")
                    .font(.caption)
                    .foregroundStyle(KineticColor.muted)
            }
            Spacer()
        }
        .padding(18)
        .kineticCard()
    }
}

private struct CircleButton: View {
    let systemName: String

    var body: some View {
        Button {
        } label: {
            Image(systemName: systemName)
                .font(.headline.weight(.semibold))
                .frame(width: 44, height: 44)
                .background(Color.white.opacity(0.88))
                .clipShape(Circle())
                .shadow(color: .black.opacity(0.07), radius: 10, y: 5)
        }
        .foregroundStyle(KineticColor.ink)
    }
}

private struct KineticMark: View {
    var body: some View {
        Text("K")
            .font(.headline.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 26, height: 26)
            .background(KineticColor.blue)
            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
    }
}

private struct MetricTile: View {
    let metric: TodayMetric

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Image(systemName: iconName)
                .font(.subheadline.weight(.semibold))
            Text(metric.label)
                .font(.caption)
            Text(metric.value)
                .font(.subheadline.weight(.semibold))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity, minHeight: 84, alignment: .leading)
        .padding(10)
        .background(background)
        .foregroundStyle(foreground)
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private var iconName: String {
        switch metric.label {
        case "Sleep": return "moon"
        case "HRV": return "waveform.path.ecg"
        default: return "heart"
        }
    }

    private var background: Color {
        switch metric.state {
        case .good: return KineticColor.emerald.opacity(0.12)
        case .warn: return KineticColor.amber.opacity(0.12)
        case .muted: return Color.gray.opacity(0.12)
        }
    }

    private var foreground: Color {
        switch metric.state {
        case .good: return Color(red: 0.0, green: 0.43, blue: 0.32)
        case .warn: return Color(red: 0.66, green: 0.29, blue: 0.05)
        case .muted: return KineticColor.muted
        }
    }
}

private struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(KineticColor.ink.opacity(configuration.isPressed ? 0.82 : 1.0))
            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
    }
}

private struct SecondaryIconButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(KineticColor.ink)
            .background(Color.white.opacity(configuration.isPressed ? 0.7 : 0.95))
            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 15, style: .continuous)
                    .stroke(Color.black.opacity(0.08))
            )
    }
}

private struct CheckInButtonStyle: ButtonStyle {
    let active: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(active ? KineticColor.blue : KineticColor.ink)
            .frame(maxWidth: .infinity, minHeight: 50)
            .background(active ? Color.blue.opacity(0.1) : Color.white.opacity(0.82))
            .clipShape(RoundedRectangle(cornerRadius: 15, style: .continuous))
    }
}

#Preview {
    TodayView(viewModel: TodayViewModel.previewSynced())
}

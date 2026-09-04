import SwiftUI

struct BehaviorPatternView: View {
    @ObservedObject var viewModel: TodayViewModel
    var accessibilityQAPreview = false
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var showingCheckin = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    if accessibilityQAPreview {
                        Label(
                            "Read-only QA preview",
                            systemImage: "checkmark.shield"
                        )
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel(
                            "Accessibility QA preview. Actions are disabled and no data is read or written."
                        )
                        .accessibilityIdentifier("behavior-pattern-qa-preview")
                    }
                    statusContent
                }
                .padding()
            }
            .background(KineticColor.canvas.ignoresSafeArea())
            .navigationTitle("What Kinetic noticed")
            .navigationBarTitleDisplayMode(.inline)
            .toolbarBackground(KineticColor.canvas, for: .navigationBar)
            .toolbarBackground(.visible, for: .navigationBar)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
            .task {
                if viewModel.behaviorResponse == nil && !viewModel.behaviorLoading {
                    await viewModel.loadBehaviorPatterns()
                }
            }
            .refreshable {
                if !accessibilityQAPreview {
                    await viewModel.loadBehaviorPatterns()
                }
            }
            .sheet(isPresented: $showingCheckin) {
                MobileCheckinView(
                    viewModel: viewModel,
                    launch: .workout(defaultStatus: .completed)
                )
            }
        }
    }

    @ViewBuilder
    private var statusContent: some View {
        if viewModel.behaviorLoading {
            ProgressView("Reviewing bounded recommendation history")
                .frame(maxWidth: .infinity, minHeight: 180)
        } else if let failure = viewModel.behaviorFailure {
            failureCard(failure)
        } else if let response = viewModel.behaviorResponse {
            summaryCard(response)
            if let message = viewModel.behaviorMessage {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal, 4)
            }
            if response.patterns.isEmpty {
                emptyCard
            } else {
                ForEach(response.patterns) { pattern in
                    patternCard(pattern)
                }
            }
            ForEach(response.warnings, id: \.self) { warning in
                Label(warning, systemImage: "exclamationmark.triangle")
                    .font(.footnote)
                    .foregroundStyle(KineticColor.amber)
            }
        } else {
            emptyCard
        }
    }

    private func summaryCard(_ response: BehaviorInsightsResponse) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Behavior memory", systemImage: "brain.head.profile")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Text(
                "\(viewModel.behaviorHistoryCount) bounded recommendation events reviewed. Observations never change training on their own."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
            if response.analysis.fallbackUsed {
                Label(
                    "Kinetic used its deterministic fallback (\(label(response.analysis.failure.rawValue))).",
                    systemImage: "shield.checkered"
                )
                .font(.footnote)
                .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .kineticCard()
    }

    private var emptyCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("More history needed", systemImage: "clock.arrow.circlepath")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Text(
                "Complete or skip workouts through Kinetic. Patterns appear only after repeated bounded signals; a single day does not become a preference."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
        }
        .padding(18)
        .kineticCard()
    }

    private func patternCard(_ pattern: BehaviorPattern) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    patternTitle(pattern)
                    confidenceLabel(pattern)
                }
            } else {
                HStack(alignment: .firstTextBaseline) {
                    patternTitle(pattern)
                    Spacer()
                    confidenceLabel(pattern)
                }
            }
            detail("Noticed", pattern.description)
            detail("Why it matters", pattern.whyItMatters)
            detail("Can change", pattern.result.willChange)
            detail("Never changes", pattern.result.willNeverChange)
            resultAction(pattern)
        }
        .padding(18)
        .kineticCard()
    }

    private func patternTitle(_ pattern: BehaviorPattern) -> some View {
        Text(pattern.title)
            .font(.headline)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("behavior-pattern-\(pattern.id)")
    }

    private func confidenceLabel(_ pattern: BehaviorPattern) -> some View {
        Text(pattern.confidence.rawValue.capitalized)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .accessibilityLabel(
                "\(pattern.confidence.rawValue.capitalized) confidence"
            )
    }

    @ViewBuilder
    private func resultAction(_ pattern: BehaviorPattern) -> some View {
        switch pattern.result {
        case .scoringPreference(_, _, _, _, _):
            let saved = viewModel.confirmedBehaviorPatternIDs.contains(pattern.id)
            Button {
                Task { await viewModel.confirmBehaviorPreference(pattern) }
            } label: {
                Label(
                    saved ? "Using this preference" : pattern.result.actionLabel,
                    systemImage: saved ? "checkmark.circle.fill" : "slider.horizontal.3"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(
                accessibilityQAPreview
                    || saved
                    || viewModel.behaviorConfirmingIDs.contains(pattern.id)
            )
            if viewModel.behaviorConfirmingIDs.contains(pattern.id) {
                ProgressView("Saving bounded preference")
            }
        case .preferredDay(_, _, _, _, _):
            Text(
                "Preferred-day confirmation stays on the web in v1 so the existing deterministic plan validator remains the only authority."
            )
            .font(.caption)
            .foregroundStyle(.secondary)
            Button {
                viewModel.markBehaviorPatternRouted(pattern)
                openURL(MobileTodayAppConfiguration.webProfileURL)
            } label: {
                Label("Open web schedule review", systemImage: "safari")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(accessibilityQAPreview)
        case .checkinPrompt(_, _, _, let prompt):
            Button {
                viewModel.markBehaviorPatternRouted(pattern)
                switch prompt {
                case .syncReadiness:
                    Task { await viewModel.readAndSyncToday() }
                case .completeCheckin:
                    viewModel.resetCheckin()
                    showingCheckin = true
                }
            } label: {
                Label(
                    pattern.result.actionLabel,
                    systemImage: prompt == .syncReadiness
                        ? "arrow.triangle.2.circlepath"
                        : "checkmark.circle"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(accessibilityQAPreview)
        case .caution(_, _, _, let actions):
            VStack(alignment: .leading, spacing: 8) {
                Text("Conservative options")
                    .font(.subheadline.weight(.semibold))
                    .accessibilityAddTraits(.isHeader)
                ForEach(actions, id: \.rawValue) { action in
                    Label(cautionLabel(action), systemImage: "shield")
                        .font(.footnote)
                }
                Text("Kinetic does not diagnose, infer severity, or provide training clearance.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func detail(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            Text(value)
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func failureCard(_ failure: BehaviorPatternFailureCode) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(failureTitle(failure), systemImage: "exclamationmark.triangle")
                .font(.headline)
                .accessibilityAddTraits(.isHeader)
            Text(failureDetail(failure))
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text("No preference or plan state changed.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Button("Retry") {
                Task { await viewModel.loadBehaviorPatterns() }
            }
            .buttonStyle(.borderedProminent)
            .disabled(accessibilityQAPreview)
        }
        .padding(18)
        .kineticCard()
    }

    private func failureTitle(_ failure: BehaviorPatternFailureCode) -> String {
        switch failure {
        case .authRequired: "Sign-in required"
        case .offline: "Behavior memory is offline"
        case .timeout: "Behavior review timed out"
        case .backendUnavailable: "Behavior service unavailable"
        case .invalidResponse: "Response rejected"
        case .unknown: "Behavior memory unavailable"
        }
    }

    private func failureDetail(_ failure: BehaviorPatternFailureCode) -> String {
        switch failure {
        case .authRequired: "Sign in again before reading protected history."
        case .offline: "Reconnect before trying again."
        case .timeout: "The finite native deadline elapsed safely. Try again later."
        case .backendUnavailable: "The deterministic service could not be reached."
        case .invalidResponse: "Kinetic rejected malformed or non-contract data."
        case .unknown: "Retry when the connection is stable."
        }
    }

    private func cautionLabel(_ action: BehaviorPatternCautionAction) -> String {
        switch action {
        case .stopOrReduce: "Stop or reduce the activity"
        case .captureDiscomfortFlag: "Record only the bounded discomfort flag"
        case .seekQualifiedCare: "Seek qualified care when appropriate"
        }
    }

    private func label(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ").capitalized
    }
}

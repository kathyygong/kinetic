import Combine
import Foundation

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

struct MobilePlanPendingPreview: Equatable {
    var operationID: String
    var action: MobilePlanAction
    var targetWorkoutID: String?
    var currentPlan: MobilePlanSnapshot?
    var proposedPlan: MobilePlanSnapshot
    var response: MobilePlanLifecycleResponse
}

@MainActor
final class MobilePlanViewModel: ObservableObject {
    @Published private(set) var plan: MobilePlanSnapshot?
    @Published private(set) var preview: MobilePlanPendingPreview?
    @Published private(set) var isWorking = false
    @Published private(set) var legacyPlanPresent = false
    @Published private(set) var message: String?

    private let configured: Bool
    private let network: MobilePlanLifecycleNetworking
    private let store: MobilePlanStoring
    private let audit: MobileAuditTransporting

    init(configured: Bool, network: MobilePlanLifecycleNetworking = URLSessionMobilePlanLifecycleClient(), store: MobilePlanStoring = FirestoreMobilePlanStore(), audit: MobileAuditTransporting = FirestoreMobileAuditTransport()) {
        self.configured = configured; self.network = network; self.store = store; self.audit = audit
    }

    func restore() async {
        guard configured else { message = "Firebase configuration is missing."; return }
        do {
            let state = try await store.load()
            plan = state.plan; legacyPlanPresent = state.legacyPlanPresent; message = state.legacyPlanPresent ? "Your proof-era plan is preserved until you approve the validated native replacement." : nil
        } catch { message = "Your owner-scoped plan could not be restored safely." }
    }

    func clear() { plan = nil; preview = nil; legacyPlanPresent = false; message = nil }

    func previewGeneration() async {
        await performPreview(action: .generate, targetWorkoutID: nil) {
            try MobilePlanProposalBuilder.generate(context: try await self.store.loadGenerationContext())
        }
    }

    func previewChange(action: MobilePlanAction, target: MobilePlanWorkout? = nil, date: String? = nil, duration: Int? = nil, replacement: MobilePlanWorkoutType? = nil) async {
        guard let current = plan else { message = "Generate a plan first."; return }
        await performPreview(action: action, targetWorkoutID: target?.id) {
            if action == .regenerateFuture {
                let generated = try MobilePlanProposalBuilder.generate(context: try await self.store.loadGenerationContext())
                return try MobilePlanProposalBuilder.proposal(action: action, current: current, regenerated: generated)
            }
            return try MobilePlanProposalBuilder.proposal(action: action, current: current, targetWorkoutID: target?.id, newDate: date, newDuration: duration, replacementType: replacement)
        }
    }

    func previewPreferredDay(strategy: BehaviorPatternPreferredDayStrategy, observedDay: MobileIntakeDay) async {
        if plan == nil { await restore() }
        guard let plan else { message = "Generate and save a plan before confirming a preferred-day pattern."; return }
        let candidates = plan.scheduledWorkouts.filter { $0.type != .race }
        let target: MobilePlanWorkout?
        let shift: Int
        switch strategy {
        case .avoidDay:
            target = candidates.first { weekday($0.date) == observedDay }
            shift = 1
        case .preferLongRunDay:
            target = candidates.first { $0.type == .longRun }
            guard let target else { message = "No future long run is available to review."; return }
            let currentRank = weekdayRank(weekday(target.date)), desiredRank = weekdayRank(observedDay)
            let delta = (desiredRank - currentRank + 7) % 7
            shift = delta == 0 ? 7 : delta
        }
        guard let target, let date = shifted(target.date, days: shift) else {
            message = "No matching future workout is available for this preferred-day review."; return
        }
        await previewChange(action: .preferredDay, target: target, date: date)
    }

    func discardPreview() { preview = nil; message = nil }

    func commitPreview() async {
        guard let pending = preview else { return }
        isWorking = true
        let started = Date()
        do {
            let latest = try await store.load()
            let request = try MobilePlanRequestFactory.make(
                mode: .commit, operationID: pending.operationID, current: pending.currentPlan,
                proposed: pending.proposedPlan, action: pending.action,
                targetWorkoutID: pending.targetWorkoutID, priorOperation: latest.priorOperation
            )
            let response = try await network.validate(request: request, idToken: try await idToken())
            switch response.result {
            case .commitReady:
                let committed = try await store.commit(response: response, request: request)
                let state = try await store.load(); plan = state.plan; legacyPlanPresent = false; preview = nil
                message = committed.replayed ? "This change was already saved." : "Plan version \(committed.version) saved."
                emit(action: pending.action, response: response, mutation: .applied, failure: .none, started: started)
            case .replayed:
                let state = try await store.load(); plan = state.plan; preview = nil
                message = "This change was already saved."
                emit(action: pending.action, response: response, mutation: .applied, failure: .none, started: started)
            case .conflict:
                let conflict = conflictMessage(response); await restore(); preview = nil; message = conflict
                emit(action: pending.action, response: response, mutation: .rejected, failure: failure(response), started: started)
            case .rejected:
                message = rejectionMessage(response)
                emit(action: pending.action, response: response, mutation: .rejected, failure: failure(response), started: started)
            case .preview:
                message = "The validator returned a preview when a commit package was required."
                emit(action: pending.action, response: response, mutation: .rejected, failure: .invalidResponse, started: started)
            }
        } catch {
            let failureMessage = errorMessage(error)
            if error as? MobilePlanStoreError == .versionConflict { await restore(); preview = nil }
            message = failureMessage
            emitFailure(action: pending.action, failure: auditFailure(error), started: started)
        }
        isWorking = false
    }

    private func performPreview(action: MobilePlanAction, targetWorkoutID: String?, proposal: () async throws -> MobilePlanSnapshot) async {
        isWorking = true; message = nil
        let started = Date(), operationID = MobilePlanRequestFactory.operationID()
        do {
            let current = plan, proposed = try await proposal(), latest = try await store.load()
            let request = try MobilePlanRequestFactory.make(mode: .preview, operationID: operationID, current: current, proposed: proposed, action: action, targetWorkoutID: targetWorkoutID, priorOperation: latest.priorOperation)
            let response = try await network.validate(request: request, idToken: try await idToken())
            if response.result == .preview, response.commitPlan == proposed {
                preview = .init(operationID: operationID, action: action, targetWorkoutID: targetWorkoutID, currentPlan: current, proposedPlan: proposed, response: response)
                emit(action: action, response: response, mutation: .reviewOnly, failure: .none, started: started)
            } else {
                message = response.result == .conflict ? conflictMessage(response) : rejectionMessage(response)
                emit(action: action, response: response, mutation: .rejected, failure: failure(response), started: started)
            }
        } catch {
            message = errorMessage(error); emitFailure(action: action, failure: auditFailure(error), started: started)
        }
        isWorking = false
    }

    private func idToken() async throws -> String {
        #if canImport(FirebaseAuth)
        guard let user = Auth.auth().currentUser else { throw MobilePlanNetworkError(failure: .authRequired) }
        return try await user.getIDToken()
        #else
        throw MobilePlanNetworkError(failure: .authRequired)
        #endif
    }

    private func weekday(_ value: String) -> MobileIntakeDay? {
        guard let date = isoFormatter.date(from: value) else { return nil }
        return [nil, .sun, .mon, .tue, .wed, .thu, .fri, .sat][Calendar(identifier: .gregorian).component(.weekday, from: date)]
    }
    private func weekdayRank(_ value: MobileIntakeDay?) -> Int {
        guard let value else { return 0 }
        return [.mon, .tue, .wed, .thu, .fri, .sat, .sun].firstIndex(of: value) ?? 0
    }
    private func shifted(_ value: String, days: Int) -> String? {
        guard let date = isoFormatter.date(from: value), let next = Calendar(identifier: .gregorian).date(byAdding: .day, value: days, to: date) else { return nil }
        return isoFormatter.string(from: next)
    }
    private var isoFormatter: DateFormatter {
        let value = DateFormatter(); value.calendar = Calendar(identifier: .gregorian); value.locale = Locale(identifier: "en_US_POSIX"); value.timeZone = TimeZone(secondsFromGMT: 0); value.dateFormat = "yyyy-MM-dd"; return value
    }

    private func errorMessage(_ error: Error) -> String {
        if let network = error as? MobilePlanNetworkError {
            return switch network.failure {
            case .authRequired: "Sign in again before changing your plan."
            case .offline: "You are offline. The preview is unchanged; retry when connected."
            case .timeout: "Plan validation timed out. Nothing was saved; retry safely."
            case .backendUnavailable: "Plan validation is temporarily unavailable. Nothing was saved."
            case .invalidResponse: "The validator returned an invalid package. Nothing was saved."
            case .unknown: "Plan validation failed. Nothing was saved."
            }
        }
        if let store = error as? MobilePlanStoreError {
            return switch store {
            case .versionConflict: "Your plan changed elsewhere. It has been refreshed; review the change again."
            case .idempotencyConflict: "This operation identifier was already used for different content. Nothing was saved."
            case .deletionPending: "Plan changes are disabled while data deletion is pending."
            case .signedOut: "Sign in again before changing your plan."
            default: "The owner-scoped transaction failed. Nothing was partially saved."
            }
        }
        if error is MobilePlanProposalError { return "That change cannot produce a valid plan proposal." }
        return "The plan change failed safely. Nothing was saved."
    }

    private func conflictMessage(_ response: MobilePlanLifecycleResponse) -> String {
        response.reasonCodes.contains(.idempotencyConflict) ? "This operation conflicts with an earlier change. Refresh and review again." : "Your plan changed elsewhere. Refresh and review again."
    }
    private func rejectionMessage(_ response: MobilePlanLifecycleResponse) -> String {
        if response.reasonCodes.contains(.completedHistoryChanged) { return "Completed workouts are locked and were not changed." }
        if response.reasonCodes.contains(.raceDayChanged) || response.reasonCodes.contains(.raceDayMissingOrInvalid) { return "Race day is locked and was not changed." }
        if response.reasonCodes.contains(.spacingViolation) { return "This change puts hard workouts too close together. Choose another day." }
        return "The deterministic validator rejected this change. Nothing was saved."
    }
    private func failure(_ response: MobilePlanLifecycleResponse) -> MobilePlanAuditFailureState {
        if response.reasonCodes.contains(.versionConflict) { return .versionConflict }
        if response.reasonCodes.contains(.idempotencyConflict) { return .idempotencyConflict }
        return .none
    }
    private func auditFailure(_ error: Error) -> MobilePlanAuditFailureState {
        if let value = error as? MobilePlanNetworkError {
            return MobilePlanAuditFailureState(rawValue: value.failure.rawValue) ?? .unknown
        }
        if let value = error as? MobilePlanStoreError {
            return switch value { case .versionConflict: .versionConflict; case .idempotencyConflict: .idempotencyConflict; case .signedOut: .authRequired; default: .unknown }
        }
        return .unknown
    }
    private func emit(action: MobilePlanAction, response: MobilePlanLifecycleResponse, mutation: MobileIntakeMutationState, failure: MobilePlanAuditFailureState, started: Date) {
        let outcome: MobileDecisionOutcome = response.result == .preview || response.result == .commitReady || response.result == .replayed ? .success : response.result == .rejected ? .invalid : .failed
        let audit = MobilePlanLifecycleAudit(action: action, outcome: outcome, result: response.result, mutationState: mutation, deterministicValidation: response.result == .rejected ? .failed : .passed, failureState: failure, versionDelta: (response.proposedVersion ?? response.baseVersion) - response.baseVersion, affectedCount: response.impact.affectedWorkoutIDs.count, completedPreserved: response.impact.completedWorkoutsPreserved, latencyMs: min(60_000, max(0, Int(Date().timeIntervalSince(started) * 1000))))
        Task { await self.audit.send(MobileAuditEnvelope(properties: audit)) }
    }
    private func emitFailure(action: MobilePlanAction, failure: MobilePlanAuditFailureState, started: Date) {
        let audit = MobilePlanLifecycleAudit(action: action, outcome: .failed, result: .rejected, mutationState: .rejected, deterministicValidation: .failed, failureState: failure, versionDelta: 0, affectedCount: 0, completedPreserved: 0, latencyMs: min(60_000, max(0, Int(Date().timeIntervalSince(started) * 1000))))
        Task { await self.audit.send(MobileAuditEnvelope(properties: audit)) }
    }
}

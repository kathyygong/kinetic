import Foundation

#if canImport(HealthKit)
import HealthKit
#endif

struct HealthKitReadinessSummary: Equatable {
    var date: String
    var entry: ReadinessEntry?
    var permissionState: PermissionState
    var metricPermissions: [String: MetricPermission]
    var dailyStatus: DailyHealthSyncStatus
    var lastErrorCode: String?
}

enum HealthKitReadinessError: Error {
    case unavailable
    case noSupportedMetrics
}

protocol ReadinessProviding {
    func requestAuthorization() async throws -> PermissionState
    func summarizeLocalDay(_ date: Date) async throws -> HealthKitReadinessSummary
}

final class HealthKitReadinessStore: ReadinessProviding {
    #if canImport(HealthKit)
    private let store = HKHealthStore()
    private var authorizationRequestState = PermissionState.notDetermined
    #endif

    func requestAuthorization() async throws -> PermissionState {
        #if canImport(HealthKit)
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthKitReadinessError.unavailable
        }

        let types = supportedReadTypes()
        guard !types.isEmpty else {
            throw HealthKitReadinessError.noSupportedMetrics
        }

        let state = try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<PermissionState, Error>) in
            store.requestAuthorization(toShare: [], read: types) { success, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    // HealthKit intentionally does not disclose read authorization.
                    // Data coverage below promotes this provisional state when proven.
                    continuation.resume(returning: success ? .partial : .denied)
                }
            }
        }
        authorizationRequestState = state
        return state
        #else
        throw HealthKitReadinessError.unavailable
        #endif
    }

    func summarizeLocalDay(_ date: Date) async throws -> HealthKitReadinessSummary {
        #if canImport(HealthKit)
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthKitReadinessError.unavailable
        }

        let calendar = Calendar.current
        let start = calendar.startOfDay(for: date)
        guard let end = calendar.date(byAdding: .day, value: 1, to: start) else {
            throw HealthKitReadinessError.noSupportedMetrics
        }

        async let sleep = readMetric(validRange: 0...24) {
            try await self.sleepHours(start: start, end: end)
        }
        async let hrv = readMetric(validRange: 1...300) {
            try await self.averageQuantity(
                identifier: .heartRateVariabilitySDNN,
                unit: HKUnit.secondUnit(with: .milli),
                start: start,
                end: end
            )
        }
        async let resting = readMetric(validRange: 20...220) {
            try await self.averageQuantity(
                identifier: .restingHeartRate,
                unit: HKUnit.count().unitDivided(by: .minute()),
                start: start,
                end: end
            )
        }

        let results: [HealthMetric: MetricRead] = [
            .sleep: await sleep,
            .hrv: await hrv,
            .restingHeartRate: await resting
        ]
        let coverage = Dictionary(
            uniqueKeysWithValues: results.map { ($0.key.rawValue, $0.value.coverage) }
        )
        let metricPermissions = Dictionary(
            uniqueKeysWithValues: results.map { ($0.key.rawValue, $0.value.permission) }
        )
        let completeCount = coverage.values.filter { $0 == .complete }.count
        let deniedCount = coverage.values.filter { $0 == .notPermitted }.count

        let permissionState: PermissionState
        if authorizationRequestState == .denied || deniedCount == HealthMetric.allCases.count {
            permissionState = .denied
        } else if completeCount == HealthMetric.allCases.count {
            permissionState = .granted
        } else {
            permissionState = .partial
        }

        let dateKey = Self.localDateKey(start)
        let now = Date()
        let entry: ReadinessEntry? = completeCount == 0 ? nil : ReadinessEntry(
            date: dateKey,
            sleepHours: results[.sleep]?.value.map { Self.round($0, places: 2) },
            hrv: results[.hrv]?.value.map { Self.round($0, places: 2) },
            restingHeartRate: results[.restingHeartRate]?.value.map { Self.round($0, places: 0) },
            fatigueLevel: nil,
            sorenessLevel: nil,
            source: .healthkit,
            updatedAt: now
        )

        let confidence: ConfidenceBucket = switch completeCount {
        case 3: .high
        case 2: .moderate
        default: .low
        }

        return HealthKitReadinessSummary(
            date: dateKey,
            entry: entry,
            permissionState: permissionState,
            metricPermissions: metricPermissions,
            dailyStatus: DailyHealthSyncStatus(
                status: completeCount == HealthMetric.allCases.count ? .synced : .partial,
                confidence: confidence,
                coverage: coverage,
                conflict: .none
            ),
            lastErrorCode: results.values.contains(where: { $0.queryFailed })
                ? "healthkit_query_failed"
                : nil
        )
        #else
        throw HealthKitReadinessError.unavailable
        #endif
    }

    #if canImport(HealthKit)
    private struct MetricRead {
        var value: Double?
        var coverage: CoverageState
        var permission: MetricPermission
        var queryFailed: Bool
    }

    private func readMetric(
        validRange: ClosedRange<Double>,
        operation: () async throws -> Double?
    ) async -> MetricRead {
        do {
            guard let value = try await operation() else {
                return MetricRead(
                    value: nil,
                    coverage: .missing,
                    permission: .notDetermined,
                    queryFailed: false
                )
            }
            guard validRange.contains(value) else {
                return MetricRead(
                    value: nil,
                    coverage: .missing,
                    permission: .granted,
                    queryFailed: false
                )
            }
            return MetricRead(
                value: value,
                coverage: .complete,
                permission: .granted,
                queryFailed: false
            )
        } catch {
            let nsError = error as NSError
            let denied = nsError.domain == HKErrorDomain &&
                nsError.code == HKError.Code.errorAuthorizationDenied.rawValue
            return MetricRead(
                value: nil,
                coverage: denied ? .notPermitted : .missing,
                permission: denied ? .denied : .notDetermined,
                queryFailed: !denied
            )
        }
    }

    private func supportedReadTypes() -> Set<HKObjectType> {
        var types = Set<HKObjectType>()
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            types.insert(sleep)
        }
        if let hrv = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
            types.insert(hrv)
        }
        if let resting = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
            types.insert(resting)
        }
        return types
    }

    private func sleepHours(start: Date, end: Date) async throws -> Double? {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            return nil
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                let intervals = (samples as? [HKCategorySample] ?? [])
                    .filter { sample in
                        sample.value == HKCategoryValueSleepAnalysis.asleepCore.rawValue ||
                            sample.value == HKCategoryValueSleepAnalysis.asleepDeep.rawValue ||
                            sample.value == HKCategoryValueSleepAnalysis.asleepREM.rawValue ||
                            sample.value == HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
                    }
                    .compactMap { sample -> DateInterval? in
                        let intervalStart = max(sample.startDate, start)
                        let intervalEnd = min(sample.endDate, end)
                        guard intervalEnd > intervalStart else { return nil }
                        return DateInterval(start: intervalStart, end: intervalEnd)
                    }

                let seconds = Self.unionDuration(intervals)
                continuation.resume(returning: seconds > 0 ? seconds / 3600.0 : nil)
            }
            store.execute(query)
        }
    }

    private func averageQuantity(
        identifier: HKQuantityTypeIdentifier,
        unit: HKUnit,
        start: Date,
        end: Date
    ) async throws -> Double? {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else {
            return nil
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        return try await withCheckedThrowingContinuation { continuation in
            let query = HKStatisticsQuery(
                quantityType: type,
                quantitySamplePredicate: predicate,
                options: .discreteAverage
            ) { _, statistics, error in
                if let error {
                    continuation.resume(throwing: error)
                    return
                }

                continuation.resume(returning: statistics?.averageQuantity()?.doubleValue(for: unit))
            }
            store.execute(query)
        }
    }

    private static func unionDuration(_ intervals: [DateInterval]) -> TimeInterval {
        let sorted = intervals.sorted { $0.start < $1.start }
        guard var current = sorted.first else { return 0 }

        var total: TimeInterval = 0
        for interval in sorted.dropFirst() {
            if interval.start <= current.end {
                current = DateInterval(start: current.start, end: max(current.end, interval.end))
            } else {
                total += current.duration
                current = interval
            }
        }
        return total + current.duration
    }
    #endif

    private static func localDateKey(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar.current
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }

    private static func round(_ value: Double, places: Int) -> Double {
        let factor = pow(10.0, Double(places))
        return (value * factor).rounded() / factor
    }
}

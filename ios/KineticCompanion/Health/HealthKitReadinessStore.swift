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

enum HealthKitSleepAggregator {
    static let maximumEpisodeGap: TimeInterval = 2 * 60 * 60

    static func queryWindow(
        dayStart: Date,
        dayEnd: Date,
        calendar: Calendar
    ) -> DateInterval {
        DateInterval(
            start: calendar.date(byAdding: .day, value: -1, to: dayStart)
                ?? dayStart.addingTimeInterval(-24 * 60 * 60),
            end: dayEnd
        )
    }

    static func appleDisplayedDailySleepHours(
        intervalsBySource: [[DateInterval]],
        dayStart: Date,
        dayEnd: Date,
        calendar: Calendar,
        maximumGap: TimeInterval = maximumEpisodeGap,
        epoch: TimeInterval = 30
    ) -> Double? {
        guard epoch > 0 else { return nil }
        let window = queryWindow(
            dayStart: dayStart,
            dayEnd: dayEnd,
            calendar: calendar
        )
        let sourceTotals = intervalsBySource.compactMap { sourceIntervals -> TimeInterval? in
            let sorted = clipped(sourceIntervals, to: window)
                .sorted { $0.start < $1.start }
            guard !sorted.isEmpty else { return nil }

            var unique: [DateInterval] = []
            for interval in sorted where !unique.contains(interval) {
                unique.append(interval)
            }

            var episodes: [[DateInterval]] = []
            for interval in unique {
                if
                    let latest = episodes.last?.last,
                    interval.start.timeIntervalSince(latest.end) <= maximumGap
                {
                    episodes[episodes.count - 1].append(interval)
                } else {
                    episodes.append([interval])
                }
            }

            let seconds = episodes
                .filter { episode in
                    guard let end = episode.last?.end else { return false }
                    return end >= dayStart && end < dayEnd
                }
                .flatMap { $0 }
                .reduce(0) { total, interval in
                    total + (interval.duration / epoch).rounded() * epoch
                }
            return seconds > 0 ? seconds : nil
        }
        guard let seconds = sourceTotals.max() else { return nil }
        return seconds / 3600.0
    }

    private static func clipped(
        _ intervals: [DateInterval],
        to window: DateInterval
    ) -> [DateInterval] {
        intervals.compactMap { interval in
            let start = max(interval.start, window.start)
            let end = min(interval.end, window.end)
            return end > start ? DateInterval(start: start, end: end) : nil
        }
    }
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
            try await self.sleepHours(
                dayStart: start,
                dayEnd: end,
                calendar: calendar
            )
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
            sleepHours: results[.sleep]?.value,
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

    private func sleepHours(
        dayStart: Date,
        dayEnd: Date,
        calendar: Calendar
    ) async throws -> Double? {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            return nil
        }

        let queryWindow = HealthKitSleepAggregator.queryWindow(
            dayStart: dayStart,
            dayEnd: dayEnd,
            calendar: calendar
        )
        let predicate = HKQuery.predicateForSamples(
            withStart: queryWindow.start,
            end: queryWindow.end
        )
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

                let asleepValues = Set(
                    HKCategoryValueSleepAnalysis.allAsleepValues.map(\.rawValue)
                )
                let categorySamples = samples as? [HKCategorySample] ?? []
                let intervalsBySource = Dictionary(
                    grouping: categorySamples.filter {
                        asleepValues.contains($0.value)
                    },
                    by: { $0.sourceRevision.source.bundleIdentifier }
                )
                .values
                .map { samples in
                    samples.map {
                        DateInterval(start: $0.startDate, end: $0.endDate)
                    }
                }
                let calculated =
                    HealthKitSleepAggregator.appleDisplayedDailySleepHours(
                    intervalsBySource: intervalsBySource,
                    dayStart: dayStart,
                    dayEnd: dayEnd,
                    calendar: calendar
                )
                continuation.resume(
                    returning: calculated
                )
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

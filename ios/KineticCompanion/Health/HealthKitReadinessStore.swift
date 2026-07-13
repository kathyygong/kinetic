import Foundation

#if canImport(HealthKit)
import HealthKit
#endif

struct HealthKitReadinessSummary {
    var entry: ReadinessEntry
    var dailyStatus: DailyHealthSyncStatus
}

enum HealthKitReadinessError: Error {
    case unavailable
    case permissionDenied
    case noSupportedMetrics
}

protocol ReadinessProviding {
    func requestAuthorization() async throws -> PermissionState
    func summarizeLocalDay(_ date: Date) async throws -> HealthKitReadinessSummary
}

final class HealthKitReadinessStore: ReadinessProviding {
    #if canImport(HealthKit)
    private let store = HKHealthStore()
    #endif

    func requestAuthorization() async throws -> PermissionState {
        #if canImport(HealthKit)
        guard HKHealthStore.isHealthDataAvailable() else {
            throw HealthKitReadinessError.unavailable
        }

        let types = supportedReadTypes()
        try await withCheckedThrowingContinuation { continuation in
            store.requestAuthorization(toShare: [], read: types) { success, error in
                if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: success ? .granted : .denied)
                }
            }
        }
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

        async let sleep = sleepHours(start: start, end: end)
        async let hrv = averageQuantity(
            identifier: .heartRateVariabilitySDNN,
            unit: HKUnit.secondUnit(with: .milli),
            start: start,
            end: end
        )
        async let resting = averageQuantity(
            identifier: .restingHeartRate,
            unit: HKUnit.count().unitDivided(by: .minute()),
            start: start,
            end: end
        )

        let sleepValue = try await sleep
        let hrvValue = try await hrv
        let restingValue = try await resting

        let coverage: [String: CoverageState] = [
            HealthMetric.sleep.rawValue: sleepValue == nil ? .missing : .complete,
            HealthMetric.hrv.rawValue: hrvValue == nil ? .missing : .complete,
            HealthMetric.restingHeartRate.rawValue: restingValue == nil ? .missing : .complete
        ]

        let completeCount = coverage.values.filter { $0 == .complete }.count
        guard completeCount > 0 else {
            throw HealthKitReadinessError.noSupportedMetrics
        }

        let now = Date()
        let entry = ReadinessEntry(
            date: Self.localDateKey(start),
            sleepHours: sleepValue.map { Self.round($0, places: 2) },
            hrv: hrvValue.map { Self.round($0, places: 2) },
            restingHeartRate: restingValue.map { Self.round($0, places: 0) },
            fatigueLevel: nil,
            sorenessLevel: nil,
            source: .healthkit,
            updatedAt: now
        )

        let confidence: ConfidenceBucket = completeCount >= 2 ? .moderate : .low
        let status: DailySyncStatus = completeCount == HealthMetric.allCases.count ? .synced : .partial

        return HealthKitReadinessSummary(
            entry: entry,
            dailyStatus: DailyHealthSyncStatus(
                status: status,
                confidence: confidence,
                coverage: coverage,
                conflict: .none
            )
        )
        #else
        throw HealthKitReadinessError.unavailable
        #endif
    }

    #if canImport(HealthKit)
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

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
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

                let total = (samples as? [HKCategorySample] ?? [])
                    .filter { sample in
                        if #available(iOS 16.0, *) {
                            return sample.value == HKCategoryValueSleepAnalysis.asleepCore.rawValue ||
                                sample.value == HKCategoryValueSleepAnalysis.asleepDeep.rawValue ||
                                sample.value == HKCategoryValueSleepAnalysis.asleepREM.rawValue ||
                                sample.value == HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue
                        }
                        return sample.value == HKCategoryValueSleepAnalysis.asleep.rawValue
                    }
                    .reduce(0.0) { partial, sample in
                        partial + sample.endDate.timeIntervalSince(sample.startDate)
                    }

                continuation.resume(returning: total > 0 ? total / 3600.0 : nil)
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

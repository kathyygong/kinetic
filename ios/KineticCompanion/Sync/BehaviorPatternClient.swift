import Foundation

#if canImport(FirebaseAuth)
import FirebaseAuth
#endif

#if canImport(FirebaseFirestore)
import FirebaseFirestore
#endif

enum BehaviorPatternFailureCode: String, Codable {
    case authRequired = "auth_required"
    case offline
    case timeout
    case backendUnavailable = "backend_unavailable"
    case invalidResponse = "invalid_response"
    case unknown
}

struct BehaviorPatternRequestError: Error, Equatable {
    var code: BehaviorPatternFailureCode
    var status: Int?
}

protocol BehaviorPatternNetworking {
    func fetch(
        request: BehaviorInsightsRequest,
        idToken: String
    ) async throws -> BehaviorInsightsResponse
}

protocol BehaviorRecommendationHistoryReading {
    func read() async throws -> MobileCheckinRecommendationLog?
}

enum BehaviorRecommendationHistoryError: Error {
    case signedOut
    case unavailable
    case invalidDomain
}

final class FirestoreBehaviorRecommendationHistoryReader:
    BehaviorRecommendationHistoryReading {
    func read() async throws -> MobileCheckinRecommendationLog? {
        #if canImport(FirebaseFirestore) && canImport(FirebaseAuth)
        guard let userID = Auth.auth().currentUser?.uid else {
            throw BehaviorRecommendationHistoryError.signedOut
        }
        let snapshot = try await Firestore.firestore()
            .collection("users")
            .document(userID)
            .collection("kinetic")
            .document("recommendations")
            .getDocument()
        guard let document = snapshot.data() else { return nil }
        if document["deleted"] as? Bool == true { return nil }
        guard document["schemaVersion"] as? Int == 1,
              let payload = document["payload"],
              !(payload is NSNull),
              JSONSerialization.isValidJSONObject(payload) else {
            throw BehaviorRecommendationHistoryError.invalidDomain
        }
        do {
            return try JSONDecoder().decode(
                MobileCheckinRecommendationLog.self,
                from: JSONSerialization.data(withJSONObject: payload)
            )
        } catch {
            throw BehaviorRecommendationHistoryError.invalidDomain
        }
        #else
        throw BehaviorRecommendationHistoryError.unavailable
        #endif
    }
}

final class URLSessionBehaviorPatternClient: BehaviorPatternNetworking {
    private let baseURL: URL
    private let session: URLSession
    private let timeout: TimeInterval

    init(
        baseURL: URL = MobileTodayAppConfiguration.apiBaseURL,
        session: URLSession = .shared,
        timeout: TimeInterval = 30
    ) {
        self.baseURL = baseURL
        self.session = session
        self.timeout = timeout
    }

    func fetch(
        request: BehaviorInsightsRequest,
        idToken: String
    ) async throws -> BehaviorInsightsResponse {
        guard !idToken.isEmpty else {
            throw BehaviorPatternRequestError(code: .authRequired)
        }
        do {
            try BehaviorPatternValidator.validate(request)
        } catch {
            throw BehaviorPatternRequestError(code: .invalidResponse)
        }
        let url = baseURL.appendingPathComponent("behavior-insights")
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.timeoutInterval = timeout
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        urlRequest.httpBody = try JSONEncoder().encode(request)

        do {
            let (data, response) = try await session.data(for: urlRequest)
            guard let http = response as? HTTPURLResponse else {
                throw BehaviorPatternRequestError(code: .invalidResponse)
            }
            guard (200...299).contains(http.statusCode) else {
                throw BehaviorPatternRequestError(
                    code: Self.failure(for: http.statusCode),
                    status: http.statusCode
                )
            }
            do {
                return try BehaviorInsightsResponse.decode(data)
            } catch {
                throw BehaviorPatternRequestError(code: .invalidResponse)
            }
        } catch let error as BehaviorPatternRequestError {
            throw error
        } catch let error as URLError {
            switch error.code {
            case .cancelled:
                throw CancellationError()
            case .timedOut:
                throw BehaviorPatternRequestError(code: .timeout)
            case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost,
                 .cannotFindHost, .dnsLookupFailed, .internationalRoamingOff:
                throw BehaviorPatternRequestError(code: .offline)
            default:
                throw BehaviorPatternRequestError(code: .unknown)
            }
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw BehaviorPatternRequestError(code: .unknown)
        }
    }

    static func failure(for status: Int) -> BehaviorPatternFailureCode {
        if status == 401 || status == 403 { return .authRequired }
        if status == 408 || status == 429 || status == 504 { return .timeout }
        if status >= 500 { return .backendUnavailable }
        return .invalidResponse
    }
}

import Foundation

struct MobileIntakeRequestError: Error, Equatable {
    var code: MobileIntakeFailureCode
    var status: Int?
}

protocol MobileIntakeNetworking {
    func route(
        request: MobileIntakeRequest,
        idToken: String
    ) async throws -> MobileIntakeResponse
}

final class URLSessionMobileIntakeClient: MobileIntakeNetworking {
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

    func route(
        request: MobileIntakeRequest,
        idToken: String
    ) async throws -> MobileIntakeResponse {
        guard !idToken.isEmpty else {
            throw MobileIntakeRequestError(code: .authRequired)
        }
        try MobileIntakeValidator.validate(request)
        let url = baseURL
            .appendingPathComponent("ai")
            .appendingPathComponent("parse-intake")
        var urlRequest = URLRequest(url: url)
        urlRequest.httpMethod = "POST"
        urlRequest.timeoutInterval = timeout
        urlRequest.setValue("application/json", forHTTPHeaderField: "Content-Type")
        urlRequest.setValue("Bearer \(idToken)", forHTTPHeaderField: "Authorization")
        urlRequest.httpBody = try JSONEncoder().encode(request)

        do {
            let (data, response) = try await session.data(for: urlRequest)
            guard let http = response as? HTTPURLResponse else {
                throw MobileIntakeRequestError(code: .invalidResponse)
            }
            guard (200...299).contains(http.statusCode) else {
                throw MobileIntakeRequestError(
                    code: Self.failure(for: http.statusCode),
                    status: http.statusCode
                )
            }
            do {
                return try MobileIntakeResponse.decode(data)
            } catch {
                throw MobileIntakeRequestError(code: .invalidResponse)
            }
        } catch let error as MobileIntakeRequestError {
            throw error
        } catch let error as URLError {
            switch error.code {
            case .timedOut:
                throw MobileIntakeRequestError(code: .timeout)
            case .notConnectedToInternet, .networkConnectionLost, .cannotConnectToHost,
                 .cannotFindHost, .dnsLookupFailed, .internationalRoamingOff:
                throw MobileIntakeRequestError(code: .offline)
            default:
                throw MobileIntakeRequestError(code: .unknown)
            }
        } catch {
            throw MobileIntakeRequestError(code: .unknown)
        }
    }

    static func failure(for status: Int) -> MobileIntakeFailureCode {
        if status == 401 || status == 403 { return .authRequired }
        if status == 408 || status == 504 { return .timeout }
        if status >= 500 { return .backendUnavailable }
        return .invalidResponse
    }
}

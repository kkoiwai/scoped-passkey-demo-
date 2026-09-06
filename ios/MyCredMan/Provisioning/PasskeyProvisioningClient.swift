import Foundation

/// HTTP Client for exchanging OAuth 2.0 tokens and interacting with the Passkey Provisioning API.
/// Mirrors Android's PasskeyProvisioningClient.
public final class PasskeyProvisioningClient {
    private let session: URLSession
    
    public struct TokenResponse: Codable {
        public let accessToken: String
        public let tokenType: String?
        public let expiresIn: Int?
        public let refreshToken: String?
        public let scope: String?
        
        enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
            case tokenType = "token_type"
            case expiresIn = "expires_in"
            case refreshToken = "refresh_token"
            case scope = "scope"
        }
    }
    
    public enum ClientError: LocalizedError {
        case httpError(statusCode: Int, body: String)
        case invalidResponse
        case networkError(String)
        
        public var errorDescription: String? {
            switch self {
            case .httpError(let code, let body):
                return "HTTP \(code): \(body)"
            case .invalidResponse:
                return "サーバーからの応答が無効です。"
            case .networkError(let msg):
                return "ネットワークエラー: \(msg)"
            }
        }
    }
    
    public init(session: URLSession = .shared) {
        self.session = session
    }
    
    /// Exchanges an authorization code for an OAuth access token using PKCE.
    public func exchangeCodeForToken(
        tokenEndpoint: String = AuthConfig.tokenEndpoint,
        code: String,
        codeVerifier: String,
        clientId: String = AuthConfig.clientId,
        redirectUri: String = AuthConfig.redirectUri
    ) async throws -> TokenResponse {
        guard let url = URL(string: tokenEndpoint) else {
            throw ClientError.networkError("Invalid token endpoint URL: \(tokenEndpoint)")
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        
        let parameters = [
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": codeVerifier,
            "client_id": clientId,
            "redirect_uri": redirectUri
        ]
        
        let bodyString = parameters.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0.value)" }
            .joined(separator: "&")
        request.httpBody = bodyString.data(using: .utf8)
        
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ClientError.invalidResponse
        }
        
        let responseBody = String(data: data, encoding: .utf8) ?? ""
        guard (200...299).contains(httpResponse.statusCode) else {
            throw ClientError.httpError(statusCode: httpResponse.statusCode, body: responseBody)
        }
        
        let decoder = JSONDecoder()
        return try decoder.decode(TokenResponse.self, from: data)
    }
    
    /// Step 1: Fetches WebAuthn PublicKeyCredentialCreationOptions JSON from the Passkey Provisioning API.
    public func fetchCreationOptions(
        creationOptionsEndpoint: String = AuthConfig.creationOptionsEndpoint,
        accessToken: String
    ) async throws -> String {
        guard let url = URL(string: creationOptionsEndpoint) else {
            throw ClientError.networkError("Invalid creation options endpoint URL: \(creationOptionsEndpoint)")
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        
        let bodyJson = """
        {"authenticatorAttachment":"platform","userVerification":"required"}
        """
        request.httpBody = bodyJson.data(using: .utf8)
        
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ClientError.invalidResponse
        }
        
        let responseBody = String(data: data, encoding: .utf8) ?? ""
        guard (200...299).contains(httpResponse.statusCode) else {
            throw ClientError.httpError(statusCode: httpResponse.statusCode, body: responseBody)
        }
        
        return responseBody
    }
    
    /// Step 2: Registers the newly created passkey with the Passkey Provisioning API.
    public func registerPasskey(
        registerEndpoint: String = AuthConfig.registerEndpoint,
        accessToken: String,
        registrationResponseJson: String
    ) async throws -> String {
        guard let url = URL(string: registerEndpoint) else {
            throw ClientError.networkError("Invalid register endpoint URL: \(registerEndpoint)")
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        
        request.httpBody = registrationResponseJson.data(using: .utf8)
        
        let (data, response) = try await session.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw ClientError.invalidResponse
        }
        
        let responseBody = String(data: data, encoding: .utf8) ?? ""
        guard (200...299).contains(httpResponse.statusCode) else {
            throw ClientError.httpError(statusCode: httpResponse.statusCode, body: responseBody)
        }
        
        return responseBody.isEmpty ? "{\"status\":\"ok\"}" : responseBody
    }
}

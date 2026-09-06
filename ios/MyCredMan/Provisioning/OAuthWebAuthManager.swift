import Foundation
import AuthenticationServices

#if canImport(UIKit)
import UIKit
#endif

/// Manages OAuth 2.0 Authorization flow using ASWebAuthenticationSession with PKCE.
/// Mirrors Android's OAuthAuthTabManager.
public final class OAuthWebAuthManager: NSObject, ASWebAuthenticationPresentationContextProviding {
    
    public struct AuthSession {
        public let state: String
        public let codeVerifier: String
        public let redirectUri: String
    }
    
    public enum OAuthError: LocalizedError {
        case userCancelled
        case stateMismatch
        case missingCode
        case oauthServerError(String)
        case invalidUrl
        case unknown(String)
        
        public var errorDescription: String? {
            switch self {
            case .userCancelled:
                return "ユーザーによって認可がキャンセルされました。"
            case .stateMismatch:
                return "State mismatch! Possible CSRF attack."
            case .missingCode:
                return "認可コードが見つかりません。"
            case .oauthServerError(let msg):
                return "OAuth エラー: \(msg)"
            case .invalidUrl:
                return "無効な認可URLです。"
            case .unknown(let msg):
                return "認可失敗: \(msg)"
            }
        }
    }
    
    private var currentSession: AuthSession?
    private var webAuthSession: ASWebAuthenticationSession?
    
    // MARK: - ASWebAuthenticationPresentationContextProviding
    #if canImport(UIKit)
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let windowScene = UIApplication.shared.connectedScenes.first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene,
           let window = windowScene.windows.first(where: { $0.isKeyWindow }) {
            return window
        }
        return ASPresentationAnchor()
    }
    #endif

    /// Starts OAuth 2.0 PKCE flow by presenting ASWebAuthenticationSession.
    @MainActor
    public func startAuthorization() async throws -> (code: String, codeVerifier: String) {
        let codeVerifier = PkceUtil.generateCodeVerifier()
        let codeChallenge = PkceUtil.generateCodeChallenge(verifier: codeVerifier)
        let state = UUID().uuidString
        
        guard var components = URLComponents(string: AuthConfig.authorizationEndpoint) else {
            throw OAuthError.invalidUrl
        }
        
        components.queryItems = [
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "client_id", value: AuthConfig.clientId),
            URLQueryItem(name: "redirect_uri", value: AuthConfig.redirectUri),
            URLQueryItem(name: "scope", value: AuthConfig.scope),
            URLQueryItem(name: "code_challenge", value: codeChallenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state)
        ]
        
        guard let authUrl = components.url else {
            throw OAuthError.invalidUrl
        }
        
        let session = AuthSession(
            state: state,
            codeVerifier: codeVerifier,
            redirectUri: AuthConfig.redirectUri
        )
        self.currentSession = session
        
        return try await withCheckedThrowingContinuation { continuation in
            let webSession = ASWebAuthenticationSession(
                url: authUrl,
                callbackURLScheme: AuthConfig.redirectScheme
            ) { [weak self] callbackUrl, error in
                guard let self = self else { return }
                
                if let error = error {
                    if let authError = error as? ASWebAuthenticationSessionError,
                       authError.code == .canceledLogin {
                        continuation.resume(throwing: OAuthError.userCancelled)
                    } else {
                        continuation.resume(throwing: OAuthError.unknown(error.localizedDescription))
                    }
                    self.currentSession = nil
                    return
                }
                
                guard let callbackUrl = callbackUrl else {
                    continuation.resume(throwing: OAuthError.unknown("No callback URL returned."))
                    self.currentSession = nil
                    return
                }
                
                do {
                    let (code, verifier) = try self.parseCallbackUrl(callbackUrl, expectedState: session.state, codeVerifier: session.codeVerifier)
                    continuation.resume(returning: (code, verifier))
                } catch {
                    continuation.resume(throwing: error)
                }
                self.currentSession = nil
            }
            
            // Ephemeral session: Do not share cookies or credentials with Safari (mirrors Android AuthTab ephemeral mode)
            webSession.prefersEphemeralWebBrowserSession = true
            webSession.presentationContextProvider = self
            self.webAuthSession = webSession
            
            if !webSession.start() {
                continuation.resume(throwing: OAuthError.unknown("Failed to start ASWebAuthenticationSession."))
                self.currentSession = nil
            }
        }
    }
    
    /// Fallback for handling deep links received via onOpenURL.
    public func handleRedirectUrl(_ url: URL) throws -> (code: String, codeVerifier: String) {
        guard let session = currentSession else {
            throw OAuthError.unknown("No active authorization session.")
        }
        let result = try parseCallbackUrl(url, expectedState: session.state, codeVerifier: session.codeVerifier)
        currentSession = nil
        return result
    }
    
    private func parseCallbackUrl(_ url: URL, expectedState: String, codeVerifier: String) throws -> (code: String, codeVerifier: String) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            throw OAuthError.invalidUrl
        }
        
        let queryItems = components.queryItems ?? []
        
        if let error = queryItems.first(where: { $0.name == "error" })?.value {
            let desc = queryItems.first(where: { $0.name == "error_description" })?.value ?? error
            throw OAuthError.oauthServerError(desc)
        }
        
        let state = queryItems.first(where: { $0.name == "state" })?.value
        if state != expectedState {
            throw OAuthError.stateMismatch
        }
        
        guard let code = queryItems.first(where: { $0.name == "code" })?.value, !code.isEmpty else {
            throw OAuthError.missingCode
        }
        
        return (code, codeVerifier)
    }
}

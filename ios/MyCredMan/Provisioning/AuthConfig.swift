import Foundation

/// Build-time configuration for OAuth 2.0 and Passkey Provisioning API.
/// Modify these constants to match your IdP and Passkey Provisioning Server.
public enum AuthConfig {
    // MARK: - OAuth 2.0 Endpoints & Parameters
    public static let authorizationEndpoint: String = "https://sp.exarnp1e.com/oauth/authorize"
    public static let tokenEndpoint: String = "https://sp.exarnp1e.com/oauth/token"
    public static let clientId: String = "mycredman-client"
    public static let redirectUri: String = "mycredman://oauth/callback"
    public static let redirectScheme: String = "mycredman"
    public static let scope: String = "openid profile passkeys.provision"

    // MARK: - Passkey Provisioning API Endpoints (Tim Cappalli specification)
    public static let creationOptionsEndpoint: String = "https://sp.exarnp1e.com/passkeys/creation-options"
    public static let registerEndpoint: String = "https://sp.exarnp1e.com/passkeys/register"
}

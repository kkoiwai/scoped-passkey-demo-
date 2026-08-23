package com.example.mycredman.provisioning

/**
 * Build-time configuration for OAuth 2.0 and Passkey Provisioning API.
 * Modify these constants to match your IdP and Passkey Provisioning Server.
 */
object AuthConfig {
    // OAuth 2.0 Endpoints & Parameters
    const val AUTHORIZATION_ENDPOINT: String = "https://sp.exarnp1e.com/oauth/authorize"
    const val TOKEN_ENDPOINT: String = "https://sp.exarnp1e.com/oauth/token"
    const val CLIENT_ID: String = "mycredman-client"
    const val REDIRECT_URI: String = "mycredman://oauth/callback"
    const val REDIRECT_SCHEME: String = "mycredman"
    const val SCOPE: String = "openid profile passkeys.provision"

    // Passkey Provisioning API Endpoints (Tim Cappalli specification)
    const val CREATION_OPTIONS_ENDPOINT: String = "https://sp.exarnp1e.com/passkeys/creation-options"
    const val REGISTER_ENDPOINT: String = "https://sp.exarnp1e.com/passkeys/register"
}

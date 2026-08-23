package com.example.mycredman.provisioning

import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.activity.result.ActivityResultLauncher
import androidx.browser.auth.AuthTabIntent
import androidx.browser.auth.ExperimentalAuthTab
import java.util.UUID

/**
 * Manages OAuth 2.0 Authorization flow using Auth Tab (AuthTabIntent) with PKCE.
 */
@OptIn(ExperimentalAuthTab::class)
class OAuthAuthTabManager(
    private val authConfig: AuthConfig = AuthConfig
) {
    companion object {
        private const val TAG = "OAuthAuthTabManager"
    }

    /**
     * Session data for an in-flight authorization request.
     */
    data class AuthSession(
        val state: String,
        val codeVerifier: String,
        val redirectUri: String
    )

    private var currentSession: AuthSession? = null

    /**
     * Prepares PKCE parameters, builds the authorization URI, and launches Auth Tab.
     */
    fun launchAuthTab(
        launcher: ActivityResultLauncher<Intent>,
        authorizationEndpoint: String = authConfig.AUTHORIZATION_ENDPOINT,
        clientId: String = authConfig.CLIENT_ID,
        redirectUri: String = authConfig.REDIRECT_URI,
        redirectScheme: String = authConfig.REDIRECT_SCHEME,
        scope: String = authConfig.SCOPE
    ): Result<AuthSession> {
        return runCatching {
            val codeVerifier = PkceUtil.generateCodeVerifier()
            val codeChallenge = PkceUtil.generateCodeChallenge(codeVerifier)
            val state = UUID.randomUUID().toString()

            val authUri = Uri.parse(authorizationEndpoint).buildUpon()
                .appendQueryParameter("response_type", "code")
                .appendQueryParameter("client_id", clientId)
                .appendQueryParameter("redirect_uri", redirectUri)
                .appendQueryParameter("scope", scope)
                .appendQueryParameter("code_challenge", codeChallenge)
                .appendQueryParameter("code_challenge_method", "S256")
                .appendQueryParameter("state", state)
                .build()

            val session = AuthSession(
                state = state,
                codeVerifier = codeVerifier,
                redirectUri = redirectUri
            )
            currentSession = session

            Log.d(TAG, "Launching Auth Tab with URI: $authUri, redirectScheme: $redirectScheme")

            val authTabIntent = AuthTabIntent.Builder()
                .setEphemeralBrowsingEnabled(true)
                .build()

            authTabIntent.launch(launcher, authUri, redirectScheme)
            session
        }
    }

    /**
     * Parses the result received from the Auth Tab callback via ActivityResultLauncher.
     *
     * @return Result containing Pair(authCode, codeVerifier)
     */
    fun handleAuthTabResult(result: AuthTabIntent.AuthResult): Result<Pair<String, String>> {
        val session = currentSession
            ?: return Result.failure(IllegalStateException("No active authorization session found."))

        Log.d(TAG, "Auth Tab result received. ResultCode: ${result.resultCode}, ResultUri: ${result.resultUri}")

        return when (result.resultCode) {
            AuthTabIntent.RESULT_OK -> {
                val resultUri = result.resultUri
                    ?: return Result.failure(IllegalStateException("Auth Tab returned RESULT_OK but resultUri is null."))

                val error = resultUri.getQueryParameter("error")
                if (!error.isNullOrEmpty()) {
                    val errorDescription = resultUri.getQueryParameter("error_description") ?: error
                    return Result.failure(Exception("OAuth Error: $errorDescription ($error)"))
                }

                val returnedState = resultUri.getQueryParameter("state")
                if (returnedState != session.state) {
                    return Result.failure(SecurityException("State mismatch! Possible CSRF attack. Expected: ${session.state}, Got: $returnedState"))
                }

                val code = resultUri.getQueryParameter("code")
                if (code.isNullOrEmpty()) {
                    return Result.failure(IllegalStateException("No authorization code found in redirect URI."))
                }

                val codeVerifier = session.codeVerifier
                currentSession = null // Clear session
                Result.success(Pair(code, codeVerifier))
            }
            AuthTabIntent.RESULT_CANCELED -> {
                currentSession = null
                Result.failure(UserCancelledException("User cancelled the authentication in Auth Tab."))
            }
            AuthTabIntent.RESULT_VERIFICATION_FAILED -> {
                currentSession = null
                Result.failure(SecurityException("Auth Tab verification failed (e.g., origin or scheme verification failed)."))
            }
            AuthTabIntent.RESULT_VERIFICATION_TIMED_OUT -> {
                currentSession = null
                Result.failure(Exception("Auth Tab verification timed out."))
            }
            else -> {
                currentSession = null
                Result.failure(Exception("Auth Tab finished with unknown result code: ${result.resultCode}"))
            }
        }
    }

    /**
     * Helper to parse redirect Intent if redirected via custom scheme Intent Filter fallback.
     */
    fun handleRedirectUri(uri: Uri): Result<Pair<String, String>> {
        val session = currentSession
            ?: return Result.failure(IllegalStateException("No active authorization session found."))

        val error = uri.getQueryParameter("error")
        if (!error.isNullOrEmpty()) {
            val errorDesc = uri.getQueryParameter("error_description") ?: error
            currentSession = null
            return Result.failure(Exception("OAuth Error: $errorDesc ($error)"))
        }

        val returnedState = uri.getQueryParameter("state")
        if (returnedState != session.state) {
            currentSession = null
            return Result.failure(SecurityException("State mismatch! Expected: ${session.state}, Got: $returnedState"))
        }

        val code = uri.getQueryParameter("code")
            ?: return Result.failure(IllegalStateException("No authorization code in redirect URI: $uri"))

        val codeVerifier = session.codeVerifier
        currentSession = null
        return Result.success(Pair(code, codeVerifier))
    }

    class UserCancelledException(message: String) : Exception(message)
}

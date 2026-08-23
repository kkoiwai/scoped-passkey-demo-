package com.example.mycredman.provisioning

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.FormBody
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * Data model for OAuth 2.0 token response.
 */
@Serializable
data class TokenResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("token_type") val tokenType: String? = null,
    @SerialName("expires_in") val expiresIn: Long? = null,
    @SerialName("refresh_token") val refreshToken: String? = null,
    @SerialName("scope") val scope: String? = null,
    @SerialName("id_token") val idToken: String? = null
)

/**
 * Client for exchanging OAuth 2.0 tokens and interacting with the Passkey Provisioning API.
 */
class PasskeyProvisioningClient(
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build(),
    private val json: Json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }
) {

    /**
     * Exchanges an authorization code for an OAuth access token using PKCE.
     */
    suspend fun exchangeCodeForToken(
        tokenEndpoint: String,
        code: String,
        codeVerifier: String,
        clientId: String,
        redirectUri: String
    ): Result<TokenResponse> = withContext(Dispatchers.IO) {
        runCatching {
            val formBody = FormBody.Builder()
                .add("grant_type", "authorization_code")
                .add("code", code)
                .add("code_verifier", codeVerifier)
                .add("client_id", clientId)
                .add("redirect_uri", redirectUri)
                .build()

            val request = Request.Builder()
                .url(tokenEndpoint)
                .post(formBody)
                .header("Accept", "application/json")
                .build()

            httpClient.newCall(request).execute().use { response ->
                val body = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw IOException("Token exchange failed with HTTP ${response.code}: $body")
                }
                json.decodeFromString<TokenResponse>(body)
            }
        }
    }

    /**
     * Step 1: Fetches WebAuthn PublicKeyCredentialCreationOptions JSON from the Passkey Provisioning API.
     */
    suspend fun fetchCreationOptions(
        creationOptionsEndpoint: String,
        accessToken: String
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val mediaType = "application/json; charset=utf-8".toMediaType()
            val requestBodyJson = """{"authenticatorAttachment":"platform","userVerification":"required"}"""
            val body = requestBodyJson.toRequestBody(mediaType)

            val request = Request.Builder()
                .url(creationOptionsEndpoint)
                .post(body)
                .header("Authorization", "Bearer $accessToken")
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .build()

            httpClient.newCall(request).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw IOException("Fetching creation options failed with HTTP ${response.code}: $responseBody")
                }
                responseBody
            }
        }
    }

    /**
     * Step 2: Registers the newly created passkey with the Passkey Provisioning API.
     */
    suspend fun registerPasskey(
        registerEndpoint: String,
        accessToken: String,
        registrationResponseJson: String
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val mediaType = "application/json; charset=utf-8".toMediaType()
            val body = registrationResponseJson.toRequestBody(mediaType)

            val request = Request.Builder()
                .url(registerEndpoint)
                .post(body)
                .header("Authorization", "Bearer $accessToken")
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .build()

            httpClient.newCall(request).execute().use { response ->
                val responseBody = response.body?.string().orEmpty()
                if (!response.isSuccessful) {
                    throw IOException("Passkey registration failed with HTTP ${response.code}: $responseBody")
                }
                if (responseBody.isNotBlank()) responseBody else "{\"status\":\"ok\"}"
            }
        }
    }
}

package com.example.mycredman

import android.net.Uri
import androidx.browser.auth.AuthTabIntent
import com.example.mycredman.provisioning.AuthConfig
import com.example.mycredman.provisioning.OAuthAuthTabManager
import com.example.mycredman.provisioning.TokenResponse
import kotlinx.serialization.json.Json
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class OAuthAuthTabManagerTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
    }

    @Test
    fun testTokenResponseDeserialization() {
        val sampleJson = """
            {
                "access_token": "eyJhbGciOi...",
                "token_type": "Bearer",
                "expires_in": 3600,
                "refresh_token": "r_12345",
                "scope": "openid profile passkeys.provision"
            }
        """.trimIndent()

        val tokenResponse = json.decodeFromString<TokenResponse>(sampleJson)
        assertEquals("eyJhbGciOi...", tokenResponse.accessToken)
        assertEquals("Bearer", tokenResponse.tokenType)
        assertEquals(3600L, tokenResponse.expiresIn)
        assertEquals("r_12345", tokenResponse.refreshToken)
        assertEquals("openid profile passkeys.provision", tokenResponse.scope)
    }

    @Test
    fun testAuthConfigDefaults() {
        assertEquals("https://sp.exarnp1e.com/oauth/authorize", AuthConfig.AUTHORIZATION_ENDPOINT)
        assertEquals("https://sp.exarnp1e.com/oauth/token", AuthConfig.TOKEN_ENDPOINT)
        assertEquals("mycredman-client", AuthConfig.CLIENT_ID)
        assertEquals("mycredman://oauth/callback", AuthConfig.REDIRECT_URI)
        assertEquals("mycredman", AuthConfig.REDIRECT_SCHEME)
        assertEquals("openid profile passkeys.provision", AuthConfig.SCOPE)
        assertEquals("https://sp.exarnp1e.com/passkeys/creation-options", AuthConfig.CREATION_OPTIONS_ENDPOINT)
        assertEquals("https://sp.exarnp1e.com/passkeys/register", AuthConfig.REGISTER_ENDPOINT)
    }
}

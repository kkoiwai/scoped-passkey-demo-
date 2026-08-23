package com.example.mycredman.provisioning

import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * Utility for Proof Key for Code Exchange (PKCE) RFC 7636.
 */
object PkceUtil {

    /**
     * Generates a cryptographically random code verifier.
     * Uses 32 bytes of entropy encoded as a URL-safe Base64 string without padding (43 characters).
     */
    fun generateCodeVerifier(): String {
        val secureRandom = SecureRandom()
        val code = ByteArray(32)
        secureRandom.nextBytes(code)
        return Base64.getUrlEncoder().withoutPadding().encodeToString(code)
    }

    /**
     * Generates a SHA-256 code challenge from the given code verifier.
     */
    fun generateCodeChallenge(codeVerifier: String): String {
        val bytes = codeVerifier.toByteArray(StandardCharsets.US_ASCII)
        val messageDigest = MessageDigest.getInstance("SHA-256")
        messageDigest.update(bytes, 0, bytes.size)
        val digest = messageDigest.digest()
        return Base64.getUrlEncoder().withoutPadding().encodeToString(digest)
    }
}

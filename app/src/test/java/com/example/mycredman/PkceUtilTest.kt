package com.example.mycredman

import com.example.mycredman.provisioning.PkceUtil
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.regex.Pattern

class PkceUtilTest {

    @Test
    fun testGenerateCodeVerifierFormat() {
        val verifier1 = PkceUtil.generateCodeVerifier()
        val verifier2 = PkceUtil.generateCodeVerifier()

        assertNotNull(verifier1)
        assertNotNull(verifier2)
        assertNotEquals(verifier1, verifier2)

        // RFC 7636 unreserved characters [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
        // Base64URL without padding regex: ^[A-Za-z0-9\-_]+$
        val pattern = Pattern.compile("^[A-Za-z0-9_-]+$")
        assertTrue(pattern.matcher(verifier1).matches())
        assertTrue(pattern.matcher(verifier2).matches())

        // 32 bytes encoded in Base64 without padding gives 43 characters
        assertEquals(43, verifier1.length)
        assertEquals(43, verifier2.length)
    }

    @Test
    fun testGenerateCodeChallengeFormat() {
        val verifier = PkceUtil.generateCodeVerifier()
        val challenge1 = PkceUtil.generateCodeChallenge(verifier)
        val challenge2 = PkceUtil.generateCodeChallenge(verifier)

        // Same verifier must yield identical challenge
        assertEquals(challenge1, challenge2)

        // SHA-256 (32 bytes) Base64URL without padding is 43 characters
        assertEquals(43, challenge1.length)

        val pattern = Pattern.compile("^[A-Za-z0-9_-]+$")
        assertTrue(pattern.matcher(challenge1).matches())
    }

    @Test
    fun testKnownPkceChallengeVector() {
        // RFC 7636 Appendix B test vector
        val verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
        val expectedChallenge = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        val calculatedChallenge = PkceUtil.generateCodeChallenge(verifier)

        assertEquals(expectedChallenge, calculatedChallenge)
    }
}

package com.example.mycredman.provisioning

import android.content.Context
import android.util.Log
import androidx.credentials.webauthn.AuthenticatorAttestationResponse
import androidx.credentials.webauthn.FidoPublicKeyCredential
import androidx.credentials.webauthn.PublicKeyCredentialCreationOptions
import com.example.mycredman.CredmanUtils
import com.example.mycredman.MyCredentialDataManager
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.math.BigInteger
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.interfaces.ECPublicKey
import java.security.spec.ECGenParameterSpec
import java.security.spec.ECPoint

/**
 * Directly generates EC P-256 key pair, saves into MyCredentialDataManager,
 * and creates WebAuthn registration response JSON without invoking the OS Credential Manager API.
 */
object DirectPasskeyCreator {
    private const val TAG = "DirectPasskeyCreator"

    private val jsonSerializer = Json {
        encodeDefaults = true
        ignoreUnknownKeys = true
        isLenient = true
    }

    @Serializable
    private data class CreatePublicKeyCredentialResponseJson(
        val id: String,
        val rawId: String,
        val response: Response,
        val authenticatorAttachment: String = "platform",
        val clientExtensionResults: EmptyClass = EmptyClass(),
        val type: String = "public-key"
    ) {
        @Serializable
        data class Response(
            val clientDataJSON: String? = null,
            var authenticatorData: String? = null,
            val transports: List<String> = listOf("internal"),
            var publicKey: String? = null,
            var publicKeyAlgorithm: Long? = -7,
            val attestationObject: String? = null
        )
        @Serializable
        class EmptyClass
    }

    /**
     * Directly generates and saves a passkey to MyCredentialDataManager.
     */
    fun createAndSavePasskey(context: Context, creationOptionsJson: String): String {
        Log.d(TAG, "Directly creating passkey from options: $creationOptionsJson")
        val request = PublicKeyCredentialCreationOptions(creationOptionsJson)

        // 1. Generate 32-byte credential ID
        val credentialId = ByteArray(32)
        SecureRandom().nextBytes(credentialId)

        // 2. Generate EC P-256 KeyPair
        val spec = ECGenParameterSpec("secp256r1")
        val keyPairGen = KeyPairGenerator.getInstance("EC")
        keyPairGen.initialize(spec)
        val keyPair = keyPairGen.genKeyPair()

        val rpid = request.rp.id
        val origin = "https://$rpid"

        // 3. Save into local MyCredentialDataManager storage
        MyCredentialDataManager.save(
            context,
            MyCredentialDataManager.Credential(
                rpid = rpid,
                serviceName = request.rp.name,
                credentialId = credentialId,
                displayName = request.user.displayName,
                userHandle = request.user.id,
                keyPair = keyPair
            )
        )
        Log.d(TAG, "Saved passkey to MyCredentialDataManager for $rpid (user: ${request.user.displayName})")

        // 4. Construct AuthenticatorAttestationResponse with RP origin
        val response = AuthenticatorAttestationResponse(
            requestOptions = request,
            credentialId = credentialId,
            credentialPublicKey = getPublicKeyFromKeyPair(keyPair),
            origin = origin,
            up = true,
            uv = true,
            be = true,
            bs = true
        )

        val fidoCredential = FidoPublicKeyCredential(
            rawId = credentialId,
            response = response,
            authenticatorAttachment = "platform"
        )

        val credentialJson = populateEasyAccessorFields(fidoCredential.json(), rpid, keyPair, credentialId)
        Log.d(TAG, "Generated registration response JSON: $credentialJson")
        return credentialJson
    }

    private fun populateEasyAccessorFields(json: String, rpid: String, keyPair: KeyPair, credentialId: ByteArray): String {
        val response = jsonSerializer.decodeFromString<CreatePublicKeyCredentialResponseJson>(json)
        response.response.publicKeyAlgorithm = -7 // ES256
        response.response.publicKey = CredmanUtils.b64Encode(keyPair.public.encoded)
        response.response.authenticatorData = getAuthData(rpid, credentialId, keyPair)
        return jsonSerializer.encodeToString(response)
    }

    private fun getAuthData(rpid: String, credentialRawId: ByteArray, keyPair: KeyPair): String {
        val aaguidHex = "00000000000000000000000000000000"
        val rpIdHash = MessageDigest.getInstance("SHA-256").digest(rpid.toByteArray())
        val flags = byteArrayOf(0x5d.toByte())
        val signCount = byteArrayOf(0x00, 0x00, 0x00, 0x00)
        val aaguid = aaguidHex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        val credentialIdLength = byteArrayOf(0x00, credentialRawId.size.toByte())
        val credentialPublicKey = getPublicKeyFromKeyPair(keyPair)

        val retVal = rpIdHash + flags + signCount + aaguid + credentialIdLength + credentialRawId + credentialPublicKey
        return CredmanUtils.b64Encode(retVal)
    }

    private fun getPublicKeyFromKeyPair(keyPair: KeyPair?): ByteArray {
        if (keyPair == null || keyPair.public !is ECPublicKey) return ByteArray(0)
        val ecPubKey = keyPair.public as ECPublicKey
        val ecPoint: ECPoint = ecPubKey.w
        if (ecPoint.affineX.bitLength() > 256 || ecPoint.affineY.bitLength() > 256) return ByteArray(0)

        val byteX = bigIntToByteArray32(ecPoint.affineX)
        val byteY = bigIntToByteArray32(ecPoint.affineY)

        return "A5010203262001215820".chunked(2).map { it.toInt(16).toByte() }.toByteArray() +
                byteX +
                "225820".chunked(2).map { it.toInt(16).toByte() }.toByteArray() +
                byteY
    }

    private fun bigIntToByteArray32(bigInteger: BigInteger): ByteArray {
        var ba = bigInteger.toByteArray()
        if (ba.size < 32) {
            ba = ByteArray(32) + ba
        }
        return ba.copyOfRange(ba.size - 32, ba.size)
    }
}

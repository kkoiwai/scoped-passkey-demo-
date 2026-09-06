import XCTest
import CryptoKit
@testable import MyCredMan

final class DirectPasskeyCreatorTests: XCTestCase {
    
    override func setUp() {
        super.setUp()
        MyCredentialDataManager.shared.deleteAll()
    }
    
    func testPkceGeneration() {
        let verifier = PkceUtil.generateCodeVerifier()
        XCTAssertEqual(verifier.count, 43, "Verifier should be 43 base64url characters")
        
        let challenge = PkceUtil.generateCodeChallenge(verifier: verifier)
        XCTAssertFalse(challenge.isEmpty)
        XCTAssertFalse(challenge.contains("+"))
        XCTAssertFalse(challenge.contains("/"))
        XCTAssertFalse(challenge.contains("="))
    }
    
    func testDirectPasskeyCreationAndVerification() throws {
        let sampleOptionsJson = """
        {
          "challenge": "dGVzdF9jaGFsbGVuZ2VfMTIzNDU2Nzg",
          "rp": {
            "id": "sp.exarnp1e.com",
            "name": "Scoped Passkey Demo Bank"
          },
          "user": {
            "id": "dXNyXzEyMzQ1Njc4OTBhYmNkZWY",
            "name": "alice+readonly@example.com",
            "displayName": "Alice (Read-only)"
          },
          "pubKeyCredParams": [
            { "alg": -7, "type": "public-key" }
          ],
          "authenticatorSelection": {
            "authenticatorAttachment": "platform",
            "residentKey": "required",
            "userVerification": "required"
          }
        }
        """
        
        let result = try DirectPasskeyCreator.createAndSavePasskey(
            creationOptionsJson: sampleOptionsJson,
            origin: "https://sp.exarnp1e.com"
        )
        
        XCTAssertEqual(result.rpId, "sp.exarnp1e.com")
        XCTAssertEqual(result.serviceName, "Scoped Passkey Demo Bank")
        XCTAssertEqual(result.displayName, "Alice (Read-only)")
        XCTAssertEqual(result.credentialId.count, 32)
        XCTAssertFalse(result.credentialIdBase64Url.isEmpty)
        
        // Check saved into MyCredentialDataManager
        let savedList = MyCredentialDataManager.shared.loadAll()
        XCTAssertEqual(savedList.count, 1)
        XCTAssertEqual(savedList.first?.rpid, "sp.exarnp1e.com")
        XCTAssertEqual(savedList.first?.credentialId, result.credentialId)
        
        // Parse registrationResponseJson
        guard let jsonData = result.registrationResponseJson.data(using: .utf8),
              let dict = try JSONSerialization.jsonObject(with: jsonData) as? [String: Any] else {
            XCTFail("Failed to parse registration response JSON")
            return
        }
        
        XCTAssertEqual(dict["id"] as? String, result.credentialIdBase64Url)
        XCTAssertEqual(dict["rawId"] as? String, result.credentialIdBase64Url)
        XCTAssertEqual(dict["type"] as? String, "public-key")
        XCTAssertEqual(dict["authenticatorAttachment"] as? String, "platform")
        
        guard let response = dict["response"] as? [String: Any] else {
            XCTFail("Missing 'response' object in registration response")
            return
        }
        
        XCTAssertEqual(response["publicKeyAlgorithm"] as? Int, -7)
        XCTAssertNotNil(response["publicKey"])
        
        // Decode and verify clientDataJSON
        guard let clientDataBase64Url = response["clientDataJSON"] as? String,
              let clientDataBytes = Data(base64URLEncoded: clientDataBase64Url),
              let clientDataDict = try JSONSerialization.jsonObject(with: clientDataBytes) as? [String: Any] else {
            XCTFail("Failed to decode clientDataJSON")
            return
        }
        
        XCTAssertEqual(clientDataDict["type"] as? String, "webauthn.create")
        XCTAssertEqual(clientDataDict["challenge"] as? String, "dGVzdF9jaGFsbGVuZ2VfMTIzNDU2Nzg")
        XCTAssertEqual(clientDataDict["origin"] as? String, "https://sp.exarnp1e.com")
        XCTAssertEqual(clientDataDict["crossOrigin"] as? Bool, false)
        
        // Decode and verify authenticatorData
        guard let authDataBase64Url = response["authenticatorData"] as? String,
              let authData = Data(base64URLEncoded: authDataBase64Url) else {
            XCTFail("Failed to decode authenticatorData")
            return
        }
        
        // Total authData length: 32 (rpIdHash) + 1 (flags) + 4 (signCount) + 16 (aaguid) + 2 (credIdLen) + 32 (credId) + 77 (coseKey) = 164 bytes
        XCTAssertEqual(authData.count, 164)
        
        let expectedRpIdHash = Data(SHA256.hash(data: Data("sp.exarnp1e.com".utf8)))
        XCTAssertEqual(authData.prefix(32), expectedRpIdHash)
        XCTAssertEqual(authData[32], 0x5d) // Flags: UP, UV, AT, BE, BS
        
        // Verify AttestationObject
        guard let attestationBase64Url = response["attestationObject"] as? String,
              let attestationData = Data(base64URLEncoded: attestationBase64Url) else {
            XCTFail("Failed to decode attestationObject")
            return
        }
        
        // Attestation starts with CBOR map header
        XCTAssertTrue(attestationData.count > 164)
    }
    
    func testGeneratePasskeyMaterialsAndAssertionSignature() throws {
        let rpId = "sp.exarnp1e.com"
        let materials = try DirectPasskeyCreator.generatePasskeyMaterials(rpId: rpId)
        XCTAssertEqual(materials.credentialId.count, 32)
        XCTAssertEqual(materials.authData.count, 164)
        XCTAssertEqual(materials.authData[32], 0x5d)
        XCTAssertTrue(materials.attestationObject.count > 164)
        
        let clientData = Data("{\"type\":\"webauthn.get\",\"challenge\":\"test\"}".utf8)
        let clientDataHash = Data(SHA256.hash(data: clientData))
        
        let assertion = try DirectPasskeyCreator.generateAssertionSignature(
            rpId: rpId,
            clientDataHash: clientDataHash,
            privateKey: materials.privateKey
        )
        
        XCTAssertEqual(assertion.authenticatorData.count, 37)
        XCTAssertEqual(assertion.authenticatorData[32], 0x1d)
        XCTAssertFalse(assertion.signature.isEmpty)
        
        // Verify signature with public key
        var signedData = Data()
        signedData.append(assertion.authenticatorData)
        signedData.append(clientDataHash)
        
        let ecdsaSignature = try P256.Signing.ECDSASignature(derRepresentation: assertion.signature)
        let isValid = materials.privateKey.publicKey.isValidSignature(ecdsaSignature, for: signedData)
        XCTAssertTrue(isValid, "ECDSA P-256 signature should be cryptographically valid for (authData || clientDataHash)")
    }
}

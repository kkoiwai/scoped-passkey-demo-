import Foundation
import CryptoKit
import Security

/// Directly generates EC P-256 key pair, saves into MyCredentialDataManager,
/// and creates WebAuthn registration response JSON without invoking the OS Passkey dialog.
public enum DirectPasskeyCreator {
    
    public struct CreationOptionsInput: Codable {
        public struct Rp: Codable {
            public let id: String
            public let name: String?
        }
        public struct User: Codable {
            public let id: String
            public let name: String?
            public let displayName: String?
        }
        public let challenge: String
        public let rp: Rp
        public let user: User
    }
    
    public struct RegistrationResult {
        public let credentialId: Data
        public let credentialIdBase64Url: String
        public let privateKey: P256.Signing.PrivateKey
        public let registrationResponseJson: String
        public let rpId: String
        public let serviceName: String
        public let userHandle: Data
        public let displayName: String
    }

    public struct PasskeyMaterials {
        public let credentialId: Data
        public let credentialIdBase64Url: String
        public let privateKey: P256.Signing.PrivateKey
        public let authData: Data
        public let attestationObject: Data
    }

    /// Generates standard WebAuthn EC P-256 passkey materials (credential ID, key pair, authData, attestationObject).
    public static func generatePasskeyMaterials(rpId: String) throws -> PasskeyMaterials {
        // 1. Generate 32-byte Credential ID
        var credentialIdBytes = [UInt8](repeating: 0, count: 32)
        guard SecRandomCopyBytes(kSecRandomDefault, credentialIdBytes.count, &credentialIdBytes) == errSecSuccess else {
            throw PasskeyError.cryptoError("Failed to generate secure random credential ID.")
        }
        let credentialId = Data(credentialIdBytes)
        let credentialIdBase64Url = credentialId.base64URLEncodedString()
        
        // 2. Generate EC P-256 Key Pair using CryptoKit
        let privateKey = P256.Signing.PrivateKey()
        let rawPublicKey = privateKey.publicKey.rawRepresentation // 64 bytes (32 bytes X + 32 bytes Y)
        let xCoord = rawPublicKey.prefix(32)
        let yCoord = rawPublicKey.suffix(32)
        
        // 3. Construct COSE Public Key (ES256, alg -7)
        let cosePrefix = Data([0xA5, 0x01, 0x02, 0x03, 0x26, 0x20, 0x01, 0x21, 0x58, 0x20])
        let coseMid = Data([0x22, 0x58, 0x20])
        var cosePublicKey = Data()
        cosePublicKey.append(cosePrefix)
        cosePublicKey.append(xCoord)
        cosePublicKey.append(coseMid)
        cosePublicKey.append(yCoord)
        
        // 4. Construct AuthenticatorData
        let rpIdData = Data(rpId.utf8)
        let rpIdHash = Data(SHA256.hash(data: rpIdData))
        let flags = Data([0x5d]) // UP (0x01) + UV (0x04) + AT (0x40) + BE (0x08) + BS (0x10)
        let signCount = Data([0x00, 0x00, 0x00, 0x00])
        let aaguid = Data(repeating: 0x00, count: 16)
        var credIdLen = Data()
        var lenUInt16 = UInt16(credentialId.count).bigEndian
        withUnsafeBytes(of: &lenUInt16) { credIdLen.append(contentsOf: $0) }
        
        var authData = Data()
        authData.append(rpIdHash)
        authData.append(flags)
        authData.append(signCount)
        authData.append(aaguid)
        authData.append(credIdLen)
        authData.append(credentialId)
        authData.append(cosePublicKey)
        
        // 5. Construct AttestationObject with format "none"
        let attHeader = Data([
            0xA3, 0x63, 0x66, 0x6D, 0x74, 0x64, 0x6E, 0x6F, 0x6E, 0x65,
            0x67, 0x61, 0x74, 0x74, 0x53, 0x74, 0x6D, 0x74, 0xA0,
            0x68, 0x61, 0x75, 0x74, 0x68, 0x44, 0x61, 0x74, 0x61, 0x58
        ])
        var attestationObject = Data()
        attestationObject.append(attHeader)
        attestationObject.append(UInt8(authData.count))
        attestationObject.append(authData)
        
        return PasskeyMaterials(
            credentialId: credentialId,
            credentialIdBase64Url: credentialIdBase64Url,
            privateKey: privateKey,
            authData: authData,
            attestationObject: attestationObject
        )
    }

    /// Generates WebAuthn assertion signature over (authenticatorData || clientDataHash)
    public static func generateAssertionSignature(
        rpId: String,
        clientDataHash: Data,
        privateKey: P256.Signing.PrivateKey
    ) throws -> (authenticatorData: Data, signature: Data) {
        let rpIdData = Data(rpId.utf8)
        let rpIdHash = Data(SHA256.hash(data: rpIdData))
        let flags = Data([0x1d]) // UP (0x01) + UV (0x04) + BE (0x08) + BS (0x10)
        let signCount = Data([0x00, 0x00, 0x00, 0x00])
        
        var authData = Data()
        authData.append(rpIdHash)
        authData.append(flags)
        authData.append(signCount)
        
        var signedData = Data()
        signedData.append(authData)
        signedData.append(clientDataHash)
        
        let signature = try privateKey.signature(for: signedData)
        return (authData, signature.derRepresentation)
    }

    /// Directly generates and saves a passkey from PublicKeyCredentialCreationOptions JSON.
    @discardableResult
    public static func createAndSavePasskey(creationOptionsJson: String, origin: String? = nil) throws -> RegistrationResult {
        guard let jsonData = creationOptionsJson.data(using: .utf8) else {
            throw PasskeyError.invalidInput("Creation options JSON could not be parsed into UTF-8 data.")
        }
        
        let decoder = JSONDecoder()
        let options = try decoder.decode(CreationOptionsInput.self, from: jsonData)
        
        let rpId = options.rp.id
        let serviceName = options.rp.name ?? rpId
        let effectiveOrigin = origin ?? "https://\(rpId)"
        let displayName = options.user.displayName ?? options.user.name ?? "User"
        
        let materials = try generatePasskeyMaterials(rpId: rpId)
        let credentialId = materials.credentialId
        let credentialIdBase64Url = materials.credentialIdBase64Url
        let privateKey = materials.privateKey
        let authData = materials.authData
        let attestationObject = materials.attestationObject
        
        // 6. Construct clientDataJSON
        let clientDataObject: [String: Any] = [
            "type": "webauthn.create",
            "challenge": options.challenge,
            "origin": effectiveOrigin,
            "crossOrigin": false
        ]
        let clientDataJSON = try JSONSerialization.data(withJSONObject: clientDataObject, options: [.sortedKeys])
        
        // 7. Save into local MyCredentialDataManager storage
        let userHandleData = Data(base64URLEncoded: options.user.id) ?? Data(options.user.id.utf8)
        let credentialRecord = MyCredentialDataManager.Credential(
            rpid: rpId,
            serviceName: serviceName,
            credentialId: credentialId,
            userHandle: userHandleData,
            displayName: displayName,
            privateKeyData: privateKey.rawRepresentation
        )
        MyCredentialDataManager.shared.save(credentialRecord)
        
        // 8. Construct full WebAuthn registration response JSON
        let publicKeyDer = privateKey.publicKey.derRepresentation
        let registrationResponse: [String: Any] = [
            "id": credentialIdBase64Url,
            "rawId": credentialIdBase64Url,
            "response": [
                "clientDataJSON": clientDataJSON.base64URLEncodedString(),
                "attestationObject": attestationObject.base64URLEncodedString(),
                "authenticatorData": authData.base64URLEncodedString(),
                "transports": ["internal"],
                "publicKey": publicKeyDer.base64EncodedString(),
                "publicKeyAlgorithm": -7
            ],
            "type": "public-key",
            "authenticatorAttachment": "platform",
            "clientExtensionResults": [:] as [String: Any]
        ]
        
        let responseData = try JSONSerialization.data(withJSONObject: registrationResponse, options: [.prettyPrinted, .sortedKeys])
        guard let responseString = String(data: responseData, encoding: .utf8) else {
            throw PasskeyError.formattingError("Failed to encode registration response to UTF-8.")
        }
        
        return RegistrationResult(
            credentialId: credentialId,
            credentialIdBase64Url: credentialIdBase64Url,
            privateKey: privateKey,
            registrationResponseJson: responseString,
            rpId: rpId,
            serviceName: serviceName,
            userHandle: userHandleData,
            displayName: displayName
        )
    }
    
    public enum PasskeyError: LocalizedError {
        case invalidInput(String)
        case cryptoError(String)
        case formattingError(String)
        
        public var errorDescription: String? {
            switch self {
            case .invalidInput(let msg): return "Invalid Input: \(msg)"
            case .cryptoError(let msg): return "Crypto Error: \(msg)"
            case .formattingError(let msg): return "Formatting Error: \(msg)"
            }
        }
    }
}

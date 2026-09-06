import Foundation
import CryptoKit
import Security

/// Utility for OAuth 2.0 PKCE (RFC 7636) code_verifier and code_challenge generation.
public enum PkceUtil {
    
    /// Generates a cryptographically secure random string of 32 bytes (Base64URL-encoded, 43 chars).
    public static func generateCodeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        let status = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        if status != errSecSuccess {
            // Fallback to Swift's SystemRandomNumberGenerator
            var rng = SystemRandomNumberGenerator()
            for i in 0..<bytes.count {
                bytes[i] = rng.next()
            }
        }
        return Data(bytes).base64URLEncodedString()
    }
    
    /// Derives the S256 code challenge from the code verifier: Base64URL(SHA256(ASCII(code_verifier))).
    public static func generateCodeChallenge(verifier: String) -> String {
        guard let asciiData = verifier.data(using: .ascii) else {
            return ""
        }
        let digest = SHA256.hash(data: asciiData)
        return Data(digest).base64URLEncodedString()
    }
}

// MARK: - Data Base64URL Extension
extension Data {
    public func base64URLEncodedString() -> String {
        return self.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
    
    public init?(base64URLEncoded string: String) {
        var base64 = string
            .replacingOccurrences(of: "-", with: "+")
            .replacingOccurrences(of: "_", with: "/")
        let padding = 4 - (base64.count % 4)
        if padding < 4 {
            base64.append(String(repeating: "=", count: padding))
        }
        self.init(base64Encoded: base64)
    }
}

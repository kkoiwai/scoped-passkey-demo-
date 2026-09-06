import Foundation
import CryptoKit
import AuthenticationServices

/// Local storage manager for passkeys and credentials, mirroring Android's MyCredentialDataManager.
public final class MyCredentialDataManager: ObservableObject {
    public static let appGroupIdentifier = "group.com.example.mycredman"
    public static let shared = MyCredentialDataManager()
    
    private let storageKey = "PREF_CREDENTIAL_SET"
    private let userDefaults: UserDefaults
    private let containerFileURL: URL?
    
    @Published public private(set) var credentials: [Credential] = []
    
    public init(userDefaults: UserDefaults? = nil) {
        let groupDefaults = UserDefaults(suiteName: MyCredentialDataManager.appGroupIdentifier)
        self.userDefaults = userDefaults ?? groupDefaults ?? .standard
        
        if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: MyCredentialDataManager.appGroupIdentifier) {
            self.containerFileURL = containerURL.appendingPathComponent("credentials.json")
        } else {
            self.containerFileURL = nil
        }
        
        self.credentials = loadAll()
        syncWithSystemStore()
    }
    
    // MARK: - Credential Model
    public struct Credential: Identifiable, Codable, Equatable {
        public var id: String {
            return "\(rpid):\(credentialId.base64URLEncodedString())"
        }
        
        public let rpid: String
        public let serviceName: String
        public let credentialId: Data
        public let userHandle: Data
        public let displayName: String
        public let privateKeyData: Data? // Raw 32 bytes for P256.Signing.PrivateKey
        public let createdAt: Date
        
        public init(
            rpid: String,
            serviceName: String,
            credentialId: Data,
            userHandle: Data = Data(),
            displayName: String = "",
            privateKeyData: Data? = nil,
            createdAt: Date = Date()
        ) {
            self.rpid = rpid
            self.serviceName = serviceName.isEmpty ? rpid : serviceName
            self.credentialId = credentialId
            self.userHandle = userHandle
            self.displayName = displayName
            self.privateKeyData = privateKeyData
            self.createdAt = createdAt
        }
        
        public var privateKey: P256.Signing.PrivateKey? {
            guard let data = privateKeyData else { return nil }
            return try? P256.Signing.PrivateKey(rawRepresentation: data)
        }
    }
    
    // MARK: - Storage Operations
    public func save(_ credential: Credential) {
        var current = loadAll()
        // Remove existing duplicate if any (same rpid and credentialId)
        current.removeAll { $0.rpid == credential.rpid && $0.credentialId == credential.credentialId }
        current.append(credential)
        saveAll(current)
        registerIdentityWithSystemStore(credential)
        DispatchQueue.main.async {
            self.credentials = current
        }
    }
    
    public func loadAll() -> [Credential] {
        let decoder = JSONDecoder()
        // 1. Try App Group container file if available
        if let fileURL = containerFileURL, FileManager.default.fileExists(atPath: fileURL.path) {
            if let fileData = try? Data(contentsOf: fileURL),
               let list = try? decoder.decode([Credential].self, from: fileData) {
                return list
            }
        }
        
        // 2. Try App Group / standard UserDefaults
        if let data = userDefaults.data(forKey: storageKey),
           let list = try? decoder.decode([Credential].self, from: data) {
            return list
        }
        
        // 3. Fallback to standard UserDefaults if suite is different
        if userDefaults != .standard, let data = UserDefaults.standard.data(forKey: storageKey),
           let list = try? decoder.decode([Credential].self, from: data) {
            return list
        }
        
        return []
    }
    
    public func load(rpid: String) -> [Credential] {
        return loadAll().filter { $0.rpid == rpid }
    }
    
    public func load(rpid: String, credentialId: Data) -> Credential? {
        return loadAll().first { $0.rpid == rpid && $0.credentialId == credentialId }
    }
    
    public func delete(rpid: String, credentialId: Data) {
        var current = loadAll()
        current.removeAll { $0.rpid == rpid && $0.credentialId == credentialId }
        saveAll(current)
        removeIdentityFromSystemStore(rpid: rpid, credentialId: credentialId)
        DispatchQueue.main.async {
            self.credentials = current
        }
    }
    
    public func deleteAll() {
        saveAll([])
        removeAllIdentitiesFromSystemStore()
        DispatchQueue.main.async {
            self.credentials = []
        }
    }
    
    private func saveAll(_ list: [Credential]) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        guard let data = try? encoder.encode(list) else { return }
        
        userDefaults.set(data, forKey: storageKey)
        UserDefaults.standard.set(data, forKey: storageKey)
        
        if let fileURL = containerFileURL {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
    
    // MARK: - ASCredentialIdentityStore Synchronization
    public func syncWithSystemStore() {
        if #available(iOS 17.0, *) {
            let identities = self.credentials.map { cred in
                ASPasskeyCredentialIdentity(
                    relyingPartyIdentifier: cred.rpid,
                    userName: cred.displayName,
                    credentialID: cred.credentialId,
                    userHandle: cred.userHandle,
                    recordIdentifier: cred.id
                )
            }
            guard !identities.isEmpty else { return }
            ASCredentialIdentityStore.shared.saveCredentialIdentities(identities) { success, error in
                if let error = error {
                    print("[MyCredentialDataManager] syncWithSystemStore error: \(error)")
                } else {
                    print("[MyCredentialDataManager] syncWithSystemStore registered \(identities.count) identities.")
                }
            }
        }
    }
    
    private func registerIdentityWithSystemStore(_ credential: Credential) {
        if #available(iOS 17.0, *) {
            let identity = ASPasskeyCredentialIdentity(
                relyingPartyIdentifier: credential.rpid,
                userName: credential.displayName,
                credentialID: credential.credentialId,
                userHandle: credential.userHandle,
                recordIdentifier: credential.id
            )
            ASCredentialIdentityStore.shared.saveCredentialIdentities([identity]) { success, error in
                if let error = error {
                    print("[MyCredentialDataManager] registerIdentity error: \(error)")
                } else {
                    print("[MyCredentialDataManager] registerIdentity success for \(credential.displayName)")
                }
            }
        }
    }
    
    private func removeIdentityFromSystemStore(rpid: String, credentialId: Data) {
        if #available(iOS 17.0, *) {
            let identity = ASPasskeyCredentialIdentity(
                relyingPartyIdentifier: rpid,
                userName: "",
                credentialID: credentialId,
                userHandle: Data(),
                recordIdentifier: nil
            )
            ASCredentialIdentityStore.shared.removeCredentialIdentities([identity]) { success, error in
                if let error = error {
                    print("[MyCredentialDataManager] removeIdentity error: \(error)")
                }
            }
        }
    }
    
    private func removeAllIdentitiesFromSystemStore() {
        if #available(iOS 17.0, *) {
            ASCredentialIdentityStore.shared.removeAllCredentialIdentities { success, error in
                if let error = error {
                    print("[MyCredentialDataManager] removeAllIdentities error: \(error)")
                }
            }
        }
    }
}

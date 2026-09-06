import Foundation
import CryptoKit
import AuthenticationServices

/// Local storage manager for passkeys and credentials, mirroring Android's MyCredentialDataManager.
public final class MyCredentialDataManager: ObservableObject {
    public static let appGroupIdentifier = "group.com.exarnp1e.mycredman"
    public static let shared = MyCredentialDataManager()
    
    private let storageKey = "PREF_CREDENTIAL_SET"
    private let autoFillEnabledKey = "IS_AUTOFILL_ENABLED_CACHE"
    private let userDefaults: UserDefaults
    private let containerFileURL: URL?
    
    @Published public private(set) var credentials: [Credential] = []
    @Published public var isAutoFillEnabled: Bool = false
    
    public init(userDefaults: UserDefaults? = nil) {
        let groupDefaults = UserDefaults(suiteName: MyCredentialDataManager.appGroupIdentifier)
        self.userDefaults = userDefaults ?? groupDefaults ?? .standard
        
        if let containerURL = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: MyCredentialDataManager.appGroupIdentifier) {
            self.containerFileURL = containerURL.appendingPathComponent("credentials.json")
        } else {
            self.containerFileURL = nil
        }
        
        self.isAutoFillEnabled = self.userDefaults.bool(forKey: autoFillEnabledKey)
        self.credentials = loadAll()
        checkAutoFillStatus()
        syncWithSystemStore()
    }
    
    // MARK: - Credential Model
    public struct Credential: Identifiable, Codable, Equatable, Hashable {
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
        DispatchQueue.main.async {
            self.credentials = current
        }
        syncWithSystemStore()
    }
    
    public func reload() {
        let loaded = loadAll()
        DispatchQueue.main.async {
            self.credentials = loaded
        }
        checkAutoFillStatus()
        syncWithSystemStore()
    }
    
    public func checkAutoFillStatus(completion: ((Bool) -> Void)? = nil) {
        if CommandLine.arguments.contains("--mock-autofill-disabled") {
            DispatchQueue.main.async {
                self.isAutoFillEnabled = false
                completion?(false)
            }
            return
        }
        if CommandLine.arguments.contains("--mock-autofill-enabled") {
            DispatchQueue.main.async {
                self.isAutoFillEnabled = true
                completion?(true)
            }
            return
        }
        
        ASCredentialIdentityStore.shared.getState { state in
            DispatchQueue.main.async {
                self.isAutoFillEnabled = state.isEnabled
                self.userDefaults.set(state.isEnabled, forKey: self.autoFillEnabledKey)
                completion?(state.isEnabled)
            }
        }
    }
    
    public func loadAll() -> [Credential] {
        let decoder = JSONDecoder()
        _ = userDefaults.synchronize()
        _ = UserDefaults.standard.synchronize()
        
        // 1. Try App Group container file if available
        if let fileURL = containerFileURL, FileManager.default.fileExists(atPath: fileURL.path) {
            if let fileData = try? Data(contentsOf: fileURL),
               let list = try? decoder.decode([Credential].self, from: fileData) {
                return list
            }
        }
        
        // 2. Try App Group UserDefaults
        if let data = userDefaults.data(forKey: storageKey),
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
        DispatchQueue.main.async {
            self.credentials = current
        }
        syncWithSystemStore()
    }
    
    public func deleteAll() {
        saveAll([])
        DispatchQueue.main.async {
            self.credentials = []
        }
        syncWithSystemStore()
    }
    
    private func saveAll(_ list: [Credential]) {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .prettyPrinted
        guard let data = try? encoder.encode(list) else { return }
        
        userDefaults.set(data, forKey: storageKey)
        _ = userDefaults.synchronize()
        UserDefaults.standard.set(data, forKey: storageKey)
        _ = UserDefaults.standard.synchronize()
        
        if let fileURL = containerFileURL {
            try? data.write(to: fileURL, options: .atomic)
        }
    }
    
    // MARK: - ASCredentialIdentityStore Synchronization
    public func syncWithSystemStore() {
        if #available(iOS 17.0, macOS 14.0, *) {
            let loaded = loadAll()
            if loaded.isEmpty {
                ASCredentialIdentityStore.shared.removeAllCredentialIdentities { success, error in
                    if let error = error {
                        print("[MyCredentialDataManager] removeAllCredentialIdentities error: \(error)")
                    } else {
                        print("[MyCredentialDataManager] removeAllCredentialIdentities successfully cleared system store.")
                    }
                }
            } else {
                let identities = loaded.map { cred in
                    ASPasskeyCredentialIdentity(
                        relyingPartyIdentifier: cred.rpid,
                        userName: cred.displayName,
                        credentialID: cred.credentialId,
                        userHandle: cred.userHandle,
                        recordIdentifier: cred.id
                    )
                }
                ASCredentialIdentityStore.shared.replaceCredentialIdentities(identities) { success, error in
                    if let error = error {
                        print("[MyCredentialDataManager] replaceCredentialIdentities error: \(error)")
                    } else {
                        print("[MyCredentialDataManager] replaceCredentialIdentities successfully updated \(identities.count) identities in system store.")
                    }
                }
            }
        }
    }
}

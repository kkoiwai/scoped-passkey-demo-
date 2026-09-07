import UIKit
import AuthenticationServices
import CryptoKit

/// Credential Provider Extension View Controller mirroring Android's MyCredentialProviderService.
/// Handles system AutoFill requests for passkey registration and assertion.
class CredentialProviderViewController: ASCredentialProviderViewController {
    
    private let cardView: UIView = {
        let view = UIView()
        view.translatesAutoresizingMaskIntoConstraints = false
        view.backgroundColor = .secondarySystemBackground
        view.layer.cornerRadius = 16
        view.layer.masksToBounds = true
        return view
    }()
    
    private let iconLabel: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.font = .systemFont(ofSize: 44)
        label.text = "🔑"
        label.textAlignment = .center
        return label
    }()
    
    private let titleLabel: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.font = .systemFont(ofSize: 22, weight: .bold)
        label.text = "My CredMan"
        label.textAlignment = .center
        return label
    }()
    
    private let subtitleLabel: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.font = .systemFont(ofSize: 17, weight: .semibold)
        label.textColor = .label
        label.text = "パスキー連携"
        label.textAlignment = .center
        return label
    }()
    
    private let statusLabel: UILabel = {
        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.font = .systemFont(ofSize: 14, weight: .regular)
        label.textColor = .secondaryLabel
        label.text = "処理中..."
        label.textAlignment = .center
        label.numberOfLines = 0
        return label
    }()
    
    private let actionButton: UIButton = {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setTitle("実行する", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 16, weight: .bold)
        button.backgroundColor = .systemBlue
        button.setTitleColor(.white, for: .normal)
        button.layer.cornerRadius = 12
        button.isHidden = true
        return button
    }()
    
    private let cancelButton: UIButton = {
        let button = UIButton(type: .system)
        button.translatesAutoresizingMaskIntoConstraints = false
        button.setTitle("キャンセル", for: .normal)
        button.titleLabel?.font = .systemFont(ofSize: 15, weight: .regular)
        return button
    }()
    
    private var isActionExecuted = false
    private var pendingAction: (() -> Void)?
    
    override func viewDidLoad() {
        super.viewDidLoad()
        setupUI()
    }
    
    private func setupUI() {
        view.backgroundColor = .systemBackground
        
        view.addSubview(cardView)
        cardView.addSubview(iconLabel)
        cardView.addSubview(titleLabel)
        cardView.addSubview(subtitleLabel)
        cardView.addSubview(statusLabel)
        cardView.addSubview(actionButton)
        cardView.addSubview(cancelButton)
        
        actionButton.addTarget(self, action: #selector(actionTapped), for: .touchUpInside)
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        
        NSLayoutConstraint.activate([
            cardView.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            cardView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            cardView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24),
            cardView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24),
            cardView.bottomAnchor.constraint(greaterThanOrEqualTo: cancelButton.bottomAnchor, constant: 16),
            
            iconLabel.topAnchor.constraint(equalTo: cardView.topAnchor, constant: 24),
            iconLabel.centerXAnchor.constraint(equalTo: cardView.centerXAnchor),
            
            titleLabel.topAnchor.constraint(equalTo: iconLabel.bottomAnchor, constant: 10),
            titleLabel.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -16),
            
            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 6),
            subtitleLabel.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 16),
            subtitleLabel.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -16),
            
            statusLabel.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 12),
            statusLabel.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 16),
            statusLabel.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -16),
            
            actionButton.topAnchor.constraint(equalTo: statusLabel.bottomAnchor, constant: 20),
            actionButton.leadingAnchor.constraint(equalTo: cardView.leadingAnchor, constant: 20),
            actionButton.trailingAnchor.constraint(equalTo: cardView.trailingAnchor, constant: -20),
            actionButton.heightAnchor.constraint(equalToConstant: 44),
            
            cancelButton.topAnchor.constraint(equalTo: actionButton.bottomAnchor, constant: 12),
            cancelButton.centerXAnchor.constraint(equalTo: cardView.centerXAnchor),
            cancelButton.heightAnchor.constraint(equalToConstant: 36)
        ])
    }
    
    @objc private func actionTapped() {
        executePendingAction()
    }
    
    @objc private func cancelTapped() {
        extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userCanceled.rawValue, userInfo: nil))
    }
    
    private func executePendingAction() {
        guard !isActionExecuted, let action = pendingAction else { return }
        isActionExecuted = true
        action()
    }
    
    // MARK: - ASCredentialProviderViewController Overrides
    
    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier]) {
        let rpId = serviceIdentifiers.first?.identifier ?? "sp.exarnp1e.com"
        NSLog("[CredentialProvider] prepareCredentialList fallback called for %@", rpId)
        if #available(iOS 17.0, macOS 14.0, *) {
            handleAssertionFlow(rpId: rpId, clientDataHash: Data(), allowedCredentialIds: [])
        } else {
            extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.failed.rawValue, userInfo: nil))
        }
    }
    
    @available(iOS 17.0, *)
    override func prepareCredentialList(for serviceIdentifiers: [ASCredentialServiceIdentifier], requestParameters: ASPasskeyCredentialRequestParameters) {
        let rpId = requestParameters.relyingPartyIdentifier
        let clientDataHash = requestParameters.clientDataHash
        let allowed = requestParameters.allowedCredentials
        NSLog("[CredentialProvider] prepareCredentialList with requestParameters: rpId=%@, clientDataHash len=%ld, allowedCreds=%ld",
              rpId, clientDataHash.count, allowed.count)
        handleAssertionFlow(rpId: rpId, clientDataHash: clientDataHash, allowedCredentialIds: allowed)
    }
    
    override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
        extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userInteractionRequired.rawValue, userInfo: nil))
    }
    
    @available(iOS 17.0, *)
    override func provideCredentialWithoutUserInteraction(for credentialRequest: any ASCredentialRequest) {
        NSLog("[CredentialProvider] provideCredentialWithoutUserInteraction called: %@", String(describing: credentialRequest))
        
        guard let passkeyRequest = credentialRequest as? ASPasskeyCredentialRequest else {
            NSLog("[CredentialProvider] Request is not ASPasskeyCredentialRequest, signaling userInteractionRequired")
            extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userInteractionRequired.rawValue, userInfo: nil))
            return
        }
        
        let clientDataHash = passkeyRequest.clientDataHash
        let passkeyIdentity = passkeyRequest.credentialIdentity as? ASPasskeyCredentialIdentity
        let rpId = passkeyIdentity?.relyingPartyIdentifier ?? passkeyRequest.credentialIdentity.serviceIdentifier.identifier
        let credentialId = passkeyIdentity?.credentialID ?? Data()
        
        NSLog("[CredentialProvider] provideCredentialWithoutUserInteraction: rpId=%@, credId=%@, clientDataHash len=%ld",
              rpId, credentialId.base64URLEncodedString(), clientDataHash.count)
        
        let allCreds = MyCredentialDataManager.shared.loadAll()
        NSLog("[CredentialProvider] Loaded %ld credentials from store", allCreds.count)
        
        // Match by credentialId first, then by rpId
        guard let cred = allCreds.first(where: { !credentialId.isEmpty && $0.credentialId == credentialId }) ??
                         allCreds.first(where: { $0.rpid == rpId || rpId.hasSuffix($0.rpid) || $0.rpid.hasSuffix(rpId) }) ??
                         allCreds.first,
              let privateKey = cred.privateKey else {
            NSLog("[CredentialProvider] Credential not found for rpId: %@, credId: %@", rpId, credentialId.base64URLEncodedString())
            extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.credentialIdentityNotFound.rawValue, userInfo: [NSLocalizedDescriptionKey: "Passkey credential not found"]))
            return
        }
        
        let effectiveRpId = !rpId.isEmpty ? rpId : (cred.rpid.isEmpty ? "sp.exarnp1e.com" : cred.rpid)
        do {
            let assertion = try DirectPasskeyCreator.generateAssertionSignature(
                rpId: effectiveRpId,
                clientDataHash: clientDataHash,
                privateKey: privateKey
            )
            
            let assertionCred = ASPasskeyAssertionCredential(
                userHandle: cred.userHandle,
                relyingParty: effectiveRpId,
                signature: assertion.signature,
                clientDataHash: clientDataHash,
                authenticatorData: assertion.authenticatorData,
                credentialID: cred.credentialId
            )
            
            NSLog("[CredentialProvider] Completing assertion without user interaction for %@ on %@...", cred.displayName, effectiveRpId)
            extensionContext.completeAssertionRequest(using: assertionCred) { expired in
                NSLog("[CredentialProvider] provideCredentialWithoutUserInteraction completed. Expired: %d", expired)
            }
        } catch {
            NSLog("[CredentialProvider] provideCredentialWithoutUserInteraction error: %@", error.localizedDescription)
            extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.failed.rawValue, userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]))
        }
    }
    
    // MARK: - Passkey Handling (iOS 17+)
    
    @available(iOS 17.0, *)
    override func prepareInterface(forPasskeyRegistration registrationRequest: any ASCredentialRequest) {
        NSLog("[CredentialProvider] prepareInterface(forPasskeyRegistration:) called: %@", String(describing: registrationRequest))
        guard let passkeyRequest = registrationRequest as? ASPasskeyCredentialRequest else {
            NSLog("[CredentialProvider] Invalid passkey registration request: %@", String(describing: registrationRequest))
            extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.failed.rawValue, userInfo: [NSLocalizedDescriptionKey: "Invalid passkey registration request"]))
            return
        }
        
        let clientDataHash = passkeyRequest.clientDataHash
        let passkeyIdentity = passkeyRequest.credentialIdentity as? ASPasskeyCredentialIdentity
        let rpId = passkeyIdentity?.relyingPartyIdentifier ?? passkeyRequest.credentialIdentity.serviceIdentifier.identifier
        let effectiveRpId = !rpId.isEmpty ? rpId : "sp.exarnp1e.com"
        let rawUserName = passkeyIdentity?.userName ?? ""
        let userName = (!rawUserName.isEmpty && rawUserName != "User") ? rawUserName : "alice@example.com"
        let userHandle = passkeyIdentity?.userHandle ?? Data()
        
        subtitleLabel.text = "✨ パスキーを新規作成"
        statusLabel.text = "サイト: \(effectiveRpId)\nアカウント: \(userName)"
        actionButton.setTitle("パスキーを登録", for: .normal)
        actionButton.isHidden = false
        
        self.pendingAction = { [weak self] in
            guard let self = self else { return }
            do {
                let materials = try DirectPasskeyCreator.generatePasskeyMaterials(rpId: effectiveRpId)
                let regCred = ASPasskeyRegistrationCredential(
                    relyingParty: effectiveRpId,
                    clientDataHash: clientDataHash,
                    credentialID: materials.credentialId,
                    attestationObject: materials.attestationObject
                )
                
                let record = MyCredentialDataManager.Credential(
                    rpid: effectiveRpId,
                    serviceName: "Scoped Passkey Bank",
                    credentialId: materials.credentialId,
                    userHandle: userHandle,
                    displayName: userName,
                    privateKeyData: materials.privateKey.rawRepresentation,
                    createdAt: Date()
                )
                MyCredentialDataManager.shared.save(record)
                
                NSLog("[CredentialProvider] Completing passkey registration for %@ on %@...", userName, effectiveRpId)
                self.extensionContext.completeRegistrationRequest(using: regCred) { expired in
                    NSLog("[CredentialProvider] Registration request finished. Expired: %d", expired)
                }
            } catch {
                NSLog("[CredentialProvider] Passkey registration error: %@", error.localizedDescription)
                self.extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.failed.rawValue, userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]))
            }
        }
        
        // Auto-fulfill after 0.2s to guarantee seamless flow
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            self?.executePendingAction()
        }
    }
    
    @available(iOS 17.0, *)
    override func prepareInterfaceToProvideCredential(for credentialRequest: any ASCredentialRequest) {
        NSLog("[CredentialProvider] prepareInterfaceToProvideCredential called: %@", String(describing: credentialRequest))
        guard let passkeyRequest = credentialRequest as? ASPasskeyCredentialRequest else {
            extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.failed.rawValue, userInfo: [NSLocalizedDescriptionKey: "Invalid passkey assertion request"]))
            return
        }
        
        let clientDataHash = passkeyRequest.clientDataHash
        let passkeyIdentity = passkeyRequest.credentialIdentity as? ASPasskeyCredentialIdentity
        let rpId = passkeyIdentity?.relyingPartyIdentifier ?? passkeyRequest.credentialIdentity.serviceIdentifier.identifier
        let credentialId = passkeyIdentity?.credentialID ?? Data()
        let allowed = credentialId.isEmpty ? [] : [credentialId]
        
        handleAssertionFlow(rpId: rpId, clientDataHash: clientDataHash, allowedCredentialIds: allowed)
    }
    
    @available(iOS 17.0, macOS 14.0, *)
    private func handleAssertionFlow(rpId: String, clientDataHash: Data, allowedCredentialIds: [Data]) {
        let allCreds = MyCredentialDataManager.shared.loadAll()
        NSLog("[CredentialProvider] handleAssertionFlow: rpId=%@, clientDataHash len=%ld, stored creds=%ld",
              rpId, clientDataHash.count, allCreds.count)
        
        let matchingCred: MyCredentialDataManager.Credential?
        if !allowedCredentialIds.isEmpty {
            matchingCred = allCreds.first(where: { allowedCredentialIds.contains($0.credentialId) })
        } else {
            matchingCred = allCreds.first(where: {
                $0.rpid == rpId || rpId.hasSuffix($0.rpid) || $0.rpid.hasSuffix(rpId)
            }) ?? allCreds.first
        }
        
        guard let cred = matchingCred, let privateKey = cred.privateKey else {
            NSLog("[CredentialProvider] No matching passkey found for rpId: %@", rpId)
            subtitleLabel.text = "⚠️ パスキーがありません"
            statusLabel.text = "サイト: \(rpId)\n利用可能なパスキーが見つかりませんでした。"
            actionButton.isHidden = true
            extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.credentialIdentityNotFound.rawValue, userInfo: [NSLocalizedDescriptionKey: "Passkey credential not found"]))
            return
        }
        
        let effectiveRpId = !rpId.isEmpty ? rpId : (cred.rpid.isEmpty ? "sp.exarnp1e.com" : cred.rpid)
        let effectiveClientDataHash = clientDataHash.isEmpty ? Data(SHA256.hash(data: Data("fallback".utf8))) : clientDataHash
        
        subtitleLabel.text = "🔑 パスキーでログイン"
        statusLabel.text = "サイト: \(effectiveRpId)\nアカウント: \(cred.displayName)"
        actionButton.setTitle("ログイン", for: .normal)
        actionButton.isHidden = false
        
        self.pendingAction = { [weak self] in
            guard let self = self else { return }
            do {
                let assertion = try DirectPasskeyCreator.generateAssertionSignature(
                    rpId: effectiveRpId,
                    clientDataHash: effectiveClientDataHash,
                    privateKey: privateKey
                )
                
                let assertionCred = ASPasskeyAssertionCredential(
                    userHandle: cred.userHandle,
                    relyingParty: effectiveRpId,
                    signature: assertion.signature,
                    clientDataHash: effectiveClientDataHash,
                    authenticatorData: assertion.authenticatorData,
                    credentialID: cred.credentialId
                )
                
                NSLog("[CredentialProvider] Completing assertion for %@ on %@...", cred.displayName, effectiveRpId)
                self.extensionContext.completeAssertionRequest(using: assertionCred) { expired in
                    NSLog("[CredentialProvider] Assertion request finished. Expired: %d", expired)
                }
            } catch {
                NSLog("[CredentialProvider] Passkey assertion error: %@", error.localizedDescription)
                self.extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.failed.rawValue, userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]))
            }
        }
        
        // Auto-fulfill after 0.2s to guarantee seamless flow
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { [weak self] in
            self?.executePendingAction()
        }
    }
}

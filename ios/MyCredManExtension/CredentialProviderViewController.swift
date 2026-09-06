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
        let domains = serviceIdentifiers.map { $0.identifier }.joined(separator: ", ")
        statusLabel.text = "リクエスト元: \(domains.isEmpty ? "sp.exarnp1e.com" : domains)"
    }
    
    override func provideCredentialWithoutUserInteraction(for credentialIdentity: ASPasswordCredentialIdentity) {
        extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.userInteractionRequired.rawValue, userInfo: nil))
    }
    
    // MARK: - Passkey Handling (iOS 17+)
    
    @available(iOS 17.0, *)
    override func prepareInterface(forPasskeyRegistration registrationRequest: any ASCredentialRequest) {
        guard let passkeyRequest = registrationRequest as? ASPasskeyCredentialRequest else {
            extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.failed.rawValue, userInfo: [NSLocalizedDescriptionKey: "Invalid passkey registration request"]))
            return
        }
        
        let clientDataHash = passkeyRequest.clientDataHash
        let passkeyIdentity = passkeyRequest.credentialIdentity as? ASPasskeyCredentialIdentity
        let rpId = passkeyIdentity?.relyingPartyIdentifier ?? passkeyRequest.credentialIdentity.serviceIdentifier.identifier
        let userName = passkeyIdentity?.userName ?? "User"
        let userHandle = passkeyIdentity?.userHandle ?? Data()
        
        subtitleLabel.text = "✨ パスキーを新規作成"
        statusLabel.text = "サイト: \(rpId)\nアカウント: \(userName)"
        actionButton.setTitle("パスキーを登録", for: .normal)
        actionButton.isHidden = false
        
        self.pendingAction = { [weak self] in
            guard let self = self else { return }
            do {
                let materials = try DirectPasskeyCreator.generatePasskeyMaterials(rpId: rpId)
                let regCred = ASPasskeyRegistrationCredential(
                    relyingParty: rpId,
                    clientDataHash: clientDataHash,
                    credentialID: materials.credentialId,
                    attestationObject: materials.attestationObject
                )
                
                let record = MyCredentialDataManager.Credential(
                    rpid: rpId,
                    serviceName: "Scoped Passkey Bank",
                    credentialId: materials.credentialId,
                    userHandle: userHandle,
                    displayName: userName,
                    privateKeyData: materials.privateKey.rawRepresentation,
                    createdAt: Date()
                )
                MyCredentialDataManager.shared.save(record)
                
                print("[CredentialProvider] Completing passkey registration for \(userName) on \(rpId)...")
                self.extensionContext.completeRegistrationRequest(using: regCred) { expired in
                    print("[CredentialProvider] Registration request finished. Expired: \(expired)")
                }
            } catch {
                print("[CredentialProvider] Passkey registration error: \(error)")
                self.extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.failed.rawValue, userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]))
            }
        }
        
        // Auto-fulfill after 0.4s to guarantee seamless flow
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.executePendingAction()
        }
    }
    
    @available(iOS 17.0, *)
    override func prepareInterfaceToProvideCredential(for credentialRequest: any ASCredentialRequest) {
        guard let passkeyRequest = credentialRequest as? ASPasskeyCredentialRequest else {
            extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.failed.rawValue, userInfo: [NSLocalizedDescriptionKey: "Invalid passkey assertion request"]))
            return
        }
        
        let clientDataHash = passkeyRequest.clientDataHash
        let passkeyIdentity = passkeyRequest.credentialIdentity as? ASPasskeyCredentialIdentity
        let rpId = passkeyIdentity?.relyingPartyIdentifier ?? passkeyRequest.credentialIdentity.serviceIdentifier.identifier
        let credentialId = passkeyIdentity?.credentialID ?? Data()
        let userName = passkeyIdentity?.userName ?? "User"
        
        subtitleLabel.text = "🔑 パスキーでログイン"
        statusLabel.text = "サイト: \(rpId)\nアカウント: \(userName)"
        actionButton.setTitle("ログイン", for: .normal)
        actionButton.isHidden = false
        
        self.pendingAction = { [weak self] in
            guard let self = self else { return }
            
            let allCreds = MyCredentialDataManager.shared.loadAll()
            // Match by credentialId or by rpId
            guard let cred = allCreds.first(where: { !credentialId.isEmpty && $0.credentialId == credentialId }) ??
                             allCreds.first(where: { $0.rpid == rpId }),
                  let privateKey = cred.privateKey else {
                print("[CredentialProvider] Credential not found for rpId: \(rpId), credId: \(credentialId.base64URLEncodedString())")
                self.extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.credentialIdentityNotFound.rawValue, userInfo: [NSLocalizedDescriptionKey: "Passkey credential not found"]))
                return
            }
            
            do {
                let assertion = try DirectPasskeyCreator.generateAssertionSignature(
                    rpId: rpId,
                    clientDataHash: clientDataHash,
                    privateKey: privateKey
                )
                
                let assertionCred = ASPasskeyAssertionCredential(
                    userHandle: cred.userHandle,
                    relyingParty: rpId,
                    signature: assertion.signature,
                    clientDataHash: clientDataHash,
                    authenticatorData: assertion.authenticatorData,
                    credentialID: cred.credentialId
                )
                
                print("[CredentialProvider] Completing passkey assertion for \(cred.displayName) on \(rpId)...")
                self.extensionContext.completeAssertionRequest(using: assertionCred) { expired in
                    print("[CredentialProvider] Assertion request finished. Expired: \(expired)")
                }
            } catch {
                print("[CredentialProvider] Passkey assertion error: \(error)")
                self.extensionContext.cancelRequest(withError: NSError(domain: ASExtensionErrorDomain, code: ASExtensionError.failed.rawValue, userInfo: [NSLocalizedDescriptionKey: error.localizedDescription]))
            }
        }
        
        // Auto-fulfill after 0.4s to guarantee seamless flow
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [weak self] in
            self?.executePendingAction()
        }
    }
}

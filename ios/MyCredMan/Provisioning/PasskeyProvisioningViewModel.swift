import Foundation
import Combine

/// UI State representing the progression of the Passkey Provisioning Flow.
/// Exactly mirrors Android's ProvisioningUiState.
public enum ProvisioningUiState: Equatable {
    case idle
    case inProgress(step: Step, description: String, accessToken: String? = nil, creationOptionsJson: String? = nil, registrationResponseJson: String? = nil)
    case success(accessToken: String, creationOptionsJson: String, registrationResponseJson: String, serverResponseJson: String, message: String)
    case error(step: String, message: String, details: String? = nil)
    
    public enum Step: Int, CaseIterable {
        case oauthAuthorizing = 1
        case tokenExchange = 2
        case fetchingOptions = 3
        case creatingPasskey = 4
        case registeringPasskey = 5
        
        public var title: String {
            switch self {
            case .oauthAuthorizing: return "OAuth 認可 (Web Auth Session)"
            case .tokenExchange: return "トークン交換 (Token Exchange)"
            case .fetchingOptions: return "Creation Options 取得"
            case .creatingPasskey: return "パスキー生成 (自アプリ保管庫)"
            case .registeringPasskey: return "パスキー登録 (Register API)"
            }
        }
    }
}

/// ViewModel orchestrating the entire OAuth 2.0 and Passkey Provisioning workflow.
/// Mirrors Android's PasskeyProvisioningViewModel.
@MainActor
public final class PasskeyProvisioningViewModel: ObservableObject {
    @Published public private(set) var uiState: ProvisioningUiState = .idle
    
    private let authManager: OAuthWebAuthManager
    private let client: PasskeyProvisioningClient
    
    public init(
        authManager: OAuthWebAuthManager = OAuthWebAuthManager(),
        client: PasskeyProvisioningClient = PasskeyProvisioningClient()
    ) {
        self.authManager = authManager
        self.client = client
    }
    
    /// Starts the Provisioning flow by opening ASWebAuthenticationSession for OAuth 2.0 PKCE authentication.
    public func startProvisioning() {
        uiState = .inProgress(
            step: .oauthAuthorizing,
            description: "認可セッションで IdP 認可画面を起動しています..."
        )
        
        Task {
            do {
                // Step 1: OAuth PKCE Authorization
                let (code, codeVerifier) = try await authManager.startAuthorization()
                
                // Step 2: Token Exchange
                await exchangeTokenAndProceed(code: code, codeVerifier: codeVerifier)
            } catch let error as OAuthWebAuthManager.OAuthError {
                if case .userCancelled = error {
                    uiState = .idle
                } else {
                    uiState = .error(
                        step: "OAuth 認可",
                        message: error.localizedDescription,
                        details: String(describing: error)
                    )
                }
            } catch {
                uiState = .error(
                    step: "OAuth 認可",
                    message: "認可セッションの起動または処理に失敗しました。",
                    details: error.localizedDescription
                )
            }
        }
    }
    
    /// Fallback for handling deep links received via onOpenURL.
    public func handleOpenUrl(_ url: URL) {
        guard url.scheme == AuthConfig.redirectScheme else { return }
        do {
            let (code, codeVerifier) = try authManager.handleRedirectUrl(url)
            Task {
                await exchangeTokenAndProceed(code: code, codeVerifier: codeVerifier)
            }
        } catch {
            uiState = .error(
                step: "認可リダイレクト (Redirect)",
                message: "認可リダイレクトの解析に失敗しました。",
                details: error.localizedDescription
            )
        }
    }
    
    /// Step 2: Exchanges authorization code for access token, then fetches Creation Options.
    private func exchangeTokenAndProceed(code: String, codeVerifier: String) async {
        uiState = .inProgress(
            step: .tokenExchange,
            description: "認可コードをアクセストークンと交換しています..."
        )
        
        do {
            let tokenResponse = try await client.exchangeCodeForToken(
                code: code,
                codeVerifier: codeVerifier
            )
            let accessToken = tokenResponse.accessToken
            await fetchCreationOptionsAndCreatePasskey(accessToken: accessToken)
        } catch {
            uiState = .error(
                step: "トークン交換 (Token Exchange)",
                message: "アクセストークンの取得に失敗しました。",
                details: error.localizedDescription
            )
        }
    }
    
    /// Step 3 & 4: Fetches PublicKeyCredentialCreationOptions JSON and creates passkey directly.
    private func fetchCreationOptionsAndCreatePasskey(accessToken: String) async {
        uiState = .inProgress(
            step: .fetchingOptions,
            description: "Passkey Provisioning API から Creation Options を取得中...",
            accessToken: accessToken
        )
        
        let creationOptionsJson: String
        do {
            creationOptionsJson = try await client.fetchCreationOptions(accessToken: accessToken)
        } catch {
            uiState = .error(
                step: "Creation Options 取得",
                message: "パスキー生成オプションの取得に失敗しました。",
                details: error.localizedDescription
            )
            return
        }
        
        // Step 4: Direct Passkey Key Pair Generation
        uiState = .inProgress(
            step: .creatingPasskey,
            description: "自アプリのパスキー保管庫に鍵を生成・保存中...",
            accessToken: accessToken,
            creationOptionsJson: creationOptionsJson
        )
        
        let registrationResult: DirectPasskeyCreator.RegistrationResult
        do {
            registrationResult = try DirectPasskeyCreator.createAndSavePasskey(creationOptionsJson: creationOptionsJson)
        } catch {
            uiState = .error(
                step: "パスキー生成 (自アプリ保管庫)",
                message: "パスキーの生成・保存に失敗しました。",
                details: error.localizedDescription
            )
            return
        }
        
        // Step 5: Register newly created passkey with server
        await registerPasskeyWithServer(
            accessToken: accessToken,
            creationOptionsJson: creationOptionsJson,
            registrationResponseJson: registrationResult.registrationResponseJson
        )
    }
    
    /// Step 5: Registers the created passkey with the Passkey Provisioning API.
    private func registerPasskeyWithServer(
        accessToken: String,
        creationOptionsJson: String,
        registrationResponseJson: String
    ) async {
        uiState = .inProgress(
            step: .registeringPasskey,
            description: "公開鍵と登録データをサーバーへ送信中...",
            accessToken: accessToken,
            creationOptionsJson: creationOptionsJson,
            registrationResponseJson: registrationResponseJson
        )
        
        do {
            let serverResponseJson = try await client.registerPasskey(
                accessToken: accessToken,
                registrationResponseJson: registrationResponseJson
            )
            
            uiState = .success(
                accessToken: accessToken,
                creationOptionsJson: creationOptionsJson,
                registrationResponseJson: registrationResponseJson,
                serverResponseJson: serverResponseJson,
                message: "パスキーの発行と登録が正常に完了しました！"
            )
        } catch {
            uiState = .error(
                step: "パスキー登録 (Register API)",
                message: "サーバーへのパスキー登録に失敗しました。",
                details: error.localizedDescription
            )
        }
    }
    
    /// Resets the flow back to Idle state.
    public func resetState() {
        uiState = .idle
    }
}

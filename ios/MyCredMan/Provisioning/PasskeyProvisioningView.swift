import SwiftUI
import AuthenticationServices

/// Main Provisioning Screen mirroring Android's PasskeyProvisioningScreen.
public struct PasskeyProvisioningView: View {
    @ObservedObject var viewModel: PasskeyProvisioningViewModel
    
    public init(viewModel: PasskeyProvisioningViewModel) {
        self.viewModel = viewModel
    }
    
    public var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                // Header Card
                headerCard
                
                // Configuration Overview Card
                configCard
                
                // Stepper Progress Display
                stepperCard
                
                // Action Buttons & Live Status
                actionArea
            }
            .padding(16)
        }
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: {
                    if #available(iOS 17.0, *) {
                        ASSettingsHelper.openCredentialProviderAppSettings { error in
                            if let error = error {
                                print("Error opening settings: \(error)")
                            }
                        }
                    } else if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }) {
                    Image(systemName: "gearshape")
                        .accessibilityLabel("設定を開く")
                }
            }
        }
    }
    
    // MARK: - Header Card
    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("🔑 Passkey Provisioning")
                .font(.title2.bold())
                .foregroundColor(.primary)
            
            Text("OAuth 2.0 (ASWebAuthenticationSession) 認可フローで取得したトークンを使用し、Tim Cappalli 仕様に準拠した Passkey Provisioning API からパスキーを発行・登録します。")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }
    
    // MARK: - Config Card
    private var configCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("⚙️ 設定情報 (AuthConfig)")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.primary)
            
            Divider()
            
            configItem(label: "Auth Endpoint", value: AuthConfig.authorizationEndpoint)
            configItem(label: "Token Endpoint", value: AuthConfig.tokenEndpoint)
            configItem(label: "Options Endpoint", value: AuthConfig.creationOptionsEndpoint)
            configItem(label: "Register Endpoint", value: AuthConfig.registerEndpoint)
            configItem(label: "Client ID", value: AuthConfig.clientId)
            configItem(label: "Redirect URI", value: AuthConfig.redirectUri)
        }
        .padding(14)
        .background(Color(.tertiarySystemBackground))
        .cornerRadius(12)
    }
    
    private func configItem(label: String, value: String) -> some View {
        HStack(alignment: .firstTextBaseline) {
            Text(label)
                .font(.caption.weight(.medium))
                .foregroundColor(.secondary)
            Spacer()
            Text(value)
                .font(.system(.caption2, design: .monospaced))
                .foregroundColor(.primary)
                .lineLimit(1)
                .truncationMode(.middle)
        }
    }
    
    // MARK: - Stepper Progress Card
    private var stepperCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("処理フロー進捗")
                .font(.headline)
            
            let currentStepNumber = {
                switch viewModel.uiState {
                case .inProgress(let step, _, _, _, _):
                    return step.rawValue
                case .success:
                    return 6
                default:
                    return 0
                }
            }()
            
            let isError = {
                if case .error = viewModel.uiState { return true }
                return false
            }()
            
            stepRow(
                stepNumber: 1,
                title: "OAuth 認可",
                sub: "ASWebAuthenticationSession (PKCE S256)",
                currentStep: currentStepNumber,
                isError: isError && currentStepNumber <= 1
            )
            stepRow(
                stepNumber: 2,
                title: "トークン交換",
                sub: "POST /oauth/token (code_verifier)",
                currentStep: currentStepNumber,
                isError: isError && currentStepNumber == 2
            )
            stepRow(
                stepNumber: 3,
                title: "Options 取得",
                sub: "POST /passkeys/creation-options",
                currentStep: currentStepNumber,
                isError: isError && currentStepNumber == 3
            )
            stepRow(
                stepNumber: 4,
                title: "パスキー生成",
                sub: "自アプリ内直接鍵生成 (EC P-256)",
                currentStep: currentStepNumber,
                isError: isError && currentStepNumber == 4
            )
            stepRow(
                stepNumber: 5,
                title: "公開鍵登録",
                sub: "POST /passkeys/register",
                currentStep: currentStepNumber,
                isError: isError && currentStepNumber == 5
            )
        }
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
    }
    
    private func stepRow(stepNumber: Int, title: String, sub: String, currentStep: Int, isError: BooleanLiteralType) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(stepBadgeColor(stepNumber: stepNumber, currentStep: currentStep, isError: isError))
                    .frame(width: 28, height: 28)
                
                if isError {
                    Text("✕")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                } else if currentStep > stepNumber {
                    Text("✓")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                } else {
                    Text("\(stepNumber)")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundColor(.white)
                }
            }
            
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body.weight(currentStep == stepNumber ? .bold : .regular))
                    .foregroundColor(currentStep >= stepNumber ? .primary : .secondary)
                
                Text(sub)
                    .font(.caption2)
                    .foregroundColor(.secondary)
            }
            Spacer()
        }
        .padding(.vertical, 2)
    }
    
    private func stepBadgeColor(stepNumber: Int, currentStep: Int, isError: Bool) -> Color {
        if isError {
            return .red
        } else if currentStep > stepNumber {
            return Color(red: 0.18, green: 0.49, blue: 0.20) // Green
        } else if currentStep == stepNumber {
            return .blue
        } else {
            return .gray.opacity(0.6)
        }
    }
    
    // MARK: - Action Area
    @ViewBuilder
    private var actionArea: some View {
        switch viewModel.uiState {
        case .idle:
            Button(action: {
                viewModel.startProvisioning()
            }) {
                HStack {
                    Image(systemName: "key.fill")
                    Text("OAuth 認証してパスキーを発行")
                        .fontWeight(.bold)
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(Color.blue)
                .foregroundColor(.white)
                .cornerRadius(12)
            }
            
        case .inProgress(let step, let description, _, _, _):
            HStack(spacing: 16) {
                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle())
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("Step \(step.rawValue): \(step.title)")
                        .font(.subheadline.bold())
                    Text(description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                Spacer()
            }
            .padding(16)
            .background(Color.blue.opacity(0.1))
            .cornerRadius(12)
            
        case .success(let accessToken, let creationOptionsJson, let registrationResponseJson, let serverResponseJson, let message):
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("✅")
                        .font(.title2)
                    Text(message)
                        .font(.headline)
                        .foregroundColor(Color(red: 0.11, green: 0.37, blue: 0.13))
                }
                
                jsonPayloadPreview(title: "Access Token", content: accessToken)
                jsonPayloadPreview(title: "Creation Options JSON", content: creationOptionsJson)
                jsonPayloadPreview(title: "Registration Response JSON", content: registrationResponseJson)
                jsonPayloadPreview(title: "Server Response", content: serverResponseJson)
                
                Button(action: {
                    viewModel.resetState()
                }) {
                    Text("もう一度パスキーを発行する")
                        .fontWeight(.semibold)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(Color(red: 0.18, green: 0.49, blue: 0.20))
                        .foregroundColor(.white)
                        .cornerRadius(10)
                }
            }
            .padding(16)
            .background(Color(red: 0.91, green: 0.96, blue: 0.91))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color(red: 0.18, green: 0.49, blue: 0.20), lineWidth: 1)
            )
            
        case .error(let step, let message, let details):
            VStack(alignment: .leading, spacing: 8) {
                Text("⚠️ Error [\(step)]")
                    .font(.headline)
                    .foregroundColor(.red)
                
                Text(message)
                    .font(.subheadline)
                
                if let details = details, !details.isEmpty {
                    Text(details)
                        .font(.system(.caption2, design: .monospaced))
                        .foregroundColor(.secondary)
                        .padding(8)
                        .background(Color(.systemBackground))
                        .cornerRadius(6)
                }
                
                HStack(spacing: 12) {
                    Button(action: {
                        viewModel.startProvisioning()
                    }) {
                        Text("再試行")
                            .fontWeight(.bold)
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .background(Color.red)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                    }
                    
                    Button(action: {
                        viewModel.resetState()
                    }) {
                        Text("Reset")
                            .fontWeight(.medium)
                            .frame(maxWidth: .infinity)
                            .frame(height: 40)
                            .background(Color(.tertiarySystemFill))
                            .foregroundColor(.primary)
                            .cornerRadius(8)
                    }
                }
                .padding(.top, 4)
            }
            .padding(16)
            .background(Color.red.opacity(0.1))
            .cornerRadius(12)
        }
    }
    
    private func jsonPayloadPreview(title: String, content: String) -> some View {
        DisclosureGroup {
            ScrollView(.horizontal, showsIndicators: true) {
                Text(content)
                    .font(.system(.caption2, design: .monospaced))
                    .foregroundColor(.white)
                    .padding(8)
            }
            .background(Color(red: 0.15, green: 0.20, blue: 0.22))
            .cornerRadius(6)
        } label: {
            Text(title)
                .font(.caption.bold())
                .foregroundColor(Color(red: 0.11, green: 0.37, blue: 0.13))
        }
        .padding(8)
        .background(Color.white.opacity(0.7))
        .cornerRadius(8)
    }
}

import SwiftUI
import AuthenticationServices

/// Saved Passkeys List View mirroring Android's CredentialList in MainActivity.
public struct SavedPasskeysView: View {
    @ObservedObject private var dataManager = MyCredentialDataManager.shared
    
    public init() {}
    
    public var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                autoFillBanner
                
                Group {
                    if dataManager.credentials.isEmpty {
                        VStack(spacing: 12) {
                            Image(systemName: "key.slash")
                                .font(.system(size: 48))
                                .foregroundColor(.secondary.opacity(0.6))
                            Text("保存されたパスキーはまだありません。")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .padding(24)
                    } else {
                        ScrollView {
                            LazyVStack(spacing: 12) {
                                ForEach(dataManager.credentials) { cred in
                                    NavigationLink(destination: CredentialDetailView(credential: cred)) {
                                        credentialCard(cred)
                                    }
                                    .buttonStyle(PlainButtonStyle())
                                }
                            }
                            .padding(16)
                        }
                    }
                }
            }
            .navigationTitle("Saved Passkeys")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
    
    private func credentialCard(_ cred: MyCredentialDataManager.Credential) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(cred.serviceName)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.blue)
                .lineLimit(1)
            
            Text("URL: \(cred.rpid)")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .lineLimit(1)
            
            Text("ID:  \(cred.displayName.isEmpty ? "-" : cred.displayName)")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.secondary.opacity(0.4), lineWidth: 2)
        )
    }
    
    private var autoFillBanner: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "key.fill")
                    .foregroundColor(.blue)
                Text("自動入力 (AutoFill) 設定")
                    .font(.headline)
            }
            Text("システム設定の「パスワードとパスキーの自動入力」で My CredMan を有効にすると、ブラウザやアプリでのログイン時にパスキーが自動補完されます。")
                .font(.caption)
                .foregroundColor(.secondary)
            
            HStack(spacing: 12) {
                if #available(iOS 18.0, *) {
                    Button(action: {
                        ASSettingsHelper.requestToTurnOnCredentialProviderExtension { enabled in
                            print("Credential provider turned on: \(enabled)")
                        }
                    }) {
                        Text("自動入力を有効化")
                            .font(.caption.bold())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.blue)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                    }
                }
                
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
                    Text("設定を開く")
                        .font(.caption.bold())
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color(.systemGray5))
                        .foregroundColor(.primary)
                        .cornerRadius(8)
                }
            }
        }
        .padding(14)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
        .padding(.horizontal, 16)
        .padding(.top, 8)
    }
}

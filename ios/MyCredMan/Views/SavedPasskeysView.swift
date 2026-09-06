import SwiftUI
import AuthenticationServices

/// Saved Passkeys List View mirroring Android's CredentialList in MainActivity.
public struct SavedPasskeysView: View {
    @ObservedObject private var dataManager = MyCredentialDataManager.shared
    @State private var navigationPath = NavigationPath()
    @State private var showClearAllAlert = false
    
    public init() {}
    
    public var body: some View {
        NavigationStack(path: $navigationPath) {
            List {
                if !dataManager.isAutoFillEnabled {
                    autoFillSection
                }
                
                if dataManager.credentials.isEmpty {
                    Section {
                        VStack(spacing: 12) {
                            Image(systemName: "key.slash")
                                .font(.system(size: 40))
                                .foregroundColor(.secondary.opacity(0.6))
                            Text("保存されたパスキーはありません")
                                .font(.subheadline.weight(.medium))
                                .foregroundColor(.secondary)
                            Text("Webサイトやアプリでパスキーを登録すると、ここに表示されます。")
                                .font(.caption)
                                .foregroundColor(.secondary.opacity(0.8))
                                .multilineTextAlignment(.center)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                    }
                } else {
                    Section(header: Text("保存されたパスキー (\(dataManager.credentials.count))")) {
                        ForEach(dataManager.credentials) { cred in
                            NavigationLink(value: cred) {
                                credentialRow(cred)
                            }
                            .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                                Button(role: .destructive) {
                                    withAnimation {
                                        dataManager.delete(rpid: cred.rpid, credentialId: cred.credentialId)
                                    }
                                } label: {
                                    Label("削除", systemImage: "trash")
                                }
                            }
                        }
                        .onDelete(perform: deleteCredentials)
                    }
                }
            }
            #if os(iOS) || targetEnvironment(macCatalyst)
            .listStyle(.insetGrouped)
            .navigationBarTitleDisplayMode(.inline)
            #else
            .listStyle(.inset)
            #endif
            .navigationTitle("Saved Passkeys")
            .toolbar {
                if !dataManager.credentials.isEmpty {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(role: .destructive) {
                            showClearAllAlert = true
                        } label: {
                            Text("全削除")
                                .font(.subheadline.bold())
                                .foregroundColor(.red)
                        }
                    }
                }
            }
            .alert("保存されているすべてのパスキーを削除しますか？", isPresented: $showClearAllAlert) {
                Button("キャンセル", role: .cancel) { }
                Button("削除", role: .destructive) {
                    withAnimation {
                        dataManager.deleteAll()
                    }
                }
            }
            .navigationDestination(for: MyCredentialDataManager.Credential.self) { cred in
                CredentialDetailView(credential: cred)
            }
            .onAppear {
                if CommandLine.arguments.contains("--add-demo-passkey") && dataManager.credentials.isEmpty {
                    SavedPasskeysView.addSamplePasskeyIfNeeded()
                }
                dataManager.reload()
                if CommandLine.arguments.contains("--show-detail") {
                    if let first = dataManager.credentials.first {
                        navigationPath.append(first)
                    }
                }
            }
            .refreshable {
                dataManager.reload()
            }
        }
    }
    
    private func deleteCredentials(at offsets: IndexSet) {
        withAnimation {
            for index in offsets {
                let cred = dataManager.credentials[index]
                dataManager.delete(rpid: cred.rpid, credentialId: cred.credentialId)
            }
        }
    }
    
    public static func addSamplePasskeyIfNeeded() {
        let sampleOptionsJson = """
        {
          "challenge": "dGVzdF9jaGFsbGVuZ2VfMTIzNDU2Nzg",
          "rp": {
            "id": "sp.exarnp1e.com",
            "name": "Scoped Passkey Bank"
          },
          "user": {
            "id": "YWxpY2VAZXhhbXBsZS5jb20",
            "name": "alice@example.com",
            "displayName": "alice@example.com"
          },
          "pubKeyCredParams": [
            { "alg": -7, "type": "public-key" }
          ]
        }
        """
        _ = try? DirectPasskeyCreator.createAndSavePasskey(creationOptionsJson: sampleOptionsJson)
        MyCredentialDataManager.shared.reload()
    }
    
    private func credentialRow(_ cred: MyCredentialDataManager.Credential) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "person.badge.key.fill")
                .foregroundColor(.blue)
                .font(.system(size: 20))
                .frame(width: 32, height: 32)
            
            VStack(alignment: .leading, spacing: 3) {
                Text(cred.serviceName.isEmpty ? cred.rpid : cred.serviceName)
                    .font(.body.weight(.semibold))
                    .foregroundColor(.primary)
                    .lineLimit(1)
                
                Text(cred.displayName.isEmpty ? "-" : cred.displayName)
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                    .lineLimit(1)
                
                Text(cred.rpid)
                    .font(.caption2)
                    .foregroundColor(.secondary.opacity(0.8))
                    .lineLimit(1)
            }
            .padding(.vertical, 2)
        }
    }
    
    private var autoFillSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 8) {
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
                    if #available(iOS 18.0, macOS 15.0, *) {
                        Button(action: {
                            ASSettingsHelper.requestToTurnOnCredentialProviderExtension { enabled in
                                print("Credential provider turned on: \(enabled)")
                                DispatchQueue.main.async {
                                    withAnimation {
                                        dataManager.isAutoFillEnabled = enabled
                                    }
                                    dataManager.checkAutoFillStatus()
                                }
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
                        .buttonStyle(.borderless)
                    }
                    
                    Button(action: {
                        if #available(iOS 17.0, macOS 14.0, *) {
                            ASSettingsHelper.openCredentialProviderAppSettings { error in
                                if let error = error {
                                    print("Error opening settings: \(error)")
                                }
                            }
                        } else {
                            #if canImport(UIKit)
                            if let url = URL(string: UIApplication.openSettingsURLString) {
                                UIApplication.shared.open(url)
                            }
                            #elseif canImport(AppKit)
                            if let url = URL(string: "x-apple.systempreferences:com.apple.Passwords") {
                                NSWorkspace.shared.open(url)
                            }
                            #endif
                        }
                    }) {
                        Text("設定を開く")
                            .font(.caption.bold())
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.gray.opacity(0.18))
                            .foregroundColor(.primary)
                            .cornerRadius(8)
                    }
                    .buttonStyle(.borderless)
                }
                .padding(.top, 4)
            }
            .padding(.vertical, 4)
        }
    }
}

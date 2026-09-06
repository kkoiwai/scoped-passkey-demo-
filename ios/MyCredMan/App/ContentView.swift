import SwiftUI
import AuthenticationServices

/// Main Content View with 2 tabs mirroring Android's MainActivity TabRow.
public struct ContentView: View {
    @StateObject private var provisioningViewModel = PasskeyProvisioningViewModel()
    @ObservedObject private var dataManager = MyCredentialDataManager.shared
    @State private var selectedTab: Int = 1
    
    public init() {}
    
    public var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                PasskeyProvisioningView(viewModel: provisioningViewModel)
                    .navigationTitle("Passkey Provisioning")
                    .navigationBarTitleDisplayMode(.inline)
            }
            .tabItem {
                Label("パスキー発行", systemImage: "key.fill")
            }
            .tag(0)
            
            SavedPasskeysView()
                .tabItem {
                    Label("保存済み (\(dataManager.credentials.count))", systemImage: "list.bullet.rectangle")
                }
                .tag(1)
        }
        .onChange(of: selectedTab) { _ in
            dataManager.reload()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
            dataManager.reload()
        }
        .onOpenURL { url in
            if url.host == "settings" {
                if #available(iOS 17.0, *) {
                    ASSettingsHelper.openCredentialProviderAppSettings { error in
                        print("Open settings result: \(String(describing: error))")
                    }
                }
            } else {
                provisioningViewModel.handleOpenUrl(url)
            }
        }
    }
}

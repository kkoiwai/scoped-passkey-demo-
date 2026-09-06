import SwiftUI

/// Credential Details and Deletion Screen mirroring Android's CredentialDetailsActivity.
public struct CredentialDetailView: View {
    @Environment(\.dismiss) private var dismiss
    public let credential: MyCredentialDataManager.Credential
    
    @State private var showDeleteAlert = false
    
    public init(credential: MyCredentialDataManager.Credential) {
        self.credential = credential
    }
    
    public var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Service Name
            Text(credential.serviceName)
                .font(.system(size: 30, weight: .bold))
                .foregroundColor(.blue)
                .lineLimit(1)
            
            // URL / RP ID
            VStack(alignment: .leading, spacing: 4) {
                Text("URL")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(credential.rpid)
                    .font(.body)
                    .padding(.leading, 12)
            }
            
            // ID / Display Name
            VStack(alignment: .leading, spacing: 4) {
                Text("ID")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(credential.displayName.isEmpty ? "-" : credential.displayName)
                    .font(.body)
                    .padding(.leading, 12)
            }
            
            // Credential ID (Base64URL)
            VStack(alignment: .leading, spacing: 4) {
                Text("Credential ID")
                    .font(.caption)
                    .foregroundColor(.secondary)
                Text(credential.credentialId.base64URLEncodedString())
                    .font(.system(.caption, design: .monospaced))
                    .foregroundColor(.secondary)
                    .padding(.leading, 12)
                    .textSelection(.enabled)
            }
            
            Spacer().frame(height: 16)
            
            // Delete Button (Matching Android's #EB5505 button)
            Button(action: {
                showDeleteAlert = true
            }) {
                Text("Delete")
                    .fontWeight(.bold)
                    .frame(maxWidth: .infinity)
                    .frame(height: 48)
                    .background(Color(red: 0.92, green: 0.33, blue: 0.02)) // #EB5505
                    .foregroundColor(.white)
                    .cornerRadius(10)
            }
            
            Spacer()
        }
        .padding(20)
        .navigationTitle("Passkey Details")
        .navigationBarTitleDisplayMode(.inline)
        .alert("Are you sure to delete?", isPresented: $showDeleteAlert) {
            Button("Cancel", role: .cancel) { }
            Button("Delete", role: .destructive) {
                MyCredentialDataManager.shared.delete(
                    rpid: credential.rpid,
                    credentialId: credential.credentialId
                )
                dismiss()
            }
        }
    }
}

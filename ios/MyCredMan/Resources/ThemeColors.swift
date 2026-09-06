import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

extension Color {
    public static var secondarySystemBackgroundCompat: Color {
        #if canImport(UIKit)
        return Color(uiColor: .secondarySystemBackground)
        #elseif canImport(AppKit)
        return Color(nsColor: .windowBackgroundColor)
        #else
        return Color.gray.opacity(0.12)
        #endif
    }
    
    public static var tertiarySystemBackgroundCompat: Color {
        #if canImport(UIKit)
        return Color(uiColor: .tertiarySystemBackground)
        #elseif canImport(AppKit)
        return Color(nsColor: .underPageBackgroundColor)
        #else
        return Color.gray.opacity(0.08)
        #endif
    }
    
    public static var systemBackgroundCompat: Color {
        #if canImport(UIKit)
        return Color(uiColor: .systemBackground)
        #elseif canImport(AppKit)
        return Color(nsColor: .controlBackgroundColor)
        #else
        return Color.white
        #endif
    }
}

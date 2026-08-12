import SwiftUI

#if canImport(UIKit)
import UIKit
#endif

enum KineticColor {
    static let blue = Color(red: 0.12, green: 0.32, blue: 0.86)
    static let ink = Color.primary
#if canImport(UIKit)
    static let canvas = Color(uiColor: .systemGroupedBackground)
    static let card = Color(uiColor: .secondarySystemGroupedBackground)
#else
    static let canvas = Color(red: 0.96, green: 0.98, blue: 1.0)
    static let card = Color.white
#endif
    static let muted = Color(red: 0.42, green: 0.45, blue: 0.50)
    static let emerald = Color(red: 0.05, green: 0.65, blue: 0.42)
    static let amber = Color(red: 0.91, green: 0.55, blue: 0.08)
    static let rose = Color(red: 0.85, green: 0.12, blue: 0.24)
}

struct KineticCard: ViewModifier {
    func body(content: Content) -> some View {
        content
            .background(KineticColor.card)
            .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .shadow(color: Color.black.opacity(0.08), radius: 24, x: 0, y: 14)
    }
}

extension View {
    func kineticCard() -> some View {
        modifier(KineticCard())
    }
}

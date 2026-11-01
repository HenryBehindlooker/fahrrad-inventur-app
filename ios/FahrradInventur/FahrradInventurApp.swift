import SwiftUI

/// iOS-Hülle für die Fahrrad-Inventur-Web-App.
/// Die eigentliche App ist die Web-App in ../web (HTML/JS); sie läuft hier in einem WKWebView.
@main
struct FahrradInventurApp: App {
    var body: some Scene {
        WindowGroup {
            WebAppView()
                // Die Web-App berücksichtigt die Safe Areas selbst (CSS env(safe-area-inset-*)).
                .ignoresSafeArea()
        }
    }
}

enum AppConfig {
    /// Leerer Info.plist-Eintrag "WebAppURL" => eingebaute Web-App aus dem Bundle (offline nutzbar).
    /// Gesetzte URL => gehostete PWA wird geladen (Updates ohne neuen App-Build).
    static var remoteURL: URL? {
        guard let raw = Bundle.main.object(forInfoDictionaryKey: "WebAppURL") as? String,
              !raw.trimmingCharacters(in: .whitespaces).isEmpty,
              let url = URL(string: raw) else { return nil }
        return url
    }

    static var startURL: URL {
        remoteURL ?? URL(string: "\(AppSchemeHandler.scheme)://\(AppSchemeHandler.host)/index.html")!
    }
}
